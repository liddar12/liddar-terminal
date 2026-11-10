import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser-tests',
  testMatch: '**/*.spec.js',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined } },
  webServer: [
    { command: 'node browser-tests/fixture-api.mjs', port: 3101, reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort', port: 5174, reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: 'https://projecttest.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', TERMINAL_DEV_API_ORIGIN: 'http://127.0.0.1:3101' } },
  ],
});
