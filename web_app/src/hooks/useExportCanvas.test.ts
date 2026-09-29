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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useExportCanvas } from './useExportCanvas';
import type { CanvasRefs } from './useCanvasRenderer';
import type { ShadowSettings, EdgeRefinementSettings } from '../store/useAppStore';

// Mock the toast store
vi.mock('../store/useToastStore', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('useExportCanvas', () => {
    let mockRefs: CanvasRefs;
    let mockShadowSettings: ShadowSettings;
    let mockEdgeRefinement: EdgeRefinementSettings;
    let originalCreateElement: typeof document.createElement;

    beforeEach(() => {
        vi.clearAllMocks();

        // Save original
        originalCreateElement = document.createElement.bind(document);

        mockShadowSettings = {
            type: 'none',
            color: '#000000',
            blur: 10,
            offsetX: 5,
            offsetY: 5,
            spread: 5,
        };

        mockEdgeRefinement = {
            mode: 'off',
            edgeContrast: 50,
            edgeSoftness: 30,
            colorDecontamination: 0,
        };

        // Create a minimal mock canvas using the real createElement
        const mockCanvas = originalCreateElement('canvas');
        mockCanvas.width = 100;
        mockCanvas.height = 100;

        mockRefs = {
            canvasRef: { current: null },
            cursorCanvasRef: { current: null },
            offscreenCanvasRef: { current: mockCanvas },
            selectionCanvasRef: { current: null },
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return handleDownload and handleCopyToClipboard functions', () => {
        const { result } = renderHook(() =>
            useExportCanvas({
                refs: mockRefs,
                backgroundColor: null,
                backgroundImage: null, backgroundSize: 'cover',
                featherRadius: 0,
                shadowSettings: mockShadowSettings,
                edgeRefinement: mockEdgeRefinement,
                exportFormat: 'png',
                exportQuality: 0.92,
            })
        );

        expect(typeof result.current.handleDownload).toBe('function');
        expect(typeof result.current.handleCopyToClipboard).toBe('function');
    });

    it('should not throw when refs are available', () => {
        const { result } = renderHook(() =>
            useExportCanvas({
                refs: mockRefs,
                backgroundColor: null,
                backgroundImage: null, backgroundSize: 'cover',
                featherRadius: 0,
                shadowSettings: mockShadowSettings,
                edgeRefinement: mockEdgeRefinement,
                exportFormat: 'png',
                exportQuality: 0.92,
            })
        );

        // The hook should return valid functions
        expect(result.current.handleDownload).toBeDefined();
        expect(result.current.handleCopyToClipboard).toBeDefined();
    });

    it('should handle null offscreen canvas gracefully', () => {
        const emptyRefs: CanvasRefs = {
            canvasRef: { current: null },
            cursorCanvasRef: { current: null },
            offscreenCanvasRef: { current: null },
            selectionCanvasRef: { current: null },
        };

        const { result } = renderHook(() =>
            useExportCanvas({
                refs: emptyRefs,
                backgroundColor: null,
                backgroundImage: null, backgroundSize: 'cover',
                featherRadius: 0,
                shadowSettings: mockShadowSettings,
                edgeRefinement: mockEdgeRefinement,
                exportFormat: 'png',
                exportQuality: 0.92,
            })
        );

        // Hook should still return valid functions
        expect(result.current.handleDownload).toBeDefined();
        expect(result.current.handleCopyToClipboard).toBeDefined();
    });

    it('should accept background color prop', () => {
        const { result } = renderHook(() =>
            useExportCanvas({
                refs: mockRefs,
                backgroundColor: '#FF0000',
                backgroundImage: null, backgroundSize: 'cover',
                featherRadius: 0,
                shadowSettings: mockShadowSettings,
                edgeRefinement: mockEdgeRefinement,
                exportFormat: 'png',
                exportQuality: 0.92,
            })
        );

        expect(result.current.handleDownload).toBeDefined();
    });

    it('should accept shadow settings with drop-shadow type', () => {
        const shadowWithDropShadow: ShadowSettings = {
            ...mockShadowSettings,
            type: 'drop-shadow',
        };

        const { result } = renderHook(() =>
            useExportCanvas({
                refs: mockRefs,
                backgroundColor: null,
                backgroundImage: null, backgroundSize: 'cover',
                featherRadius: 0,
                shadowSettings: shadowWithDropShadow,
                edgeRefinement: mockEdgeRefinement,
                exportFormat: 'png',
                exportQuality: 0.92,
            })
        );

        expect(result.current.handleDownload).toBeDefined();
    });

    it('should accept shadow settings with glow type', () => {
        const shadowWithGlow: ShadowSettings = {
            ...mockShadowSettings,
            type: 'glow',
        };

        const { result } = renderHook(() =>
            useExportCanvas({
                refs: mockRefs,
                backgroundColor: null,
                backgroundImage: null, backgroundSize: 'cover',
                featherRadius: 0,
                shadowSettings: shadowWithGlow,
                edgeRefinement: mockEdgeRefinement,
                exportFormat: 'png',
                exportQuality: 0.92,
            })
        );

        expect(result.current.handleDownload).toBeDefined();
    });

    it('should accept feather radius', () => {
        const { result } = renderHook(() =>
            useExportCanvas({
                refs: mockRefs,
                backgroundColor: null,
                backgroundImage: null, backgroundSize: 'cover',
                featherRadius: 10,
                shadowSettings: mockShadowSettings,
                edgeRefinement: mockEdgeRefinement,
                exportFormat: 'png',
                exportQuality: 0.92,
            })
        );

        expect(result.current.handleDownload).toBeDefined();
    });

    it('should accept different export formats', () => {
        const formats = ['png', 'jpeg', 'webp'] as const;
        
        formats.forEach(format => {
            const { result } = renderHook(() =>
                useExportCanvas({
                    refs: mockRefs,
                    backgroundColor: null,
                    backgroundImage: null, backgroundSize: 'cover',
                    featherRadius: 0,
                    shadowSettings: mockShadowSettings,
                    edgeRefinement: mockEdgeRefinement,
                    exportFormat: format,
                    exportQuality: 0.92,
                })
            );

            expect(result.current.handleDownload).toBeDefined();
        });
    });
});
