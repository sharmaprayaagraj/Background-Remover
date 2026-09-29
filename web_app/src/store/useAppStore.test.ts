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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from './useAppStore';

describe('useAppStore', () => {
    beforeEach(() => {
        // Reset the store before each test
        useAppStore.getState().reset();
        vi.clearAllMocks();
    });

    describe('image state', () => {
        it('should set original image and clear processed image', () => {
            useAppStore.getState().setOriginalImage('test-image.png');
            
            expect(useAppStore.getState().originalImage).toBe('test-image.png');
            expect(useAppStore.getState().processedImage).toBeNull();
            expect(useAppStore.getState().maskImage).toBeNull();
        });

        it('should set processed image and initialize history', () => {
            useAppStore.getState().setProcessedImage('processed.png');
            
            expect(useAppStore.getState().processedImage).toBe('processed.png');
            expect(useAppStore.getState().maskImage).toBe('processed.png');
            expect(useAppStore.getState().history).toHaveLength(1);
            expect(useAppStore.getState().historyIndex).toBe(0);
        });

        it('should clear error when setting new original image', () => {
            useAppStore.getState().setError('Some error');
            useAppStore.getState().setOriginalImage('new-image.png');
            
            expect(useAppStore.getState().error).toBeNull();
        });
    });

    describe('brush controls', () => {
        it('should update brush size', () => {
            useAppStore.getState().setBrushSize(75);
            expect(useAppStore.getState().brushSize).toBe(75);
        });

        it('should toggle brush mode', () => {
            expect(useAppStore.getState().brushMode).toBe('erase');
            
            useAppStore.getState().setBrushMode('restore');
            expect(useAppStore.getState().brushMode).toBe('restore');
            
            useAppStore.getState().setBrushMode('erase');
            expect(useAppStore.getState().brushMode).toBe('erase');
        });
    });

    describe('zoom and pan', () => {
        it('should update zoom level', () => {
            useAppStore.getState().setZoom(2.5);
            expect(useAppStore.getState().zoom).toBe(2.5);
        });

        it('should update pan position', () => {
            useAppStore.getState().setPan({ x: 100, y: -50 });
            expect(useAppStore.getState().pan).toEqual({ x: 100, y: -50 });
        });
    });

    describe('history management', () => {
        it('should add items to history', () => {
            useAppStore.getState().addToHistory('state1');
            expect(useAppStore.getState().history).toHaveLength(1);
            expect(useAppStore.getState().historyIndex).toBe(0);
            
            useAppStore.getState().addToHistory('state2');
            expect(useAppStore.getState().history).toHaveLength(2);
            expect(useAppStore.getState().historyIndex).toBe(1);
        });

        it('should limit history to 10 items', () => {
            for (let i = 0; i < 15; i++) {
                useAppStore.getState().addToHistory(`state${i}`);
            }
            
            expect(useAppStore.getState().history).toHaveLength(10);
            expect(useAppStore.getState().historyIndex).toBe(9);
        });

        it('should support undo', () => {
            useAppStore.getState().addToHistory('state1');
            useAppStore.getState().addToHistory('state2');
            useAppStore.getState().addToHistory('state3');
            
            expect(useAppStore.getState().historyIndex).toBe(2);
            
            useAppStore.getState().undo();
            expect(useAppStore.getState().historyIndex).toBe(1);
            expect(useAppStore.getState().maskImage).toBe('state2');
            
            useAppStore.getState().undo();
            expect(useAppStore.getState().historyIndex).toBe(0);
            expect(useAppStore.getState().maskImage).toBe('state1');
        });

        it('should not undo past the beginning', () => {
            useAppStore.getState().addToHistory('state1');
            
            useAppStore.getState().undo();
            useAppStore.getState().undo();
            useAppStore.getState().undo();
            
            expect(useAppStore.getState().historyIndex).toBe(0);
        });

        it('should support redo', () => {
            useAppStore.getState().addToHistory('state1');
            useAppStore.getState().addToHistory('state2');
            useAppStore.getState().addToHistory('state3');
            
            useAppStore.getState().undo();
            useAppStore.getState().undo();
            
            expect(useAppStore.getState().historyIndex).toBe(0);
            
            useAppStore.getState().redo();
            expect(useAppStore.getState().historyIndex).toBe(1);
            expect(useAppStore.getState().maskImage).toBe('state2');
        });

        it('should not redo past the end', () => {
            useAppStore.getState().addToHistory('state1');
            useAppStore.getState().addToHistory('state2');
            
            useAppStore.getState().redo();
            useAppStore.getState().redo();
            useAppStore.getState().redo();
            
            expect(useAppStore.getState().historyIndex).toBe(1);
        });

        it('should clear future history when adding new state after undo', () => {
            useAppStore.getState().addToHistory('state1');
            useAppStore.getState().addToHistory('state2');
            useAppStore.getState().addToHistory('state3');
            
            useAppStore.getState().undo();
            useAppStore.getState().undo();
            
            // Now at state1, add new state
            useAppStore.getState().addToHistory('state-new');
            
            expect(useAppStore.getState().history).toHaveLength(2);
            expect(useAppStore.getState().history).toEqual(['state1', 'state-new']);
        });
    });

    describe('error handling', () => {
        it('should set and clear errors', () => {
            useAppStore.getState().setError('Test error message');
            expect(useAppStore.getState().error).toBe('Test error message');
            
            useAppStore.getState().setError(null);
            expect(useAppStore.getState().error).toBeNull();
        });
    });

    describe('processing state', () => {
        it('should track processing state', () => {
            expect(useAppStore.getState().isProcessing).toBe(false);
            
            useAppStore.getState().setIsProcessing(true);
            expect(useAppStore.getState().isProcessing).toBe(true);
            
            useAppStore.getState().setIsProcessing(false);
            expect(useAppStore.getState().isProcessing).toBe(false);
        });

        it('should track processing progress', () => {
            expect(useAppStore.getState().processingProgress).toBe(0);
            
            useAppStore.getState().setProcessingProgress(50);
            expect(useAppStore.getState().processingProgress).toBe(50);
            
            useAppStore.getState().setProcessingProgress(100);
            expect(useAppStore.getState().processingProgress).toBe(100);
        });
    });

    describe('reset', () => {
        it('should reset all state to initial values', () => {
            // Set various states
            useAppStore.getState().setOriginalImage('image.png');
            useAppStore.getState().setProcessedImage('processed.png');
            useAppStore.getState().setError('error');
            useAppStore.getState().setBrushSize(100);
            useAppStore.getState().setBrushMode('restore');
            useAppStore.getState().setZoom(2);
            useAppStore.getState().setPan({ x: 50, y: 50 });
            useAppStore.getState().setIsProcessing(true);
            useAppStore.getState().setProcessingProgress(75);
            
            // Reset
            useAppStore.getState().reset();
            
            // Verify initial state
            expect(useAppStore.getState().originalImage).toBeNull();
            expect(useAppStore.getState().processedImage).toBeNull();
            expect(useAppStore.getState().maskImage).toBeNull();
            expect(useAppStore.getState().error).toBeNull();
            expect(useAppStore.getState().zoom).toBe(1);
            expect(useAppStore.getState().pan).toEqual({ x: 0, y: 0 });
            expect(useAppStore.getState().isProcessing).toBe(false);
            expect(useAppStore.getState().processingProgress).toBe(0);
            expect(useAppStore.getState().history).toHaveLength(0);
            expect(useAppStore.getState().historyIndex).toBe(-1);
        });
    });
});
