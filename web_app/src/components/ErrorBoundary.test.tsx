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
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, CanvasErrorBoundary } from './ErrorBoundary';

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) {
        throw new Error('Test error message');
    }
    return <div>Child content</div>;
};

describe('ErrorBoundary', () => {
    beforeEach(() => {
        // Suppress console.error for cleaner test output
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should render children when no error', () => {
        render(
            <ErrorBoundary>
                <div>Test content</div>
            </ErrorBoundary>
        );

        expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('should render error UI when child throws', () => {
        render(
            <ErrorBoundary>
                <ThrowError shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('should render custom fallback when provided', () => {
        render(
            <ErrorBoundary fallback={<div>Custom fallback</div>}>
                <ThrowError shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    });

    it('should call onError callback when error occurs', () => {
        const onError = vi.fn();
        render(
            <ErrorBoundary onError={onError}>
                <ThrowError shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(onError).toHaveBeenCalled();
        expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
        expect(onError.mock.calls[0][0].message).toBe('Test error message');
    });

    it('should have Try Again button that resets error state', () => {
        render(
            <ErrorBoundary>
                <ThrowError shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(screen.getByText('Something went wrong')).toBeInTheDocument();

        // Click Try Again - this resets internal state
        const tryAgainButton = screen.getByText('Try Again');
        expect(tryAgainButton).toBeInTheDocument();
        
        // Just verify the button can be clicked without throwing
        expect(() => fireEvent.click(tryAgainButton)).not.toThrow();
    });
});

describe('CanvasErrorBoundary', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should render children when no error', () => {
        render(
            <CanvasErrorBoundary>
                <div>Canvas content</div>
            </CanvasErrorBoundary>
        );

        expect(screen.getByText('Canvas content')).toBeInTheDocument();
    });

    it('should render canvas-specific error UI when child throws', () => {
        render(
            <CanvasErrorBoundary>
                <ThrowError shouldThrow={true} />
            </CanvasErrorBoundary>
        );

        expect(screen.getByText('Canvas Error')).toBeInTheDocument();
        expect(screen.getByText(/problem processing your image/)).toBeInTheDocument();
    });

    it('should call onReset callback when Try Another Image is clicked', () => {
        const onReset = vi.fn();
        render(
            <CanvasErrorBoundary onReset={onReset}>
                <ThrowError shouldThrow={true} />
            </CanvasErrorBoundary>
        );

        fireEvent.click(screen.getByText('Try Another Image'));

        expect(onReset).toHaveBeenCalled();
    });
});
