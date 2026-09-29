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

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { ImagePlus, X, Palette } from 'lucide-react';
import clsx from 'clsx';
import type { BackgroundSize } from '../store/useAppStore';
import { toast } from '../store/useToastStore';

interface BackgroundPickerProps {
    backgroundColor: string | null;
    backgroundImage: string | null;
    backgroundSize: BackgroundSize;
    onColorChange: (color: string | null) => void;
    onImageChange: (image: string | null) => void;
    onSizeChange: (size: BackgroundSize) => void;
}

const PRESET_COLORS = [
    null, // Transparent
    '#FFFFFF',
    '#000000',
    '#22C55E', // Green
    '#3B82F6', // Blue
    '#EF4444', // Red
    '#F59E0B', // Amber
    '#8B5CF6', // Purple
    '#EC4899', // Pink
];

const MAX_BACKGROUND_FILE_SIZE = 10 * 1024 * 1024; // 10MB — same cap as uploads

export const BackgroundPicker: React.FC<BackgroundPickerProps> = ({
    backgroundColor,
    backgroundImage,
    backgroundSize,
    onColorChange,
    onImageChange,
    onSizeChange,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [customColor, setCustomColor] = useState('#FFFFFF');
    const fileInputRef = useRef<HTMLInputElement>(null);
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

    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                return;
            }
            // Cap the size — background images are decoded into bitmaps and
            // held for the whole session (fix #19).
            if (file.size > MAX_BACKGROUND_FILE_SIZE) {
                toast.error(`Background image too large. Maximum size: ${MAX_BACKGROUND_FILE_SIZE / 1024 / 1024}MB`);
                return;
            }
            const url = URL.createObjectURL(file);
            onImageChange(url);
            setIsOpen(false);
        }
        // Reset input so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [onImageChange]);

    const handleColorSelect = useCallback((color: string | null) => {
        onColorChange(color);
        setIsOpen(false);
    }, [onColorChange]);

    const handleCustomColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setCustomColor(e.target.value);
    }, []);

    const handleCustomColorApply = useCallback(() => {
        onColorChange(customColor);
        setIsOpen(false);
    }, [customColor, onColorChange]);

    const clearBackground = useCallback(() => {
        onColorChange(null);
        setIsOpen(false);
    }, [onColorChange]);

    const hasBackground = backgroundColor !== null || backgroundImage !== null;

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation",
                    hasBackground
                        ? "bg-lime-500/10 text-lime-400 ring-1 ring-lime-500/50"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                )}
                title="Background"
                aria-label="Change background"
            >
                <Palette className="w-4 h-4" />
                <span className="hidden sm:inline">Background</span>
                {hasBackground && (
                    <span
                        className="w-4 h-4 rounded border border-zinc-600"
                        style={{
                            backgroundColor: backgroundColor || 'transparent',
                            backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
                            backgroundSize: 'cover',
                        }}
                    />
                )}
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsOpen(false)}
                    />
                    
                    {/* Dropdown */}
                    <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 z-50 glass rounded-2xl shadow-glow p-4 min-w-[280px]">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-zinc-200">Background</span>
                            {hasBackground && (
                                <button
                                    onClick={clearBackground}
                                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1"
                                >
                                    <X className="w-3 h-3" />
                                    Clear
                                </button>
                            )}
                        </div>

                        {/* Preset Colors */}
                        <div className="mb-4">
                            <span className="text-xs text-zinc-500 mb-2 block">Preset Colors</span>
                            <div className="grid grid-cols-9 gap-2">
                                {PRESET_COLORS.map((color, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleColorSelect(color)}
                                        className={clsx(
                                            "w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 interactive-3d",
                                            backgroundColor === color && !backgroundImage
                                                ? "border-lime-500 ring-2 ring-lime-500/30"
                                                : "border-zinc-700 hover:border-zinc-500"
                                        )}
                                        style={{
                                            backgroundColor: color || 'transparent',
                                            backgroundImage: color === null
                                                ? `linear-gradient(45deg, #27272a 25%, transparent 25%), 
                                                   linear-gradient(-45deg, #27272a 25%, transparent 25%), 
                                                   linear-gradient(45deg, transparent 75%, #27272a 75%), 
                                                   linear-gradient(-45deg, transparent 75%, #27272a 75%)`
                                                : undefined,
                                            backgroundSize: '8px 8px',
                                            backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                                        }}
                                        title={color === null ? 'Transparent' : color}
                                        aria-label={color === null ? 'Transparent' : `Color ${color}`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Custom Color */}
                        <div className="mb-4">
                            <span className="text-xs text-zinc-500 mb-2 block">Custom Color</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={customColor}
                                    onChange={handleCustomColorChange}
                                    className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-zinc-700"
                                />
                                <input
                                    type="text"
                                    value={customColor}
                                    onChange={handleCustomColorChange}
                                    className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono uppercase"
                                    placeholder="#FFFFFF"
                                />
                                <button
                                    onClick={handleCustomColorApply}
                                    className="px-3 py-2 bg-lime-500 hover:bg-lime-400 text-black text-sm font-medium rounded-lg transition-colors interactive-3d"
                                >
                                    Apply
                                </button>
                            </div>
                        </div>

                        {/* Image Upload */}
                        <div>
                            <span className="text-xs text-zinc-500 mb-2 block">Custom Image</span>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 border-dashed rounded-lg text-sm text-zinc-300 transition-colors interactive-3d"
                            >
                                <ImagePlus className="w-5 h-5" />
                                Upload Background Image
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                            />
                        </div>

                        {/* Current Background Preview */}
                        {backgroundImage && (
                            <div className="mt-4 pt-4 border-t border-zinc-800">
                                <span className="text-xs text-zinc-500 mb-2 block">Current Background</span>
                                <div className="relative">
                                    <img 
                                        src={backgroundImage} 
                                        alt="Background" 
                                        className="w-full h-20 object-cover rounded-lg"
                                    />
                                    <button
                                        onClick={clearBackground}
                                        className="absolute top-1 right-1 p-1 bg-zinc-900/80 hover:bg-red-500 rounded-full transition-colors"
                                        title="Remove background image"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                
                                {/* Background Size Selector */}
                                <div className="mt-3">
                                    <span className="text-xs text-zinc-500 mb-2 block">Background Size</span>
                                    <div className="grid grid-cols-4 gap-1">
                                        {(['cover', 'contain', 'stretch', 'tile'] as const).map((size) => (
                                            <button
                                                key={size}
                                                onClick={() => onSizeChange(size)}
                                                className={clsx(
                                                    "px-2 py-1.5 rounded text-xs font-medium transition-colors capitalize interactive-3d",
                                                    backgroundSize === size
                                                        ? "bg-lime-500/20 text-lime-400"
                                                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                                )}
                                            >
                                                {size}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
