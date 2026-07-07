// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const isFastApiAppTarget = process.env.APP_E2E_TARGET === 'fastapi'
  || process.env.npm_lifecycle_event === 'test:e2e:fastapi'
  || process.env.npm_lifecycle_event === 'verify:fastapi:e2e';

if (isFastApiAppTarget) {
  process.env.API_CONTRACT_TARGET = process.env.API_CONTRACT_TARGET || 'fastapi';
  process.env.API_CONTRACT_FASTAPI_BASE_URL = process.env.API_CONTRACT_FASTAPI_BASE_URL || 'http://127.0.0.1:8001';
}

const isFastApiContractTarget = process.env.API_CONTRACT_TARGET === 'fastapi';
const shouldUseExternallyManagedFastApi = isFastApiContractTarget && !isFastApiAppTarget;
const shouldReuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === '0'
  ? false
  : process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === '1'
    ? true
    : !process.env.CI;

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
    baseURL: isFastApiAppTarget ? 'http://127.0.0.1:8001' : 'http://127.0.0.1:8011',
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

  webServer: shouldUseExternallyManagedFastApi ? undefined : {
    command: isFastApiAppTarget
      ? 'npm run prepare:test-app && npm run serve:test:fastapi'
      : 'npm run prepare:test-app && npm run serve:test:docker',
    url: isFastApiAppTarget ? 'http://127.0.0.1:8001' : 'http://127.0.0.1:8011',
    reuseExistingServer: shouldReuseExistingServer,
    timeout: 120 * 1000
  }
});