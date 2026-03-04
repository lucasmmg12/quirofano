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
  },
})
