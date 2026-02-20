import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
        rewrite: (path) => path.replace(/^\/api\/builderbot/, '/api/v2/c3fd918b-b736-40dc-a841-cbb73d3b2a8d'),
        secure: true,
      },
    },
  },
})
