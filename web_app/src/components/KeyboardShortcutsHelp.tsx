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

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Keyboard, X } from 'lucide-react';

interface Shortcut {
    keys: string[];
    description: string;
}

const shortcuts: Shortcut[] = [
    { keys: ['E'], description: 'Switch to Erase mode' },
    { keys: ['R'], description: 'Switch to Restore mode' },
    { keys: ['['], description: 'Decrease brush size' },
    { keys: [']'], description: 'Increase brush size' },
    { keys: ['C'], description: 'Start crop tool' },
    { keys: ['Enter'], description: 'Apply crop' },
    { keys: ['Esc'], description: 'Cancel crop' },
    { keys: ['F'], description: 'Fit image to screen' },
    { keys: ['Ctrl', 'Z'], description: 'Undo' },
    { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo' },
    { keys: ['Ctrl', 'V'], description: 'Paste image from clipboard' },
];

export const KeyboardShortcutsHelp: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);

    // Expose modal state on <body> so useKeyboardShortcuts can ignore
    // E/R/C/F/Enter presses while the dialog is up (fix #24). Uses the
    // DOM (not an exported helper) so this file stays component-only for
    // fast refresh.
    useEffect(() => {
        document.body.dataset.shortcutsModalOpen = String(isOpen);
        return () => {
            delete document.body.dataset.shortcutsModalOpen;
        };
    }, [isOpen]);

    // Handle '?' key to toggle help
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    return (
        <>
            {/* Help button (fix #9): portaled to <body> — a fixed-position
                element inside the perspective container is positioned relative
                to that container, not the viewport. */}
            {createPortal(
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-4 right-4 z-40 p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 rounded-full shadow-lg transition-colors border border-zinc-700"
                    aria-label="Show keyboard shortcuts (press ? for shortcuts)"
                    title="Keyboard shortcuts (?)"
                >
                    <Keyboard className="w-5 h-5" />
                </button>,
                document.body
            )}

            {/* Modal overlay (fix #33): portaled to <body> so the fixed
                backdrop covers the true viewport, not the perspective container. */}
            {isOpen && createPortal(
                <div
                    className="fixed inset-0 backdrop-blur-xl bg-zinc-950/80 z-50 flex items-center justify-center p-4"
                    onClick={() => setIsOpen(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="shortcuts-title"
                >
                    <div
                        className="glass-strong rounded-3xl p-8 max-w-2xl mx-auto shadow-glow-strong preserve-3d animate-in zoom-in-95 duration-300 w-full max-h-[80vh] overflow-hidden"
                        style={{ transform: 'translateZ(var(--z-modal))' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between pb-4 border-b border-white/10">
                            <h2 id="shortcuts-title" className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                                <Keyboard className="w-5 h-5 text-lime-400" />
                                Keyboard Shortcuts
                            </h2>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors"
                                aria-label="Close shortcuts dialog"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Shortcuts list */}
                        <div className="py-4 overflow-y-auto max-h-[60vh]">
                            <ul className="space-y-3" role="list">
                                {shortcuts.map((shortcut, index) => (
                                    <li key={index} className="flex items-center justify-between gap-4">
                                        <span className="text-zinc-300 text-sm">{shortcut.description}</span>
                                        <div className="flex items-center gap-1">
                                            {shortcut.keys.map((key, keyIndex) => (
                                                <React.Fragment key={keyIndex}>
                                                    <kbd className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300 min-w-[24px] text-center">
                                                        {key}
                                                    </kbd>
                                                    {keyIndex < shortcut.keys.length - 1 && (
                                                        <span className="text-zinc-600 text-xs">+</span>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Footer */}
                        <div className="pt-4 border-t border-white/10">
                            <p className="text-xs text-zinc-500 text-center">
                                Press <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-400 font-mono">?</kbd> to toggle this dialog
                            </p>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
