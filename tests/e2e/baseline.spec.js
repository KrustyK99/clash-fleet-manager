const { test, expect } = require('@playwright/test');

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