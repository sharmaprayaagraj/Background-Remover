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

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import type { ShadowSettings, ShadowType } from '../store/useAppStore';

interface ShadowPickerProps {
    shadowSettings: ShadowSettings;
    onShadowChange: (settings: Partial<ShadowSettings>) => void;
}

export const ShadowPicker: React.FC<ShadowPickerProps> = ({
    shadowSettings,
    onShadowChange,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
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

    // Close panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const typeLabels: Record<ShadowType, string> = {
        'none': 'None',
        'drop-shadow': 'Drop Shadow',
        'glow': 'Outer Glow',
    };

    const hasEffect = shadowSettings.type !== 'none';

    return (
        <div className="relative" ref={panelRef}>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                    hasEffect
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                        : 'text-zinc-400 bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 hover:text-purple-400'
                }`}
                title="Shadow/Glow Effects"
            >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Effects</span>
                <ChevronDown className="w-3 h-3" />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 glass rounded-2xl shadow-glow z-50 overflow-hidden">
                    <div className="p-4 space-y-4">
                        <h3 className="text-sm font-medium text-zinc-300">Shadow & Glow Effects</h3>

                        {/* Effect Type */}
                        <div className="space-y-2">
                            <label className="text-xs text-zinc-500 uppercase tracking-wider">Effect Type</label>
                            <div className="flex gap-1">
                                {(['none', 'drop-shadow', 'glow'] as ShadowType[]).map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => onShadowChange({ type })}
                                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors interactive-3d ${
                                            shadowSettings.type === type
                                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                        }`}
                                    >
                                        {typeLabels[type]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {shadowSettings.type !== 'none' && (
                            <>
                                {/* Color Picker */}
                                <div className="space-y-2">
                                    <label className="text-xs text-zinc-500 uppercase tracking-wider">
                                        {shadowSettings.type === 'glow' ? 'Glow Color' : 'Shadow Color'}
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="color"
                                            value={shadowSettings.color}
                                            onChange={(e) => onShadowChange({ color: e.target.value })}
                                            className="w-10 h-8 rounded border border-zinc-700 cursor-pointer bg-transparent"
                                        />
                                        <input
                                            type="text"
                                            value={shadowSettings.color}
                                            onChange={(e) => onShadowChange({ color: e.target.value })}
                                            className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-300"
                                        />
                                        {/* Preset colors */}
                                        <div className="flex gap-1">
                                            {shadowSettings.type === 'glow' 
                                                ? ['#ffffff', '#84cc16', '#3b82f6', '#ec4899'].map((color) => (
                                                    <button
                                                        key={color}
                                                        onClick={() => onShadowChange({ color })}
                                                        className="w-6 h-6 rounded border border-zinc-700 hover:scale-110 transition-transform interactive-3d"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                ))
                                                : ['#000000', '#1f2937', '#374151', '#6b7280'].map((color) => (
                                                    <button
                                                        key={color}
                                                        onClick={() => onShadowChange({ color })}
                                                        className="w-6 h-6 rounded border border-zinc-700 hover:scale-110 transition-transform interactive-3d"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                ))
                                            }
                                        </div>
                                    </div>
                                </div>

                                {/* Blur */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs text-zinc-500 uppercase tracking-wider">Blur</label>
                                        <span className="text-xs text-zinc-400">{shadowSettings.blur}px</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="50"
                                        value={shadowSettings.blur}
                                        onChange={(e) => onShadowChange({ blur: Number(e.target.value) })}
                                        className="w-full accent-purple-500 interactive-3d"
                                    />
                                </div>

                                {/* Offset (only for drop shadow) */}
                                {shadowSettings.type === 'drop-shadow' && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs text-zinc-500 uppercase tracking-wider">Offset</label>
                                            <span className="text-xs text-zinc-400">X: {shadowSettings.offsetX}, Y: {shadowSettings.offsetY}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-xs text-zinc-600">Horizontal</label>
                                                <input
                                                    type="range"
                                                    min="-50"
                                                    max="50"
                                                    value={shadowSettings.offsetX}
                                                    onChange={(e) => onShadowChange({ offsetX: Number(e.target.value) })}
                                                    className="w-full accent-purple-500 interactive-3d"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-zinc-600">Vertical</label>
                                                <input
                                                    type="range"
                                                    min="-50"
                                                    max="50"
                                                    value={shadowSettings.offsetY}
                                                    onChange={(e) => onShadowChange({ offsetY: Number(e.target.value) })}
                                                    className="w-full accent-purple-500 interactive-3d"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Spread (for glow intensity) */}
                                {shadowSettings.type === 'glow' && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs text-zinc-500 uppercase tracking-wider">Intensity</label>
                                            <span className="text-xs text-zinc-400">{shadowSettings.spread}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="20"
                                            value={shadowSettings.spread}
                                            onChange={(e) => onShadowChange({ spread: Number(e.target.value) })}
                                            className="w-full accent-purple-500 interactive-3d"
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
