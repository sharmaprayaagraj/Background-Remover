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

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    handleReset = (): void => {
        this.setState({ hasError: false, error: null });
    };

    render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 border border-zinc-800 rounded-xl text-center space-y-4">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-8 h-8 text-red-400" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-semibold text-zinc-100">Something went wrong</h2>
                        <p className="text-zinc-400 max-w-md">
                            An unexpected error occurred. Please try again or refresh the page.
                        </p>
                        {this.state.error && (
                            <p className="text-xs text-zinc-500 font-mono bg-zinc-950 p-2 rounded mt-2">
                                {this.state.error.message}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={this.handleReset}
                        className="flex items-center gap-2 px-4 py-2 bg-lime-500 text-black rounded-lg hover:bg-lime-400 transition-colors font-medium"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

/**
 * Canvas-specific error boundary with reset functionality that clears the image state
 */
interface CanvasErrorBoundaryProps {
    children: ReactNode;
    onReset?: () => void;
}

interface CanvasErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, CanvasErrorBoundaryState> {
    constructor(props: CanvasErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): CanvasErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('Canvas error:', error, errorInfo);
    }

    handleReset = (): void => {
        this.setState({ hasError: false, error: null });
        this.props.onReset?.();
    };

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-[65vh] bg-zinc-900/50 rounded-xl border border-zinc-800 p-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-8 h-8 text-red-400" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-semibold text-zinc-100">Canvas Error</h2>
                        <p className="text-zinc-400 max-w-md">
                            There was a problem processing your image. This might happen with very large or corrupted images.
                        </p>
                        {this.state.error && (
                            <p className="text-xs text-zinc-500 font-mono bg-zinc-950 p-2 rounded mt-2">
                                {this.state.error.message}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={this.handleReset}
                        className="flex items-center gap-2 px-4 py-2 bg-lime-500 text-black rounded-lg hover:bg-lime-400 transition-colors font-medium"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Try Another Image
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
