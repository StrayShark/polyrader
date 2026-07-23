import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// In Tauri dev mode, the sidecar runs on port 13001.
// In standalone web dev mode, the server runs on port 3001/3002.
const SIDECAR_PORT = 13001;
const apiProxyTarget = process.env.POLYRADER_API_PROXY_TARGET ?? 'http://localhost:3001';
const wsProxyTarget = process.env.POLYRADER_WS_PROXY_TARGET ?? 'ws://localhost:3001';
const isTauri =
  process.env.TAURI_ENV !== undefined ||
  process.env.TAURI_ENV_PLATFORM !== undefined ||
  process.env.TAURI_DEV === 'true';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Keep Tauri on a dedicated fixed port. Falling through to another port
    // leaves the desktop shell pointed at the wrong frontend.
    port: 15173,
    host: '127.0.0.1',
    strictPort: true,
    proxy: isTauri
      ? {
          '/api': {
            target: `http://localhost:${SIDECAR_PORT}`,
            changeOrigin: true,
          },
          '/ws': {
            target: `ws://localhost:${SIDECAR_PORT}`,
            ws: true,
          },
        }
      : {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
          },
          '/ws': {
            target: wsProxyTarget,
            ws: true,
          },
        },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
