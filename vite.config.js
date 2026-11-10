import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { assertPublicBuildConfig, localDevApiOrigin } from './shared/authConfig.js';

// The `api/` folder is deployed as Vercel serverless functions, so it is not
// part of the Vite build. During local dev (`vite` on :5173) proxy /api to
// `vercel dev` (:3000) so the Breadth and scanner tabs hit real functions.
export default defineConfig(({ mode }) => {
  // Reject mistakes before Vite serializes environment values into public JS.
  assertPublicBuildConfig(loadEnv(mode, process.cwd(), 'VITE_'));
  return {
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: localDevApiOrigin(process.env.TERMINAL_DEV_API_ORIGIN), changeOrigin: true },
    },
  },
  };
});
