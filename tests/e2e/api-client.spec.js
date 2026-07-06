const path = require('node:path');
const { test, expect } = require('@playwright/test');

const API_CLIENT_SCRIPT_PATH = path.join(process.cwd(), 'app-api-client.js');
const HARNESS_URL = 'http://fleet-api-client.test/api-client-harness.html';

async function loadApiClientHarness(page) {
  await page.route('**/api-client-harness.html', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <script src="/app-api-client.js"></script>
        </head>
        <body>API client harness</body>
      </html>
    `
  }));

  await page.route('**/app-api-client.js', route => route.fulfill({
    path: API_CLIENT_SCRIPT_PATH,
    contentType: 'application/javascript'
  }));

  await page.goto(HARNESS_URL);
}

async function captureApiRequests(page, apiResponder) {
  const requests = [];

  await page.route('**/api.php?**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const response = apiResponder({ request, action: url.searchParams.get('action') });

    requests.push({
      method: request.method(),
      url: request.url(),
      action: url.searchParams.get('action'),
      pathname: url.pathname,
      search: url.search,
      headers: request.headers(),
      postData: request.postData()
    });

    await route.fulfill({
      status: response.status || 200,
      contentType: 'application/json',
      body: JSON.stringify(response.body)
    });
  });

  return requests;
}

test('public API shape is exposed on window.FleetApiClient', async ({ page }) => {
  await loadApiClientHarness(page);

  const apiShape = await page.evaluate(() => ({
    exists: Boolean(window.FleetApiClient),
    loadTimers: typeof window.FleetApiClient.loadTimers,
    saveTimers: typeof window.FleetApiClient.saveTimers,
    loadAccountViews: typeof window.FleetApiClient.loadAccountViews,
    saveAccountViews: typeof window.FleetApiClient.saveAccountViews
  }));

  expect(apiShape).toEqual({
    exists: true,
    loadTimers: 'function',
    saveTimers: 'function',
    loadAccountViews: 'function',
    saveAccountViews: 'function'
  });
});

test('loadTimers makes the expected GET request and returns JSON', async ({ page }) => {
  const responseBody = {
    schemaVersion: 2,
    timers: [],
    accountSnapshotMeta: {},
    lastUpdated: 'timer-load-value'
  };
  const requests = await captureApiRequests(page, () => ({ body: responseBody }));
  await loadApiClientHarness(page);

  const result = await page.evaluate(() => window.FleetApiClient.loadTimers());

  expect(result).toEqual(responseBody);
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe('GET');
  expect(requests[0].action).toBe('load');
  expect(requests[0].pathname).toBe('/api.php');
  expect(requests[0].search).toBe('?action=load');
  expect(requests[0].postData).toBeNull();
});

test('saveTimers makes the expected POST request and returns JSON', async ({ page }) => {
  const payload = {
    lastKnownLastUpdated: 'client-timer-value',
    timers: [{ id: 'timer-1', account: 'Bart' }],
    accountSnapshotMeta: { Bart: { importedAt: 'now' } }
  };
  const responseBody = { ok: true, lastUpdated: 'server-timer-value' };
  const requests = await captureApiRequests(page, () => ({ body: responseBody }));
  await loadApiClientHarness(page);

  const result = await page.evaluate(savePayload => window.FleetApiClient.saveTimers(savePayload), payload);

  expect(result).toEqual(responseBody);
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe('POST');
  expect(requests[0].action).toBe('save');
  expect(requests[0].pathname).toBe('/api.php');
  expect(requests[0].search).toBe('?action=save');
  expect(requests[0].headers['content-type']).toContain('application/json');
  expect(JSON.parse(requests[0].postData)).toEqual(payload);
});

test('loadAccountViews makes the expected GET request and returns JSON', async ({ page }) => {
  const responseBody = {
    schemaVersion: 3,
    views: [{ id: 'all', label: 'All Accounts', accounts: null, system: true }],
    snapshotFreshnessSettings: { freshHours: 2, agingHours: 24 },
    accountTagMap: {},
    lastUpdated: 'views-load-value'
  };
  const requests = await captureApiRequests(page, () => ({ body: responseBody }));
  await loadApiClientHarness(page);

  const result = await page.evaluate(() => window.FleetApiClient.loadAccountViews());

  expect(result).toEqual(responseBody);
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe('GET');
  expect(requests[0].action).toBe('loadViews');
  expect(requests[0].pathname).toBe('/api.php');
  expect(requests[0].search).toBe('?action=loadViews');
  expect(requests[0].postData).toBeNull();
});

test('saveAccountViews makes the expected POST request and returns JSON', async ({ page }) => {
  const payload = {
    lastKnownLastUpdated: 'client-views-value',
    views: [{ id: 'focus', label: 'Focus', accounts: ['Bart'], system: false }],
    snapshotFreshnessSettings: { freshHours: 4, agingHours: 48 },
    accountTagMap: { Bart: '#ABC123' }
  };
  const responseBody = { ok: true, lastUpdated: 'server-views-value' };
  const requests = await captureApiRequests(page, () => ({ body: responseBody }));
  await loadApiClientHarness(page);

  const result = await page.evaluate(savePayload => window.FleetApiClient.saveAccountViews(savePayload), payload);

  expect(result).toEqual(responseBody);
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe('POST');
  expect(requests[0].action).toBe('saveViews');
  expect(requests[0].pathname).toBe('/api.php');
  expect(requests[0].search).toBe('?action=saveViews');
  expect(requests[0].headers['content-type']).toContain('application/json');
  expect(JSON.parse(requests[0].postData)).toEqual(payload);
});

test('non-OK API responses throw errors with status, code, and payload details', async ({ page }) => {
  const errorBody = {
    error: 'Stale data',
    code: 'STALE_DATA',
    currentLastUpdated: 'server-value',
    lastKnownLastUpdated: 'client-value'
  };
  const requests = await captureApiRequests(page, () => ({ status: 409, body: errorBody }));
  await loadApiClientHarness(page);

  const result = await page.evaluate(async () => {
    try {
      await window.FleetApiClient.saveTimers({
        lastKnownLastUpdated: 'client-value',
        timers: [],
        accountSnapshotMeta: {}
      });

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error.message,
        status: error.status,
        code: error.code,
        payload: error.payload
      };
    }
  });

  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe('POST');
  expect(requests[0].action).toBe('save');
  expect(result).toEqual({
    ok: false,
    message: 'Stale data',
    status: 409,
    code: 'STALE_DATA',
    payload: errorBody
  });
});
