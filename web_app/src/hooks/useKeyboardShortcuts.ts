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

import { useEffect } from 'react';

interface UseKeyboardShortcutsProps {
    brushSize: number;
    setBrushSize: (size: number) => void;
    setBrushMode: (mode: 'erase' | 'restore') => void;
    undo: () => void;
    redo: () => void;
    onFitToScreen?: () => void;
    isCropping?: boolean;
    onStartCrop?: () => void;
    onApplyCrop?: () => void;
    onCancelCrop?: () => void;
    // Pending strokes
    hasPendingStrokes?: boolean;
    onCommitStrokes?: () => void;
    onClearPendingStrokes?: () => void;
}

export function useKeyboardShortcuts({
    brushSize,
    setBrushSize,
    setBrushMode,
    undo,
    redo,
    onFitToScreen,
    isCropping,
    onStartCrop,
    onApplyCrop,
    onCancelCrop,
    hasPendingStrokes,
    onCommitStrokes,
    onClearPendingStrokes,
}: UseKeyboardShortcutsProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            // Ignore editor shortcuts while any modal dialog is open
            // (fix #24): KeyboardShortcutsHelp exposes its state on
            // document.body so E/R/C/F/Enter/Escape never act underneath it.
            if (document.body.dataset.shortcutsModalOpen === 'true') {
                return;
            }

            if (e.key === '[') {
                setBrushSize(Math.max(brushSize - 10, 10));
            } else if (e.key === ']') {
                setBrushSize(Math.min(brushSize + 10, 200));
            } else if (e.key === 'e' || e.key === 'E') {
                setBrushMode('erase');
            } else if (e.key === 'r' || e.key === 'R') {
                setBrushMode('restore');
            } else if (e.key === 'c' || e.key === 'C') {
                if (!isCropping) {
                    onStartCrop?.();
                }
            } else if (e.key === 'Enter') {
                if (isCropping) {
                    e.preventDefault();
                    onApplyCrop?.();
                } else if (hasPendingStrokes) {
                    e.preventDefault();
                    onCommitStrokes?.();
                }
            } else if (e.key === 'Escape') {
                if (isCropping) {
                    e.preventDefault();
                    onCancelCrop?.();
                } else if (hasPendingStrokes) {
                    e.preventDefault();
                    onClearPendingStrokes?.();
                }
            } else if (e.key === 'f' || e.key === 'F') {
                onFitToScreen?.();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [brushSize, setBrushSize, setBrushMode, undo, redo, onFitToScreen, isCropping, onStartCrop, onApplyCrop, onCancelCrop, hasPendingStrokes, onCommitStrokes, onClearPendingStrokes]);
}
