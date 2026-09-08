import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 5000 },
  outputDir: '.dist/review/test-results',
  reporter: [['list'], ['json', { outputFile: '.dist/review/playwright-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:6017', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run storybook', url: 'http://127.0.0.1:6017', reuseExistingServer: false, timeout: 120000 },
});
