const { test, expect } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chrome', 'API contract tests only need to run once.');
});

function expectObject(value) {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBeFalsy();
}

async function responseJson(response) {
  return await response.json();
}

async function loadTimers(request) {
  const response = await request.get('/api.php?action=load');
  expect(response.status()).toBe(200);
  return await responseJson(response);
}

async function loadViews(request) {
  const response = await request.get('/api.php?action=loadViews');
  expect(response.status()).toBe(200);
  return await responseJson(response);
}

test('load returns the timer data contract', async ({ request }) => {
  const response = await request.get('/api.php?action=load');

  expect(response.status()).toBe(200);

  const data = await responseJson(response);
  expect(data.schemaVersion).toBe(2);
  expect(Array.isArray(data.timers)).toBeTruthy();
  expectObject(data.accountSnapshotMeta);
  expect(data.lastUpdated === null || typeof data.lastUpdated === 'string').toBeTruthy();
});

test('loadViews returns the saved-view and shared-settings contract', async ({ request }) => {
  const response = await request.get('/api.php?action=loadViews');

  expect(response.status()).toBe(200);

  const data = await responseJson(response);
  expect(data.schemaVersion).toBe(3);
  expect(Array.isArray(data.views)).toBeTruthy();
  expect(data.views.length).toBeGreaterThan(0);

  expect(data.views[0]).toEqual(expect.objectContaining({
    id: 'all',
    label: 'All Accounts',
    accounts: null,
    system: true
  }));

  expectObject(data.snapshotFreshnessSettings);
  expect(typeof data.snapshotFreshnessSettings.freshHours).toBe('number');
  expect(typeof data.snapshotFreshnessSettings.agingHours).toBe('number');
  expect(data.snapshotFreshnessSettings.agingHours).toBeGreaterThan(data.snapshotFreshnessSettings.freshHours);
  expectObject(data.accountTagMap);
});

test('invalid and unsupported API calls return useful errors', async ({ request }) => {
  const unknownAction = await request.get('/api.php?action=doesNotExist');
  expect(unknownAction.status()).toBe(400);
  expect((await responseJson(unknownAction)).error).toBeTruthy();

  const saveWithGet = await request.get('/api.php?action=save');
  expect(saveWithGet.status()).toBe(405);
  expect((await responseJson(saveWithGet)).error).toBeTruthy();

  const saveViewsWithGet = await request.get('/api.php?action=saveViews');
  expect(saveViewsWithGet.status()).toBe(405);
  expect((await responseJson(saveViewsWithGet)).error).toBeTruthy();

  const invalidJson = await request.post('/api.php?action=save', {
    headers: { 'Content-Type': 'application/json' },
    data: '{'
  });
  expect(invalidJson.status()).toBe(400);
  expect((await responseJson(invalidJson)).error).toBeTruthy();

  const saveWithoutTimers = await request.post('/api.php?action=save', {
    data: { lastKnownLastUpdated: null }
  });
  expect(saveWithoutTimers.status()).toBe(400);
  expect((await responseJson(saveWithoutTimers)).error).toBeTruthy();

  const saveViewsWithoutViews = await request.post('/api.php?action=saveViews', {
    data: { lastKnownLastUpdated: null }
  });
  expect(saveViewsWithoutViews.status()).toBe(400);
  expect((await responseJson(saveViewsWithoutViews)).error).toBeTruthy();
});

test('timer stale-save protection rejects old client data', async ({ request }) => {
  const current = await loadTimers(request);
  expect(typeof current.lastUpdated).toBe('string');

  const response = await request.post('/api.php?action=save', {
    data: {
      lastKnownLastUpdated: 'deliberately-wrong-last-updated',
      timers: current.timers,
      accountSnapshotMeta: current.accountSnapshotMeta
    }
  });

  expect(response.status()).toBe(409);

  const error = await responseJson(response);
  expect(error.code).toBe('STALE_DATA');
  expect(error.currentLastUpdated).toBe(current.lastUpdated);
  expect(error.lastKnownLastUpdated).toBe('deliberately-wrong-last-updated');
});

test('saved-view stale-save protection rejects old client data', async ({ request }) => {
  const current = await loadViews(request);
  expect(typeof current.lastUpdated).toBe('string');

  const response = await request.post('/api.php?action=saveViews', {
    data: {
      lastKnownLastUpdated: 'deliberately-wrong-last-updated',
      views: current.views,
      snapshotFreshnessSettings: current.snapshotFreshnessSettings,
      accountTagMap: current.accountTagMap
    }
  });

  expect(response.status()).toBe(409);

  const error = await responseJson(response);
  expect(error.code).toBe('STALE_VIEWS');
  expect(error.currentLastUpdated).toBe(current.lastUpdated);
  expect(error.lastKnownLastUpdated).toBe('deliberately-wrong-last-updated');
});

test('timer save preserves accountSnapshotMeta when older clients omit it', async ({ request }) => {
  const before = await loadTimers(request);
  const existingMeta = before.accountSnapshotMeta;

  const saveResponse = await request.post('/api.php?action=save', {
    data: {
      lastKnownLastUpdated: before.lastUpdated,
      timers: before.timers
    }
  });

  expect(saveResponse.status()).toBe(200);

  const saveResult = await responseJson(saveResponse);
  expect(saveResult.ok).toBe(true);
  expect(typeof saveResult.lastUpdated).toBe('string');
  expect(saveResult.lastUpdated).not.toBe(before.lastUpdated);
  expect(typeof saveResult.backupCreated).toBe('string');
  expect(saveResult.backupCreated.length).toBeGreaterThan(0);
  expect(saveResult.backupCreated.startsWith('timers-')).toBeTruthy();

  const after = await loadTimers(request);
  expect(after.accountSnapshotMeta).toEqual(existingMeta);
  expect(after.lastUpdated).toBe(saveResult.lastUpdated);
});

test('saved-view save preserves shared settings when older clients omit them', async ({ request }) => {
  const before = await loadViews(request);
  const existingFreshnessSettings = before.snapshotFreshnessSettings;
  const existingAccountTagMap = before.accountTagMap;

  const saveResponse = await request.post('/api.php?action=saveViews', {
    data: {
      lastKnownLastUpdated: before.lastUpdated,
      views: before.views
    }
  });

  expect(saveResponse.status()).toBe(200);

  const saveResult = await responseJson(saveResponse);
  expect(saveResult.ok).toBe(true);
  expect(typeof saveResult.lastUpdated).toBe('string');
  expect(saveResult.lastUpdated).not.toBe(before.lastUpdated);
  expect(typeof saveResult.backupCreated).toBe('string');
  expect(saveResult.backupCreated.length).toBeGreaterThan(0);
  expect(saveResult.backupCreated.startsWith('account-views-')).toBeTruthy();

  const after = await loadViews(request);
  expect(after.snapshotFreshnessSettings).toEqual(existingFreshnessSettings);
  expect(after.accountTagMap).toEqual(existingAccountTagMap);
  expect(after.lastUpdated).toBe(saveResult.lastUpdated);
});
