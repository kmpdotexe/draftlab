import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** GitHub Pages serves the project site under https://kmpdotexe.github.io/draftlab/. */
export const PAGES_BASE = '/draftlab/';

// The app's dev server and production build. Tests use vitest.config.ts. The build and `vite preview` use the
// Pages base path; the dev server stays at '/'.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // The snapshot is loaded as its own ~1.35 MB chunk on purpose (src/app/data/snapshot.ts); warn only above that.
    chunkSizeWarningLimit: 1500,
  },
}));
