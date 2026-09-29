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

import { useState, useCallback, useRef, useEffect } from 'react';

export function useGitHubStarToast() {
    const [showToast, setShowToast] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const triggerToast = useCallback(() => {
        // Clear any existing timer
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        // Show toast after a short delay (e.g., after download)
        timerRef.current = setTimeout(() => setShowToast(true), 1000);
    }, []);

    const closeToast = useCallback(() => {
        setShowToast(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, []);

    return {
        showToast,
        triggerToast,
        closeToast,
    };
}
