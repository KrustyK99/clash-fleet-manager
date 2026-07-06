// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',

  // Keep this conservative while we are testing against a file-backed PHP app.
  fullyParallel: false,

  // Useful CI safety rails, even though we are not wiring CI yet.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

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

  webServer: {
    command: 'npm run prepare:test-app && npm run serve:test:docker',
    url: 'http://127.0.0.1:8011',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  }
});