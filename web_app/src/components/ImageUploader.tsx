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

import React, { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { resizeImageIfNeeded, formatDimensions, getMaxDimension, MAX_FILE_SIZE_BYTES } from '../utils/imageResize';
import { toast } from '../store/useToastStore';
import clsx from 'clsx';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const ImageUploader: React.FC = () => {
    const setOriginalImage = useAppStore((state) => state.setOriginalImage);
    const setError = useAppStore((state) => state.setError);
    const [isResizing, setIsResizing] = useState(false);
    const [tiltStyle, setTiltStyle] = useState({});
    // Coalesce tilt updates into one render per frame (fix #31): setTiltStyle
    // used to fire on every mousemove, re-rendering the component each time.
    const tiltRafRef = useRef(0);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (isResizing) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (y - centerY) / 20;
        const rotateY = (centerX - x) / 20;

        if (tiltRafRef.current) return;
        tiltRafRef.current = requestAnimationFrame(() => {
            tiltRafRef.current = 0;
            setTiltStyle({
                transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`,
            });
        });
    }, [isResizing]);

    const handleMouseLeave = useCallback(() => {
        if (tiltRafRef.current) {
            cancelAnimationFrame(tiltRafRef.current);
            tiltRafRef.current = 0;
        }
        setTiltStyle({
            transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)',
        });
    }, []);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
            setError(`Invalid file type. Please use: ${ALLOWED_TYPES.map(t => t.split('/')[1].toUpperCase()).join(', ')}`);
            return;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE_BYTES) {
            setError(`File too large. Maximum size: ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`);
            return;
        }

        // Clear any previous errors
        setError(null);

        const reader = new FileReader();
        reader.onload = async () => {
            const result = reader.result as string;
            
            try {
                setIsResizing(true);
                
                // Check if image needs resizing
                const resizeResult = await resizeImageIfNeeded(result, getMaxDimension());
                
                if (resizeResult.wasResized) {
                    toast.info(
                        `Image resized from ${formatDimensions(resizeResult.originalDimensions)} to ${formatDimensions(resizeResult.newDimensions)} for optimal performance`
                    );
                }
                
                setOriginalImage(resizeResult.dataUrl);
            } catch (err) {
                console.error('Image resize failed:', err);
                // Fall back to original image if resize fails
                setOriginalImage(result);
            } finally {
                setIsResizing(false);
            }
        };
        reader.onerror = () => {
            setError('Failed to read file. Please try again.');
        };
        reader.readAsDataURL(file);
    }, [setOriginalImage, setError]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.jpeg', '.jpg', '.png', '.webp']
        },
        maxFiles: 1,
        multiple: false,
        disabled: isResizing
    });

    return (
        <div
            {...getRootProps()}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={tiltStyle}
            className={clsx(
                "glass rounded-3xl p-12 text-center cursor-pointer preserve-3d",
                "border-2 border-dashed transition-all duration-300 ease-out",
                isResizing
                    ? "border-zinc-700/50 cursor-wait backdrop-blur-xl"
                    : isDragActive
                        ? "border-lime-500 bg-lime-500/5 shadow-glow-strong scale-105"
                        : "border-zinc-700/30 hover:border-lime-500/50 hover:bg-zinc-900/50 hover:shadow-glow"
            )}
        >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-4">
                {isResizing ? (
                    <div className="w-16 h-16 rounded-full flex items-center justify-center bg-lime-500/20 transition-colors">
                        <div className="w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <Upload className={clsx(
                        "mx-auto h-16 w-16 mb-4 transition-all duration-300",
                        isDragActive 
                            ? "text-lime-400 scale-110 rotate-12" 
                            : "text-zinc-400 group-hover:text-lime-500"
                    )} 
                    style={{ transform: isDragActive ? 'translateZ(20px)' : 'translateZ(0)' }} />
                )}
                <div className="space-y-1">
                    <p className="text-xl mb-2 text-zinc-200 font-medium tracking-wide">
                        {isResizing 
                            ? "Preparing image..." 
                            : isDragActive 
                                ? "Drop image here" 
                                : "Click or drag image to upload"}
                    </p>
                    <p className="text-sm text-zinc-500 font-light">
                        {isResizing 
                            ? "Optimizing for best performance"
                            : "Supports JPG, PNG, WEBP (Max 10MB)"}
                    </p>
                </div>
            </div>
        </div>
    );
};
