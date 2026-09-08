import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (command === 'build' && !(process.env.VITE_THIRDWEB_CLIENT_ID ?? env.VITE_THIRDWEB_CLIENT_ID)?.trim()) {
    throw new Error('Set VITE_THIRDWEB_CLIENT_ID in the deployment environment before building. This is the public Thirdweb client ID, not a secret key.');
  }
  return {
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
    watch: {
      // Keep the archived vendor template outside the dev watcher.
      ignored: ['**/portfolio-html-template/**'],
    },
  },
  };
})
