/*
 * Copyright 2025 Suvink
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { CanvasRefs } from './useCanvasRenderer';

interface UseBrushPaintingProps {
    refs: CanvasRefs;
    imgObj: HTMLImageElement | null;
    brushSize: number;
    brushMode: 'erase' | 'restore';
    instantApply: boolean;
    render: () => void;
    addToHistory: (dataUrl: string) => void;
    onPendingStrokesChange: (hasPending: boolean) => void;
    /** Invalidate the edge-refinement cache after pixels change. */
    bumpSourceRevision: () => void;
}

// Helper: Color Distance
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
    return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
}

export function useBrushPainting({
    refs,
    imgObj,
    brushSize,
    brushMode,
    instantApply,
    render,
    addToHistory,
    onPendingStrokesChange,
    bumpSourceRevision,
}: UseBrushPaintingProps) {
    const { canvasRef, selectionCanvasRef, offscreenCanvasRef } = refs;
    const renderScheduledRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const hasStrokesRef = useRef(false);
    const originalPixelsCacheRef = useRef<{ img: HTMLImageElement; data: Uint8ClampedArray } | null>(null);

    // Free the pixel cache when the image changes (fix #11): the cache held a
    // full-resolution RGBA copy of the original (~67 MB at 4096×4096) and was
    // only replaced lazily on the next commit — releasing it here on imgObj
    // change (and on unmount) bounds the memory to a single live image.
    useEffect(() => {
        originalPixelsCacheRef.current = null;
    }, [imgObj]);
    useEffect(() => {
        return () => {
            originalPixelsCacheRef.current = null;
        };
    }, []);

    // Throttled render using requestAnimationFrame
    const scheduleRender = useCallback(() => {
        if (renderScheduledRef.current) return;
        renderScheduledRef.current = true;
        requestAnimationFrame(() => {
            render();
            renderScheduledRef.current = false;
        });
    }, [render]);

    // Paint at specific screen coordinates - used by both mouse and touch
    const paintSelectionAtPoint = useCallback((clientX: number, clientY: number) => {
        const sc = selectionCanvasRef.current;
        const canvas = canvasRef.current;
        if (!sc || !canvas || !imgObj) return;

        const ctx = sc.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        // Draw line from last point for smoother strokes
        const lastPoint = lastPointRef.current;
        if (lastPoint) {
            ctx.beginPath();
            ctx.moveTo(lastPoint.x, lastPoint.y);
            ctx.lineTo(x, y);
            ctx.lineWidth = brushSize;
            ctx.lineCap = 'round';
            ctx.strokeStyle = brushMode === 'erase' ? '#ef4444' : '#22c55e';
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = brushMode === 'erase' ? '#ef4444' : '#22c55e';
            ctx.fill();
        }
        
        lastPointRef.current = { x, y };
        
        // Track that we have pending strokes
        if (!hasStrokesRef.current) {
            hasStrokesRef.current = true;
            onPendingStrokesChange(true);
        }
        
        scheduleRender();
    }, [canvasRef, selectionCanvasRef, imgObj, brushSize, brushMode, scheduleRender, onPendingStrokesChange]);

    // Handle Painting Selection (mouse event wrapper)
    const paintSelection = useCallback((e: React.MouseEvent) => {
        paintSelectionAtPoint(e.clientX, e.clientY);
    }, [paintSelectionAtPoint]);

    // Core function to apply the marked strokes to the image
    const commitStrokes = useCallback(() => {
        const osc = offscreenCanvasRef.current;
        const sc = selectionCanvasRef.current;

        if (!osc || !sc || !imgObj) return;

        const ctx = osc.getContext('2d');
        const scCtx = sc.getContext('2d');
        if (!ctx || !scCtx) return;

        // Fix #13: derive dimensions from the offscreen canvas itself, not the
        // visible canvas — the visible canvas may transiently mismatch during
        // zoom/sync, and getImageData silently clips to the source's own size.
        const width = osc.width;
        const height = osc.height;

        // Get all necessary image data
        const maskImageData = ctx.getImageData(0, 0, width, height);
        const maskData = maskImageData.data;

        const selectionImageData = scCtx.getImageData(0, 0, width, height);
        const selectionData = selectionImageData.data;

        // Original image pixels — cached per image (was re-decoded on every commit)
        let originalData = originalPixelsCacheRef.current?.img === imgObj
            ? originalPixelsCacheRef.current.data
            : null;
        if (!originalData) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return;
            tempCtx.drawImage(imgObj, 0, 0);
            originalData = tempCtx.getImageData(0, 0, width, height).data;
            originalPixelsCacheRef.current = { img: imgObj, data: originalData };
        }

        // Calculate Average Color of Selection
        let totalR = 0, totalG = 0, totalB = 0, count = 0;

        for (let i = 0; i < selectionData.length; i += 4) {
            if (selectionData[i + 3] > 0) {
                totalR += originalData[i];
                totalG += originalData[i + 1];
                totalB += originalData[i + 2];
                count++;
            }
        }

        if (count === 0) return; // Nothing selected

        const avgR = totalR / count;
        const avgG = totalG / count;
        const avgB = totalB / count;

        const tolerance = 80; // Increased tolerance for better coverage

        // Iterate through pixels
        for (let i = 0; i < selectionData.length; i += 4) {
            // Check if this pixel is selected (alpha > 0)
            if (selectionData[i + 3] > 0) {
                const r = originalData[i];
                const g = originalData[i + 1];
                const b = originalData[i + 2];

                // Check color similarity to AVERAGE color
                if (colorDistance(r, g, b, avgR, avgG, avgB) < tolerance) {
                    if (brushMode === 'erase') {
                        maskData[i + 3] = 0; // Transparent
                    } else {
                        // Restore
                        maskData[i] = r;
                        maskData[i + 1] = g;
                        maskData[i + 2] = b;
                        maskData[i + 3] = 255; // Opaque
                    }
                }
            }
        }

        // Apply changes
        ctx.putImageData(maskImageData, 0, 0);

        // Clear selection canvas
        scCtx.clearRect(0, 0, width, height);

        // Reset pending strokes state
        hasStrokesRef.current = false;
        onPendingStrokesChange(false);

        // Offscreen pixels changed → refinement cache is stale
        bumpSourceRevision();

        // Save history
        addToHistory(osc.toDataURL());

        render();
    }, [offscreenCanvasRef, selectionCanvasRef, imgObj, brushMode, addToHistory, render, onPendingStrokesChange, bumpSourceRevision]);

    // Clear strokes without applying (cancel)
    const clearPendingStrokes = useCallback(() => {
        const sc = selectionCanvasRef.current;
        if (!sc) return;

        const scCtx = sc.getContext('2d');
        if (!scCtx) return;

        scCtx.clearRect(0, 0, sc.width, sc.height);
        
        hasStrokesRef.current = false;
        onPendingStrokesChange(false);
        lastPointRef.current = null;
        
        render();
    }, [selectionCanvasRef, onPendingStrokesChange, render]);

    // Called on mouse/touch up - only auto-applies if instantApply is true
    const applySmartSelection = useCallback(() => {
        // Reset last point for next stroke
        lastPointRef.current = null;
        
        // Only auto-apply if instant mode is enabled
        if (instantApply) {
            commitStrokes();
        }
        // Otherwise, keep the strokes visible for user to confirm
    }, [instantApply, commitStrokes]);

    return {
        paintSelection,
        paintSelectionAtPoint,
        applySmartSelection,
        commitStrokes,
        clearPendingStrokes,
    };
}
