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

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CanvasToolbar } from './CanvasToolbar';

describe('CanvasToolbar', () => {
    const defaultProps = {
        brushMode: 'erase' as const,
        brushSize: 50,
        zoom: 1,
        historyIndex: 0,
        historyLength: 1,
        backgroundColor: null,
        backgroundImage: null,
        backgroundSize: 'cover' as const,
        onBrushModeChange: vi.fn(),
        onBrushSizeChange: vi.fn(),
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onFitToScreen: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onDownload: vi.fn(),
        onReset: vi.fn(),
        onBackgroundColorChange: vi.fn(),
        onBackgroundImageChange: vi.fn(),
        onBackgroundSizeChange: vi.fn(),
        exportFormat: 'png' as const,
        exportQuality: 0.92,
        onExportFormatChange: vi.fn(),
        onExportQualityChange: vi.fn(),
        featherRadius: 0,
        onFeatherRadiusChange: vi.fn(),
        shadowSettings: {
            type: 'none' as const,
            color: '#000000',
            blur: 10,
            offsetX: 5,
            offsetY: 5,
            spread: 5,
        },
        onShadowChange: vi.fn(),
        edgeRefinement: {
            mode: 'off' as const,
            edgeContrast: 1.0,
            edgeSoftness: 0,
            colorDecontamination: 0,
        },
        onEdgeRefinementChange: vi.fn(),
        isCropping: false,
        onStartCrop: vi.fn(),
        onApplyCrop: vi.fn(),
        onCancelCrop: vi.fn(),
        onCopyToClipboard: vi.fn(),
        instantApply: false,
        hasPendingStrokes: false,
        onInstantApplyChange: vi.fn(),
        onCommitStrokes: vi.fn(),
        onClearPendingStrokes: vi.fn(),
    };

    it('should display current brush size', () => {
        render(<CanvasToolbar {...defaultProps} brushSize={75} />);
        
        expect(screen.getByText('75')).toBeInTheDocument();
    });

    it('should display current zoom level', () => {
        render(<CanvasToolbar {...defaultProps} zoom={1.5} />);
        
        expect(screen.getByText('150%')).toBeInTheDocument();
    });

    it('should highlight active brush mode', () => {
        const { rerender } = render(<CanvasToolbar {...defaultProps} brushMode="erase" />);
        
        const eraseButton = screen.getByRole('button', { name: /erase/i });
        expect(eraseButton).toHaveAttribute('aria-pressed', 'true');
        
        rerender(<CanvasToolbar {...defaultProps} brushMode="restore" />);
        
        const restoreButton = screen.getByRole('button', { name: /restore/i });
        expect(restoreButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('should call onBrushModeChange when switching modes', async () => {
        const user = userEvent.setup();
        const onBrushModeChange = vi.fn();
        
        render(<CanvasToolbar {...defaultProps} onBrushModeChange={onBrushModeChange} />);
        
        await user.click(screen.getByRole('button', { name: /restore/i }));
        expect(onBrushModeChange).toHaveBeenCalledWith('restore');
    });

    it('should call onBrushSizeChange when adjusting size', async () => {
        const user = userEvent.setup();
        const onBrushSizeChange = vi.fn();
        
        render(<CanvasToolbar {...defaultProps} onBrushSizeChange={onBrushSizeChange} />);
        
        await user.click(screen.getByRole('button', { name: /increase brush size/i }));
        expect(onBrushSizeChange).toHaveBeenCalledWith(60);
        
        await user.click(screen.getByRole('button', { name: /decrease brush size/i }));
        expect(onBrushSizeChange).toHaveBeenCalledWith(40);
    });

    it('should call onZoomIn and onZoomOut', async () => {
        const user = userEvent.setup();
        const onZoomIn = vi.fn();
        const onZoomOut = vi.fn();
        
        render(<CanvasToolbar {...defaultProps} onZoomIn={onZoomIn} onZoomOut={onZoomOut} />);
        
        await user.click(screen.getByRole('button', { name: /zoom in/i }));
        expect(onZoomIn).toHaveBeenCalled();
        
        await user.click(screen.getByRole('button', { name: /zoom out/i }));
        expect(onZoomOut).toHaveBeenCalled();
    });

    it('should disable undo when at beginning of history', () => {
        render(<CanvasToolbar {...defaultProps} historyIndex={0} historyLength={3} />);
        
        const undoButton = screen.getByRole('button', { name: /undo/i });
        expect(undoButton).toBeDisabled();
    });

    it('should disable redo when at end of history', () => {
        render(<CanvasToolbar {...defaultProps} historyIndex={2} historyLength={3} />);
        
        const redoButton = screen.getByRole('button', { name: /redo/i });
        expect(redoButton).toBeDisabled();
    });

    it('should enable undo/redo when in middle of history', () => {
        render(<CanvasToolbar {...defaultProps} historyIndex={1} historyLength={3} />);
        
        const undoButton = screen.getByRole('button', { name: /undo/i });
        const redoButton = screen.getByRole('button', { name: /redo/i });
        
        expect(undoButton).not.toBeDisabled();
        expect(redoButton).not.toBeDisabled();
    });

    it('should call onDownload when clicking download button', async () => {
        const user = userEvent.setup();
        const onDownload = vi.fn();
        
        render(<CanvasToolbar {...defaultProps} onDownload={onDownload} />);
        
        await user.click(screen.getByRole('button', { name: /download/i }));
        expect(onDownload).toHaveBeenCalled();
    });

    it('should call onReset when clicking start over', async () => {
        const user = userEvent.setup();
        const onReset = vi.fn();
        
        render(<CanvasToolbar {...defaultProps} onReset={onReset} />);
        
        await user.click(screen.getByRole('button', { name: /start over/i }));
        expect(onReset).toHaveBeenCalled();
    });
});
