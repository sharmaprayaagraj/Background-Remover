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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImageUploader } from './ImageUploader';

// Mock the store
const mockSetOriginalImage = vi.fn();
const mockSetError = vi.fn();

vi.mock('../store/useAppStore', () => ({
    useAppStore: vi.fn((selector) => {
        const store = {
            setOriginalImage: mockSetOriginalImage,
            setError: mockSetError,
        };
        return selector(store);
    }),
}));

describe('ImageUploader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render the upload zone', () => {
        render(<ImageUploader />);
        
        expect(screen.getByText(/click or drag image to upload/i)).toBeInTheDocument();
    });

    it('should show supported file types', () => {
        render(<ImageUploader />);
        
        expect(screen.getByText(/supports jpg, png, webp/i)).toBeInTheDocument();
    });

    it('should show max file size hint', () => {
        render(<ImageUploader />);
        
        expect(screen.getByText(/max 10mb/i)).toBeInTheDocument();
    });

    it('should have an accessible dropzone', () => {
        render(<ImageUploader />);
        
        // The dropzone should have an input element for file selection
        const input = document.querySelector('input[type="file"]');
        expect(input).toBeInTheDocument();
    });
});
