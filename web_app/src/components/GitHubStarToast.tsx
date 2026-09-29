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
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface GitHubStarToastProps {
    show: boolean;
    onClose: () => void;
}

export const GitHubStarToast: React.FC<GitHubStarToastProps> = ({ show, onClose }) => {
    if (!show) return null;

    // Portaled to <body>: fixed positioning inside the perspective container
    // would be relative to that container, not the viewport (fix #9).
    return createPortal(
        <div className="fixed bottom-8 right-8 z-50 animate-in slide-in-from-bottom fade-in duration-500">
            <div className="glass-strong text-zinc-100 p-4 rounded-2xl shadow-glow-strong preserve-3d flex items-center gap-4 max-w-sm border border-zinc-700/30 ring-1 ring-lime-500/20"
                 style={{ transform: 'translateZ(var(--z-modal))' }}>
                <div className="flex-1">
                    <p className="font-semibold text-sm">Happy with the result?</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Support us with a star on GitHub! ⭐</p>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href="https://github.com/zebbern/backround_remover"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="interactive-3d hover:scale-105 glass rounded-xl px-6 py-3 bg-lime-500 text-black text-xs font-bold hover:bg-lime-400 hover:border-lime-500/50 hover:shadow-glow transition-all duration-300"
                    >
                        Star
                    </a>
                    <button
                        onClick={onClose}
                        className="interactive-3d p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg hover:rotate-90 transition-all duration-200"
                        aria-label="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
