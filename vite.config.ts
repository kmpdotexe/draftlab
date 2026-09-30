import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app's dev server and production build. Tests use vitest.config.ts.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // The snapshot is loaded as its own ~1.35 MB chunk on purpose (src/app/data/snapshot.ts); warn only above that.
    chunkSizeWarningLimit: 1500,
  },
});
