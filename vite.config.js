import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The `api/` folder is deployed as Vercel serverless functions, so it is not
// part of the Vite build. During local dev (`vite` on :5173) proxy /api to
// `vercel dev` (:3000) so the Breadth and scanner tabs hit real functions.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
