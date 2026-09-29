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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { useToastStore, toast } from '../store/useToastStore';
import {
    calculateResizedDimensions,
    needsResize,
    formatDimensions,
    isLargeImage,
} from '../utils/imageResize';
import { applyEdgeRefinement } from '../utils/edgeRefinement';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// jsdom (and Node) don't provide ImageData — polyfill a minimal spec-shaped
// version so applyEdgeRefinement can construct its output.
if (typeof globalThis.ImageData === 'undefined') {
    class ImageDataPolyfill {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        constructor(data: Uint8ClampedArray, width: number, height?: number) {
            if (height === undefined) height = data.length / (4 * width);
            if (data.length !== width * height * 4) {
                throw new Error('ImageData: data length mismatch');
            }
            this.data = data;
            this.width = width;
            this.height = height;
        }
    }
    (globalThis as Record<string, unknown>).ImageData = ImageDataPolyfill;
}

/** Build a real ImageData-backed pixel buffer. */
function makeImageData(
    width: number,
    height: number,
    fill: (index: number) => [number, number, number, number] = () => [0, 0, 0, 0]
): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const [r, g, b, a] = fill(i);
        data[i * 4] = r;
        data[i * 4 + 1] = g;
        data[i * 4 + 2] = b;
        data[i * 4 + 3] = a;
    }
    return new ImageData(data, width, height);
}

/** A 1px hard border of opaque pixels on a transparent canvas. */
function makeAlphaRampImage(width: number, height: number): ImageData {
    return makeImageData(width, height, (i) => {
        const x = i % width;
        const y = Math.floor(i / width);
        const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        return isBorder ? [255, 0, 0, 255] : [0, 255, 0, 0];
    });
}

describe('STRESS: useAppStore history under hostile usage', () => {
    beforeEach(() => {
        useAppStore.getState().reset();
        vi.clearAllMocks();
    });

    it('handles 1,000 rapid history pushes without corruption', () => {
        for (let i = 0; i < 1000; i++) {
            useAppStore.getState().addToHistory(`state-${i}`);
        }
        const { history, historyIndex } = useAppStore.getState();
        expect(history).toHaveLength(10);
        expect(historyIndex).toBe(9);
        expect(history[9]).toBe('state-999');
        expect(history[0]).toBe('state-990');
    });

    it('survives an undo/redo/push storm (2,000 random-ish operations)', () => {
        let seed = 42;
        const rand = () => {
            // Deterministic LCG so failures reproduce
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };

        let pushes = 0;
        for (let i = 0; i < 2000; i++) {
            const roll = rand();
            const s = useAppStore.getState();
            if (roll < 0.45) {
                s.addToHistory(`push-${pushes++}`);
            } else if (roll < 0.7) {
                s.undo();
            } else {
                s.redo();
            }
        }

        const s = useAppStore.getState();
        expect(s.history.length).toBeLessThanOrEqual(10);
        expect(s.historyIndex).toBeGreaterThanOrEqual(-1);
        expect(s.historyIndex).toBeLessThanOrEqual(s.history.length - 1);
        // Invariant: current mask always matches what the history pointer says
        if (s.historyIndex >= 0) {
            expect(s.maskImage).toBe(s.history[s.historyIndex]);
        }
    });

    it('history replay via setMaskImage keeps processedImage in sync (undo pattern)', () => {
        useAppStore.getState().setProcessedImage('a.png');
        useAppStore.getState().addToHistory('b.png');
        useAppStore.getState().undo(); // idx=0, mask='a.png'
        // External code replaying the current history state must not desync exports
        useAppStore.getState().setMaskImage(useAppStore.getState().history[useAppStore.getState().historyIndex]);
        const s = useAppStore.getState();
        expect(s.maskImage).toBe('a.png');
        expect(s.processedImage).toBe('a.png'); // was stale 'b.png' before fix
    });

    it('setMaskImage with arbitrary value updates mask only (documented divergence)', () => {
        useAppStore.getState().setProcessedImage('a.png');
        useAppStore.getState().addToHistory('b.png');
        useAppStore.getState().setMaskImage('unrelated.png');
        const s = useAppStore.getState();
        expect(s.maskImage).toBe('unrelated.png');
        expect(s.processedImage).toBe('b.png'); // intentionally untouched for non-replay values
    });

    it('undo at empty history leaves state consistent (historyIndex stays -1)', () => {
        useAppStore.getState().undo();
        useAppStore.getState().redo();
        useAppStore.getState().undo();
        const s = useAppStore.getState();
        expect(s.historyIndex).toBe(-1);
        expect(s.history).toHaveLength(0);
    });

    it('redimension/interleaving: setProcessedImage after undo keeps history valid', () => {
        useAppStore.getState().setProcessedImage('first.png');
        useAppStore.getState().addToHistory('second.png');
        useAppStore.getState().undo();
        // New image loaded entirely (e.g. user re-processes)
        useAppStore.getState().setProcessedImage('fresh.png');
        const s = useAppStore.getState();
        expect(s.history).toEqual(['fresh.png']);
        expect(s.historyIndex).toBe(0);
        expect(s.maskImage).toBe('fresh.png');
    });
});

describe('STRESS: useAppStore with garbage inputs', () => {
    beforeEach(() => {
        useAppStore.getState().reset();
        vi.clearAllMocks();
    });

    it('setFeatherRadius clamps NaN, Infinity, and negatives', () => {
        useAppStore.getState().setFeatherRadius(10);
        useAppStore.getState().setFeatherRadius(NaN);
        expect(useAppStore.getState().featherRadius).toBe(0); // NaN → 0 (was NaN before fix #8)
        useAppStore.getState().setFeatherRadius(Infinity);
        expect(useAppStore.getState().featherRadius).toBe(20); // clamped by Math.min
        useAppStore.getState().setFeatherRadius(-100);
        expect(useAppStore.getState().featherRadius).toBe(0);
    });

    it('setExportQuality clamps hostile values', () => {
        useAppStore.getState().setExportQuality(-5);
        expect(useAppStore.getState().exportQuality).toBe(0.1);
        useAppStore.getState().setExportQuality(42);
        expect(useAppStore.getState().exportQuality).toBe(1);
        useAppStore.getState().setExportQuality(NaN);
        expect(useAppStore.getState().exportQuality).toBe(0.92); // NaN → default (was NaN before fix #8)
    });

    it('setProcessingProgress accepts out-of-range values (documents no clamping)', () => {
        useAppStore.getState().setProcessingProgress(150);
        expect(useAppStore.getState().processingProgress).toBe(150);
        useAppStore.getState().setProcessingProgress(-20);
        expect(useAppStore.getState().processingProgress).toBe(-20);
    });

    it('negative/zero-dimension crop rect can be stored safely (fix #12: applyCrop removed)', () => {
        useAppStore.getState().setOriginalImage('orig.png');
        useAppStore.getState().setProcessedImage('proc.png');
        useAppStore.getState().setCropRect({ x: -50, y: -50, width: 0, height: -10 });
        // The dead, broken async applyCrop was removed in fix #12; the live
        // path is applyCropImmediate, exercised below with hostile input.
        expect(() =>
            useAppStore
                .getState()
                .applyCropImmediate('cropped-orig.png', 'cropped-proc.png', null)
        ).not.toThrow();
        expect(useAppStore.getState().cropRect).toBeNull();
        expect(useAppStore.getState().isCropping).toBe(false);
    });

    it('applyCropImmediate with a hostile crop rect clears tool state', () => {
        useAppStore.getState().setCropRect({ x: 0, y: 0, width: 10, height: 10 });
        useAppStore.getState().applyCropImmediate('o.png', 'p.png', null);
        expect(useAppStore.getState().cropRect).toBeNull();
        expect(useAppStore.getState().maskImage).toBe('p.png');
    });
});

describe('STRESS: useToastStore lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Drain any pending timers and existing toasts
        vi.useRealTimers();
        useToastStore.setState({ toasts: [] });
    });

    // Fix #32: if an assertion throws while fake timers are active, timers
    // stayed fake for the rest of the file and poisoned later suites.
    afterEach(() => {
        vi.useRealTimers();
    });

    it('1,000 rapid toasts all register but the store caps rendered toasts at 5 (fix #16)', () => {
        // Fake timers: without the cap this test would otherwise schedule
        // 1,000 real 3s auto-dismiss timeouts that outlive the assertion
        // and linger in the worker (fix #13).
        vi.useFakeTimers();
        for (let i = 0; i < 1000; i++) {
            toast.info(`msg-${i}`);
        }
        // All 1,000 addToast calls ran; the store keeps only the newest 5 so
        // the DOM/timer count stays bounded (previously 1,000 live nodes).
        const toasts = useToastStore.getState().toasts;
        expect(toasts).toHaveLength(5);
        expect(toasts[4].message).toBe('msg-999');
    });

    it('duration=0 toasts never auto-remove (potential UI leak)', () => {
        toast.info('sticky', 0);
        vi.useFakeTimers();
        vi.advanceTimersByTime(60_000);
        expect(useToastStore.getState().toasts).toHaveLength(1);
        vi.useRealTimers();
    });

    it('removeToast with unknown id is a safe no-op', () => {
        toast.success('real');
        expect(() => useToastStore.getState().removeToast('nonexistent-id')).not.toThrow();
        expect(useToastStore.getState().toasts).toHaveLength(1);
    });
});

describe('STRESS: imageResize math edge cases', () => {
    it('zero/negative dimensions clamp to ≥1px so canvases are never 0-sized (fix #29)', () => {
        expect(needsResize({ width: 0, height: 0 })).toBe(false);
        expect(calculateResizedDimensions({ width: 0, height: 0 }, 100)).toEqual({ width: 1, height: 1 });
        expect(formatDimensions({ width: 0, height: 0 })).toBe('0 × 0');
    });

    it('NaN width in an oversized input clamps the NaN-derived edge to 1px (fix #29)', () => {
        expect(needsResize({ width: NaN, height: NaN })).toBe(false);
        const out = calculateResizedDimensions({ width: NaN, height: 1000 }, 500);
        // height (1000) > max (500) → portrait branch: height pinned to 500,
        // NaN-derived width clamps to 1 instead of being NaN (was NaN pre-fix).
        expect(out.width).toBe(1);
        expect(out.height).toBe(500);
    });

    it('Infinity width degenerates safely: short edge clamped to 1px instead of 0', () => {
        const out = calculateResizedDimensions({ width: Infinity, height: 1e9 }, 100);
        expect(out.width).toBe(100); // long edge pinned to max
        expect(out.height).toBe(1); // 100 / Infinity === 0 → clamped (was 0 before fix)
    });

    it('extreme panoramas keep at least 1px on the short edge (canvas-safe)', () => {
        const out = calculateResizedDimensions({ width: 100000, height: 10 }, 4096);
        expect(out.width).toBe(4096);
        expect(out.height).toBe(1); // was 0 before the clampDimension fix
        expect(out.height).toBeGreaterThanOrEqual(1);
    });

    it('isLargeImage with negative threshold still flags oversized images', () => {
        expect(isLargeImage({ width: 100, height: 100 }, -1)).toBe(true);
    });
});

describe('STRESS: edgeRefinement on degenerate images', () => {
    const fakeCtx = {} as CanvasRenderingContext2D;

    it('1x1 image with hair mode + full sliders does not crash', () => {
        const img = makeImageData(1, 1, () => [128, 128, 128, 128]);
        const out = applyEdgeRefinement(
            fakeCtx,
            img,
            { mode: 'hair', edgeContrast: 100, edgeSoftness: 100, colorDecontamination: 100 },
            img
        );
        expect(out.width).toBe(1);
        expect(out.height).toBe(1);
    });

    it('1xN sliver images survive all effects', () => {
        const img = makeImageData(1, 50, () => [100, 100, 100, 100]);
        const out = applyEdgeRefinement(
            fakeCtx,
            img,
            { mode: 'standard', edgeContrast: 80, edgeSoftness: 60, colorDecontamination: 40 },
            img
        );
        expect(out.height).toBe(50);
    });

    it('fully transparent image stays fully transparent after hair refinement', () => {
        const img = makeImageData(20, 20, () => [0, 0, 0, 0]);
        const out = applyEdgeRefinement(
            fakeCtx,
            img,
            { mode: 'hair', edgeContrast: 100, edgeSoftness: 100, colorDecontamination: 100 },
            img
        );
        let allTransparent = true;
        for (let i = 3; i < out.data.length; i += 4) {
            if (out.data[i] !== 0) allTransparent = false;
        }
        expect(allTransparent).toBe(true);
    });

    it('fully opaque image stays fully opaque after hair refinement', () => {
        const img = makeImageData(20, 20, () => [10, 20, 30, 255]);
        const out = applyEdgeRefinement(
            fakeCtx,
            img,
            { mode: 'hair', edgeContrast: 100, edgeSoftness: 100, colorDecontamination: 100 },
            img
        );
        let allOpaque = true;
        for (let i = 3; i < out.data.length; i += 4) {
            if (out.data[i] !== 255) allOpaque = false;
        }
        expect(allOpaque).toBe(true);
    });

    it('100x100 hard-edge image processes in under 2 seconds (perf sanity)', () => {
        const img = makeAlphaRampImage(100, 100);
        const start = performance.now();
        applyEdgeRefinement(
            fakeCtx,
            img,
            { mode: 'hair', edgeContrast: 80, edgeSoftness: 60, colorDecontamination: 40 },
            img
        );
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(2000);
    });

    it('perf scaling: 500x500 with max softness (quadratic dilation) — documents cost', () => {
        const img = makeAlphaRampImage(500, 500);
        const start = performance.now();
        applyEdgeRefinement(
            fakeCtx,
            img,
            { mode: 'hair', edgeContrast: 100, edgeSoftness: 100, colorDecontamination: 100 },
            img
        );
        const elapsed = performance.now() - start;
        // This is where the app will visibly hang on big images. Log, don't fail.
        console.info(`[stress] 500x500 max-sliders edgeRefinement took ${elapsed.toFixed(0)}ms`);
        expect(elapsed).toBeLessThan(30_000);
    });
});
