import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
    watch: {
      // Not wired into the app yet — a big reference template sitting in the
      // repo root, kept around to build the homepage from later.
      ignored: ['**/portfolio-html-template/**'],
    },
  },
})
