import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  server: {
    port: 3000,
    open: true,
    hmr: {
      overlay: true, // Show error overlay in the browser
    },
    watch: {
      // Ensure all file changes are detected
      usePolling: false, // Set to true if file changes aren't detected (slower but more reliable on some systems)
    },
  },
});

