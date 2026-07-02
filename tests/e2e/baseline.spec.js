const { test, expect } = require('@playwright/test');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function showMenuIfNeeded(page) {
  const savedViewSelect = page.locator('#account-view-select');

  if (!(await savedViewSelect.isVisible())) {
    await page.locator('#sidebar-toggle-btn').click();
    await expect(savedViewSelect).toBeVisible();
  }
}

test('account filter pill filters the timer list and reset restores all timers', async ({ page, request }) => {
  const response = await request.get('/api.php?action=load');
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  const timers = body.timers;

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
});

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