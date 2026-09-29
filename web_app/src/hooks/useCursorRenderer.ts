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

interface UseCursorRendererProps {
    refs: CanvasRefs;
    brushSize: number;
    brushMode: 'erase' | 'restore';
    zoom: number;
}

/**
 * Imperative brush-cursor overlay.
 *
 * Instead of receiving cursor position through React state (which re-rendered
 * the entire component tree on every mouse move), callers invoke `updateCursor`
 * directly from event handlers. Drawing is coalesced into requestAnimationFrame
 * and all parameters are read from refs, so cursor movement triggers zero
 * React renders.
 */
export function useCursorRenderer({
    refs,
    brushSize,
    brushMode,
    zoom,
}: UseCursorRendererProps) {
    const { cursorCanvasRef } = refs;
    const rafIdRef = useRef<number>(0);
    const posRef = useRef<{ x: number; y: number } | null>(null);
    const paramsRef = useRef({ brushSize, brushMode, zoom });

    // Keep latest params without re-scheduling anything (effect, not a
    // render-phase ref write — react-hooks/refs).
    useEffect(() => {
        paramsRef.current = { brushSize, brushMode, zoom };
    }, [brushSize, brushMode, zoom]);

    const draw = useCallback(() => {
        const cursorCanvas = cursorCanvasRef.current;
        if (!cursorCanvas) return;

        const ctx = cursorCanvas.getContext('2d');
        if (!ctx) return;

        const rect = cursorCanvas.getBoundingClientRect();

        // Set cursor canvas dimensions to match container (only if changed)
        if (cursorCanvas.width !== Math.floor(rect.width) || cursorCanvas.height !== Math.floor(rect.height)) {
            cursorCanvas.width = Math.floor(rect.width);
            cursorCanvas.height = Math.floor(rect.height);
        }

        ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

        const pos = posRef.current;
        if (!pos) return;

        const x = pos.x - rect.left;
        const y = pos.y - rect.top;

        // Only draw if cursor is within bounds
        if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;

        const { brushSize: size, brushMode: mode, zoom: z } = paramsRef.current;

        // Draw Brush Cursor (scaled by zoom for visual consistency)
        const scaledBrushSize = (size * z) / 2;

        ctx.beginPath();
        ctx.arc(x, y, scaledBrushSize, 0, Math.PI * 2);
        ctx.strokeStyle = mode === 'erase' ? '#ef4444' : '#22c55e';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Crosshair center
        ctx.beginPath();
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + 5, y);
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
        ctx.stroke();
    }, [cursorCanvasRef]);

    const scheduleDraw = useCallback(() => {
        if (rafIdRef.current) return;
        rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = 0;
            draw();
        });
    }, [draw]);

    /**
     * Update the cursor position imperatively (no React state).
     * Pass null to hide the cursor (e.g. mouse left the canvas).
     */
    const updateCursor = useCallback((clientX: number, clientY: number) => {
        posRef.current = { x: clientX, y: clientY };
        scheduleDraw();
    }, [scheduleDraw]);

    /** Hide and clear the cursor overlay. */
    const clearCursor = useCallback(() => {
        posRef.current = null;
        scheduleDraw();
    }, [scheduleDraw]);

    // Redraw when visual parameters change (brush size, mode, zoom)
    useEffect(() => {
        scheduleDraw();
        return () => {
            if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = 0;
            }
        };
    }, [brushSize, brushMode, zoom, scheduleDraw]);

    // Resize handling (fix #25): draw() only resizes the backing store when it
    // runs, and it previously only ran on mousemove — after a window resize
    // the canvas kept stale dimensions until the next mouse movement. A
    // resize listener redraws immediately; the last cursor position is kept.
    useEffect(() => {
        const handleResize = () => scheduleDraw();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [scheduleDraw]);

    return { updateCursor, clearCursor };
}
