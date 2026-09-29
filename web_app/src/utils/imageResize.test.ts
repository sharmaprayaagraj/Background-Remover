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

import { describe, it, expect } from 'vitest';
import {
    needsResize,
    calculateResizedDimensions,
    isLargeImage,
    formatDimensions,
    MAX_IMAGE_DIMENSION,
    LARGE_IMAGE_THRESHOLD,
} from './imageResize';

describe('imageResize utilities', () => {
    describe('needsResize', () => {
        it('should return false for images within limits', () => {
            expect(needsResize({ width: 1000, height: 1000 })).toBe(false);
            expect(needsResize({ width: 4096, height: 2048 })).toBe(false);
        });

        it('should return true for images exceeding width limit', () => {
            expect(needsResize({ width: 5000, height: 1000 })).toBe(true);
        });

        it('should return true for images exceeding height limit', () => {
            expect(needsResize({ width: 1000, height: 5000 })).toBe(true);
        });

        it('should respect custom max dimension', () => {
            expect(needsResize({ width: 1000, height: 1000 }, 500)).toBe(true);
            expect(needsResize({ width: 500, height: 500 }, 500)).toBe(false);
        });
    });

    describe('calculateResizedDimensions', () => {
        it('should return original dimensions if within limits', () => {
            const result = calculateResizedDimensions({ width: 1000, height: 800 });
            expect(result).toEqual({ width: 1000, height: 800 });
        });

        it('should scale down landscape images correctly', () => {
            const result = calculateResizedDimensions({ width: 8192, height: 4096 }, 4096);
            expect(result.width).toBe(4096);
            expect(result.height).toBe(2048);
        });

        it('should scale down portrait images correctly', () => {
            const result = calculateResizedDimensions({ width: 4096, height: 8192 }, 4096);
            expect(result.width).toBe(2048);
            expect(result.height).toBe(4096);
        });

        it('should scale down square images correctly', () => {
            const result = calculateResizedDimensions({ width: 8192, height: 8192 }, 4096);
            expect(result.width).toBe(4096);
            expect(result.height).toBe(4096);
        });

        it('should maintain aspect ratio', () => {
            const original = { width: 6000, height: 4000 };
            const result = calculateResizedDimensions(original, 3000);
            const originalRatio = original.width / original.height;
            const newRatio = result.width / result.height;
            expect(Math.abs(originalRatio - newRatio)).toBeLessThan(0.01);
        });
    });

    describe('isLargeImage', () => {
        it('should return false for small images', () => {
            expect(isLargeImage({ width: 1000, height: 1000 })).toBe(false);
        });

        it('should return true for large width', () => {
            expect(isLargeImage({ width: 3000, height: 1000 })).toBe(true);
        });

        it('should return true for large height', () => {
            expect(isLargeImage({ width: 1000, height: 3000 })).toBe(true);
        });

        it('should respect custom threshold', () => {
            expect(isLargeImage({ width: 1000, height: 1000 }, 500)).toBe(true);
        });
    });

    describe('formatDimensions', () => {
        it('should format dimensions correctly', () => {
            expect(formatDimensions({ width: 1920, height: 1080 })).toBe('1920 × 1080');
        });

        it('should handle large numbers', () => {
            expect(formatDimensions({ width: 8192, height: 4096 })).toBe('8192 × 4096');
        });
    });

    describe('constants', () => {
        it('should have reasonable default values', () => {
            expect(MAX_IMAGE_DIMENSION).toBe(4096);
            expect(LARGE_IMAGE_THRESHOLD).toBe(2048);
        });
    });
});
