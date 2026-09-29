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

import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

interface TouchState {
    isPainting: boolean;
    isPanning: boolean;
    isPinching: boolean;
    isScrolling: boolean;
    lastTouchPos: { x: number; y: number };
    startTouchPos: { x: number; y: number };
    lastPinchDistance: number;
}

interface UseTouchEventsProps {
    setZoom: (zoom: number) => void;
    setPan: (pan: { x: number; y: number }) => void;
    onPaintStart: (x: number, y: number) => void;
    onPaintMove: (x: number, y: number) => void;
    onPaintEnd: () => void;
}

// Minimum movement to determine scroll vs paint intent (in pixels)
const SCROLL_THRESHOLD = 10;
// If vertical movement is this much greater than horizontal, it's a scroll
const SCROLL_RATIO = 1.5;
// Delay before applying smart selection after last touch (ms) - allows for quick multi-stroke painting
const PAINT_END_DEBOUNCE = 600;

// Calculate distance between two touch points
function getTouchDistance(touch1: React.Touch, touch2: React.Touch): number {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Get center point between two touches
function getTouchCenter(touch1: React.Touch, touch2: React.Touch): { x: number; y: number } {
    return {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
    };
}

export function useTouchEvents({
    setZoom,
    setPan,
    onPaintStart,
    onPaintMove,
    onPaintEnd,
}: UseTouchEventsProps) {
    const touchStateRef = useRef<TouchState>({
        isPainting: false,
        isPanning: false,
        isPinching: false,
        isScrolling: false,
        lastTouchPos: { x: 0, y: 0 },
        startTouchPos: { x: 0, y: 0 },
        lastPinchDistance: 0,
    });

    const [isTouching, setIsTouching] = useState(false);
    const paintEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasPaintedRef = useRef(false);

    // Cancel any pending paint end timer
    const cancelPaintEndTimer = useCallback(() => {
        if (paintEndTimerRef.current) {
            clearTimeout(paintEndTimerRef.current);
            paintEndTimerRef.current = null;
        }
    }, []);

    // Schedule paint end with debounce - allows for quick multi-stroke painting
    const schedulePaintEnd = useCallback(() => {
        cancelPaintEndTimer();
        paintEndTimerRef.current = setTimeout(() => {
            if (hasPaintedRef.current) {
                onPaintEnd();
                hasPaintedRef.current = false;
            }
            paintEndTimerRef.current = null;
        }, PAINT_END_DEBOUNCE);
    }, [cancelPaintEndTimer, onPaintEnd]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        // Cancel any pending paint end - user is still painting
        cancelPaintEndTimer();
        
        const touches = e.touches;

        if (touches.length === 1) {
            // Single finger - don't prevent default yet, wait to determine intent
            const touch = touches[0];
            touchStateRef.current = {
                ...touchStateRef.current,
                isPainting: false, // Don't start painting immediately
                isPanning: false,
                isPinching: false,
                isScrolling: false,
                lastTouchPos: { x: touch.clientX, y: touch.clientY },
                startTouchPos: { x: touch.clientX, y: touch.clientY },
            };
            // Don't set isTouching or call onPaintStart yet
        } else if (touches.length === 2) {
            // Two fingers = pinch zoom or pan - prevent default for this
            e.preventDefault();
            const touch1 = touches[0];
            const touch2 = touches[1];
            const distance = getTouchDistance(touch1, touch2);
            const center = getTouchCenter(touch1, touch2);

            touchStateRef.current = {
                ...touchStateRef.current,
                isPainting: false,
                isPanning: true,
                isPinching: true,
                isScrolling: false,
                lastTouchPos: center,
                startTouchPos: center,
                lastPinchDistance: distance,
            };
            setIsTouching(true);
        }
    }, [cancelPaintEndTimer]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        const touches = e.touches;
        const state = touchStateRef.current;

        if (touches.length === 1) {
            const touch = touches[0];
            const dx = touch.clientX - state.startTouchPos.x;
            const dy = touch.clientY - state.startTouchPos.y;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const totalMovement = Math.sqrt(dx * dx + dy * dy);

            // If we're already scrolling, let the browser handle it
            if (state.isScrolling) {
                return; // Don't prevent default, allow native scroll
            }

            // If we're already painting, continue painting
            if (state.isPainting) {
                e.preventDefault();
                onPaintMove(touch.clientX, touch.clientY);
                hasPaintedRef.current = true;
                touchStateRef.current.lastTouchPos = { x: touch.clientX, y: touch.clientY };
                return;
            }

            // Determine intent based on movement direction
            if (totalMovement > SCROLL_THRESHOLD) {
                // Check if movement is predominantly vertical (scroll intent)
                if (absDy > absDx * SCROLL_RATIO) {
                    // Vertical movement - user wants to scroll
                    touchStateRef.current.isScrolling = true;
                    setIsTouching(false);
                    // Don't prevent default - allow native scroll
                    return;
                } else {
                    // Horizontal or diagonal movement - user wants to paint
                    e.preventDefault();
                    touchStateRef.current.isPainting = true;
                    setIsTouching(true);
                    onPaintStart(state.startTouchPos.x, state.startTouchPos.y);
                    onPaintMove(touch.clientX, touch.clientY);
                    hasPaintedRef.current = true;
                    touchStateRef.current.lastTouchPos = { x: touch.clientX, y: touch.clientY };
                }
            }
            // If movement is small, wait for more data
        } else if (touches.length === 2 && (state.isPanning || state.isPinching)) {
            // Two finger pinch/pan - always prevent default
            e.preventDefault();
            const touch1 = touches[0];
            const touch2 = touches[1];
            const newDistance = getTouchDistance(touch1, touch2);
            const newCenter = getTouchCenter(touch1, touch2);

            // Read live state instead of captured values: this callback stays
            // referentially stable during gestures (no re-binding per frame)
            // and fast pinches no longer lag behind stale closures.
            const { zoom: currentZoom, pan: currentPan } = useAppStore.getState();

            // Pinch zoom
            if (state.lastPinchDistance > 0) {
                const scale = newDistance / state.lastPinchDistance;
                const newZoom = Math.min(Math.max(currentZoom * scale, 0.1), 5);
                setZoom(newZoom);
            }

            // Pan
            const dx = newCenter.x - state.lastTouchPos.x;
            const dy = newCenter.y - state.lastTouchPos.y;
            setPan({ x: currentPan.x + dx, y: currentPan.y + dy });

            touchStateRef.current.lastTouchPos = newCenter;
            touchStateRef.current.lastPinchDistance = newDistance;
        }
    }, [setZoom, setPan, onPaintStart, onPaintMove]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        const state = touchStateRef.current;

        // Only prevent default if we were painting/pinching (not scrolling)
        if (state.isPainting || state.isPanning || state.isPinching) {
            e.preventDefault();
        }

        // Schedule paint end with debounce - allows for quick multi-stroke painting
        // The selection marks stay visible until user stops painting for 600ms
        if (state.isPainting) {
            schedulePaintEnd();
        }

        // Reset if no more touches
        if (e.touches.length === 0) {
            touchStateRef.current = {
                isPainting: false,
                isPanning: false,
                isPinching: false,
                isScrolling: false,
                lastTouchPos: { x: 0, y: 0 },
                startTouchPos: { x: 0, y: 0 },
                lastPinchDistance: 0,
            };
            setIsTouching(false);
        } else if (e.touches.length === 1 && !state.isScrolling) {
            // Switched from two fingers to one - prepare for potential painting
            const touch = e.touches[0];
            touchStateRef.current = {
                isPainting: false,
                isPanning: false,
                isPinching: false,
                isScrolling: false,
                lastTouchPos: { x: touch.clientX, y: touch.clientY },
                startTouchPos: { x: touch.clientX, y: touch.clientY },
                lastPinchDistance: 0,
            };
            // Don't start painting immediately, wait for movement
        }
    }, [schedulePaintEnd]);

    return {
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        isTouching,
    };
}
