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

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useCanvasRenderer } from '../hooks/useCanvasRenderer';
import { useBrushPainting } from '../hooks/useBrushPainting';
import { useCursorRenderer } from '../hooks/useCursorRenderer';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useTouchEvents } from '../hooks/useTouchEvents';
import { useGitHubStarToast } from '../hooks/useGitHubStarToast';
import { useCropTool } from '../hooks/useCropTool';
import { useExportCanvas } from '../hooks/useExportCanvas';
import { toast } from '../store/useToastStore';
import { CanvasToolbar } from './CanvasToolbar';
import { GitHubStarToast } from './GitHubStarToast';
import { memo } from 'react';

const MemoizedCanvasToolbar = memo(CanvasToolbar);

export const CanvasViewer: React.FC = () => {
    // Store state
    const originalImage = useAppStore((state) => state.originalImage);
    const processedImage = useAppStore((state) => state.processedImage);
    const reset = useAppStore((state) => state.reset);

    // Editing state
    const brushSize = useAppStore((state) => state.brushSize);
    const brushMode = useAppStore((state) => state.brushMode);
    const zoom = useAppStore((state) => state.zoom);
    const pan = useAppStore((state) => state.pan);
    const featherRadius = useAppStore((state) => state.featherRadius);
    const setFeatherRadius = useAppStore((state) => state.setFeatherRadius);

    // Crop state
    const isCropping = useAppStore((state) => state.isCropping);
    const cropRect = useAppStore((state) => state.cropRect);
    const setIsCropping = useAppStore((state) => state.setIsCropping);
    const setCropRect = useAppStore((state) => state.setCropRect);
    const applyCropImmediate = useAppStore((state) => state.applyCropImmediate);

    // Background replacement
    const backgroundColor = useAppStore((state) => state.backgroundColor);
    const backgroundImage = useAppStore((state) => state.backgroundImage);
    const backgroundSize = useAppStore((state) => state.backgroundSize);
    const setBackgroundColor = useAppStore((state) => state.setBackgroundColor);
    const setBackgroundImage = useAppStore((state) => state.setBackgroundImage);
    const setBackgroundSize = useAppStore((state) => state.setBackgroundSize);

    // Shadow/glow effects
    const shadowSettings = useAppStore((state) => state.shadowSettings);
    const setShadowSettings = useAppStore((state) => state.setShadowSettings);

    // Edge refinement
    const edgeRefinement = useAppStore((state) => state.edgeRefinement);
    const setEdgeRefinement = useAppStore((state) => state.setEdgeRefinement);

    // Export settings
    const exportFormat = useAppStore((state) => state.exportFormat);
    const exportQuality = useAppStore((state) => state.exportQuality);
    const setExportFormat = useAppStore((state) => state.setExportFormat);
    const setExportQuality = useAppStore((state) => state.setExportQuality);

    // History
    const history = useAppStore((state) => state.history);
    const historyIndex = useAppStore((state) => state.historyIndex);
    const addToHistory = useAppStore((state) => state.addToHistory);
    const undo = useAppStore((state) => state.undo);
    const redo = useAppStore((state) => state.redo);

    // Instant apply / pending strokes
    const instantApply = useAppStore((state) => state.instantApply);
    const hasPendingStrokes = useAppStore((state) => state.hasPendingStrokes);
    const setInstantApply = useAppStore((state) => state.setInstantApply);
    const setHasPendingStrokes = useAppStore((state) => state.setHasPendingStrokes);

    // Actions
    const setBrushSize = useAppStore((state) => state.setBrushSize);
    const setBrushMode = useAppStore((state) => state.setBrushMode);
    const setZoom = useAppStore((state) => state.setZoom);
    const setPan = useAppStore((state) => state.setPan);

    // Local state
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const lastMousePosRef = useRef({ x: 0, y: 0 });
    const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null);

    // rAF coalescing for wheel-zoom and pan (one store write per frame max)
    const pendingZoomRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);
    const zoomRafRef = useRef(0);
    const panRafRef = useRef(0);
    // Live values for the non-passive wheel listener (fix #9). Kept in refs
    // via effects so the native listener never reads stale closures and no
    // ref is written during render (react-hooks/refs).
    const zoomPanRef = useRef({ zoom, pan });
    const setZoomRef = useRef(setZoom);
    const setPanRef = useRef(setPan);
    useEffect(() => {
        zoomPanRef.current = { zoom, pan };
        setZoomRef.current = setZoom;
        setPanRef.current = setPan;
    }, [zoom, pan, setZoom, setPan]);

    // GitHub star toast
    const { showToast, triggerToast, closeToast } = useGitHubStarToast();

    // Canvas renderer hook - get individual refs for JSX and bundled refs for other hooks
    const { canvasRef, cursorCanvasRef, refs, render, bumpSourceRevision } = useCanvasRenderer({
        imgObj,
        brushMode,
        isDragging,
        backgroundColor,
        backgroundImage,
        backgroundSize,
        featherRadius,
        shadowSettings,
        edgeRefinement,
        isCropping,
        cropRect,
        hasPendingStrokes,
    });

    // Brush painting hook
    const { paintSelection, paintSelectionAtPoint, applySmartSelection, commitStrokes, clearPendingStrokes } = useBrushPainting({
        refs,
        imgObj,
        brushSize,
        brushMode,
        render,
        addToHistory,
        instantApply,
        onPendingStrokesChange: setHasPendingStrokes,
        bumpSourceRevision,
    });

    // Touch events hook
    const { handleTouchStart, handleTouchMove, handleTouchEnd, isTouching } = useTouchEvents({
        setZoom,
        setPan,
        onPaintStart: paintSelectionAtPoint,
        onPaintMove: paintSelectionAtPoint,
        onPaintEnd: applySmartSelection,
    });

    // Crop tool hook
    const { handleCropMouseDown, handleCropMouseMove, handleCropMouseUp, getCursor } = useCropTool({
        canvasRef,
        imgObj,
        cropRect,
        setCropRect,
    });

    // Export canvas hook — imgObj is the decoded ORIGINAL image, needed so
    // edge color decontamination behaves identically in export and preview.
    const { handleDownload, handleCopyToClipboard } = useExportCanvas({
        refs,
        backgroundColor,
        backgroundImage,
        backgroundSize,
        featherRadius,
        shadowSettings,
        edgeRefinement,
        exportFormat,
        exportQuality,
        originalImage: imgObj,
        onDownloadComplete: triggerToast,
    });

    // Crop handlers
    const handleStartCrop = useCallback(() => {
        if (imgObj) {
            setIsCropping(true);
            // Initialize crop rect to full image
            setCropRect({ x: 0, y: 0, width: imgObj.width, height: imgObj.height });
        }
    }, [imgObj, setIsCropping, setCropRect]);

    const handleCancelCrop = useCallback(() => {
        setIsCropping(false);
        setCropRect(null);
    }, [setIsCropping, setCropRect]);

    // Cursor renderer hook (imperative — no re-renders on mouse move)
    const { updateCursor, clearCursor } = useCursorRenderer({
        refs,
        brushSize,
        brushMode,
        zoom,
    });

    // Fit to screen handler (defined before keyboard shortcuts)
    const handleFitToScreen = useCallback(() => {
        const container = containerRef.current;
        if (!container || !imgObj) return;
        
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        const availableWidth = containerWidth * 0.9;
        const availableHeight = containerHeight * 0.9;
        
        const scaleX = availableWidth / imgObj.width;
        const scaleY = availableHeight / imgObj.height;
        
        const fitZoom = Math.min(scaleX, scaleY, 1);
        
        setZoom(fitZoom);
        setPan({ x: 0, y: 0 });
    }, [imgObj, setZoom, setPan]);

    const handleApplyCrop = useCallback(() => {
        if (!cropRect || !imgObj) return;

        // Helper to crop a canvas/image synchronously
        const cropCanvas = (source: HTMLCanvasElement | HTMLImageElement): string => {
            const canvas = document.createElement('canvas');
            canvas.width = cropRect.width;
            canvas.height = cropRect.height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(
                source,
                cropRect.x, cropRect.y, cropRect.width, cropRect.height,
                0, 0, cropRect.width, cropRect.height
            );
            return canvas.toDataURL('image/png');
        };

        // Crop the offscreen canvas (current edited state)
        const osc = refs.offscreenCanvasRef.current;
        if (!osc) return;

        // Crop processed image from offscreen canvas (in memory - instant)
        const croppedProcessed = cropCanvas(osc);

        // For original image, we need to crop the imgObj (already loaded)
        const croppedOriginal = cropCanvas(imgObj);

        // Fix #3: seed the new mask/history from the *processed pixels*.
        // The selection canvas is a transient stroke overlay (usually blank);
        // cropping it used to poison maskImage and history[0].
        applyCropImmediate(croppedOriginal, croppedProcessed, croppedProcessed);
        toast.success('Crop applied');
    }, [cropRect, imgObj, refs, applyCropImmediate]);

    // Keyboard shortcuts hook
    useKeyboardShortcuts({
        brushSize,
        setBrushSize,
        setBrushMode,
        undo,
        redo,
        onFitToScreen: handleFitToScreen,
        isCropping,
        onStartCrop: handleStartCrop,
        onApplyCrop: handleApplyCrop,
        onCancelCrop: handleCancelCrop,
        hasPendingStrokes,
        onCommitStrokes: commitStrokes,
        onClearPendingStrokes: clearPendingStrokes,
    });

    // Load original image and auto-fit to container
    useEffect(() => {
        if (originalImage) {
            const img = new Image();
            img.src = originalImage;
            img.onload = () => {
                setImgObj(img);
                
                // Auto-fit: calculate zoom to fit image in container
                const container = containerRef.current;
                if (container) {
                    const containerWidth = container.clientWidth;
                    const containerHeight = container.clientHeight;
                    
                    // Add padding (90% of container)
                    const availableWidth = containerWidth * 0.9;
                    const availableHeight = containerHeight * 0.9;
                    
                    const scaleX = availableWidth / img.width;
                    const scaleY = availableHeight / img.height;
                    
                    // Use the smaller scale to fit entirely
                    const fitZoom = Math.min(scaleX, scaleY, 1); // Cap at 1 (don't zoom in small images)
                    
                    setZoom(fitZoom);
                    setPan({ x: 0, y: 0 }); // Reset pan
                }
            };
        }
    }, [originalImage, setZoom, setPan]);

    // Sync offscreen canvas when the actual history state changes
    // (guards against identity changes of `history`/`render` causing redundant
    //  full-canvas decodes on unrelated re-renders)
    const lastSyncedHistoryRef = useRef<string | null>(null);
    useEffect(() => {
        if (history.length > 0 && historyIndex >= 0 && historyIndex < history.length) {
            const imgSrc = history[historyIndex];
            if (lastSyncedHistoryRef.current === imgSrc) return; // already on screen
            lastSyncedHistoryRef.current = imgSrc;
            const img = new Image();
            img.src = imgSrc;
            img.onload = () => {
                const osc = refs.offscreenCanvasRef.current;
                if (osc) {
                    const ctx = osc.getContext('2d');
                    if (ctx) {
                        ctx.clearRect(0, 0, osc.width, osc.height);
                        ctx.drawImage(img, 0, 0);
                        bumpSourceRevision();
                        render();
                    }
                }
            };
        }
    }, [history, historyIndex, refs.offscreenCanvasRef, render, bumpSourceRevision]);

    // Update offscreen canvas when a NEW processed image arrives
    const lastSyncedProcessedImageRef = useRef<string | null>(null);
    useEffect(() => {
        if (processedImage && imgObj) {
            if (lastSyncedProcessedImageRef.current === processedImage) return;
            lastSyncedProcessedImageRef.current = processedImage;
            const img = new Image();
            img.src = processedImage;
            img.onload = () => {
                const osc = refs.offscreenCanvasRef.current;
                if (osc) {
                    const ctx = osc.getContext('2d');
                    if (ctx) {
                        ctx.clearRect(0, 0, osc.width, osc.height);
                        ctx.drawImage(img, 0, 0);
                        bumpSourceRevision();
                        render();
                    }
                }
            };
        }
    }, [processedImage, imgObj, refs.offscreenCanvasRef, render, bumpSourceRevision]);

    // Re-render when modes change
    useEffect(() => {
        render();
    }, [render]);

    // Non-passive wheel listener (fix #9): React attaches onWheel passively,
    // so e.preventDefault() there is a no-op and the page scrolls while
    // zooming. A native listener with { passive: false } actually blocks it.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();

            // Coalesce store updates into one animation frame:
            // rapid wheel events no longer queue a store write + re-render each.
            if (pendingZoomRef.current === null) {
                const { zoom: z, pan: p } = zoomPanRef.current;
                pendingZoomRef.current = { zoom: z, pan: { x: p.x, y: p.y } };
            }
            const pending = pendingZoomRef.current;
            const zoomRatio = e.deltaY > 0 ? 0.9 : 1.1;
            pending.zoom = Math.min(Math.max(pending.zoom * zoomRatio, 0.1), 5);

            // Cursor-anchored zoom (fix #3 regression): keep the point under
            // the mouse visually fixed while zooming. Mouse position is
            // measured relative to the container center — the transform's
            // origin — and pan is adjusted so
            // mouse = mouse − (mouse − pan) · zoomRatio holds afterwards.
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left - rect.width / 2;
            const mouseY = e.clientY - rect.top - rect.height / 2;
            pending.pan = {
                x: mouseX - (mouseX - pending.pan.x) * zoomRatio,
                y: mouseY - (mouseY - pending.pan.y) * zoomRatio,
            };

            if (zoomRafRef.current !== 0) return;
            zoomRafRef.current = requestAnimationFrame(() => {
                zoomRafRef.current = 0;
                const p = pendingZoomRef.current;
                if (!p) return;
                pendingZoomRef.current = null;
                setZoomRef.current(p.zoom);
                setPanRef.current(p.pan);
            });
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', onWheel);
            if (zoomRafRef.current !== 0) {
                cancelAnimationFrame(zoomRafRef.current);
                zoomRafRef.current = 0;
            }
        };
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (isCropping) {
            handleCropMouseDown(e);
            return;
        }
        // Flush any pending wheel-zoom before starting a drag/paint (fix #15):
        // otherwise the rAF callback can commit the zoom mid-gesture, and a
        // pending buffer seeded before a zoom-button click could commit a
        // stale zoom value one frame later.
        if (pendingZoomRef.current) {
            const p = pendingZoomRef.current;
            pendingZoomRef.current = null;
            if (zoomRafRef.current !== 0) {
                cancelAnimationFrame(zoomRafRef.current);
                zoomRafRef.current = 0;
            }
            setZoomRef.current(p.zoom);
            setPanRef.current(p.pan);
        }
        if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
            // Middle click, right click, or Alt+left click = pan
            setIsDragging(true);
            lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        } else if (e.button === 0) {
            // Left click = paint
            setIsDragging(true);
            paintSelection(e);
        }
    }, [isCropping, handleCropMouseDown, paintSelection]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        // Imperative cursor update — zero React renders
        updateCursor(e.clientX, e.clientY);

        if (isCropping) {
            handleCropMouseMove(e);
            return;
        }

        if (!isDragging) return;

        if (e.buttons === 4 || e.buttons === 2 || (e.buttons === 1 && e.altKey)) {
            // Pan (middle click = 4, right click = 2) — rAF-coalesced store writes
            if (panRafRef.current !== 0) return;
            panRafRef.current = requestAnimationFrame(() => {
                panRafRef.current = 0;
                const last = lastMousePosRef.current;
                const dx = e.clientX - last.x;
                const dy = e.clientY - last.y;
                const current = useAppStore.getState().pan;
                setPan({ x: current.x + dx, y: current.y + dy });
                lastMousePosRef.current = { x: e.clientX, y: e.clientY };
            });
        } else if (e.buttons === 1) {
            // Paint (already rAF-throttled inside useBrushPainting)
            paintSelection(e);
        }
    }, [isCropping, handleCropMouseMove, isDragging, setPan, paintSelection, updateCursor]);

    const handleMouseUp = useCallback(() => {
        if (isCropping) {
            handleCropMouseUp();
            return;
        }
        if (isDragging) {
            applySmartSelection();
        }
        setIsDragging(false);
    }, [isCropping, handleCropMouseUp, isDragging, applySmartSelection]);

    const handleMouseLeave = useCallback(() => {
        clearCursor();
        handleMouseUp();
    }, [clearCursor, handleMouseUp]);

    const handleZoomIn = useCallback(() => {
        setZoom(Math.min(zoom + 0.1, 5));
    }, [zoom, setZoom]);

    const handleZoomOut = useCallback(() => {
        setZoom(Math.max(zoom - 0.1, 0.1));
    }, [zoom, setZoom]);

    return (
        <div className="flex flex-col w-full h-full max-w-6xl mx-auto gap-6">
            {/* Toolbar */}
            <MemoizedCanvasToolbar
                brushMode={brushMode}
                brushSize={brushSize}
                zoom={zoom}
                historyIndex={historyIndex}
                historyLength={history.length}
                backgroundColor={backgroundColor}
                backgroundImage={backgroundImage}
                backgroundSize={backgroundSize}
                onBrushModeChange={setBrushMode}
                onBrushSizeChange={setBrushSize}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onFitToScreen={handleFitToScreen}
                onUndo={undo}
                onRedo={redo}
                onDownload={handleDownload}
                onReset={reset}
                onBackgroundColorChange={setBackgroundColor}
                onBackgroundImageChange={setBackgroundImage}
                onBackgroundSizeChange={setBackgroundSize}
                exportFormat={exportFormat}
                exportQuality={exportQuality}
                onExportFormatChange={setExportFormat}
                onExportQualityChange={setExportQuality}
                featherRadius={featherRadius}
                onFeatherRadiusChange={setFeatherRadius}
                shadowSettings={shadowSettings}
                onShadowChange={setShadowSettings}
                edgeRefinement={edgeRefinement}
                onEdgeRefinementChange={setEdgeRefinement}
                isCropping={isCropping}
                onStartCrop={handleStartCrop}
                onApplyCrop={handleApplyCrop}
                onCancelCrop={handleCancelCrop}
                onCopyToClipboard={handleCopyToClipboard}
                instantApply={instantApply}
                hasPendingStrokes={hasPendingStrokes}
                onInstantApplyChange={setInstantApply}
                onCommitStrokes={commitStrokes}
                onClearPendingStrokes={clearPendingStrokes}
            />

            {/* Canvas Container */}
            <div
                ref={containerRef}
                className="relative w-full flex-1 bg-zinc-900/50 rounded-xl overflow-hidden shadow-inner border border-zinc-800 touch-none flex items-center justify-center"
                style={{ cursor: isCropping ? getCursor() : 'crosshair' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onContextMenu={(e) => e.preventDefault()}
                role="application"
                aria-label={`Image editor canvas. ${isCropping ? 'Crop mode active. Press Enter to apply, Escape to cancel.' : `${brushMode === 'erase' ? 'Erase' : 'Restore'} mode active. Press E for erase, R for restore.`}`}
                tabIndex={0}
            >
                {/* Checkerboard Background - Fixed size, doesn't scale with zoom */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: `
                            linear-gradient(45deg, #18181b 25%, transparent 25%), 
                            linear-gradient(-45deg, #18181b 25%, transparent 25%), 
                            linear-gradient(45deg, transparent 75%, #18181b 75%), 
                            linear-gradient(-45deg, transparent 75%, #18181b 75%)
                        `,
                        backgroundSize: '16px 16px',
                        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                    }}
                />

                <div
                    style={{
                        transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                        transformOrigin: 'center',
                        transition: (isDragging || isTouching) ? 'none' : 'transform 0.1s ease-out',
                    }}
                    className="relative z-10"
                >
                    <canvas ref={canvasRef} />
                </div>

                {/* Cursor canvas - outside transform to stay fixed to mouse position */}
                <canvas 
                    ref={cursorCanvasRef} 
                    className="absolute inset-0 z-50 pointer-events-none"
                    style={{ width: '100%', height: '100%' }}
                />
            </div>

            {/* GitHub Star Toast */}
            <GitHubStarToast show={showToast} onClose={closeToast} />
        </div>
    );
};
