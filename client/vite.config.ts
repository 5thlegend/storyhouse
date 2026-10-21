import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Worker (`wrangler dev`) serves the API and the family's
// media; Vite proxies both so cookies stay same-origin.
const backend = process.env.VITE_API_BASE || 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/media': { target: backend, changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
