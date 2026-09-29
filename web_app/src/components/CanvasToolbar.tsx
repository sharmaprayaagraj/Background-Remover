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

import React, { useState, useEffect } from 'react';
import { Download, ZoomIn, ZoomOut, Minus, Plus, Undo, Redo, Maximize, ChevronDown, SlidersHorizontal, Crop, Check, X, Copy } from 'lucide-react';
import clsx from 'clsx';
import { BackgroundPicker } from './BackgroundPicker';
import { ShadowPicker } from './ShadowPicker';
import { EdgeRefinementPicker } from './EdgeRefinementPicker';
import type { ExportFormat, ShadowSettings, EdgeRefinementSettings, BackgroundSize } from '../store/useAppStore';

interface CanvasToolbarProps {
    brushMode: 'erase' | 'restore';
    brushSize: number;
    zoom: number;
    historyIndex: number;
    historyLength: number;
    backgroundColor: string | null;
    backgroundImage: string | null;
    backgroundSize: BackgroundSize;
    onBrushModeChange: (mode: 'erase' | 'restore') => void;
    onBrushSizeChange: (size: number) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitToScreen: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onDownload: () => void;
    onReset: () => void;
    onBackgroundColorChange: (color: string | null) => void;
    onBackgroundImageChange: (image: string | null) => void;
    onBackgroundSizeChange: (size: BackgroundSize) => void;
    exportFormat: ExportFormat;
    exportQuality: number;
    onExportFormatChange: (format: ExportFormat) => void;
    onExportQualityChange: (quality: number) => void;
    featherRadius: number;
    onFeatherRadiusChange: (value: number) => void;
    shadowSettings: ShadowSettings;
    onShadowChange: (settings: Partial<ShadowSettings>) => void;
    edgeRefinement: EdgeRefinementSettings;
    onEdgeRefinementChange: (settings: Partial<EdgeRefinementSettings>) => void;
    isCropping: boolean;
    onStartCrop: () => void;
    onApplyCrop: () => void;
    onCancelCrop: () => void;
    onCopyToClipboard: () => void;
    // Pending strokes
    instantApply: boolean;
    hasPendingStrokes: boolean;
    onInstantApplyChange: (value: boolean) => void;
    onCommitStrokes: () => void;
    onClearPendingStrokes: () => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
    brushMode,
    brushSize,
    zoom,
    historyIndex,
    historyLength,
    backgroundColor,
    backgroundImage,
    backgroundSize,
    onBrushModeChange,
    onBrushSizeChange,
    onZoomIn,
    onZoomOut,
    onFitToScreen,
    onUndo,
    onRedo,
    onDownload,
    onReset,
    onBackgroundColorChange,
    onBackgroundImageChange,
    onBackgroundSizeChange,
    exportFormat,
    exportQuality,
    onExportFormatChange,
    onExportQualityChange,
    featherRadius,
    onFeatherRadiusChange,
    shadowSettings,
    onShadowChange,
    edgeRefinement,
    onEdgeRefinementChange,
    isCropping,
    onStartCrop,
    onApplyCrop,
    onCancelCrop,
    onCopyToClipboard,
    instantApply,
    hasPendingStrokes,
    onInstantApplyChange,
    onCommitStrokes,
    onClearPendingStrokes,
}) => {
    const [showFormatMenu, setShowFormatMenu] = useState(false);
    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < historyLength - 1;

    // Close the format menu on Escape (fix #24)
    const formatButtonRef = React.useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!showFormatMenu) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setShowFormatMenu(false);
                formatButtonRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [showFormatMenu]);

    const formatLabels: Record<ExportFormat, string> = {
        png: 'PNG',
        jpeg: 'JPEG',
        webp: 'WebP',
    };

    return (
        <>
            {/* Main Toolbar - Mobile Responsive */}
            <div className="glass rounded-2xl p-3 flex flex-col gap-2 shadow-glow preserve-3d"
                 style={{ transform: 'translateZ(var(--z-controls))' }}>
                {/* Top Row - Essential Controls */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Brush Size Control */}
                    <div className="glass-strong flex items-center gap-2 px-2 py-1 rounded-xl">
                        <span className="text-xs font-medium text-zinc-500">Brush</span>
                        <button
                            onClick={() => onBrushSizeChange(Math.max(brushSize - 10, 10))}
                            className="px-3 py-2 rounded-xl text-zinc-400 hover:text-lime-400 transition-all duration-200 interactive-3d hover:bg-zinc-800/50 touch-manipulation"
                            title="Decrease size ([)"
                            aria-label="Decrease brush size"
                        >
                            <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-7 text-center font-mono text-sm text-zinc-200">{brushSize}</span>
                        <button
                            onClick={() => onBrushSizeChange(Math.min(brushSize + 10, 200))}
                            className="px-3 py-2 rounded-xl text-zinc-400 hover:text-lime-400 transition-all duration-200 interactive-3d hover:bg-zinc-800/50 touch-manipulation"
                            title="Increase size (])"
                            aria-label="Increase brush size"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Brush Mode Toggle */}
                    <div className="glass-strong flex items-center gap-1 rounded-xl p-1">
                        <button
                            onClick={() => onBrushModeChange('erase')}
                            className={clsx(
                                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 interactive-3d touch-manipulation",
                                brushMode === 'erase'
                                    ? "bg-red-500/20 text-red-400 border border-red-500/50"
                                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                            )}
                            title="Erase Mode (E)"
                            aria-pressed={brushMode === 'erase'}
                        >
                            <div className={clsx("w-2 h-2 rounded-full", brushMode === 'erase' ? "bg-red-500" : "bg-zinc-600")} />
                            <span className="hidden xs:inline">Erase</span>
                        </button>
                        <button
                            onClick={() => onBrushModeChange('restore')}
                            className={clsx(
                                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 interactive-3d touch-manipulation",
                                brushMode === 'restore'
                                    ? "bg-lime-500/20 text-lime-400 border border-lime-500/50"
                                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                            )}
                            title="Restore Mode (R)"
                            aria-pressed={brushMode === 'restore'}
                        >
                            <div className={clsx("w-2 h-2 rounded-full", brushMode === 'restore' ? "bg-lime-500" : "bg-zinc-600")} />
                            <span className="hidden xs:inline">Restore</span>
                        </button>
                    </div>

                    {/* Instant Apply Toggle & Pending Strokes Actions */}
                    <div className="glass-strong flex items-center gap-1 rounded-xl p-1">
                        <button
                            onClick={() => onInstantApplyChange(!instantApply)}
                            className={clsx(
                                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 interactive-3d touch-manipulation",
                                instantApply
                                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                                    : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                            )}
                            title={instantApply ? "Switch to Manual Apply" : "Switch to Instant Apply"}
                            aria-pressed={instantApply}
                        >
                            <div className={clsx("w-2 h-2 rounded-full", instantApply ? "bg-amber-500" : "bg-cyan-500")} />
                            <span className="hidden xs:inline">{instantApply ? 'Instant' : 'Manual'}</span>
                        </button>
                        
                        {/* Show Apply/Cancel only when in manual mode with pending strokes */}
                        {!instantApply && hasPendingStrokes && (
                            <>
                                <button
                                    onClick={onCommitStrokes}
                                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium bg-lime-500/20 text-lime-400 hover:bg-lime-500/30 border border-lime-500/50 hover:border-lime-500 hover:shadow-glow transition-all duration-200 interactive-3d touch-manipulation"
                                    title="Apply Changes (Enter)"
                                >
                                    <Check className="w-4 h-4" />
                                    <span className="hidden xs:inline">Apply</span>
                                </button>
                                <button
                                    onClick={onClearPendingStrokes}
                                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 hover:border-red-500 transition-all duration-200 interactive-3d touch-manipulation"
                                    title="Cancel (Escape)"
                                >
                                    <X className="w-4 h-4" />
                                    <span className="hidden xs:inline">Cancel</span>
                                </button>
                            </>
                        )}
                    </div>

                    {/* Background Picker */}
                    <BackgroundPicker
                        backgroundColor={backgroundColor}
                        backgroundImage={backgroundImage}
                        backgroundSize={backgroundSize}
                        onColorChange={onBackgroundColorChange}
                        onImageChange={onBackgroundImageChange}
                        onSizeChange={onBackgroundSizeChange}
                    />

                    {/* Shadow/Glow Effects */}
                    <ShadowPicker
                        shadowSettings={shadowSettings}
                        onShadowChange={onShadowChange}
                    />

                    {/* Edge Refinement */}
                    <EdgeRefinementPicker
                        settings={edgeRefinement}
                        onChange={onEdgeRefinementChange}
                    />

                    {/* Feather Edges Slider */}
                    <div className="glass-strong flex items-center gap-2 px-2 py-1 rounded-xl">
                        <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
                        <input
                            type="range"
                            min="0"
                            max="20"
                            step="1"
                            value={featherRadius}
                            onChange={(e) => onFeatherRadiusChange(parseInt(e.target.value))}
                            className="w-14 accent-lime-500"
                            title={`Feather Edges: ${featherRadius}px`}
                            disabled={isCropping}
                        />
                        <span className="w-4 text-center font-mono text-xs text-zinc-400">{featherRadius}</span>
                    </div>

                    {/* Crop Tool */}
                    {!isCropping ? (
                        <button
                            onClick={onStartCrop}
                            className="glass-strong flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-lime-400 hover:border-lime-500/50 hover:shadow-glow transition-all duration-200 interactive-3d touch-manipulation"
                            title="Crop Image (C)"
                        >
                            <Crop className="w-4 h-4" />
                            <span className="hidden sm:inline">Crop</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={onApplyCrop}
                                className="glass-strong flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium bg-lime-500/20 text-lime-400 hover:bg-lime-500/30 border border-lime-500/50 hover:border-lime-500 hover:shadow-glow transition-all duration-200 interactive-3d touch-manipulation"
                                title="Apply Crop (Enter)"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                            <button
                                onClick={onCancelCrop}
                                className="glass-strong flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:bg-zinc-800/50 hover:text-red-400 border hover:border-red-500/50 transition-all duration-200 interactive-3d touch-manipulation"
                                title="Cancel Crop (Escape)"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Undo/Redo */}
                    <div className="glass-strong flex items-center gap-0.5 p-1 rounded-xl">
                        <button
                            onClick={onUndo}
                            disabled={!canUndo}
                            className="px-3 py-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-xl disabled:opacity-30 disabled:hover:bg-transparent transition-all duration-200 interactive-3d touch-manipulation"
                            title="Undo (Ctrl+Z)"
                            aria-label="Undo"
                        >
                            <Undo className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onRedo}
                            disabled={!canRedo}
                            className="px-3 py-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-xl disabled:opacity-30 disabled:hover:bg-transparent transition-all duration-200 interactive-3d touch-manipulation"
                            title="Redo (Ctrl+Shift+Z)"
                            aria-label="Redo"
                        >
                            <Redo className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Zoom Controls */}
                    <div className="glass-strong flex items-center gap-0.5 p-1 rounded-xl">
                        <button 
                            onClick={onZoomOut} 
                            className="px-3 py-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-xl transition-all duration-200 interactive-3d touch-manipulation"
                            aria-label="Zoom out"
                            title="Zoom Out"
                        >
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={onFitToScreen} 
                            className="px-3 py-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-xl transition-all duration-200 interactive-3d touch-manipulation"
                            aria-label="Fit to screen"
                            title="Fit to Screen (F)"
                        >
                            <Maximize className="w-4 h-4" />
                        </button>
                        <span className="w-10 text-center font-mono text-xs text-zinc-400">{Math.round(zoom * 100)}%</span>
                        <button 
                            onClick={onZoomIn} 
                            className="px-3 py-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-xl transition-all duration-200 interactive-3d touch-manipulation"
                            aria-label="Zoom in"
                            title="Zoom In"
                        >
                            <ZoomIn className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom Bar */}
            <div className="flex flex-wrap justify-between items-center gap-2">
                <button
                    onClick={onReset}
                    className="glass-strong px-4 py-2.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 rounded-xl transition-all duration-200 interactive-3d text-sm font-medium touch-manipulation"
                >
                    Start Over
                </button>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Export Format Selector */}
                    <div className="relative">
                        <button
                            ref={formatButtonRef}
                            onClick={() => setShowFormatMenu(!showFormatMenu)}
                            className="glass-strong flex items-center gap-1.5 px-4 py-2.5 text-zinc-200 hover:text-lime-400 hover:border-lime-500/50 hover:shadow-glow rounded-xl text-sm font-medium transition-all duration-200 interactive-3d touch-manipulation"
                            title="Export format"
                        >
                            {formatLabels[exportFormat]}
                            <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        {showFormatMenu && (
                            <>
                                <div 
                                    className="fixed inset-0 z-40" 
                                    onClick={() => setShowFormatMenu(false)}
                                />
                                <div className="absolute right-0 bottom-full mb-2 z-50 glass-strong rounded-xl shadow-glow-strong overflow-hidden min-w-[140px]">
                                    {(['png', 'jpeg', 'webp'] as ExportFormat[]).map((format) => (
                                        <button
                                            key={format}
                                            onClick={() => {
                                                onExportFormatChange(format);
                                                setShowFormatMenu(false);
                                            }}
                                            className={clsx(
                                                "w-full px-4 py-2.5 text-left text-sm transition-all duration-200",
                                                exportFormat === format
                                                    ? "bg-lime-500/10 text-lime-400 border-l-2 border-lime-500"
                                                    : "text-zinc-300 hover:bg-zinc-800/50 border-l-2 border-transparent"
                                            )}
                                        >
                                            {formatLabels[format]}
                                            {format !== 'png' && (
                                                <span className="text-zinc-500 ml-2">({Math.round(exportQuality * 100)}%)</span>
                                            )}
                                        </button>
                                    ))}
                                    {exportFormat !== 'png' && (
                                        <div className="px-4 py-3 border-t border-zinc-800">
                                            <label className="text-xs text-zinc-500 block mb-2">Quality</label>
                                            <input
                                                type="range"
                                                min="10"
                                                max="100"
                                                value={Math.round(exportQuality * 100)}
                                                onChange={(e) => onExportQualityChange(parseInt(e.target.value) / 100)}
                                                className="w-full accent-lime-500"
                                            />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    <button
                        onClick={onCopyToClipboard}
                        className="glass-strong flex items-center justify-center gap-1.5 px-4 py-2.5 text-zinc-200 hover:text-lime-400 hover:border-lime-500/50 hover:shadow-glow rounded-xl font-medium transition-all duration-200 interactive-3d touch-manipulation"
                        title="Copy to Clipboard"
                    >
                        <Copy className="w-4 h-4" />
                        <span className="hidden sm:inline">Copy</span>
                    </button>

                    <button
                        onClick={onDownload}
                        className="glass-strong flex items-center justify-center gap-1.5 px-4 py-2.5 bg-lime-500 hover:bg-lime-400 text-black rounded-xl font-bold transition-all duration-200 shadow-glow-strong hover:shadow-glow-strong interactive-3d touch-manipulation"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden xs:inline">Download</span>
                    </button>
                </div>
            </div>
        </>
    );
};
