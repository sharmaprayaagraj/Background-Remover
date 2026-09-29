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

import BackgroundRemovalWorker from '../workers/backgroundRemoval.worker?worker';
import type { WorkerMessage, WorkerResponse } from '../workers/backgroundRemoval.worker';
import { isMobileDevice } from '../utils/imageResize';

export type ProgressCallback = (progress: number) => void;

class BackgroundRemovalService {
    private worker: Worker | null = null;
    private isPreloaded = false;
    private preloadPromise: Promise<void> | null = null;
    /** Monotonic request id generator. */
    private nextRequestId = 0;
    /** Pending jobs keyed by requestId; responses are routed by id. */
    private pendingJobs = new Map<string, {
        resolve: (result: Blob) => void;
        reject: (err: Error) => void;
        onProgress?: ProgressCallback;
        cleanup: () => void;
    }>();
    /** Single persistent listener routes worker messages to pending jobs. */
    private messageHandler: ((event: MessageEvent<WorkerResponse>) => void) | null = null;

    private getWorker(): Worker {
        if (!this.worker) {
            this.worker = new BackgroundRemovalWorker();
            this.messageHandler = (event: MessageEvent<WorkerResponse>) => {
                const { type, flow, requestId, progress, result, error } = event.data;

                // Process jobs are routed strictly by flow + requestId;
                // preload traffic has its own temporary listeners.
                if (flow !== 'process' || !requestId) return;

                const job = this.pendingJobs.get(requestId);
                if (!job) return;

                if (type === 'progress' && progress !== undefined) {
                    job.onProgress?.(progress);
                } else if (type === 'complete' && result) {
                    this.pendingJobs.delete(requestId);
                    job.cleanup();
                    const resultBlob = new Blob([result], { type: 'image/png' });
                    job.resolve(resultBlob);
                } else if (type === 'error') {
                    this.pendingJobs.delete(requestId);
                    job.cleanup();
                    job.reject(new Error(error || 'Worker error'));
                }
            };
            this.worker.addEventListener('message', this.messageHandler);
            // A crashed worker fails every pending job instead of hanging forever.
            this.worker.addEventListener('error', (event: ErrorEvent) => {
                const err = new Error(event.message || 'Worker error');
                for (const [id, job] of this.pendingJobs) {
                    job.cleanup();
                    job.reject(err);
                    this.pendingJobs.delete(id);
                }
                this.terminate();
            });
        }
        return this.worker;
    }

    /**
     * Preload WASM and ONNX model files in the background.
     * Call this early (e.g., on app mount) to speed up first image processing.
     */
    async preload(onProgress?: ProgressCallback): Promise<void> {
        // Return existing promise if already preloading
        if (this.preloadPromise) {
            return this.preloadPromise;
        }

        // Skip if already preloaded
        if (this.isPreloaded) {
            return Promise.resolve();
        }

        this.preloadPromise = new Promise((resolve, reject) => {
            const worker = this.getWorker();

            const handleMessage = (event: MessageEvent<WorkerResponse>) => {
                const { type, flow, progress, error } = event.data;

                // Only preload traffic belongs to this temporary listener;
                // process-job progress must not pollute the preload bar (fix #6).
                if (flow !== 'preload') return;

                if (type === 'progress' && onProgress && progress !== undefined) {
                    onProgress(progress);
                } else if (type === 'preload-complete') {
                    worker.removeEventListener('message', handleMessage);
                    worker.removeEventListener('error', handleError);
                    this.isPreloaded = true;
                    this.preloadPromise = null;
                    resolve();
                } else if (type === 'error') {
                    worker.removeEventListener('message', handleMessage);
                    worker.removeEventListener('error', handleError);
                    this.preloadPromise = null;
                    reject(new Error(error || 'Preload failed'));
                }
            };

            const handleError = (event: ErrorEvent) => {
                worker.removeEventListener('message', handleMessage);
                worker.removeEventListener('error', handleError);
                this.preloadPromise = null;
                reject(new Error(event.message || 'Worker error'));
            };

            worker.addEventListener('message', handleMessage);
            worker.addEventListener('error', handleError);

            const message: WorkerMessage = { type: 'preload', flow: 'preload', useCpu: isMobileDevice() };
            worker.postMessage(message);
        });

        return this.preloadPromise;
    }

    /**
     * Check if assets are preloaded
     */
    get preloaded(): boolean {
        return this.isPreloaded;
    }

    async removeBackground(
        imageSource: string | HTMLImageElement | Blob,
        onProgress?: ProgressCallback
    ): Promise<Blob> {
        // Convert image source to Blob if needed
        let blob: Blob;
        
        if (imageSource instanceof Blob) {
            blob = imageSource;
        } else if (typeof imageSource === 'string') {
            // Fetch the image and convert to blob
            const response = await fetch(imageSource);
            blob = await response.blob();
        } else if (imageSource instanceof HTMLImageElement) {
            // Convert HTMLImageElement to blob via canvas
            const canvas = document.createElement('canvas');
            canvas.width = imageSource.naturalWidth;
            canvas.height = imageSource.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not get canvas context');
            ctx.drawImage(imageSource, 0, 0);
            blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Failed to convert image')), 'image/png');
            });
        } else {
            throw new Error('Invalid image source type');
        }

        // Convert Blob to ArrayBuffer for worker transfer
        const arrayBuffer = await blob.arrayBuffer();
        const mimeType = blob.type || 'image/png';

        const requestId = `job-${++this.nextRequestId}`;

        return new Promise<Blob>((resolve, reject) => {
            const worker = this.getWorker();

            const job = {
                resolve,
                reject,
                onProgress,
                cleanup: () => {
                    // Removal from pendingJobs is done by the caller; this hook
                    // exists so future cleanup (e.g. progress map resets) has a home.
                },
            };
            this.pendingJobs.set(requestId, job);

            // Send message to worker with transferable ArrayBuffer
            const message: WorkerMessage = {
                type: 'process',
                flow: 'process',
                requestId,
                imageData: arrayBuffer,
                mimeType,
                useCpu: isMobileDevice(),
            };
            worker.postMessage(message, [arrayBuffer]);
        });
    }

    terminate(): void {
        if (this.worker) {
            if (this.messageHandler) {
                this.worker.removeEventListener('message', this.messageHandler);
            }
            this.worker.terminate();
            this.worker = null;
            this.messageHandler = null;
        }
    }
}

export const backgroundRemovalService = new BackgroundRemovalService();
