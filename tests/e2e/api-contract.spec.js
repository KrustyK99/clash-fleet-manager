const { test, expect } = require('@playwright/test');
const {
  createApiContractClient,
  resolveApiContractTarget
} = require('../support/api-contract-client');
const {
  WRONG_LAST_UPDATED,
  createTimerSavePayload,
  createSavedViewsSavePayload
} = require('../support/api-contract-fixtures');

test.describe.configure({ mode: 'serial' });

function expectObject(value) {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBeFalsy();
}

async function responseJson(response) {
  return await response.json();
}

async function loadTimers(api) {
  const response = await api.loadTimers();
  expect(response.status()).toBe(200);
  return await responseJson(response);
}

async function loadViews(api) {
  const response = await api.loadAccountViews();
  expect(response.status()).toBe(200);
  return await responseJson(response);
}

test('load returns the timer data contract', async ({ request }) => {
  expect(['php', 'fastapi']).toContain(resolveApiContractTarget().name);

  const api = createApiContractClient(request);
  const response = await api.loadTimers();

  expect(response.status()).toBe(200);

  const data = await responseJson(response);
  expect(data.schemaVersion).toBe(2);
  expect(Array.isArray(data.timers)).toBeTruthy();
  expectObject(data.accountSnapshotMeta);
  expect(data.lastUpdated === null || typeof data.lastUpdated === 'string').toBeTruthy();
});

test('loadViews returns the saved-view and shared-settings contract', async ({ request }) => {
  const api = createApiContractClient(request);
  const response = await api.loadAccountViews();

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
  expect(resolveApiContractTarget({ target: 'fastapi' }).name).toBe('fastapi');
  expect(() => resolveApiContractTarget({ target: 'somethingelse' })).toThrow('Unsupported API_CONTRACT_TARGET: somethingelse');

  const api = createApiContractClient(request);

  const unknownAction = await api.getUnsupportedAction();
  expect(unknownAction.status()).toBe(400);
  expect((await responseJson(unknownAction)).error).toBeTruthy();

  const saveWithGet = await api.getSaveTimers();
  expect(saveWithGet.status()).toBe(405);
  expect((await responseJson(saveWithGet)).error).toBeTruthy();

  const saveViewsWithGet = await api.getSaveAccountViews();
  expect(saveViewsWithGet.status()).toBe(405);
  expect((await responseJson(saveViewsWithGet)).error).toBeTruthy();

  const invalidJson = await api.saveTimersRaw('{', {
    headers: { 'Content-Type': 'application/json' }
  });
  expect(invalidJson.status()).toBe(400);
  expect((await responseJson(invalidJson)).error).toBeTruthy();

  const invalidViewsJson = await api.saveAccountViewsRaw('{', {
    headers: { 'Content-Type': 'application/json' }
  });
  expect(invalidViewsJson.status()).toBe(400);
  expect((await responseJson(invalidViewsJson)).error).toBeTruthy();

  const saveWithoutTimers = await api.saveTimers({ lastKnownLastUpdated: null });
  expect(saveWithoutTimers.status()).toBe(400);
  expect((await responseJson(saveWithoutTimers)).error).toBeTruthy();

  const saveViewsWithoutViews = await api.saveAccountViews({ lastKnownLastUpdated: null });
  expect(saveViewsWithoutViews.status()).toBe(400);
  expect((await responseJson(saveViewsWithoutViews)).error).toBeTruthy();
});

test('timer stale-save protection rejects old client data', async ({ request }) => {
  const api = createApiContractClient(request);
  const current = await loadTimers(api);
  expect(typeof current.lastUpdated).toBe('string');

  const response = await api.saveTimers(createTimerSavePayload(current, {
    lastKnownLastUpdated: WRONG_LAST_UPDATED
  }));

  expect(response.status()).toBe(409);

  const error = await responseJson(response);
  expect(error.code).toBe('STALE_DATA');
  expect(error.currentLastUpdated).toBe(current.lastUpdated);
  expect(error.lastKnownLastUpdated).toBe(WRONG_LAST_UPDATED);
});

test('saved-view stale-save protection rejects old client data', async ({ request }) => {
  const api = createApiContractClient(request);
  const current = await loadViews(api);
  expect(typeof current.lastUpdated).toBe('string');

  const response = await api.saveAccountViews(createSavedViewsSavePayload(current, {
    lastKnownLastUpdated: WRONG_LAST_UPDATED
  }));

  expect(response.status()).toBe(409);

  const error = await responseJson(response);
  expect(error.code).toBe('STALE_VIEWS');
  expect(error.currentLastUpdated).toBe(current.lastUpdated);
  expect(error.lastKnownLastUpdated).toBe(WRONG_LAST_UPDATED);
});

test('timer save preserves accountSnapshotMeta when older clients omit it', async ({ request }) => {
  const api = createApiContractClient(request);
  const before = await loadTimers(api);
  const existingMeta = before.accountSnapshotMeta;

  const saveResponse = await api.saveTimers(createTimerSavePayload(before, {
    accountSnapshotMeta: undefined
  }));

  expect(saveResponse.status()).toBe(200);

  const saveResult = await responseJson(saveResponse);
  expect(saveResult.ok).toBe(true);
  expect(typeof saveResult.lastUpdated).toBe('string');
  expect(saveResult.lastUpdated).not.toBe(before.lastUpdated);
  expect(typeof saveResult.backupCreated).toBe('string');
  expect(saveResult.backupCreated.length).toBeGreaterThan(0);
  expect(saveResult.backupCreated.startsWith('timers-')).toBeTruthy();

  const after = await loadTimers(api);
  expect(after.accountSnapshotMeta).toEqual(existingMeta);
  expect(after.lastUpdated).toBe(saveResult.lastUpdated);
});

test('saved-view save preserves shared settings when older clients omit them', async ({ request }) => {
  const api = createApiContractClient(request);
  const before = await loadViews(api);
  const existingFreshnessSettings = before.snapshotFreshnessSettings;
  const existingAccountTagMap = before.accountTagMap;

  const saveResponse = await api.saveAccountViews(createSavedViewsSavePayload(before, {
    snapshotFreshnessSettings: undefined,
    accountTagMap: undefined
  }));

  expect(saveResponse.status()).toBe(200);

  const saveResult = await responseJson(saveResponse);
  expect(saveResult.ok).toBe(true);
  expect(typeof saveResult.lastUpdated).toBe('string');
  expect(saveResult.lastUpdated).not.toBe(before.lastUpdated);
  expect(typeof saveResult.backupCreated).toBe('string');
  expect(saveResult.backupCreated.length).toBeGreaterThan(0);
  expect(saveResult.backupCreated.startsWith('account-views-')).toBeTruthy();

  const after = await loadViews(api);
  expect(after.snapshotFreshnessSettings).toEqual(existingFreshnessSettings);
  expect(after.accountTagMap).toEqual(existingAccountTagMap);
  expect(after.lastUpdated).toBe(saveResult.lastUpdated);
});

test('saved-view save normalizes views, freshness settings, and account tag map', async ({ request }) => {
  const api = createApiContractClient(request);
  const before = await loadViews(api);
  let after = null;

  try {
    const saveResponse = await api.saveAccountViews({
      lastKnownLastUpdated: before.lastUpdated,
      views: [
        {
          id: 'all',
          label: 'Wrong label should normalize away',
          accounts: ['Should not persist']
        },
        {
          id: 'parity-view',
          label: '  Parity View  ',
          accounts: ['Bart', 'Bart', '', null, 'Zylink']
        },
        {
          id: 'duplicate-view',
          label: 'First duplicate wins',
          accounts: ['Heisenberg']
        },
        {
          id: 'duplicate-view',
          label: 'Second duplicate is ignored',
          accounts: ['Jesse Pinkman']
        },
        {
          id: '',
          label: 'Missing id is ignored',
          accounts: ['Bart']
        }
      ],
      snapshotFreshnessSettings: {
        freshHours: 0,
        agingHours: 0
      },
      accountTagMap: {
        ' abc 123 ': ' Bart ',
        '#def456': '',
        '#AAA': 'Zylink',
        '': 'Ignored'
      }
    });

    expect(saveResponse.status()).toBe(200);
    expect((await responseJson(saveResponse)).ok).toBe(true);

    after = await loadViews(api);

    expect(after.views[0]).toEqual({
      id: 'all',
      label: 'All Accounts',
      accounts: null,
      system: true
    });

    expect(after.views.find((view) => view.id === 'parity-view')).toEqual({
      id: 'parity-view',
      label: 'Parity View',
      accounts: ['Bart', 'Zylink']
    });

    expect(after.views.filter((view) => view.id === 'duplicate-view')).toEqual([
      {
        id: 'duplicate-view',
        label: 'First duplicate wins',
        accounts: ['Heisenberg']
      }
    ]);

    expect(after.views.some((view) => view.label === 'Missing id is ignored')).toBeFalsy();
    expect(after.snapshotFreshnessSettings).toEqual({ freshHours: 1, agingHours: 2 });
    expect(after.accountTagMap).toEqual({
      '#AAA': 'Zylink',
      '#ABC123': 'Bart'
    });
  } finally {
    if (after && after.lastUpdated) {
      const restoreResponse = await api.saveAccountViews(createSavedViewsSavePayload(before, {
        lastKnownLastUpdated: after.lastUpdated
      }));
      expect(restoreResponse.status()).toBe(200);
    }
  }
});
