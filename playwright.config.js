import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, use: { headless: true, viewport: { width: 1440, height: 900 } },
  webServer: { command: 'node tests/serve.mjs', port: 4173, reuseExistingServer: false }
});
