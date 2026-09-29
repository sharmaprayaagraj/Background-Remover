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

import { create } from 'zustand';

export type ExportFormat = 'png' | 'jpeg' | 'webp';
export type ShadowType = 'none' | 'drop-shadow' | 'glow';

export interface ShadowSettings {
    type: ShadowType;
    color: string;
    blur: number; // 0-50
    offsetX: number; // -50 to 50
    offsetY: number; // -50 to 50
    spread: number; // 0-20 (for glow effect intensity)
}

export interface CropRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type EdgeRefinementMode = 'off' | 'standard' | 'hair';

export type BackgroundSize = 'cover' | 'contain' | 'stretch' | 'tile';

export interface EdgeRefinementSettings {
    mode: EdgeRefinementMode;
    edgeContrast: number;      // 0-100: How much to sharpen edge detection
    edgeSoftness: number;      // 0-100: Softness of the edge transition
    colorDecontamination: number; // 0-100: Remove background color spill
}

interface AppState {
    originalImage: string | null; // URL or base64
    processedImage: string | null; // URL or base64
    maskImage: string | null; // URL or base64 of the mask
    isProcessing: boolean;
    processingProgress: number; // 0-100
    error: string | null;

    // Editing State
    brushSize: number;
    brushMode: 'erase' | 'restore';
    instantApply: boolean; // If false, user must confirm brush strokes
    hasPendingStrokes: boolean; // Whether there are uncommitted brush strokes
    zoom: number;
    pan: { x: number; y: number };
    featherRadius: number; // 0-20 feather/blur radius for edge softening

    // Crop state
    isCropping: boolean;
    cropRect: CropRect | null;

    // Edge refinement
    edgeRefinement: EdgeRefinementSettings;

    // Background replacement
    backgroundColor: string | null; // Hex color or null for transparent
    backgroundImage: string | null; // URL or base64 of custom background image
    backgroundSize: BackgroundSize; // How background image is scaled

    // Shadow/glow effect
    shadowSettings: ShadowSettings;

    // Export settings
    exportFormat: ExportFormat;
    exportQuality: number; // 0-1 for JPEG/WebP

    // History
    history: string[]; // Array of maskImage URLs
    historyIndex: number;

    setOriginalImage: (image: string | null) => void;
    setProcessedImage: (image: string | null) => void;
    setMaskImage: (image: string | null) => void;
    setIsProcessing: (isProcessing: boolean) => void;
    setProcessingProgress: (progress: number) => void;
    setError: (error: string | null) => void;

    setBrushSize: (size: number) => void;
    setBrushMode: (mode: 'erase' | 'restore') => void;
    setInstantApply: (instant: boolean) => void;
    setHasPendingStrokes: (pending: boolean) => void;
    setZoom: (zoom: number) => void;
    setPan: (pan: { x: number; y: number }) => void;
    setFeatherRadius: (value: number) => void;

    setIsCropping: (isCropping: boolean) => void;
    setCropRect: (rect: CropRect | null) => void;
    applyCropImmediate: (croppedOriginal: string, croppedProcessed: string, croppedMask: string | null) => void;

    setBackgroundColor: (color: string | null) => void;
    setBackgroundImage: (image: string | null) => void;
    setBackgroundSize: (size: BackgroundSize) => void;

    setEdgeRefinement: (settings: Partial<EdgeRefinementSettings>) => void;

    setShadowSettings: (settings: Partial<ShadowSettings>) => void;

    setExportFormat: (format: ExportFormat) => void;
    setExportQuality: (quality: number) => void;

    addToHistory: (maskImage: string) => void;
    undo: () => void;
    redo: () => void;

    reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
    originalImage: null,
    processedImage: null,
    maskImage: null,
    isProcessing: false,
    processingProgress: 0,
    error: null,

    brushSize: 50,
    brushMode: 'erase',
    instantApply: false, // Default: require confirmation for brush strokes
    hasPendingStrokes: false,
    zoom: 1,
    pan: { x: 0, y: 0 },
    featherRadius: 0,

    isCropping: false,
    cropRect: null,

    edgeRefinement: {
        mode: 'off',
        edgeContrast: 50,
        edgeSoftness: 30,
        colorDecontamination: 0,
    },

    backgroundColor: null,
    backgroundImage: null,
    backgroundSize: 'cover',

    shadowSettings: {
        type: 'none',
        color: '#000000',
        blur: 10,
        offsetX: 5,
        offsetY: 5,
        spread: 5,
    },

    exportFormat: 'png',
    exportQuality: 0.92,

    history: [],
    historyIndex: -1,

    setOriginalImage: (image) => {
        const state = get();
        // Cleanup previous blob URLs to prevent memory leaks
        if (state.originalImage?.startsWith('blob:')) {
            URL.revokeObjectURL(state.originalImage);
        }
        if (state.processedImage?.startsWith('blob:')) {
            URL.revokeObjectURL(state.processedImage);
        }
        if (state.maskImage?.startsWith('blob:')) {
            URL.revokeObjectURL(state.maskImage);
        }
        if (state.backgroundImage?.startsWith('blob:')) {
            URL.revokeObjectURL(state.backgroundImage);
        }
        // Cleanup history blob URLs
        state.history.forEach(url => {
            if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        });
        // Clear editor tool state so stale crop/pending-stroke flags don't
        // leak into the next image (fix #7).
        set({
            originalImage: image,
            processedImage: null,
            maskImage: null,
            error: null,
            history: [],
            historyIndex: -1,
            isCropping: false,
            cropRect: null,
            hasPendingStrokes: false,
        });
    },
    setProcessedImage: (image) => {
        const state = get();
        // Cleanup previous processed image blob URL
        if (state.processedImage?.startsWith('blob:')) {
            URL.revokeObjectURL(state.processedImage);
        }
        // Cleanup history blob URLs: the incoming image rewrites the whole
        // history, so the old entries would otherwise leak (fix #20).
        state.history.forEach(url => {
            if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        });
        set({ processedImage: image, maskImage: image });
        // Initialize history with the first processed image
        if (image) {
            set({ history: [image], historyIndex: 0 });
        }
    },
    setMaskImage: (image) => set((state) => {
        // When replaying a history state (undo/redo pattern), keep processedImage
        // in sync so exports/rendering can never desync from the visible mask.
        const isHistoryReplay = state.historyIndex >= 0 && state.history[state.historyIndex] === image;
        return isHistoryReplay ? { maskImage: image, processedImage: image } : { maskImage: image };
    }),
    setIsProcessing: (isProcessing) => set({ isProcessing }),
    setProcessingProgress: (progress) => set({ processingProgress: progress }),
    setError: (error) => set({ error }),

    setBrushSize: (size) => set({ brushSize: size }),
    setBrushMode: (mode) => set({ brushMode: mode }),
    setInstantApply: (instant) => set({ instantApply: instant }),
    setHasPendingStrokes: (pending) => set({ hasPendingStrokes: pending }),
    setZoom: (zoom) => set({ zoom }),
    setPan: (pan) => set({ pan }),
    // Clamp NaN to 0 and constrain to 0-20 (fix #8). Only NaN is remapped —
    // ±Infinity still flows through the min/max clamps (→ 20 / 0).
    setFeatherRadius: (value) => {
        const safe = Number.isNaN(value) ? 0 : value;
        set({ featherRadius: Math.max(0, Math.min(20, safe)) });
    },

    setIsCropping: (isCropping) => set({ isCropping, cropRect: isCropping ? get().cropRect : null }),
    setCropRect: (rect) => set({ cropRect: rect }),

    // Instant crop using pre-cropped data (no async image loading)
    applyCropImmediate: (croppedOriginal, croppedProcessed, croppedMask) => {
        const state = get();
        // Cleanup old URLs
        if (state.originalImage?.startsWith('blob:')) URL.revokeObjectURL(state.originalImage);
        if (state.processedImage?.startsWith('blob:')) URL.revokeObjectURL(state.processedImage);
        if (state.maskImage?.startsWith('blob:')) URL.revokeObjectURL(state.maskImage);
        state.history.forEach(url => {
            if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        });

        // croppedMask is derived from the processed image by the caller (fix #3):
        // only use it when it exists; never fall back to a blank overlay.
        const maskSource = croppedMask || croppedProcessed;

        set({
            originalImage: croppedOriginal,
            processedImage: croppedProcessed,
            maskImage: maskSource,
            isCropping: false,
            cropRect: null,
            history: [maskSource],
            historyIndex: 0,
            zoom: 1,
            pan: { x: 0, y: 0 }
        });
    },

    setBackgroundColor: (color) => {
        const state = get();
        // Cleanup previous background image blob URL when switching to color
        if (state.backgroundImage?.startsWith('blob:')) {
            URL.revokeObjectURL(state.backgroundImage);
        }
        set({ backgroundColor: color, backgroundImage: null });
    },
    setBackgroundImage: (image) => {
        const state = get();
        // Cleanup previous background image blob URL
        if (state.backgroundImage?.startsWith('blob:')) {
            URL.revokeObjectURL(state.backgroundImage);
        }
        set({ backgroundImage: image, backgroundColor: null });
    },
    setBackgroundSize: (size) => set({ backgroundSize: size }),

    setEdgeRefinement: (settings) => set((state) => ({
        edgeRefinement: { ...state.edgeRefinement, ...settings }
    })),

    setShadowSettings: (settings) => set((state) => ({
        shadowSettings: { ...state.shadowSettings, ...settings }
    })),

    setExportFormat: (format) => set({ exportFormat: format }),
    // Clamp NaN to the default and constrain to 0.1-1 (fix #8). ±Infinity
    // still flows through the clamps (→ 1 / 0.1).
    setExportQuality: (quality) => {
        const safe = Number.isNaN(quality) ? 0.92 : quality;
        set({ exportQuality: Math.max(0.1, Math.min(1, safe)) });
    },

    addToHistory: (maskImage) => {
        const { history, historyIndex } = get();
        
        // Cleanup blob URLs that will be removed (future states after current)
        const removedStates = history.slice(historyIndex + 1);
        removedStates.forEach(url => {
            if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        });
        
        // Slice history if we are in the middle
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(maskImage);

        // Limit history size to 10 steps to save memory
        if (newHistory.length > 10) {
            const removed = newHistory.shift();
            // Cleanup the oldest blob URL being removed
            if (removed?.startsWith('blob:')) URL.revokeObjectURL(removed);
        }

        set({
            history: newHistory,
            historyIndex: newHistory.length - 1,
            maskImage: maskImage,
            processedImage: maskImage // Update processedImage to reflect current state
        });
    },

    undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            const prevImage = history[newIndex];
            set({
                historyIndex: newIndex,
                maskImage: prevImage,
                processedImage: prevImage
            });
        }
    },

    redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            const nextImage = history[newIndex];
            set({
                historyIndex: newIndex,
                maskImage: nextImage,
                processedImage: nextImage
            });
        }
    },

    reset: () => {
        const state = get();
        // Cleanup all blob URLs to prevent memory leaks
        if (state.originalImage?.startsWith('blob:')) {
            URL.revokeObjectURL(state.originalImage);
        }
        if (state.processedImage?.startsWith('blob:')) {
            URL.revokeObjectURL(state.processedImage);
        }
        if (state.maskImage?.startsWith('blob:')) {
            URL.revokeObjectURL(state.maskImage);
        }
        if (state.backgroundImage?.startsWith('blob:')) {
            URL.revokeObjectURL(state.backgroundImage);
        }
        state.history.forEach(url => {
            if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        });
        set({
            originalImage: null,
            processedImage: null,
            maskImage: null,
            isProcessing: false,
            processingProgress: 0,
            error: null,
            zoom: 1,
            pan: { x: 0, y: 0 },
            backgroundColor: null,
            backgroundImage: null,
            history: [],
            historyIndex: -1,
            // Clear editor tool state so "Start Over" mid-crop doesn't leave
            // crop mode or dead Apply/Cancel buttons active (fix #7).
            isCropping: false,
            cropRect: null,
            hasPendingStrokes: false,
        });
    },
}));
