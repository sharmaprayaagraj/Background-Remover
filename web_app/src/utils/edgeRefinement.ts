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

import type { EdgeRefinementSettings } from '../store/useAppStore';

/* ------------------------------------------------------------------ *
 * Result cache — refinement is pure, so identical (revision, settings)
 * pairs return the cached ImageData instead of re-running the kernels.
 * The renderer bumps `lastSourceRevision` whenever offscreen pixels
 * change (brush commit, undo/redo, new image).
 * ------------------------------------------------------------------ */
let cacheRevision = -1;
let cacheSignature = '';
let cacheResult: ImageData | null = null;

/** Call whenever the source image pixels change (brush commit, undo/redo, new image). */
export function bumpEdgeRefinementSource(): number {
    return ++cacheRevision;
}

/**
 * Drop the cached refinement result. Call when a new image is loaded — the
 * cache would otherwise pin the previous image's full-frame ImageData
 * (~67 MB at 4096×4096) in memory until the next refinement run.
 */
export function clearEdgeRefinementCache(): void {
    cacheResult = null;
    cacheSignature = '';
}

/**
 * Apply edge refinement to an image using canvas operations.
 * This processes the alpha channel to improve edge quality.
 *
 * Pass `sourceRevision` (from `bumpEdgeRefinementSource`) to opt into result
 * caching: identical (revision, settings) pairs return the cached ImageData.
 * Omit it to always compute fresh (used by export's multi-pass flow).
 */
export function applyEdgeRefinement(
    _ctx: CanvasRenderingContext2D,
    imageData: ImageData,
    settings: EdgeRefinementSettings,
    originalImageData?: ImageData,
    sourceRevision?: number
): ImageData {
    if (settings.mode === 'off') {
        return imageData;
    }

    if (sourceRevision !== undefined) {
        const signature = `${settings.mode}|${settings.edgeContrast}|${settings.edgeSoftness}|${settings.colorDecontamination}`;
        if (
            cacheResult &&
            sourceRevision === cacheRevision &&
            signature === cacheSignature &&
            cacheResult.width === imageData.width &&
            cacheResult.height === imageData.height
        ) {
            return cacheResult;
        }
    }

    const { width, height } = imageData;
    const data = new Uint8ClampedArray(imageData.data);

    // Apply edge contrast (sharpen alpha edges)
    if (settings.edgeContrast > 0) {
        applyAlphaContrast(data, width, height, settings.edgeContrast / 100, settings.mode === 'hair');
    }

    // Apply edge softness (controlled blur on edges only)
    if (settings.edgeSoftness > 0) {
        applyEdgeSoftness(data, width, height, settings.edgeSoftness / 100);
    }

    // Apply color decontamination (remove background color spill)
    if (settings.colorDecontamination > 0 && originalImageData) {
        applyColorDecontamination(data, originalImageData.data, width, height, settings.colorDecontamination / 100);
    }

    const result = new ImageData(data, width, height);

    if (sourceRevision !== undefined) {
        const signature = `${settings.mode}|${settings.edgeContrast}|${settings.edgeSoftness}|${settings.colorDecontamination}`;
        cacheRevision = sourceRevision;
        cacheSignature = signature;
        cacheResult = result;
    }

    return result;
}

/**
 * Returns true if any pixel alpha is strictly between the given bounds.
 * Single O(N) pass — lets kernels skip work entirely when there are no
 * semi-transparent pixels (the common case for clean cutouts).
 */
function hasSemiTransparentPixels(data: Uint8ClampedArray, pixelCount: number, low: number, high: number): boolean {
    for (let i = 3; i < pixelCount * 4; i += 4) {
        const a = data[i];
        if (a > low && a < high) return true;
    }
    return false;
}

/**
 * O(N) sliding-window box blur pass (one axis).
 * Two perpendicular passes approximate a gaussian far faster than the
 * naive per-pixel neighborhood loop (O(N) vs O(N * r^2)).
 */
function boxBlurPass(
    src: Float32Array,
    dst: Float32Array,
    width: number,
    height: number,
    radius: number,
    vertical: boolean
): void {
    const windowSize = radius * 2 + 1;
    if (vertical) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let dy = -radius; dy <= radius; dy++) {
                const y = Math.min(height - 1, Math.max(0, dy));
                sum += src[y * width + x];
            }
            for (let y = 0; y < height; y++) {
                dst[y * width + x] = sum / windowSize;
                const outY = Math.max(0, y - radius);
                const inY = Math.min(height - 1, y + radius + 1);
                sum += src[inY * width + x] - src[outY * width + x];
            }
        }
    } else {
        for (let y = 0; y < height; y++) {
            let sum = 0;
            for (let dx = -radius; dx <= radius; dx++) {
                const x = Math.min(width - 1, Math.max(0, dx));
                sum += src[y * width + x];
            }
            for (let x = 0; x < width; x++) {
                dst[y * width + x] = sum / windowSize;
                const outX = Math.max(0, x - radius);
                const inX = Math.min(width - 1, x + radius + 1);
                sum += src[y * width + inX] - src[y * width + outX];
            }
        }
    }
}

/**
 * Apply contrast to alpha channel to sharpen edges.
 * For hair mode, uses a more aggressive edge detection.
 */
function applyAlphaContrast(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    strength: number,
    isHairMode: boolean
): void {
    const pixelCount = width * height;

    // Early out: no soft edges to sharpen
    if (!hasSemiTransparentPixels(data, pixelCount, 4, 251)) return;

    // Create a copy of alpha values
    const alphaValues = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
        alphaValues[i] = data[i * 4 + 3] / 255;
    }

    // Calculate edge strength for each pixel
    const edgeStrength = new Float32Array(pixelCount);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;

            // Sobel-like edge detection on alpha
            const left = alphaValues[idx - 1];
            const right = alphaValues[idx + 1];
            const up = alphaValues[idx - width];
            const down = alphaValues[idx + width];

            const gx = right - left;
            const gy = down - up;
            edgeStrength[idx] = Math.sqrt(gx * gx + gy * gy);
        }
    }

    // Apply contrast based on edge strength
    // Use stronger multipliers for more visible effect
    const contrastMultiplier = isHairMode ? 4.0 : 2.5;
    const threshold = isHairMode ? 0.3 : 0.5;

    for (let i = 0; i < pixelCount; i++) {
        const alpha = alphaValues[i];
        const edge = edgeStrength[i];

        // Lower edge detection threshold for more pixels to be affected
        if (edge > 0.005) {
            // Apply S-curve contrast to edge pixels
            let adjusted = alpha;

            // Sigmoid contrast with stronger effect
            const factor = strength * contrastMultiplier;
            if (alpha < threshold) {
                // Push low alpha values lower (toward transparent)
                adjusted = alpha * Math.pow(alpha / threshold, factor);
            } else {
                // Push high alpha values higher (toward opaque)
                adjusted = 1 - (1 - alpha) * Math.pow((1 - alpha) / (1 - threshold), factor);
            }

            // Blend based on edge strength - stronger blending for visibility
            const blendFactor = Math.min(edge * 5, 1) * strength;
            const finalAlpha = alpha * (1 - blendFactor) + adjusted * blendFactor;

            data[i * 4 + 3] = Math.round(Math.max(0, Math.min(255, finalAlpha * 255)));
        }
    }
}

/**
 * Apply softness to edges only, preserving interior detail.
 * Uses separable (O(N)) dilation and sliding-window box blur instead of
 * the previous O(N * r^2) neighborhood loops — ~7x faster at max strength.
 */
function applyEdgeSoftness(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    strength: number
): void {
    const pixelCount = width * height;

    // Early out: nothing to soften
    if (!hasSemiTransparentPixels(data, pixelCount, 5, 250)) return;

    // Create alpha buffer
    const alphaBuffer = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
        alphaBuffer[i] = data[i * 4 + 3] / 255;
    }

    // Find edge pixels (where alpha is between 0.05 and 0.95)
    const isEdge = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
        const alpha = alphaBuffer[i];
        isEdge[i] = (alpha > 0.02 && alpha < 0.98) ? 1 : 0;
    }

    // Separable edge-mask dilation (two 1D max passes with linear falloff)
    const dilationRadius = Math.ceil(strength * 3);
    const tmpMask = new Float32Array(pixelCount);
    const edgeMask = new Float32Array(pixelCount);

    for (let y = 0; y < height; y++) {
        const base = y * width;
        for (let x = 0; x < width; x++) {
            let m = 0;
            for (let dx = -dilationRadius; dx <= dilationRadius; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= width) continue;
                if (isEdge[base + nx]) {
                    const falloff = 1 - Math.abs(dx) / (dilationRadius + 1);
                    if (falloff > m) m = falloff;
                }
            }
            tmpMask[base + x] = m;
        }
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let m = 0;
            for (let dy = -dilationRadius; dy <= dilationRadius; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= height) continue;
                const v = tmpMask[ny * width + x];
                if (v > 0) {
                    const falloff = v * (1 - Math.abs(dy) / (dilationRadius + 1));
                    if (falloff > m) m = falloff;
                }
            }
            edgeMask[y * width + x] = m;
        }
    }

    // Sliding-window box blur (two full passes ≈ gaussian), O(N) regardless of radius
    const blurRadius = Math.ceil(strength * 2) + 1;
    const blurTmp = new Float32Array(pixelCount);
    const blurred = new Float32Array(pixelCount);
    boxBlurPass(alphaBuffer, blurTmp, width, height, blurRadius, false);
    boxBlurPass(blurTmp, blurred, width, height, blurRadius, true);
    boxBlurPass(blurred, blurTmp, width, height, blurRadius, false);
    boxBlurPass(blurTmp, blurred, width, height, blurRadius, true);

    // Apply blurred values based on edge mask
    for (let i = 0; i < pixelCount; i++) {
        const maskStrength = edgeMask[i] * strength;
        if (maskStrength > 0) {
            const final = alphaBuffer[i] * (1 - maskStrength) + blurred[i] * maskStrength;
            data[i * 4 + 3] = Math.round(Math.max(0, Math.min(255, final * 255)));
        }
    }
}

/**
 * Remove background color spill from edge pixels.
 *
 * For each semi-transparent pixel we estimate the nearby background color
 * from the most transparent pixels in the *original* image, then un-mix the
 * observed color:  fg = (observed - (1 - alpha) * bg) / alpha.
 * This genuinely uses `originalData` — previously the parameter was ignored
 * and the routine only blended toward interior colors (fix #6).
 */
function applyColorDecontamination(
    data: Uint8ClampedArray,
    originalData: Uint8ClampedArray,
    width: number,
    height: number,
    strength: number
): void {
    const pixelCount = width * height;
    const alphaBuffer = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
        alphaBuffer[i] = data[i * 4 + 3] / 255;
    }

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const alpha = alphaBuffer[idx];

            // Only process semi-transparent edge pixels
            if (alpha > 0.05 && alpha < 0.95) {
                const pixelIdx = idx * 4;

                // Estimate the local background color from the most
                // transparent ORIGINAL pixels in the neighborhood.
                let bgR = 0, bgG = 0, bgB = 0, bgWeight = 0;
                const searchRadius = 3;

                for (let dy = -searchRadius; dy <= searchRadius; dy++) {
                    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                        const ny = y + dy;
                        const nx = x + dx;
                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            const nidx = ny * width + nx;
                            const nPixelIdx = nidx * 4;
                            const nAlpha = originalData[nPixelIdx + 3] / 255;

                            if (nAlpha < 0.1) {
                                bgR += originalData[nPixelIdx];
                                bgG += originalData[nPixelIdx + 1];
                                bgB += originalData[nPixelIdx + 2];
                                bgWeight += 1;
                            }
                        }
                    }
                }

                if (bgWeight > 0) {
                    const bgAvgR = bgR / bgWeight;
                    const bgAvgG = bgG / bgWeight;
                    const bgAvgB = bgB / bgWeight;

                    // Un-mix the observed color assuming it was composited
                    // over the estimated background at this pixel's alpha.
                    const invAlpha = 1 / alpha;
                    let fgR = (data[pixelIdx] - (1 - alpha) * bgAvgR) * invAlpha;
                    let fgG = (data[pixelIdx + 1] - (1 - alpha) * bgAvgG) * invAlpha;
                    let fgB = (data[pixelIdx + 2] - (1 - alpha) * bgAvgB) * invAlpha;

                    // Blend the recovered foreground in by strength; keep the
                    // original color as fallback for out-of-range estimates.
                    const mix = Math.max(0, Math.min(1, strength));
                    const clamp = (v: number, fallback: number) => {
                        const c = Math.max(0, Math.min(255, v));
                        return Number.isFinite(c) ? c : fallback;
                    };
                    fgR = clamp(fgR, data[pixelIdx]);
                    fgG = clamp(fgG, data[pixelIdx + 1]);
                    fgB = clamp(fgB, data[pixelIdx + 2]);

                    data[pixelIdx] = Math.round(data[pixelIdx] * (1 - mix) + fgR * mix);
                    data[pixelIdx + 1] = Math.round(data[pixelIdx + 1] * (1 - mix) + fgG * mix);
                    data[pixelIdx + 2] = Math.round(data[pixelIdx + 2] * (1 - mix) + fgB * mix);
                }
            }
        }
    }
}
