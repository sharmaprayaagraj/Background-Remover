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

import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import type { CropRect, ShadowSettings, EdgeRefinementSettings, BackgroundSize } from '../store/useAppStore';
import { applyEdgeRefinement, bumpEdgeRefinementSource, clearEdgeRefinementCache } from '../utils/edgeRefinement';
import { toast } from '../store/useToastStore';

interface UseCanvasRendererProps {
    imgObj: HTMLImageElement | null;
    brushMode: 'erase' | 'restore';
    isDragging: boolean;
    backgroundColor: string | null;
    backgroundImage: string | null;
    backgroundSize: BackgroundSize;
    featherRadius: number;
    shadowSettings: ShadowSettings;
    edgeRefinement: EdgeRefinementSettings;
    isCropping?: boolean;
    cropRect?: CropRect | null;
    hasPendingStrokes?: boolean;
}

export interface CanvasRefs {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    offscreenCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    selectionCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useCanvasRenderer({
    imgObj,
    brushMode,
    isDragging,
    backgroundColor,
    backgroundImage,
    backgroundSize,
    featherRadius,
    shadowSettings,
    edgeRefinement,
    isCropping = false,
    cropRect = null,
    hasPendingStrokes = false,
}: UseCanvasRendererProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const selectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const tempCanvasRef = useRef<HTMLCanvasElement | null>(null); // Reusable temp canvas for effects
    const refinedCanvasRef = useRef<HTMLCanvasElement | null>(null); // Canvas for edge-refined image
    const lastSourceRevisionRef = useRef(-1); // Tracks offscreen pixel changes for refinement caching
    const lastRefinedKeyRef = useRef(''); // Settings+revision of the content currently in refinedCanvasRef
    const [bgImgObj, setBgImgObj] = useState<HTMLImageElement | null>(null);
    // Decoded copy of the ORIGINAL image at source resolution, used for edge
    // color decontamination in the live preview (fix #6 wiring). Kept in a
    // ref so the render callback stays referentially stable.
    const originalImageObjRef = useRef<HTMLImageElement | null>(null);

    // Load background image when it changes
    useEffect(() => {
        if (backgroundImage) {
            let cancelled = false;
            const img = new Image();
            img.src = backgroundImage;
            img.onload = () => {
                if (!cancelled) setBgImgObj(img);
            };
            img.onerror = () => {
                if (!cancelled) {
                    setBgImgObj(null);
                    // Surface the failure instead of silently showing no
                    // background (fix #30).
                    toast.error('Failed to load background image.');
                }
            };
            return () => {
                cancelled = true;
                img.onload = null;
                img.onerror = null;
            };
        }
        // Use a microtask to avoid synchronous setState in effect
        queueMicrotask(() => setBgImgObj(null));
    }, [backgroundImage]);

    // Memoize refs object to avoid recreation on every render
    const refs = useMemo<CanvasRefs>(() => ({
        canvasRef,
        cursorCanvasRef,
        offscreenCanvasRef,
        selectionCanvasRef,
    }), []);

    // Initialize canvases when image loads
    useEffect(() => {
        if (imgObj) {
            // Initialize offscreen canvas (edited image)
            const osc = document.createElement('canvas');
            osc.width = imgObj.width;
            osc.height = imgObj.height;
            const ctx = osc.getContext('2d');
            if (ctx) ctx.drawImage(imgObj, 0, 0);
            offscreenCanvasRef.current = osc;

            // Track the original image for decontamination + drop the stale
            // module-level refinement result (fix #8): otherwise it pins the
            // previous image's full-frame ImageData until the next run.
            originalImageObjRef.current = imgObj;
            clearEdgeRefinementCache();

            // Initialize selection canvas (mask)
            const sc = document.createElement('canvas');
            sc.width = imgObj.width;
            sc.height = imgObj.height;
            selectionCanvasRef.current = sc;

            // Initialize temp canvas for effects (reusable)
            const tc = document.createElement('canvas');
            tc.width = imgObj.width;
            tc.height = imgObj.height;
            tempCanvasRef.current = tc;

            // New source pixels → invalidate refinement cache
            lastSourceRevisionRef.current = bumpEdgeRefinementSource();
            lastRefinedKeyRef.current = '';
        }
    }, [imgObj]);

    // Main Render Function
    const render = useCallback(() => {
        const canvas = canvasRef.current;
        const osc = offscreenCanvasRef.current;
        const sc = selectionCanvasRef.current;
        if (!canvas || !osc || !imgObj) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Match dimensions
        if (canvas.width !== imgObj.width) canvas.width = imgObj.width;
        if (canvas.height !== imgObj.height) canvas.height = imgObj.height;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Skip edge refinement during active painting for performance
        // Edge refinement will be applied when user stops dragging
        let sourceForDrawing: HTMLCanvasElement = osc;
        if (edgeRefinement.mode !== 'off' && !isDragging) {
            const refinedKey = `${edgeRefinement.mode}|${edgeRefinement.edgeContrast}|${edgeRefinement.edgeSoftness}|${edgeRefinement.colorDecontamination}|${lastSourceRevisionRef.current}`;

            if (refinedCanvasRef.current && lastRefinedKeyRef.current === refinedKey) {
                // Cache hit (fix #11): refinedCanvas already holds the refined
                // result for this exact revision + settings — skip the full
                // getImageData/putImageData roundtrip entirely.
                sourceForDrawing = refinedCanvasRef.current;
            } else {
                // Create or resize refined canvas
                if (!refinedCanvasRef.current) {
                    refinedCanvasRef.current = document.createElement('canvas');
                }
                const refinedCanvas = refinedCanvasRef.current;
                if (refinedCanvas.width !== osc.width || refinedCanvas.height !== osc.height) {
                    refinedCanvas.width = osc.width;
                    refinedCanvas.height = osc.height;
                }

                const refinedCtx = refinedCanvas.getContext('2d');
                if (refinedCtx) {
                    // Copy original first
                    refinedCtx.clearRect(0, 0, refinedCanvas.width, refinedCanvas.height);
                    refinedCtx.drawImage(osc, 0, 0);

                    // Original image data for color decontamination (fix #6):
                    // sampled lazily, only when the slider is active, and
                    // cached alongside the refinement so we don't re-decode a
                    // 67 MB buffer on every frame.
                    let originalImageData: ImageData | undefined;
                    if (edgeRefinement.colorDecontamination > 0 && originalImageObjRef.current) {
                        const origCanvas = document.createElement('canvas');
                        origCanvas.width = refinedCanvas.width;
                        origCanvas.height = refinedCanvas.height;
                        const origCtx = origCanvas.getContext('2d');
                        if (origCtx) {
                            origCtx.drawImage(originalImageObjRef.current, 0, 0, origCanvas.width, origCanvas.height);
                            originalImageData = origCtx.getImageData(0, 0, origCanvas.width, origCanvas.height);
                        }
                    }

                    // Apply edge refinement (cached per source revision + settings)
                    const imageData = refinedCtx.getImageData(0, 0, refinedCanvas.width, refinedCanvas.height);
                    const refinedData = applyEdgeRefinement(refinedCtx, imageData, edgeRefinement, originalImageData, lastSourceRevisionRef.current);
                    refinedCtx.putImageData(refinedData, 0, 0);

                    lastRefinedKeyRef.current = refinedKey;
                    sourceForDrawing = refinedCanvas;
                }
            }
        }

        // 0. Draw Custom Background (Lowest Layer)
        if (backgroundColor) {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (bgImgObj) {
            // Draw background image based on backgroundSize mode
            switch (backgroundSize) {
                case 'cover': {
                    // Scale to cover entire canvas (may crop)
                    const scale = Math.max(
                        canvas.width / bgImgObj.width,
                        canvas.height / bgImgObj.height
                    );
                    const scaledWidth = bgImgObj.width * scale;
                    const scaledHeight = bgImgObj.height * scale;
                    const x = (canvas.width - scaledWidth) / 2;
                    const y = (canvas.height - scaledHeight) / 2;
                    ctx.drawImage(bgImgObj, x, y, scaledWidth, scaledHeight);
                    break;
                }
                case 'contain': {
                    // Scale to fit entirely (may have letterboxing)
                    const scale = Math.min(
                        canvas.width / bgImgObj.width,
                        canvas.height / bgImgObj.height
                    );
                    const scaledWidth = bgImgObj.width * scale;
                    const scaledHeight = bgImgObj.height * scale;
                    const x = (canvas.width - scaledWidth) / 2;
                    const y = (canvas.height - scaledHeight) / 2;
                    ctx.drawImage(bgImgObj, x, y, scaledWidth, scaledHeight);
                    break;
                }
                case 'stretch': {
                    // Stretch to fill exactly (may distort)
                    ctx.drawImage(bgImgObj, 0, 0, canvas.width, canvas.height);
                    break;
                }
                case 'tile': {
                    // Tile/repeat the background image at its original size
                    const pattern = ctx.createPattern(bgImgObj, 'repeat');
                    if (pattern) {
                        ctx.fillStyle = pattern;
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    }
                    break;
                }
            }
        }

        // 1. Draw Ghost Overlay (Bottom Layer)
        // Only visible in Restore Mode. Drawn first so it appears behind the edited image.
        if (brushMode === 'restore') {
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.filter = 'opacity(0.3)';
            ctx.drawImage(imgObj, 0, 0);
            ctx.restore();
        }

        // 1.5 Draw Shadow/Glow Effect (Behind the edited image)
        if (shadowSettings.type !== 'none') {
            ctx.save();

            if (shadowSettings.type === 'drop-shadow') {
                // Drop shadow: draw the image with shadow filter
                ctx.shadowColor = shadowSettings.color;
                ctx.shadowBlur = shadowSettings.blur;
                ctx.shadowOffsetX = shadowSettings.offsetX;
                ctx.shadowOffsetY = shadowSettings.offsetY;
                ctx.drawImage(sourceForDrawing, 0, 0);
            } else if (shadowSettings.type === 'glow') {
                // Optimized outer glow: use max 3 layers instead of many
                const layers = Math.min(3, shadowSettings.spread);
                for (let i = layers; i > 0; i--) {
                    ctx.save();
                    ctx.shadowColor = shadowSettings.color;
                    ctx.shadowBlur = shadowSettings.blur * (i / layers);
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    ctx.globalAlpha = 0.4 / i;
                    ctx.drawImage(sourceForDrawing, 0, 0);
                    ctx.restore();
                }
            }

            // Fix #5: the outer save() above was previously never restored for
            // the glow branch, leaking one saved state per render frame.
            ctx.restore();
        }

        // 2. Draw Current Edited Image (Middle Layer)
        // Apply feather/blur to edges only (affects alpha channel smoothness)
        if (featherRadius > 0) {
            // Use cached temp canvas for better performance
            const tempCanvas = tempCanvasRef.current;
            if (tempCanvas) {
                const tempCtx = tempCanvas.getContext('2d');
                if (tempCtx) {
                    // Clear and resize if needed
                    if (tempCanvas.width !== sourceForDrawing.width || tempCanvas.height !== sourceForDrawing.height) {
                        tempCanvas.width = sourceForDrawing.width;
                        tempCanvas.height = sourceForDrawing.height;
                    }
                    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                    
                    // Draw the original image with blur to create soft edges
                    tempCtx.filter = `blur(${featherRadius}px)`;
                    tempCtx.drawImage(sourceForDrawing, 0, 0);
                    tempCtx.filter = 'none';
                    
                    // Use the blurred version as a mask, but keep original colors
                    tempCtx.globalCompositeOperation = 'source-atop';
                    tempCtx.drawImage(sourceForDrawing, 0, 0);
                    tempCtx.globalCompositeOperation = 'source-over';
                    
                    ctx.drawImage(tempCanvas, 0, 0);
                } else {
                    ctx.drawImage(sourceForDrawing, 0, 0);
                }
            } else {
                ctx.drawImage(sourceForDrawing, 0, 0);
            }
        } else {
            ctx.drawImage(sourceForDrawing, 0, 0);
        }

        // 3. Draw Selection Overlay (Top Layer)
        // Show selection when actively dragging OR when there are pending strokes (manual mode)
        if (sc && (isDragging || hasPendingStrokes)) {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.drawImage(sc, 0, 0);
            ctx.restore();
        }

        // 4. Draw Crop Overlay (Topmost Layer)
        if (isCropping && cropRect) {
            ctx.save();
            
            // Create a clipping path that excludes the crop area
            // This dims everything OUTSIDE the crop rect
            ctx.beginPath();
            // Outer rectangle (full canvas)
            ctx.rect(0, 0, canvas.width, canvas.height);
            // Inner rectangle (crop area) - drawn counter-clockwise to create a hole
            ctx.moveTo(cropRect.x, cropRect.y);
            ctx.lineTo(cropRect.x, cropRect.y + cropRect.height);
            ctx.lineTo(cropRect.x + cropRect.width, cropRect.y + cropRect.height);
            ctx.lineTo(cropRect.x + cropRect.width, cropRect.y);
            ctx.closePath();
            
            // Fill with semi-transparent overlay (only fills the area outside crop rect)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fill('evenodd');
            
            // Draw crop border
            ctx.strokeStyle = '#84cc16'; // lime-500
            ctx.lineWidth = 2;
            ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
            
            // Draw corner handles
            const handleSize = 8;
            ctx.fillStyle = '#84cc16';
            
            // Corners
            ctx.fillRect(cropRect.x - handleSize/2, cropRect.y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(cropRect.x + cropRect.width - handleSize/2, cropRect.y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(cropRect.x - handleSize/2, cropRect.y + cropRect.height - handleSize/2, handleSize, handleSize);
            ctx.fillRect(cropRect.x + cropRect.width - handleSize/2, cropRect.y + cropRect.height - handleSize/2, handleSize, handleSize);
            
            // Edge midpoints
            ctx.fillRect(cropRect.x + cropRect.width/2 - handleSize/2, cropRect.y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(cropRect.x + cropRect.width/2 - handleSize/2, cropRect.y + cropRect.height - handleSize/2, handleSize, handleSize);
            ctx.fillRect(cropRect.x - handleSize/2, cropRect.y + cropRect.height/2 - handleSize/2, handleSize, handleSize);
            ctx.fillRect(cropRect.x + cropRect.width - handleSize/2, cropRect.y + cropRect.height/2 - handleSize/2, handleSize, handleSize);
            
            // Draw rule-of-thirds grid
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            const thirdW = cropRect.width / 3;
            const thirdH = cropRect.height / 3;
            ctx.beginPath();
            ctx.moveTo(cropRect.x + thirdW, cropRect.y);
            ctx.lineTo(cropRect.x + thirdW, cropRect.y + cropRect.height);
            ctx.moveTo(cropRect.x + 2 * thirdW, cropRect.y);
            ctx.lineTo(cropRect.x + 2 * thirdW, cropRect.y + cropRect.height);
            ctx.moveTo(cropRect.x, cropRect.y + thirdH);
            ctx.lineTo(cropRect.x + cropRect.width, cropRect.y + thirdH);
            ctx.moveTo(cropRect.x, cropRect.y + 2 * thirdH);
            ctx.lineTo(cropRect.x + cropRect.width, cropRect.y + 2 * thirdH);
            ctx.stroke();
            
            // Show crop dimensions
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(cropRect.x, cropRect.y - 24, 80, 20);
            ctx.fillStyle = '#fff';
            ctx.font = '12px monospace';
            ctx.fillText(`${Math.round(cropRect.width)} × ${Math.round(cropRect.height)}`, cropRect.x + 4, cropRect.y - 9);
            
            ctx.restore();
        }
    }, [imgObj, brushMode, isDragging, backgroundColor, bgImgObj, backgroundSize, featherRadius, shadowSettings, edgeRefinement, isCropping, cropRect, hasPendingStrokes]);

    return {
        canvasRef,
        cursorCanvasRef,
        offscreenCanvasRef,
        selectionCanvasRef,
        refs,
        render,
        /** Invalidate the refinement cache after mutating offscreen pixels. */
        bumpSourceRevision: useCallback(() => {
            lastSourceRevisionRef.current = bumpEdgeRefinementSource();
            lastRefinedKeyRef.current = '';
        }, []),
    };
}
