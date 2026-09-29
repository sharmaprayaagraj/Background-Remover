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

/**
 * Maximum dimension (width or height) for processed images.
 * Images larger than this will be scaled down to prevent performance issues.
 */
export const MAX_IMAGE_DIMENSION = 4096;

/**
 * Maximum dimension for mobile devices to prevent out-of-memory crashes.
 * Mobile devices have significantly less memory available for processing.
 * Using 1024px to be very conservative - the AI model + canvas operations
 * can easily consume 500MB+ of RAM on larger images.
 */
export const MAX_IMAGE_DIMENSION_MOBILE = 1024;

/**
 * Threshold for showing a warning about large images.
 */
export const LARGE_IMAGE_THRESHOLD = 2048;

/**
 * Maximum upload file size in bytes. Shared by the upload and paste paths so
 * the two limits can never drift apart.
 */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Detect if the current device is a mobile device.
 * Uses multiple signals for reliable detection.
 */
export function isMobileDevice(): boolean {
    // Check for touch capability + small screen (most reliable for actual mobile)
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    
    // Also check user agent for mobile keywords
    const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Check if device memory is low (if available)
    const hasLowMemory = 'deviceMemory' in navigator && (navigator as { deviceMemory?: number }).deviceMemory !== undefined && (navigator as { deviceMemory?: number }).deviceMemory! < 4;
    
    return (hasTouchScreen && isSmallScreen) || mobileUserAgent || hasLowMemory;
}

/**
 * Get the appropriate max dimension based on device type.
 */
export function getMaxDimension(): number {
    return isMobileDevice() ? MAX_IMAGE_DIMENSION_MOBILE : MAX_IMAGE_DIMENSION;
}

export interface ImageDimensions {
    width: number;
    height: number;
}

export interface ResizeResult {
    dataUrl: string;
    originalDimensions: ImageDimensions;
    newDimensions: ImageDimensions;
    wasResized: boolean;
}

/**
 * Load an image from a data URL and return its dimensions.
 */
export function getImageDimensions(dataUrl: string): Promise<ImageDimensions> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => {
            reject(new Error('Failed to load image'));
        };
        img.src = dataUrl;
    });
}

/**
 * Check if an image needs to be resized based on its dimensions.
 */
export function needsResize(dimensions: ImageDimensions, maxDimension: number = MAX_IMAGE_DIMENSION): boolean {
    return dimensions.width > maxDimension || dimensions.height > maxDimension;
}

/**
 * Round a computed dimension and clamp to a minimum of 1px.
 * Guards against extreme aspect ratios (e.g. 100000x10 panoramas) and
 * non-finite values (NaN/Infinity), which would otherwise produce 0-width
 * or 0-height canvases and break downstream canvas operations.
 */
function clampDimension(value: number): number {
    return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
}

/**
 * Calculate new dimensions while maintaining aspect ratio.
 * Resulting dimensions are always at least 1px on each side.
 */
export function calculateResizedDimensions(
    original: ImageDimensions,
    maxDimension: number = MAX_IMAGE_DIMENSION
): ImageDimensions {
    const { width, height } = original;
    
    // Within limits → untouched. For valid inputs this is the fast path; a
    // NaN width/height fails both comparisons so degenerate inputs fall
    // through to the aspect-ratio math below, where every derived value is
    // clamped (fix #29: results are never 0 or non-finite).
    if (width <= maxDimension && height <= maxDimension) {
        // Within limits and valid → untouched fast path.
        if (width >= 1 && height >= 1) {
            return { width, height };
        }
        // Within limits but degenerate (0/negative) → still clamp so canvases
        // are never 0-sized (fix #29).
        return { width: clampDimension(width), height: clampDimension(height) };
    }

    const aspectRatio = width / height;
    
    if (width > height) {
        return {
            width: clampDimension(maxDimension),
            height: clampDimension(maxDimension / aspectRatio),
        };
    } else {
        return {
            width: clampDimension(maxDimension * aspectRatio),
            height: clampDimension(maxDimension),
        };
    }
}

/**
 * Resize an image if it exceeds the maximum dimension.
 *
 * Performance upgrades over the naive path:
 * - `createImageBitmap` decodes off the main thread when available (no main-thread
 *   image decode stall on multi-megapixel uploads)
 * - Large downscale factors use stepped halving, which is both faster per step
 *   and visually cleaner than a single bilinear crush from 8000px to 2048px
 */
export function resizeImageIfNeeded(
    dataUrl: string,
    maxDimension: number = MAX_IMAGE_DIMENSION
): Promise<ResizeResult> {
    const decode = async (): Promise<ImageBitmap | HTMLImageElement> => {
        if (typeof createImageBitmap === 'function') {
            try {
                const blob = await (await fetch(dataUrl)).blob();
                return await createImageBitmap(blob);
            } catch {
                // Fall through to the Image element path
            }
        }
        return new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image for resizing'));
            img.src = dataUrl;
        });
    };

    return decode().then((source) => {
        const originalDimensions = {
            width: source.width,
            height: source.height,
        };

        // Check if resize is needed
        if (!needsResize(originalDimensions, maxDimension)) {
            if ('close' in source && typeof source.close === 'function') {
                source.close(); // free ImageBitmap memory
            }
            return {
                dataUrl,
                originalDimensions,
                newDimensions: originalDimensions,
                wasResized: false,
            };
        }

        const newDimensions = calculateResizedDimensions(originalDimensions, maxDimension);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get canvas context');
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Stepped halving: shrink by 50% at a time until one final draw reaches target
        let currentW = originalDimensions.width;
        let currentH = originalDimensions.height;
        // CanvasImageSource is the honest type — a canvas is a valid drawImage
        // source without the old `as unknown as HTMLImageElement` lie (fix #29).
        let current: ImageBitmap | HTMLImageElement | HTMLCanvasElement = source;
        while (currentW / newDimensions.width >= 2) {
            const halfW = Math.max(1, Math.floor(currentW / 2));
            const halfH = Math.max(1, Math.floor(currentH / 2));
            const stepCanvas = document.createElement('canvas');
            stepCanvas.width = halfW;
            stepCanvas.height = halfH;
            const stepCtx = stepCanvas.getContext('2d');
            if (!stepCtx) break;
            stepCtx.imageSmoothingEnabled = true;
            stepCtx.imageSmoothingQuality = 'high';
            stepCtx.drawImage(current, 0, 0, halfW, halfH);
            current = stepCanvas;
            currentW = halfW;
            currentH = halfH;
        }

        canvas.width = newDimensions.width;
        canvas.height = newDimensions.height;
        ctx.drawImage(current, 0, 0, newDimensions.width, newDimensions.height);

        const resizedDataUrl = canvas.toDataURL('image/png');
        if ('close' in source && typeof source.close === 'function') {
            source.close(); // free ImageBitmap memory
        }

        return {
            dataUrl: resizedDataUrl,
            originalDimensions,
            newDimensions,
            wasResized: true,
        } as ResizeResult;
    }).catch((err) => {
        throw err instanceof Error ? err : new Error('Failed to load image for resizing');
    });
}

/**
 * Check if image is considered "large" (may cause slower processing).
 */
export function isLargeImage(dimensions: ImageDimensions, threshold: number = LARGE_IMAGE_THRESHOLD): boolean {
    return dimensions.width > threshold || dimensions.height > threshold;
}

/**
 * Format image dimensions for display.
 */
export function formatDimensions(dimensions: ImageDimensions): string {
    return `${dimensions.width} × ${dimensions.height}`;
}
