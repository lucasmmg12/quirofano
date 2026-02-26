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
      '/api/builderbot': {
        target: 'https://app.builderbot.cloud',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/builderbot/, '/api/v2/c42aa354-f1a3-44a6-b95b-5ccb24562254'),
        secure: true,
      },
    },
  },
})
