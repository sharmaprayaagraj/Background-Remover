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

import { useState, useCallback, type RefObject } from 'react';
import type { CropRect } from '../store/useAppStore';

type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move' | null;

interface UseCropToolProps {
    canvasRef: RefObject<HTMLCanvasElement | null>;
    imgObj: HTMLImageElement | null;
    cropRect: CropRect | null;
    setCropRect: (rect: CropRect | null) => void;
}

interface UseCropToolReturn {
    handleCropMouseDown: (e: React.MouseEvent) => void;
    handleCropMouseMove: (e: React.MouseEvent) => void;
    handleCropMouseUp: () => void;
    activeHandle: HandlePosition;
    getCursor: () => string;
}

const HANDLE_SIZE = 10;
const MIN_CROP_SIZE = 20;

export function useCropTool({
    canvasRef,
    imgObj,
    cropRect,
    setCropRect,
}: UseCropToolProps): UseCropToolReturn {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [activeHandle, setActiveHandle] = useState<HandlePosition>(null);
    const [originalRect, setOriginalRect] = useState<CropRect | null>(null);

    // Convert screen coordinates to image coordinates
    // Uses the same approach as brush painting for consistency
    const screenToImage = useCallback((screenX: number, screenY: number) => {
        if (!canvasRef.current || !imgObj) return { x: 0, y: 0 };

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        
        // Calculate scale between canvas internal size and displayed size
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        // Convert screen to image coordinates
        const imageX = (screenX - rect.left) * scaleX;
        const imageY = (screenY - rect.top) * scaleY;

        return { x: imageX, y: imageY };
    }, [canvasRef, imgObj]);

    // Get the current scale factor for converting screen to image coordinates
    const getScale = useCallback(() => {
        if (!canvasRef.current) return 1;
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        return canvas.width / rect.width;
    }, [canvasRef]);

    // Check which handle (if any) is at the given image coordinates
    const getHandleAtPoint = useCallback((x: number, y: number): HandlePosition => {
        if (!cropRect) return null;

        // Scale the handle zone size based on current display scale
        const scale = getScale();
        const handleZoneSize = HANDLE_SIZE * scale;
        const { x: rx, y: ry, width: rw, height: rh } = cropRect;

        // Check corners first (they take priority)
        if (Math.abs(x - rx) < handleZoneSize && Math.abs(y - ry) < handleZoneSize) return 'nw';
        if (Math.abs(x - (rx + rw)) < handleZoneSize && Math.abs(y - ry) < handleZoneSize) return 'ne';
        if (Math.abs(x - rx) < handleZoneSize && Math.abs(y - (ry + rh)) < handleZoneSize) return 'sw';
        if (Math.abs(x - (rx + rw)) < handleZoneSize && Math.abs(y - (ry + rh)) < handleZoneSize) return 'se';

        // Check edges
        if (Math.abs(y - ry) < handleZoneSize && x > rx && x < rx + rw) return 'n';
        if (Math.abs(y - (ry + rh)) < handleZoneSize && x > rx && x < rx + rw) return 's';
        if (Math.abs(x - rx) < handleZoneSize && y > ry && y < ry + rh) return 'w';
        if (Math.abs(x - (rx + rw)) < handleZoneSize && y > ry && y < ry + rh) return 'e';

        // Check inside (for moving)
        if (x > rx && x < rx + rw && y > ry && y < ry + rh) return 'move';

        return null;
    }, [cropRect, getScale]);

    const handleCropMouseDown = useCallback((e: React.MouseEvent) => {
        if (!imgObj) return;

        const { x, y } = screenToImage(e.clientX, e.clientY);
        const handle = getHandleAtPoint(x, y);

        if (handle) {
            // Start resizing or moving existing crop
            setIsDragging(true);
            setActiveHandle(handle);
            setDragStart({ x, y });
            setOriginalRect(cropRect);
        } else {
            // Start new crop selection
            setIsDragging(true);
            setActiveHandle('se'); // Growing from top-left
            setDragStart({ x, y });
            setCropRect({ x, y, width: 0, height: 0 });
            setOriginalRect({ x, y, width: 0, height: 0 });
        }
    }, [imgObj, screenToImage, getHandleAtPoint, cropRect, setCropRect]);

    const handleCropMouseMove = useCallback((e: React.MouseEvent) => {
        const { x, y } = screenToImage(e.clientX, e.clientY);

        if (!isDragging) {
            // Just update cursor based on handle hover
            setActiveHandle(getHandleAtPoint(x, y));
            return;
        }

        if (!originalRect || !imgObj) return;

        const dx = x - dragStart.x;
        const dy = y - dragStart.y;

        let newRect: CropRect;

        switch (activeHandle) {
            case 'move':
                newRect = {
                    x: Math.max(0, Math.min(imgObj.width - originalRect.width, originalRect.x + dx)),
                    y: Math.max(0, Math.min(imgObj.height - originalRect.height, originalRect.y + dy)),
                    width: originalRect.width,
                    height: originalRect.height,
                };
                break;
            case 'nw': {
                // Moving edges are clamped FIRST, then size is derived from
                // the clamped position — the opposite order let x + width
                // exceed the image when the clamp kicked in (fix #4).
                const right = originalRect.x + originalRect.width;
                const bottom = originalRect.y + originalRect.height;
                const newX = Math.min(right - MIN_CROP_SIZE, Math.max(0, originalRect.x + dx));
                const newY = Math.min(bottom - MIN_CROP_SIZE, Math.max(0, originalRect.y + dy));
                newRect = {
                    x: newX,
                    y: newY,
                    width: right - newX,
                    height: bottom - newY,
                };
                break;
            }
            case 'ne': {
                const bottom = originalRect.y + originalRect.height;
                const newRight = Math.min(imgObj.width, Math.max(originalRect.x + MIN_CROP_SIZE, originalRect.x + originalRect.width + dx));
                const newY = Math.min(bottom - MIN_CROP_SIZE, Math.max(0, originalRect.y + dy));
                newRect = {
                    x: originalRect.x,
                    y: newY,
                    width: newRight - originalRect.x,
                    height: bottom - newY,
                };
                break;
            }
            case 'sw': {
                const right = originalRect.x + originalRect.width;
                const newBottom = Math.min(imgObj.height, Math.max(originalRect.y + MIN_CROP_SIZE, originalRect.y + originalRect.height + dy));
                const newX = Math.min(right - MIN_CROP_SIZE, Math.max(0, originalRect.x + dx));
                newRect = {
                    x: newX,
                    y: originalRect.y,
                    width: right - newX,
                    height: newBottom - originalRect.y,
                };
                break;
            }
            case 'se': {
                const newRight = Math.min(imgObj.width, Math.max(originalRect.x + MIN_CROP_SIZE, originalRect.x + originalRect.width + dx));
                const newBottom = Math.min(imgObj.height, Math.max(originalRect.y + MIN_CROP_SIZE, originalRect.y + originalRect.height + dy));
                newRect = {
                    x: originalRect.x,
                    y: originalRect.y,
                    width: newRight - originalRect.x,
                    height: newBottom - originalRect.y,
                };
                break;
            }
            case 'n': {
                const bottom = originalRect.y + originalRect.height;
                const newY = Math.min(bottom - MIN_CROP_SIZE, Math.max(0, originalRect.y + dy));
                newRect = {
                    x: originalRect.x,
                    y: newY,
                    width: originalRect.width,
                    height: bottom - newY,
                };
                break;
            }
            case 's': {
                const newBottom = Math.min(imgObj.height, Math.max(originalRect.y + MIN_CROP_SIZE, originalRect.y + originalRect.height + dy));
                newRect = {
                    x: originalRect.x,
                    y: originalRect.y,
                    width: originalRect.width,
                    height: newBottom - originalRect.y,
                };
                break;
            }
            case 'w': {
                const right = originalRect.x + originalRect.width;
                const newX = Math.min(right - MIN_CROP_SIZE, Math.max(0, originalRect.x + dx));
                newRect = {
                    x: newX,
                    y: originalRect.y,
                    width: right - newX,
                    height: originalRect.height,
                };
                break;
            }
            case 'e': {
                const newRight = Math.min(imgObj.width, Math.max(originalRect.x + MIN_CROP_SIZE, originalRect.x + originalRect.width + dx));
                newRect = {
                    x: originalRect.x,
                    y: originalRect.y,
                    width: newRight - originalRect.x,
                    height: originalRect.height,
                };
                break;
            }
            default:
                return;
        }

        setCropRect(newRect);
    }, [isDragging, originalRect, activeHandle, dragStart, imgObj, screenToImage, getHandleAtPoint, setCropRect]);

    const handleCropMouseUp = useCallback(() => {
        setIsDragging(false);
        setOriginalRect(null);
    }, []);

    const getCursor = useCallback((): string => {
        switch (activeHandle) {
            case 'nw':
            case 'se':
                return 'nwse-resize';
            case 'ne':
            case 'sw':
                return 'nesw-resize';
            case 'n':
            case 's':
                return 'ns-resize';
            case 'e':
            case 'w':
                return 'ew-resize';
            case 'move':
                return 'move';
            default:
                return 'crosshair';
        }
    }, [activeHandle]);

    return {
        handleCropMouseDown,
        handleCropMouseMove,
        handleCropMouseUp,
        activeHandle,
        getCursor,
    };
}
