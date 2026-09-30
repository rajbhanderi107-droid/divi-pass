import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e', timeout: 30_000, fullyParallel: false, workers: 1,
  use: { baseURL: 'http://localhost:4173', ...devices['Pixel 5'], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } },
  webServer: { command: 'npx vite preview --port 4173', port: 4173, reuseExistingServer: true },
});
