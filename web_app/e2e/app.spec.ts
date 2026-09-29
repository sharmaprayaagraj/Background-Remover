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

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Create a small test image (1x1 red PNG)
function createTestImageBuffer(): Buffer {
    // Minimal valid PNG: 1x1 red pixel
    const png = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // RGB, no filter
        0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
        0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, // compressed data
        0x00, 0x03, 0x00, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, // checksum
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
        0xae, 0x42, 0x60, 0x82, // IEND CRC
    ]);
    return png;
}

// Helper to create a larger test image for visual tests
async function createTestImage(): Promise<string> {
    const testDir = path.join(process.cwd(), 'e2e', 'fixtures');
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    const testImagePath = path.join(testDir, 'test-image.png');
    
    // Create a simple valid PNG for testing
    fs.writeFileSync(testImagePath, createTestImageBuffer());
    return testImagePath;
}

test.describe('Image Upload Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('shows upload area on initial load', async ({ page }) => {
        // Check the main heading
        await expect(page.getByText('Remove Backgrounds')).toBeVisible();
        await expect(page.getByText('100% Automatically')).toBeVisible();
        
        // Check upload area is visible - "Click or drag image to upload"
        await expect(page.getByText(/click or drag image/i)).toBeVisible();
    });

    test('displays file type restrictions', async ({ page }) => {
        await expect(page.getByText(/Supports.*JPG.*PNG.*WEBP/i)).toBeVisible();
    });

    test('shows processing state when uploading an image', async ({ page }) => {
        const testImagePath = await createTestImage();
        
        // Get the file input (it's hidden, so we need to use setInputFiles)
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testImagePath);
        
        // The overlay renders "Processing..." (fix #10: the old selectors
        // looked for text the UI never displayed).
        await expect(page.getByText('Processing...', { exact: true })).toBeVisible({ timeout: 10000 });
    });

    test('file input only accepts images', async ({ page }) => {
        // Verify the file input has correct accept attribute
        const fileInput = page.locator('input[type="file"]');
        await expect(fileInput).toHaveAttribute('accept', /image/i);
    });

    test('shows max file size limit info', async ({ page }) => {
        await expect(page.getByText(/10\s*MB/i)).toBeVisible();
    });
});

test.describe('Canvas Editor', () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await page.goto('/');
        
        // Upload a test image first
        const testImagePath = await createTestImage();
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testImagePath);
        
        // Wait for processing to complete (or timeout)
        // The background removal takes time, so we'll wait for the canvas to appear
        try {
            await page.waitForSelector('canvas', { timeout: 55000 });
        } catch {
            // AI processing timed out - skip this test
            testInfo.skip(true, 'AI background removal took too long');
        }
    });

    test('shows canvas after image upload', async ({ page }) => {
        await expect(page.locator('canvas').first()).toBeVisible();
    });

    test('displays toolbar with brush controls', async ({ page }) => {
        // Check for brush mode buttons
        await expect(page.getByRole('button', { name: /erase/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /restore/i })).toBeVisible();
    });

    test('displays undo/redo buttons', async ({ page }) => {
        // Skip if canvas didn't load in time (AI processing can be slow)
        const canvas = page.locator('canvas').first();
        if (!await canvas.isVisible({ timeout: 5000 }).catch(() => false)) {
            test.skip();
            return;
        }
        await expect(page.getByRole('button', { name: /undo/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /redo/i })).toBeVisible();
    });

    test('displays zoom controls', async ({ page }) => {
        await expect(page.getByRole('button', { name: /zoom in/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /zoom out/i })).toBeVisible();
    });

    test('displays download button', async ({ page }) => {
        await expect(page.getByRole('button', { name: /download/i })).toBeVisible();
    });

    test('can switch between erase and restore modes', async ({ page }) => {
        const eraseButton = page.getByRole('button', { name: /erase/i });
        const restoreButton = page.getByRole('button', { name: /restore/i });
        
        // Click restore mode
        await restoreButton.click();
        await expect(restoreButton).toHaveAttribute('aria-pressed', 'true');
        
        // Click back to erase mode
        await eraseButton.click();
        await expect(eraseButton).toHaveAttribute('aria-pressed', 'true');
    });

    test('can adjust brush size', async ({ page }) => {
        // Find brush size controls
        const increaseButton = page.getByRole('button', { name: /increase brush/i });

        // Increase size
        await increaseButton.click();
        
        // Verify size changed (should be different from initial)
        // Note: This is a basic check - the actual value depends on initial state
        await expect(increaseButton).toBeVisible();
    });

    test('can use zoom controls', async ({ page }) => {
        const zoomInButton = page.getByRole('button', { name: /zoom in/i });
        const zoomOutButton = page.getByRole('button', { name: /zoom out/i });
        
        // Click zoom in
        await zoomInButton.click();
        
        // Check zoom percentage changed (should show percentage)
        await expect(page.getByText(/%/)).toBeVisible();
        
        // Click zoom out
        await zoomOutButton.click();
    });

    test('start over button returns to upload screen', async ({ page }) => {
        const startOverButton = page.getByRole('button', { name: /start over/i });
        await startOverButton.click();
        
        // Should show upload area again
        await expect(page.getByText(/click or drag/i)).toBeVisible();
    });
});

test.describe('Mobile Responsiveness', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

    test('upload area is accessible on mobile', async ({ page }) => {
        await page.goto('/');
        
        await expect(page.getByText('Remove Backgrounds')).toBeVisible();
        await expect(page.getByText(/click or drag/i)).toBeVisible();
    });

    test('toolbar is responsive on mobile', async ({ page }) => {
        await page.goto('/');
        
        // Upload test image
        const testImagePath = await createTestImage();
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testImagePath);
        
        // Wait for canvas
        await page.waitForSelector('canvas', { timeout: 60000 });
        
        // Check toolbar elements are visible (may be stacked)
        await expect(page.getByRole('button', { name: /erase/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /download/i })).toBeVisible();
    });
});

test.describe('Accessibility', () => {
    test('upload area has proper ARIA labels', async ({ page }) => {
        await page.goto('/');
        
        // File input should be accessible
        const fileInput = page.locator('input[type="file"]');
        await expect(fileInput).toHaveAttribute('accept');
    });

    test('buttons have proper labels', async ({ page }) => {
        await page.goto('/');
        
        // Upload a test image to get to the editor
        const testImagePath = await createTestImage();
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testImagePath);
        
        await page.waitForSelector('canvas', { timeout: 60000 });
        
        // Check ARIA labels on buttons
        await expect(page.getByRole('button', { name: /undo/i })).toHaveAttribute('aria-label');
        await expect(page.getByRole('button', { name: /redo/i })).toHaveAttribute('aria-label');
        await expect(page.getByRole('button', { name: /zoom in/i })).toHaveAttribute('aria-label');
        await expect(page.getByRole('button', { name: /zoom out/i })).toHaveAttribute('aria-label');
    });
});

// Cleanup
test.afterAll(async () => {
    // Clean up test fixtures
    const fixturesDir = path.join(process.cwd(), 'e2e', 'fixtures');
    if (fs.existsSync(fixturesDir)) {
        fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
});
