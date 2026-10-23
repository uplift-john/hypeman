import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiPort = Number(process.env.HYPEMAN_API_PORT ?? 8787);
const webPort = Number(process.env.HYPEMAN_WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: webPort,
    strictPort: true,
    host: '127.0.0.1',
    open: !process.env.CI && !process.env.HYPEMAN_NO_OPEN,
    proxy: {
      '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
    },
  },
});
