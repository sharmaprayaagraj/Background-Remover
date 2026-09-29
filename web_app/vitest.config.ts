import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        globals: true,
        css: true,
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        // userEvent-driven component tests measure 2-3.5s on slower machines;
        // the 5s default leaves no headroom under system load (AV scans, etc.)
        testTimeout: 20000,
    },
});
