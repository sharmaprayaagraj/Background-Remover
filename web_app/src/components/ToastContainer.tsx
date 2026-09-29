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

import React from 'react';
import { X, Check, AlertCircle, Info } from 'lucide-react';
import { useToastStore, type ToastType } from '../store/useToastStore';
import clsx from 'clsx';

const iconMap: Record<ToastType, React.ReactNode> = {
    success: <Check className="w-4 h-4" />,
    error: <AlertCircle className="w-4 h-4" />,
    info: <Info className="w-4 h-4" />,
};

const styleMap: Record<ToastType, string> = {
    success: 'bg-lime-500/10 border-lime-500/30 text-lime-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
};

const iconStyleMap: Record<ToastType, string> = {
    success: 'bg-lime-500/20 text-lime-400',
    error: 'bg-red-500/20 text-red-400',
    info: 'bg-blue-500/20 text-blue-400',
};

export const ToastContainer: React.FC = () => {
    const toasts = useToastStore((state) => state.toasts);
    const removeToast = useToastStore((state) => state.removeToast);

    return (
        <div
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none"
            role="region"
            aria-label="Notifications"
            aria-live="polite"
            aria-atomic="false"
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    role="status"
                    aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
                    className={clsx(
                        "glass-strong rounded-xl px-4 py-3 shadow-glow-strong preserve-3d",
                        "pointer-events-auto flex items-center gap-3",
                        "animate-in slide-in-from-right duration-300",
                        styleMap[toast.type]
                    )}
                    style={{ 
                        transform: 'translateZ(var(--z-modal))'
                    }}
                >
                    <div className={clsx("p-1.5 rounded-full", iconStyleMap[toast.type])} aria-hidden="true">
                        {iconMap[toast.type]}
                    </div>
                    <span className="text-sm font-medium text-zinc-100">{toast.message}</span>
                    <button
                        onClick={() => removeToast(toast.id)}
                        className="interactive-3d p-1 text-zinc-500 hover:text-zinc-300 rounded hover:rotate-90 transition-all duration-200 ml-2"
                        aria-label={`Dismiss notification: ${toast.message}`}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
};
