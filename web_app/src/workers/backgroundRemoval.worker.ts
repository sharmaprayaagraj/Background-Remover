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

import { removeBackground, preload, type Config } from '@imgly/background-removal';

export type WorkerFlow = 'preload' | 'process';

export interface WorkerMessage {
    type: 'process' | 'preload';
    /** Which flow a response belongs to — explicit so listeners never have
     *  to guess from the absence of a requestId (fix #6). */
    flow: WorkerFlow;
    /** Correlates responses to requests; required for concurrent process jobs. */
    requestId?: string;
    imageData?: ArrayBuffer;
    mimeType?: string;
    useCpu?: boolean; // Force CPU processing for mobile devices
}

export interface WorkerResponse {
    type: 'progress' | 'complete' | 'error' | 'preload-complete';
    /** Echoes the flow of the originating WorkerMessage. */
    flow: WorkerFlow;
    /** Echoes the requestId from the originating WorkerMessage. */
    requestId?: string;
    progress?: number;
    result?: ArrayBuffer;
    error?: string;
}

// Track if model is already loaded to avoid re-downloading
let isModelLoaded = false;
let currentDevice: 'gpu' | 'cpu' = 'gpu';

// Track loading progress across multiple files
interface FileProgress {
    current: number;
    total: number;
}
const fileProgressMap = new Map<string, FileProgress>();

function calculateOverallProgress(): number {
    if (fileProgressMap.size === 0) return 0;
    
    let totalBytes = 0;
    let loadedBytes = 0;
    
    for (const progress of fileProgressMap.values()) {
        totalBytes += progress.total;
        loadedBytes += progress.current;
    }
    
    return totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;
}

// Shared config for consistent behavior - model stays cached after first load
const getConfig = (onProgress?: (progress: number) => void, useCpu?: boolean): Config => ({
    progress: (key: string, current: number, total: number) => {
        if (total > 0) {
            fileProgressMap.set(key, { current, total });
            const overallProgress = calculateOverallProgress();
            onProgress?.(overallProgress);
        }
    },
    debug: false,
    device: useCpu ? 'cpu' : 'gpu', // Use CPU on mobile to avoid WebGPU memory issues
    output: {
        format: 'image/png',
        quality: 0.8, // Slightly reduce quality to save memory
    },
});

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const { type, flow, requestId, imageData, mimeType, useCpu } = event.data;

    if (type === 'preload') {
        // Skip if already loaded with same device setting
        if (isModelLoaded && currentDevice === (useCpu ? 'cpu' : 'gpu')) {
            const response: WorkerResponse = { type: 'preload-complete', flow, requestId };
            self.postMessage(response);
            return;
        }
        
        // Clear progress map for fresh preload
        fileProgressMap.clear();
        currentDevice = useCpu ? 'cpu' : 'gpu';
        
        // Preload WASM and ONNX model files
        try {
            const config = getConfig((progress) => {
                const response: WorkerResponse = { type: 'progress', flow, requestId, progress };
                self.postMessage(response);
            }, useCpu);

            await preload(config);
            isModelLoaded = true;
            
            const response: WorkerResponse = { type: 'preload-complete', flow, requestId };
            self.postMessage(response);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Preload failed';
            const response: WorkerResponse = { type: 'error', flow, requestId, error: errorMessage };
            self.postMessage(response);
        }
        return;
    }

    if (type === 'process' && imageData && mimeType) {
        try {
            // Convert ArrayBuffer back to Blob
            const blob = new Blob([imageData], { type: mimeType });

            // Clear progress map for fresh processing (in case model needs to load)
            fileProgressMap.clear();
            
            const config = getConfig((progress) => {
                const response: WorkerResponse = { type: 'progress', flow, requestId, progress };
                self.postMessage(response);
            }, useCpu);

            // Process the image - model will be cached from preload or loaded on first use
            const resultBlob = await removeBackground(blob, config);
            isModelLoaded = true; // Model is definitely loaded after processing
            currentDevice = useCpu ? 'cpu' : 'gpu';
            
            // Convert Blob to ArrayBuffer for transfer
            const resultBuffer = await resultBlob.arrayBuffer();
            
            const response: WorkerResponse = { type: 'complete', flow, requestId, result: resultBuffer };
            self.postMessage(response, { transfer: [resultBuffer] }); // Transfer ownership for performance
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const response: WorkerResponse = { type: 'error', flow, requestId, error: errorMessage };
            self.postMessage(response);
        }
    }
};
