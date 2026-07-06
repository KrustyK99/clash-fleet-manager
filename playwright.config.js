// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const isFastApiContractTarget = process.env.API_CONTRACT_TARGET === 'fastapi';

module.exports = defineConfig({
  testDir: './tests/e2e',

  // Keep this conservative while we are testing against a file-backed PHP app.
  fullyParallel: false,

  // Useful CI safety rails, even though we are not wiring CI yet.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The PHP backend tests mutate file-backed JSON fixtures. Keep the suite in
  // one worker so UI tests never read a file while an API contract test is
  // truncating and rewriting it.
  workers: 1,

  reporter: 'html',

  use: {
    baseURL: 'http://127.0.0.1:8011',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chrome',
      testIgnore: /api-(contract|client)\.spec\.js/,
      use: { ...devices['Pixel 5'] }
    }
  ],

  webServer: isFastApiContractTarget ? undefined : {
    command: 'npm run prepare:test-app && npm run serve:test:docker',
    url: 'http://127.0.0.1:8011',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  }
});