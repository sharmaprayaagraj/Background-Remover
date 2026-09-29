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

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ImageUploader } from './components/ImageUploader';
import { CanvasViewer } from './components/CanvasViewer';
import { ToastContainer } from './components/ToastContainer';
import { CanvasErrorBoundary } from './components/ErrorBoundary';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { useAppStore } from './store/useAppStore';
import { useBackgroundRemoval } from './hooks/useBackgroundRemoval';
import { useModelPreload } from './hooks/useModelPreload';
import { resizeImageIfNeeded, formatDimensions, getMaxDimension, MAX_FILE_SIZE_BYTES } from './utils/imageResize';
import { toast } from './store/useToastStore';
import { Github } from 'lucide-react';

function App() {
  const originalImage = useAppStore((state) => state.originalImage);
  const isProcessing = useAppStore((state) => state.isProcessing);
  const processingProgress = useAppStore((state) => state.processingProgress);
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);

  // Initialize background removal hook
  useBackgroundRemoval();

  // Preload the AI model and WASM files in the background for faster first processing
  const { isPreloading, progress: preloadProgress } = useModelPreload();

  // Get setOriginalImage for paste functionality
  const setOriginalImage = useAppStore((state) => state.setOriginalImage);

  // Global paste handler (Ctrl+V)
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    // Don't handle paste if already processing or in an input field
    if (isProcessing) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          // Enforce the same size limit as the upload path (fix #15)
          if (file.size > MAX_FILE_SIZE_BYTES) {
            setError(`File too large. Maximum size: ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`);
            return;
          }
          try {
            // Read file as data URL
            const reader = new FileReader();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error('Failed to read pasted image'));
              reader.readAsDataURL(file);
            });
            
            // Apply same resize logic as ImageUploader
            const resizeResult = await resizeImageIfNeeded(dataUrl, getMaxDimension());
            
            if (resizeResult.wasResized) {
              toast.info(
                `Image resized from ${formatDimensions(resizeResult.originalDimensions)} to ${formatDimensions(resizeResult.newDimensions)} for optimal performance`
              );
            }
            
            setOriginalImage(resizeResult.dataUrl);
          } catch (err) {
            console.error('Paste failed:', err);
            setError('Failed to process pasted image');
          }
        }
        break;
      }
    }
  }, [isProcessing, setOriginalImage, setError]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  return (
    <div className="min-h-screen text-zinc-100 selection:bg-lime-500/30 perspective-container">
      <div className="app-container preserve-3d">
      <main className={`max-w-7xl mx-auto px-4 py-8 animate-fade-in-up ${!originalImage ? 'min-h-[calc(100vh-8rem)] flex items-center' : 'h-[calc(100vh-8rem)]'}`}
            style={{ animationDelay: '0.1s' }}>
        {!originalImage ? (
          <div className="max-w-3xl mx-auto space-y-12 w-full">
            {/* Hero Section */}
            <div className="text-center space-y-6">
              <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight">
                <span className="block bg-gradient-to-r from-white via-zinc-100 to-white bg-clip-text text-transparent">Remove Backgrounds</span>
                <span className="block text-lime-400 mt-2">100% Automatically</span>
              </h1>
              <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                Free, open-source AI tool that runs entirely in your browser.
                <span className="block text-zinc-500 mt-2 text-base">Your images never leave your device. Complete privacy guaranteed.</span>
              </p>
            </div>

            {/* Upload Area */}
            <div className="max-w-2xl mx-auto">
              <ImageUploader />
            </div>

            {/* Preload indicator */}
            {isPreloading && (
              <div className="glass rounded-xl px-4 py-2 text-sm text-zinc-400 shadow-glow text-center max-w-md mx-auto">
                Loading AI model... {Math.round(preloadProgress)}%
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full">
            <CanvasErrorBoundary onReset={() => useAppStore.getState().reset()}>
              <CanvasViewer />
            </CanvasErrorBoundary>
          </div>
        )}
      </main>

      <footer className="py-6 border-t border-zinc-900">
        <div className="flex items-center justify-center gap-6">
          <div className="flex items-center gap-3">
            <img 
              src="/zebbern-avatar.png" 
              alt="zebbern" 
              className="w-8 h-8 rounded-full border border-zinc-700"
            />
            <span className="text-zinc-500 text-sm">Made by <a href="https://github.com/zebbern" target="_blank" rel="noopener noreferrer" className="text-lime-400 hover:text-lime-300 transition-colors">zebbern</a></span>
          </div>
          <a
            href="https://github.com/zebbern/backround_remover"
            target="_blank"
            rel="noopener noreferrer"
            className="glass-strong rounded-xl px-4 py-2 flex items-center gap-2 interactive-3d
                       hover:border-lime-500/50 hover:shadow-glow transition-all duration-300
                       group"
          >
            <Github className="w-4 h-4 transition-transform duration-300 group-hover:rotate-12" />
            <span className="font-medium text-sm">Star on GitHub</span>
          </a>
        </div>
      </footer>

      {/* Overlays (fix #33): rendered in a portal OUTSIDE the perspective /
          preserve-3d ancestor. Inside it, position:fixed becomes relative to
          the transformed container, so full-screen overlays sized themselves
          against the wrong box. */}
      {createPortal(
        <>
          {/* Error Banner */}
          {error && (
            <div className="fixed top-20 left-1/2 z-50 
                            glass-strong border border-red-500/50 text-red-400 px-6 py-3 rounded-xl 
                            flex items-center gap-4 shadow-glow-strong
                            animate-in slide-in-from-top duration-300"
                 style={{ transform: 'translateX(-50%)' }}>
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-300 transition-all duration-200
                           hover:scale-110 hover:rotate-90 interactive-3d font-bold text-lg"
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {/* Processing Overlay */}
          {isProcessing && (
            <div className="fixed inset-0 backdrop-blur-md bg-zinc-950/50 z-40 
                            flex items-center justify-center">
              <div className="glass-strong rounded-3xl p-8 shadow-glow-strong">
                <div className="text-center">
                  <div className="animate-glow-pulse text-lime-400 text-lg font-medium mb-4">
                    Processing...
                  </div>
                  <div className="w-64 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-lime-500 to-lime-400 transition-all duration-300"
                      style={{ width: `${processingProgress}%` }}
                    />
                  </div>
                  <div className="text-zinc-400 text-sm mt-2">
                    {processingProgress}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Toast Notifications */}
          <ToastContainer />
        </>,
        document.body
      )}

      <KeyboardShortcutsHelp />
      </div>
    </div>
  );
}

export default App;
