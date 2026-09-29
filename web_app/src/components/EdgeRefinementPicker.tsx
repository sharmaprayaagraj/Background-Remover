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

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import type { EdgeRefinementSettings, EdgeRefinementMode } from '../store/useAppStore';

interface EdgeRefinementPickerProps {
    settings: EdgeRefinementSettings;
    onChange: (settings: Partial<EdgeRefinementSettings>) => void;
}

const MODE_LABELS: Record<EdgeRefinementMode, { label: string; description: string }> = {
    off: { label: 'Off', description: 'No edge refinement' },
    standard: { label: 'Standard', description: 'Good for most subjects' },
    hair: { label: 'Hair/Fine Detail', description: 'Best for hair, fur, feathers' },
};

export const EdgeRefinementPicker: React.FC<EdgeRefinementPickerProps> = ({
    settings,
    onChange,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Close on Escape and restore focus to the trigger (fix #24)
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen]);

    const handleModeChange = useCallback((mode: EdgeRefinementMode) => {
        // Set sensible defaults based on mode
        if (mode === 'off') {
            onChange({ mode, edgeContrast: 50, edgeSoftness: 30, colorDecontamination: 0 });
        } else if (mode === 'standard') {
            onChange({ mode, edgeContrast: 60, edgeSoftness: 40, colorDecontamination: 20 });
        } else if (mode === 'hair') {
            onChange({ mode, edgeContrast: 80, edgeSoftness: 60, colorDecontamination: 40 });
        }
    }, [onChange]);

    const isActive = settings.mode !== 'off';

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation",
                    isActive
                        ? "bg-lime-500/10 text-lime-400 ring-1 ring-lime-500/50"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                )}
                title="Edge Refinement"
                aria-label="Edge refinement settings"
            >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Edges</span>
                <ChevronDown className={clsx("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsOpen(false)}
                    />
                    
                    {/* Dropdown Panel */}
                    <div className="absolute top-full left-0 mt-2 w-72 glass rounded-2xl shadow-glow z-50 overflow-hidden">
                        <div className="p-3 border-b border-zinc-800">
                            <h3 className="text-sm font-semibold text-zinc-100">Edge Refinement</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">Improve edges for hair & fine details</p>
                        </div>

                        {/* Mode Selection */}
                        <div className="p-3 space-y-2 border-b border-zinc-800">
                            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Mode</label>
                            <div className="grid grid-cols-3 gap-1">
                                {(Object.keys(MODE_LABELS) as EdgeRefinementMode[]).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => handleModeChange(mode)}
                                        className={clsx(
                                            "px-2 py-1.5 text-xs font-medium rounded-lg transition-colors interactive-3d",
                                            settings.mode === mode
                                                ? "bg-lime-500 text-black"
                                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                                        )}
                                    >
                                        {MODE_LABELS[mode].label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-zinc-500">{MODE_LABELS[settings.mode].description}</p>
                        </div>

                        {/* Sliders - only show when mode is not 'off' */}
                        {settings.mode !== 'off' && (
                            <div className="p-3 space-y-4">
                                {/* Edge Contrast */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-medium text-zinc-300">Edge Contrast</label>
                                        <span className="text-xs text-zinc-500">{settings.edgeContrast}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={settings.edgeContrast}
                                        onChange={(e) => onChange({ edgeContrast: Number(e.target.value) })}
                                        className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer interactive-3d
                                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                                            [&::-webkit-slider-thumb]:bg-lime-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                                            [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
                                    />
                                    <p className="text-[10px] text-zinc-500">Sharpens edge detection</p>
                                </div>

                                {/* Edge Softness */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-medium text-zinc-300">Edge Softness</label>
                                        <span className="text-xs text-zinc-500">{settings.edgeSoftness}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={settings.edgeSoftness}
                                        onChange={(e) => onChange({ edgeSoftness: Number(e.target.value) })}
                                        className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer interactive-3d
                                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                                            [&::-webkit-slider-thumb]:bg-lime-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                                            [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
                                    />
                                    <p className="text-[10px] text-zinc-500">Smooths edge transitions</p>
                                </div>

                                {/* Color Decontamination */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-medium text-zinc-300">Color Decontamination</label>
                                        <span className="text-xs text-zinc-500">{settings.colorDecontamination}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={settings.colorDecontamination}
                                        onChange={(e) => onChange({ colorDecontamination: Number(e.target.value) })}
                                        className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer interactive-3d
                                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                                            [&::-webkit-slider-thumb]:bg-lime-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                                            [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
                                    />
                                    <p className="text-[10px] text-zinc-500">Removes background color spill</p>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
