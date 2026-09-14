import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.DEDALO_TEST_URL || 'http://localhost:5174',
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH },
  },
  reporter: 'list',
});
