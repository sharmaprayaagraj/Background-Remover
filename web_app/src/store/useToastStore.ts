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

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastState {
    toasts: Toast[];
    addToast: (message: string, type?: ToastType, duration?: number) => void;
    removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    
    addToast: (message, type = 'success', duration = 3000) => {
        // crypto.randomUUID with fallbacks for older engines (fix #16:
        // String.prototype.substr is deprecated).
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const toast: Toast = { id, message, type, duration };
        
        set((state) => {
            let nextToasts = [...state.toasts, toast];
            // Cap simultaneous toasts: unbounded growth meant 1,000 queued
            // toasts produced 1,000 timers and 1,000 DOM nodes (fix #16).
            const MAX_TOASTS = 5;
            if (nextToasts.length > MAX_TOASTS) {
                nextToasts = nextToasts.slice(nextToasts.length - MAX_TOASTS);
            }
            return { toasts: nextToasts };
        });

        // Auto-remove after duration (duration <= 0 intentionally persists)
        if (duration > 0) {
            setTimeout(() => {
                set((state) => ({
                    toasts: state.toasts.filter((t) => t.id !== id),
                }));
            }, duration);
        }
    },

    removeToast: (id) => {
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        }));
    },
}));

// Convenience functions
export const toast = {
    success: (message: string, duration?: number) => 
        useToastStore.getState().addToast(message, 'success', duration),
    error: (message: string, duration?: number) => 
        useToastStore.getState().addToast(message, 'error', duration),
    info: (message: string, duration?: number) => 
        useToastStore.getState().addToast(message, 'info', duration),
};
