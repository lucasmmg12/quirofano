import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // ── Browser compatibility: 2020+ ──
  build: {
    target: ['es2020', 'chrome80', 'firefox74', 'safari13.1', 'edge80'],
    cssTarget: ['chrome80', 'firefox74', 'safari13.1', 'edge80'],
  },
  esbuild: {
    target: 'es2020',
  },
  server: {
    port: 5173,
    open: true,
    hmr: {
      port: 5173,
    },
    proxy: {
      // Proxy al sync-server local para consultas SALUS
      '/api/salus': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        // Si el sync-server no está corriendo, no crashear Vite
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.warn('[Vite Proxy] Sync server no disponible:', err.message);
          });
        },
      },
    },
  },
})
