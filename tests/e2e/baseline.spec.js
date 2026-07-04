const { test, expect } = require('@playwright/test');

// Pragmatic refactor safety net for the monolithic index.html app.
// These tests focus on high-value user flows rather than exhaustive UI coverage.

// Escape dynamic fixture labels before using them in regex-based role lookups.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mobile starts with the sidebar hidden, so tests that use sidebar controls
// need to open the menu first. Desktop usually already shows it.
async function showMenuIfNeeded(page) {
  const savedViewSelect = page.locator('#account-view-select');

  if (!(await savedViewSelect.isVisible())) {
    await page.locator('#sidebar-toggle-btn').click();
    await expect(savedViewSelect).toBeVisible();
  }
}

test('extracted CSS and script files load successfully', async ({ page }) => {
  const assetResponses = new Map();

  page.on('response', response => {
    const url = response.url();

    if (/\/(styles\.css|coc-data-map\.js|app-config\.js|app-utils\.js|app-snapshot-meta\.js|app-account-views\.js|app-saved-views-ui\.js|app-timer-entry-ui\.js|app-timer-entry-actions-ui\.js|app-account-controls-ui\.js|app-ui-layout\.js|app-snapshot-import-ui\.js|app-snapshot-collector-ui\.js|app-timer-filters\.js|app-account-summary\.js|app-account-summary-ui\.js|app-timer-filter-ui\.js|app-timer-list-actions-ui\.js|app-timer-lifecycle-actions\.js|app-timer-card-ui\.js|app-fleet-summary-ui\.js)(\?|$)/.test(url)) {
      assetResponses.set(url.split('/').pop().split('?')[0], response.status());
    }
  });

  await page.goto('/');

  // This test is about extracted file loading, not app save/load status.
  // The sync badge may legitimately say Loaded, Saved, Saving, or Save failed
  // depending on fixture normalization and parallel test timing.
  await expect(page.getByText('CLASH TIMERS')).toBeVisible();

  expect(assetResponses.get('styles.css')).toBe(200);
  expect(assetResponses.get('coc-data-map.js')).toBe(200);
  expect(assetResponses.get('app-config.js')).toBe(200);
  expect(assetResponses.get('app-utils.js')).toBe(200);
  expect(assetResponses.get('app-snapshot-meta.js')).toBe(200);
  expect(assetResponses.get('app-account-views.js')).toBe(200);
  expect(assetResponses.get('app-saved-views-ui.js')).toBe(200);
  expect(assetResponses.get('app-timer-entry-ui.js')).toBe(200);
  expect(assetResponses.get('app-timer-entry-actions-ui.js')).toBe(200);
  expect(assetResponses.get('app-account-controls-ui.js')).toBe(200);
  expect(assetResponses.get('app-ui-layout.js')).toBe(200);
  expect(assetResponses.get('app-snapshot-import-ui.js')).toBe(200);
  expect(assetResponses.get('app-snapshot-collector-ui.js')).toBe(200);
  expect(assetResponses.get('app-timer-filters.js')).toBe(200);
  expect(assetResponses.get('app-account-summary.js')).toBe(200);
  expect(assetResponses.get('app-account-summary-ui.js')).toBe(200);
  expect(assetResponses.get('app-timer-filter-ui.js')).toBe(200);
  expect(assetResponses.get('app-timer-list-actions-ui.js')).toBe(200);
  expect(assetResponses.get('app-timer-lifecycle-actions.js')).toBe(200);
  expect(assetResponses.get('app-timer-card-ui.js')).toBe(200);
  expect(assetResponses.get('app-fleet-summary-ui.js')).toBe(200);

  const assets = await page.evaluate(() => ({
    stylesheets: Array.from(document.styleSheets).map(sheet => sheet.href || ''),
    scripts: Array.from(document.scripts).map(script => script.src || '')
  }));

  expect(assets.stylesheets.some(href => href.endsWith('/styles.css'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/coc-data-map.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-config.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-utils.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-snapshot-meta.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-account-views.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-saved-views-ui.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-timer-entry-ui.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-timer-entry-actions-ui.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-account-controls-ui.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-ui-layout.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-snapshot-import-ui.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-snapshot-collector-ui.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-timer-filters.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-account-summary.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-account-summary-ui.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-timer-filter-ui.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-timer-list-actions-ui.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-timer-lifecycle-actions.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-timer-card-ui.js'))).toBeTruthy();
  expect(assets.scripts.some(src => src.endsWith('/app-fleet-summary-ui.js'))).toBeTruthy();

  const globalsLoaded = await page.evaluate(() => ({
    hasUpgradeTypes: Array.isArray(window.UPGRADE_TYPES),
    hasDataMap: !!window.COC_DATA_ID_MAP,
    hasUtilityFunction: typeof window.fmt === 'function',
    hasSnapshotMetaFunction: typeof window.getSnapshotFreshness === 'function',
    hasAccountViewsFunction: typeof window.getSelectedAccountView === 'function',
    hasSavedViewsUiFunction: typeof window.renderAccountViewsEditor === 'function',
    hasTimerEntryUiFunction: typeof window.openBulkModal === 'function' && typeof window.parseBulkTimerText === 'function',
    hasTimerEntryActionsUiFunction: typeof window.saveTimer === 'function'
      && typeof window.saveBulkTimers === 'function'
      && typeof window.quickAdd === 'function',
    hasAccountControlsUiFunction: typeof window.renderAccountViewPicker === 'function'
      && typeof window.setAccountView === 'function'
      && typeof window.applySavedAccountView === 'function'
      && typeof window.applyAccountViewChangesAfterSave === 'function'
      && typeof window.populateAccountControls === 'function'
      && typeof window.setupNativeSelectRenderGuard === 'function',
    hasLayoutFunction: typeof window.setupScrollTopButton === 'function',
    hasSnapshotImportUiFunction: typeof window.openSnapshotModal === 'function' && typeof window.renderSnapshotCandidates === 'function',
    hasSnapshotCollectorUiFunction: typeof window.openBatchSnapshotModal === 'function' && typeof window.renderBatchSnapshotRows === 'function',
    hasTimerFiltersFunction: typeof window.getVisibleTimerList === 'function',
    hasAccountSummaryFunction: typeof window.buildAccountSummaryRows === 'function',
    hasAccountSummaryUiFunction: typeof window.renderAccountSummary === 'function',
    hasTimerFilterUiFunction: typeof window.renderGroupBar === 'function' && typeof window.renderStats === 'function' && typeof window.resetFilters === 'function',
    hasTimerListActionsUiFunction: typeof window.toggleDeleteSelectionMode === 'function' && typeof window.renderDeleteSelectionBar === 'function' && typeof window.toggleTimerActions === 'function',
    hasTimerLifecycleActionsFunction: typeof window.startTimer === 'function'
      && typeof window.pauseTimer === 'function'
      && typeof window.resetTimer === 'function'
      && typeof window.deleteTimer === 'function'
      && typeof window.startAll === 'function'
      && typeof window.pauseAll === 'function'
      && typeof window.resetExpired === 'function',
    hasTimerCardUiFunction: typeof window.renderTimerCard === 'function',
    hasFleetSummaryUiFunction: typeof window.renderFleetSummaryModal === 'function'
  }));

  expect(globalsLoaded).toEqual({
    hasUpgradeTypes: true,
    hasDataMap: true,
    hasUtilityFunction: true,
    hasSnapshotMetaFunction: true,
    hasAccountViewsFunction: true,
    hasSavedViewsUiFunction: true,
    hasTimerEntryUiFunction: true,
    hasTimerEntryActionsUiFunction: true,
    hasAccountControlsUiFunction: true,
    hasLayoutFunction: true,
    hasSnapshotImportUiFunction: true,
    hasSnapshotCollectorUiFunction: true,
    hasTimerFiltersFunction: true,
    hasAccountSummaryFunction: true,
    hasAccountSummaryUiFunction: true,
    hasTimerFilterUiFunction: true,
    hasTimerListActionsUiFunction: true,
    hasTimerLifecycleActionsFunction: true,
    hasTimerCardUiFunction: true,
    hasFleetSummaryUiFunction: true
  });
});

test('extracted app configuration is available to the browser app', async ({ page }) => {
  await page.goto('/');

  const config = await page.evaluate(() => ({
    upgradeTypes: window.UPGRADE_TYPES,
    noteTemplates: window.NOTE_TEMPLATES,
    accountPresets: window.ACCOUNT_PRESETS,
    defaultViews: window.DEFAULT_ACCOUNT_VIEWS,
    freshnessSettings: window.DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS
  }));

  expect(Array.isArray(config.upgradeTypes)).toBeTruthy();
  expect(config.upgradeTypes).toContain('Builder');
  expect(config.upgradeTypes).toContain('Lab');

  expect(Array.isArray(config.noteTemplates)).toBeTruthy();
  expect(config.noteTemplates).toContain('Check lab');

  expect(Array.isArray(config.accountPresets)).toBeTruthy();
  expect(config.accountPresets.length).toBeGreaterThan(0);

  expect(Array.isArray(config.defaultViews)).toBeTruthy();
  expect(config.defaultViews.some(view => view.id === 'all')).toBeTruthy();

  expect(config.freshnessSettings.freshHours).toBeGreaterThan(0);
  expect(config.freshnessSettings.agingHours).toBeGreaterThan(
    config.freshnessSettings.freshHours
  );
});

test('new timer modal static selects are populated and note template fills note field', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /new timer/i }).click();

  const modal = page.locator('#modal');
  await expect(modal).toBeVisible();

  const typeOptions = await page.locator('#f-upgrade-type option').allTextContents();
  expect(typeOptions[0]).toBe('— Select type —');
  expect(typeOptions).toContain('Builder');
  expect(typeOptions).toContain('Lab');

  const noteOptions = await page.locator('#f-note-template option').allTextContents();
  expect(noteOptions[0]).toBe('— Choose a quick note —');
  expect(noteOptions).toContain('Check lab');

  await page.locator('#f-note-template').selectOption({ label: 'Check lab' });

  await expect(page.locator('#f-note')).toHaveValue('Check lab');
  await expect(page.locator('#f-note-template')).toHaveValue('');

  await modal.getByRole('button', { name: /^Cancel$/ }).click();

  await expect(modal).toBeHidden();
});

test('edit timer modal opens with the selected timer values', async ({ page }) => {
  await page.goto('/');

  const firstCard = page.locator('#timer-list .timer-card').first();
  await expect(firstCard).toBeVisible();

  const timerName = await firstCard.locator('.timer-name').innerText();

  await firstCard.locator('button[title="Edit full timer"]').click();

  const modal = page.locator('#modal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#modal-title')).toHaveText('Edit Timer');
  await expect(page.locator('#f-name')).toHaveValue(timerName);

  await modal.getByRole('button', { name: /^Cancel$/ }).click();

  await expect(modal).toBeHidden();
});

test('timer card secondary display toggles between elapsed and end time', async ({ page }) => {
  await page.goto('/');

  const secondary = page.locator('#timer-list .timer-card.running .timer-secondary').first();

  await expect(secondary).toBeVisible();
  await expect(secondary).toContainText(/elapsed/i);

  await secondary.click();

  await expect(secondary).toContainText(/ends/i);

  await secondary.click();

  await expect(secondary).toContainText(/elapsed/i);
});

test('timer cards render stable core presentation elements', async ({ page }) => {
  await page.goto('/');

  const firstCard = page.locator('#timer-list .timer-card').first();

  await expect(firstCard).toBeVisible();
  await expect(firstCard.locator('.timer-name')).toBeVisible();
  await expect(firstCard.locator('.timer-display')).toBeVisible();
  await expect(firstCard.locator('.timer-meta')).toBeVisible();
  await expect(firstCard.locator('.timer-due-badge')).toBeVisible();
  await expect(firstCard.locator('.progress-bar .progress-fill')).toHaveCount(1);
  await expect(firstCard.locator('.card-actions button[title="Adjust time"]')).toHaveCount(1);
  await expect(firstCard.locator('.card-actions button[title="Edit full timer"]')).toHaveCount(1);
});

test('bulk add modal opens with default rows and row controls work', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /multi add/i }).click();

  const modal = page.locator('#bulk-modal');
  const rows = page.locator('#bulk-rows .bulk-timer-row');

  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: /add multiple timers/i })).toBeVisible();

  await expect(page.locator('#bulk-start')).toBeChecked();
  await expect(page.locator('#bulk-sound')).toBeChecked();
  await expect(rows).toHaveCount(5);

  await page.locator('.bulk-add-row').click();
  await expect(rows).toHaveCount(6);

  await rows.last().locator('.bulk-remove-btn').click();
  await expect(rows).toHaveCount(5);

  await page.locator('#bulk-paste-text').fill('X-Bow 3h 57m');
  await modal.getByRole('button', { name: /clear list/i }).click();

  await expect(page.locator('#bulk-paste-text')).toHaveValue('');
  await expect(page.locator('#bulk-paste-status')).toHaveText('List cleared.');
  await expect(page.locator('#bulk-paste-status')).toHaveClass(/ok/);

  await page.locator('#bulk-paste-text').fill('X-Bow 3h 57m\nGold Storage 6d 7h');
  await modal.getByRole('button', { name: /parse list/i }).click();

  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('.bulk-name')).toHaveValue('X-Bow');
  await expect(page.locator('#bulk-paste-status')).toContainText('Parsed 2 timers');
  await expect(page.locator('#bulk-paste-status')).toHaveClass(/ok/);

  await modal.getByRole('button', { name: /^Cancel$/ }).click();

  await expect(modal).toBeHidden();
});

test('extracted utility helpers preserve expected behavior', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(() => ({
    splitSeconds: splitSeconds(90061),
    clampNegative: clampNonNegativeSeconds(-12),
    clampDecimal: clampNonNegativeSeconds(12.9),
    fmtShort: fmt(65),
    fmtHour: fmt(3661),
    fmtDay: fmt(90061),
    fmtDurationZero: fmtDuration(0),
    fmtDurationMixed: fmtDuration(90061),
    escaped: esc('<tag attr="x">&'),
    timerArg: timerIdArg('abc"123'),
    bulkTimerLine: parseBulkTimerLine('1. X-Bow 3h 57m'),
    normalizedTag: normalizePlayerTag('  abc 123 '),
    dueReady: dueWindow({ status: 'expired', remaining: 999 }),
    dueSoon: dueWindow({ status: 'running', remaining: 3600 }),
    dueToday: dueWindow({ status: 'running', remaining: 86400 }),
    dueLater: dueWindow({ status: 'running', remaining: 86401 })
  }));

  expect(result.splitSeconds).toEqual({ d: 1, h: 1, m: 1, s: 1 });

  expect(result.clampNegative).toBe(0);
  expect(result.clampDecimal).toBe(12);

  expect(result.fmtShort).toBe('01:05');
  expect(result.fmtHour).toBe('1:01:01');
  expect(result.fmtDay).toBe('1d 01:01:01');

  expect(result.fmtDurationZero).toBe('0s');
  expect(result.fmtDurationMixed).toBe('1d 1h 1m 1s');

  expect(result.escaped).toBe('&lt;tag attr=&quot;x&quot;&gt;&amp;');
  expect(result.timerArg).toBe('&quot;abc\\&quot;123&quot;');
  expect(result.bulkTimerLine).toEqual({
    name: 'X-Bow',
    days: 0,
    hours: 3,
    minutes: 57,
    seconds: 0
  });

  expect(result.normalizedTag).toBe('#ABC123');

  expect(result.dueReady).toMatchObject({ key: 'Ready', cls: 'ready', order: 0 });
  expect(result.dueSoon).toMatchObject({ key: 'Soon', cls: 'soon', order: 1 });
  expect(result.dueToday).toMatchObject({ key: 'Today', cls: 'today', order: 2 });
  expect(result.dueLater).toMatchObject({ key: 'Later', cls: 'later', order: 3 });
});


test('extracted snapshot metadata helpers preserve expected behavior', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(() => {
    snapshotFreshnessSettings = normalizeSnapshotFreshnessSettings({ freshHours: 6, agingHours: 24 });
    accountSnapshotMeta = normalizeAccountSnapshotMeta({
      Bart: {
        loadedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
        tag: '#abc123',
        candidateCount: 4,
        selectedCount: 3,
        builderCapacity: { homeTotal: 6, builderBaseTotal: 2 }
      }
    });

    const snapshot = {
      tag: ' xyz789 ',
      playerName: 'Snapshot Bart',
      buildings: [
        { data: '1000015', cnt: 5 },
        { data: '1000064', lvl: 1 }
      ],
      buildings2: [
        { data: '1000034', lvl: 9 }
      ]
    };

    return {
      normalizedSettings: normalizeSnapshotFreshnessSettings({ freshHours: 99.8, agingHours: 12 }),
      normalizedTagMap: normalizeAccountTagMap({ abc123: 'Bart', ' #def456 ': ' Elvira Dark ' }),
      playerTag: getSnapshotPlayerTag(snapshot),
      playerName: getSnapshotPlayerName(snapshot),
      freshness: getSnapshotFreshness('Bart'),
      builderCapacity: getAccountBuilderCapacity('Bart'),
      derivedCapacity: deriveBuilderCapacityFromSnapshot(snapshot),
      capacityText: snapshotBuilderCapacityStatusText(snapshot)
    };
  });

  expect(result.normalizedSettings).toEqual({ freshHours: 100, agingHours: 101 });
  expect(result.normalizedTagMap).toEqual({ '#ABC123': 'Bart', '#DEF456': 'Elvira Dark' });
  expect(result.playerTag).toBe('#XYZ789');
  expect(result.playerName).toBe('Snapshot Bart');
  expect(result.freshness).toMatchObject({ key: 'fresh', cls: 'fresh', label: 'Fresh' });
  expect(result.builderCapacity).toEqual({ homeTotal: 6, builderBaseTotal: 2 });
  expect(result.derivedCapacity).toEqual({ homeTotal: 6, builderBaseTotal: 2 });
  expect(result.capacityText).toBe(' Detected capacity: 6 home builders, 2 Builder Base builders.');
});


test('account control bridge populates saved view and account selects', async ({ page }) => {
  await page.goto('/');

  await showMenuIfNeeded(page);

  const accountViewOptions = await page.locator('#account-view-select option').allTextContents();
  expect(accountViewOptions.length).toBeGreaterThan(0);
  expect(accountViewOptions).toContain('All Accounts');

  const quickAccountOptions = await page.locator('#q-account option').allTextContents();
  expect(quickAccountOptions[0]).toBe('— Select account —');
  expect(quickAccountOptions.length).toBeGreaterThan(1);

  const bulkAccountOptions = await page.locator('#bulk-account option').allTextContents();
  expect(bulkAccountOptions[0]).toBe('— Select account or scope —');
  expect(bulkAccountOptions.some((label) => /^All Accounts \(/.test(label))).toBeTruthy();

  const snapshotAccountOptions = await page.locator('#snapshot-account option').allTextContents();
  expect(snapshotAccountOptions[0]).toBe('— Select account —');
  expect(snapshotAccountOptions.length).toBeGreaterThan(1);

  await expect(page.locator('#account-suggestions option').first()).toHaveCount(1);
});

test('timer filter/status bars render baseline controls after app load', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#group-bar .filter-bar-label')).toHaveText('Account');
  await expect(page.locator('#due-bar .filter-bar-label')).toHaveText('Due');
  await expect(page.locator('#type-bar .filter-bar-label')).toHaveText('Type');
  await expect(page.locator('#stats-bar .filter-bar-label')).toHaveText('Status');

  await expect(page.locator('#group-bar .account-pill').first()).toBeVisible();
  await expect(page.locator('#due-bar').getByRole('button', { name: /ready now/i })).toBeVisible();
  await expect(page.locator('#type-bar').getByRole('button', { name: /^all \(/i })).toBeVisible();
  await expect(page.locator('#stats-bar').getByRole('button', { name: /reset filters/i })).toBeVisible();
  await expect(page.locator('#stats-bar').getByRole('button', { name: /pinned/i })).toBeVisible();
});

test('delete selection mode opens with stable controls and can cancel', async ({ page }) => {
  await page.goto('/');

  const deleteButton = page.locator('#delete-mode-btn');
  const deleteBar = page.locator('#delete-selection-bar');

  await expect(page.locator('#timer-list .timer-card').first()).toBeVisible();

  await deleteButton.click();

  await expect(deleteButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#delete-mode-label')).toHaveText('Delete On');
  await expect(deleteBar).toHaveClass(/visible/);
  await expect(deleteBar).toContainText(/Delete mode/i);
  await expect(deleteBar.getByRole('button', { name: /select visible/i })).toBeVisible();
  await expect(deleteBar.getByRole('button', { name: /^cancel$/i })).toBeVisible();

  await deleteBar.getByRole('button', { name: /^cancel$/i }).click();

  await expect(deleteButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#delete-mode-label')).toHaveText('Delete');
  await expect(deleteBar).not.toHaveClass(/visible/);
});

test('account filter pill filters the timer list and reset restores all timers', async ({ page, request }) => {
  const response = await request.get('/api.php?action=load');
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  const timers = body.timers;

  // Pick a real account from the fixture so this test survives fixture refreshes.
  const countsByAccount = timers.reduce((counts, timer) => {
    const account = timer.account || timer.group || 'Ungrouped';
    counts[account] = (counts[account] || 0) + 1;
    return counts;
  }, {});

  const [account, expectedCount] = Object.entries(countsByAccount)
    .filter(([, count]) => count > 0 && count < timers.length)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  await page.goto('/');

  const timerCards = page.locator('#timer-list .timer-card');
  await expect(timerCards).toHaveCount(timers.length);

  const accountPill = page
    .locator('#group-bar .account-pill')
    .filter({ hasText: account })
    .first();

  await accountPill.click();

  await expect(accountPill).toHaveClass(/active/);
  await expect(timerCards).toHaveCount(expectedCount);

  await expect(page.locator('#timer-list .timer-card .timer-group-badge')).toHaveText(
    Array(expectedCount).fill(account)
  );

  await expect(page.locator('#timer-count')).toContainText(
    `${expectedCount} of ${timers.length}`
  );

  await page.getByRole('button', { name: /reset filters/i }).click();

  await expect(timerCards).toHaveCount(timers.length);
  await expect(page.locator('#timer-count')).toContainText(`${timers.length} timers`);
});

test('saved account view scopes timers and can return to all accounts', async ({ page, request }) => {
  const [timersResponse, viewsResponse] = await Promise.all([
    request.get('/api.php?action=load'),
    request.get('/api.php?action=loadViews')
  ]);

  expect(timersResponse.ok()).toBeTruthy();
  expect(viewsResponse.ok()).toBeTruthy();

  const timerBody = await timersResponse.json();
  const viewsBody = await viewsResponse.json();

  const timers = timerBody.timers;
  const views = viewsBody.views;

  // Pick a real Saved View from the fixture instead of hardcoding a view label.
  const candidateViews = views
    .filter((view) => Array.isArray(view.accounts) && view.accounts.length)
    .map((view) => {
      const accountSet = new Set(view.accounts);
      const scopedTimers = timers.filter((timer) =>
        accountSet.has(timer.account || timer.group || 'Ungrouped')
      );

      return {
        ...view,
        accountSet,
        scopedTimers
      };
    })
    .filter((view) => view.scopedTimers.length > 0 && view.scopedTimers.length < timers.length)
    .sort((a, b) => b.scopedTimers.length - a.scopedTimers.length || a.label.localeCompare(b.label));

  expect(candidateViews.length).toBeGreaterThan(0);

  const view = candidateViews[0];
  const timerCards = page.locator('#timer-list .timer-card');

  await page.goto('/');

  await expect(timerCards).toHaveCount(timers.length);

  await showMenuIfNeeded(page);

  await page.locator('#account-view-select').selectOption(view.id);

  await expect(page.locator('#account-view-select')).toHaveValue(view.id);
  await expect(page.locator('#account-view-hint')).toContainText(view.label);
  await expect(timerCards).toHaveCount(view.scopedTimers.length);
  await expect(page.locator('#timer-count')).toContainText(
    `${view.scopedTimers.length} of ${timers.length}`
  );

  const renderedAccounts = await page
    .locator('#timer-list .timer-card .timer-group-badge')
    .allTextContents();

  expect(renderedAccounts.length).toBe(view.scopedTimers.length);
  expect(renderedAccounts.every((account) => view.accountSet.has(account))).toBeTruthy();

  const accountPillLabels = await page
    .locator('#group-bar .account-pill')
    .evaluateAll((buttons) =>
      buttons
        .map((button) => button.querySelector('span')?.textContent?.trim())
        .filter(Boolean)
    );

  expect(accountPillLabels).toEqual(['All', ...view.accounts]);

  await page.locator('.view-status-pill').click();

  await expect(page.locator('#account-view-select')).toHaveValue('all');
  await expect(timerCards).toHaveCount(timers.length);
});

test('saved views management modal opens with editor and freshness settings', async ({ page }) => {
  await page.goto('/');

  await showMenuIfNeeded(page);
  await page.getByRole('button', { name: /^Manage$/ }).click();

  const modal = page.locator('#account-views-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: /manage saved views/i })).toBeVisible();
  await expect(modal.locator('.account-view-editor-row').first()).toBeVisible();
  await expect(modal.locator('#snapshot-fresh-hours')).toBeVisible();
  await expect(modal.locator('#snapshot-aging-hours')).toBeVisible();

  await modal.getByRole('button', { name: /^Cancel$/ }).click();

  await expect(modal).toBeHidden();
});

test('search filters timers and clear search restores the full list', async ({ page, request }) => {
  const response = await request.get('/api.php?action=load');

  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  const timers = body.timers;

  const matchesSearch = (timer, term) => {
    const search = term.toLowerCase();

    return [
      timer.name,
      timer.note || '',
      timer.account || timer.group || '',
      timer.upgradeType || ''
    ].some((value) => String(value || '').toLowerCase().includes(search));
  };

  // Pick a real search term from the fixture so this test survives fixture refreshes.
  // The chosen term must match a subset of timers and appear in every rendered timer name.
  const candidates = new Map();

  for (const timer of timers) {
    const tokens = String(timer.name || '').match(/[A-Za-z][A-Za-z'-]{3,}/g) || [];

    for (const token of new Set(tokens.map((value) => value.toLowerCase()))) {
      const matchingTimers = timers.filter((candidate) => matchesSearch(candidate, token));

      if (
        matchingTimers.length > 0 &&
        matchingTimers.length < timers.length &&
        matchingTimers.every((candidate) =>
          String(candidate.name || '').toLowerCase().includes(token)
        )
      ) {
        candidates.set(token, matchingTimers);
      }
    }
  }

  const [searchTerm, expectedTimers] = Array.from(candidates.entries())
    .sort((a, b) => a[1].length - b[1].length || a[0].localeCompare(b[0]))[0];

  expect(searchTerm).toBeTruthy();

  const expectedCount = expectedTimers.length;
  const timerCards = page.locator('#timer-list .timer-card');

  await page.goto('/');

  await expect(timerCards).toHaveCount(timers.length);

  await showMenuIfNeeded(page);

  await page.locator('#search-input').fill(searchTerm);

  await expect(timerCards).toHaveCount(expectedCount);
  await expect(page.locator('#timer-count')).toContainText(
    `${expectedCount} of ${timers.length}`
  );

  await expect(page.locator('#active-search-pill')).toBeVisible();
  await expect(page.locator('#active-search-pill')).toContainText(searchTerm);

  const renderedNames = await page
    .locator('#timer-list .timer-card .timer-name')
    .allTextContents();

  expect(renderedNames).toHaveLength(expectedCount);
  expect(renderedNames.every((name) => name.toLowerCase().includes(searchTerm))).toBeTruthy();

  await page.locator('#sidebar-toggle-btn').click();

  await expect(page.locator('#sidebar-toggle-btn')).toHaveAttribute(
    'aria-label',
    /search filter active/i
  );
  await expect(page.locator('#active-search-pill')).toBeVisible();

  await page.getByRole('button', { name: /clear search filter/i }).click();

  await expect(page.locator('#search-input')).toHaveValue('');
  await expect(page.locator('#active-search-pill')).toBeHidden();
  await expect(timerCards).toHaveCount(timers.length);
});

test('type filter scopes the timer list and reset restores all timers', async ({ page, request }) => {
  const response = await request.get('/api.php?action=load');

  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  const timers = body.timers;

  const getType = (timer) => timer.upgradeType || 'No type';

  const countsByType = timers.reduce((counts, timer) => {
    const type = getType(timer);
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});

  // Pick a real upgrade type from the fixture instead of hardcoding Builder/Lab/etc.
  const [upgradeType, expectedCount] = Object.entries(countsByType)
    .filter(([, count]) => count > 0 && count < timers.length)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];

  expect(upgradeType).toBeTruthy();

  const timerCards = page.locator('#timer-list .timer-card');

  await page.goto('/');

  await expect(timerCards).toHaveCount(timers.length);

  const typePill = page.locator('#type-bar').getByRole('button', {
    name: new RegExp(`^${escapeRegExp(upgradeType)} \\(${expectedCount}\\)$`)
  });

  await typePill.click();

  await expect(typePill).toHaveClass(/active/);
  await expect(timerCards).toHaveCount(expectedCount);

  await expect(page.locator('#timer-list .timer-card .timer-type-badge')).toHaveText(
    Array(expectedCount).fill(upgradeType)
  );

  await expect(page.locator('#timer-count')).toContainText(
    `${expectedCount} of ${timers.length}`
  );

  await page.getByRole('button', { name: /reset filters/i }).click();

  await expect(timerCards).toHaveCount(timers.length);
  await expect(page.locator('#timer-count')).toContainText(`${timers.length} timers`);
});

test('dashboard loads current timer data', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('CLASH TIMERS')).toBeVisible();
  await expect(page.locator('#sync-status')).toContainText(/Loaded|ready/i);

  const timerCards = page.locator('#timer-list .timer-card');

  await expect(timerCards.first()).toBeVisible();
  await expect(page.locator('#timer-list')).toContainText(/Running|Paused|Stopped|Expired/i);
});

test('API load endpoint returns timer payload', async ({ request }) => {
  const response = await request.get('/api.php?action=load');

  expect(response.ok()).toBeTruthy();

  const body = await response.json();

  expect(body.schemaVersion).toBe(2);
  expect(Array.isArray(body.timers)).toBeTruthy();
  expect(body.timers.length).toBeGreaterThan(0);
});

test('API saved views endpoint returns saved account views', async ({ request }) => {
  const response = await request.get('/api.php?action=loadViews');

  expect(response.ok()).toBeTruthy();

  const body = await response.json();

  expect(Array.isArray(body.views)).toBeTruthy();
  expect(body.views.some((view) => view.label === 'All Accounts')).toBeTruthy();
});

test('fleet summary modal opens', async ({ page }) => {
  await page.goto('/');

  await page.locator('#fleet-summary-btn').click();

  await expect(page.getByRole('heading', { name: /fleet summary/i })).toBeVisible();
  await expect(page.getByText(/Active timers/i)).toBeVisible();
  const matrixSection = page.locator('#fleet-section-matrix');
  await expect(matrixSection).toBeVisible();
  await expect(matrixSection.locator('.fleet-panel-title').getByText(/Queue coverage matrix/i)).toBeVisible();
  await expect(page.locator('.fleet-matrix-sort-btn.account')).toBeVisible();
});

test('fleet summary matrix sorting remains interactive', async ({ page }) => {
  await page.goto('/');

  await page.locator('#fleet-summary-btn').click();

  const matrixSection = page.locator('#fleet-section-matrix');
  await expect(matrixSection).toBeVisible();

  const matrix = matrixSection.locator('.fleet-matrix');
  await expect(matrix).toBeVisible();
  await expect(matrix.locator('.fleet-matrix-row').first()).toBeVisible();

  await matrix.getByRole('button', { name: /sort home ascending/i }).click();

  await expect(matrixSection).toBeVisible();
  await expect(matrixSection.locator('.fleet-matrix')).toBeVisible();
  await expect(
    matrixSection.locator('.fleet-matrix-sort-btn.active .fleet-matrix-sort-label').filter({ hasText: /^Home$/ })
  ).toBeVisible();
  await expect(matrixSection.locator('.fleet-matrix-row').first()).toBeVisible();
});

test('account snapshot add modal opens with safe defaults and validates empty paste', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /snapshot add/i }).click();

  const modal = page.locator('#snapshot-modal');

  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: /add timers from account snapshot/i })).toBeVisible();

  await expect(page.locator('#snapshot-start')).toBeChecked();
  await expect(page.locator('#snapshot-sound')).toBeChecked();
  await expect(page.locator('#snapshot-include-helper')).not.toBeChecked();
  await expect(page.locator('#snapshot-replace-existing')).not.toBeChecked();
  await expect(page.locator('#snapshot-preserve-manual-notes')).toBeChecked();
  await expect(page.locator('#snapshot-preserve-manual-notes')).toBeDisabled();

  await expect(page.locator('#snapshot-candidate-rows')).toContainText(
    /paste and parse a snapshot to see timer candidates/i
  );

  await modal.getByRole('button', { name: /^Parse Snapshot$/ }).click();

  await expect(page.locator('#snapshot-status')).toContainText(/paste account json first/i);
  await expect(page.locator('#snapshot-status')).toHaveClass(/warning/);

  await modal.getByRole('button', { name: /^Cancel$/ }).click();

  await expect(modal).toBeHidden();
});

// Keep this as a smoke/guard test only. Full Snapshot Collector imports mutate
// the shared file-backed runtime data, so those should be added deliberately.
test('snapshot collector opens with safe defaults and validates empty paste', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /snapshot collector/i }).click();

  const modal = page.locator('#batch-snapshot-modal');

  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: /snapshot collector/i })).toBeVisible();

  await expect(page.locator('#batch-snapshot-start')).toBeChecked();
  await expect(page.locator('#batch-snapshot-sound')).toBeChecked();
  await expect(page.locator('#batch-snapshot-include-helper')).not.toBeChecked();
  await expect(page.locator('#batch-snapshot-replace-existing')).toBeChecked();
  await expect(page.locator('#batch-snapshot-preserve-manual-notes')).toBeChecked();

  await expect(page.locator('#batch-snapshot-rows')).toContainText(
    /paste a snapshot and click add snapshot/i
  );

  await modal.getByRole('button', { name: /^Add Snapshot$/ }).click();

  await expect(page.locator('#batch-snapshot-status')).toContainText(
    /paste one game snapshot first/i
  );
  await expect(page.locator('#batch-snapshot-status')).toHaveClass(/warning/);

  await modal.getByRole('button', { name: /^Cancel$/ }).click();

  await expect(modal).toBeHidden();
});