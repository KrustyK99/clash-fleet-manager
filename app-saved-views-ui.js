// Saved Views/settings modal UI helpers for the Clash Timers browser app.
// Classic browser script: these functions intentionally read and mutate existing global app state.
// Keep persistence/API functions and high-level render orchestration in index.html.

// ── Saved View management ─────────────────────────────────────────────────
function openAccountViewsModal() {
  accountViewEditorDrafts = getAccountViews().map(cloneAccountView);
  renderAccountViewsEditor();
  const modal = document.getElementById('account-views-modal');
  if (modal) modal.style.display = 'flex';
}

function closeAccountViewsModal() {
  const modal = document.getElementById('account-views-modal');
  if (modal) modal.style.display = 'none';
  accountViewEditorDrafts = [];
}

function getAccountViewEditorRows(validate=false) {
  const rows = Array.from(document.querySelectorAll('.account-view-editor-row'));
  const drafts = [];
  const labels = new Set();

  for (const row of rows) {
    const id = row.dataset.viewId || '';
    const system = row.dataset.system === 'true' || id === 'all';
    const nameInput = row.querySelector('.account-view-name-input');
    const label = system ? 'All Accounts' : String(nameInput ? nameInput.value : '').trim();

    if (validate && !label) {
      if (nameInput) nameInput.focus();
      toast('View name is required', 'warning');
      return null;
    }

    const labelKey = label.toLowerCase();
    if (validate && labelKey && labels.has(labelKey)) {
      if (nameInput) nameInput.focus();
      toast('Saved View names must be unique', 'warning');
      return null;
    }
    if (labelKey) labels.add(labelKey);

    const accounts = system
      ? null
      : sortAccountNames(Array.from(row.querySelectorAll('.account-view-account-input:checked')).map(cb => cb.value));

    drafts.push({
      id: system ? 'all' : normalizeAccountViewId(id, label),
      label: label || (system ? 'All Accounts' : ''),
      accounts,
      ...(system ? { system: true } : {})
    });
  }

  return normalizeAccountViews(drafts);
}

function renderAccountViewsEditor() {
  const list = document.getElementById('account-views-list');
  if (!list) return;

  const knownAccounts = getKnownAccounts();
  const views = normalizeAccountViews(accountViewEditorDrafts.length ? accountViewEditorDrafts : getAccountViews());
  accountViewEditorDrafts = views.map(cloneAccountView);

  list.innerHTML = views.map((view, index) => {
    const system = view.system === true || view.id === 'all';
    const selectedAccounts = new Set(Array.isArray(view.accounts) ? view.accounts : []);
    const accountGrid = system
      ? '<div class="account-view-system-note">All Accounts is protected and always includes every known account.</div>'
      : (knownAccounts.length
          ? `<div class="account-view-account-grid">${knownAccounts.map(account => {
              const checked = selectedAccounts.has(account) ? ' checked' : '';
              return `
                <label class="account-view-account-check" title="${esc(account)}">
                  <input type="checkbox" class="account-view-account-input" value="${esc(account)}"${checked}>
                  <span class="account-view-account-name">${esc(account)}</span>
                </label>
              `;
            }).join('')}</div>${selectedAccounts.size ? '' : '<div class="account-view-empty-note">No accounts selected.</div>'}`
          : '<div class="account-view-empty-note">No known accounts available yet.</div>');

    return `
      <div class="account-view-editor-row" data-view-id="${esc(view.id)}" data-system="${system ? 'true' : 'false'}">
        <div class="account-view-editor-head">
          <div>
            <label>View name</label>
            <input type="text" class="account-view-name-input" value="${esc(view.label)}" ${system ? 'readonly aria-readonly="true"' : ''}>
            <div class="account-view-editor-meta">${system ? 'Protected system view' : `${Array.isArray(view.accounts) ? view.accounts.length : 0} selected account${Array.isArray(view.accounts) && view.accounts.length === 1 ? '' : 's'}`}</div>
          </div>
          ${system
            ? '<button class="btn btn-sm" type="button" onclick="toast(\'All Accounts cannot be deleted\', \'warning\')" title="All Accounts cannot be deleted">Protected</button>'
            : `<button class="btn btn-sm btn-danger" type="button" onclick="deleteAccountViewEditorRow('${esc(view.id)}')">Delete</button>`}
        </div>
        ${accountGrid}
      </div>
    `;
  }).join('');
  renderSnapshotFreshnessSettingsEditor();
}

function renderSnapshotFreshnessSettingsEditor() {
  const settings = normalizeSnapshotFreshnessSettings(snapshotFreshnessSettings);
  const freshEl = document.getElementById('snapshot-fresh-hours');
  const agingEl = document.getElementById('snapshot-aging-hours');
  if (freshEl) freshEl.value = String(settings.freshHours);
  if (agingEl) agingEl.value = String(settings.agingHours);
}

function getSnapshotFreshnessSettingsFromControls(validate=false) {
  const freshEl = document.getElementById('snapshot-fresh-hours');
  const agingEl = document.getElementById('snapshot-aging-hours');
  const freshHours = Number(freshEl ? freshEl.value : snapshotFreshnessSettings.freshHours);
  const agingHours = Number(agingEl ? agingEl.value : snapshotFreshnessSettings.agingHours);

  if (validate) {
    if (!Number.isFinite(freshHours) || freshHours < 1) {
      if (freshEl) freshEl.focus();
      toast('Fresh threshold must be at least 1 hour.', 'warning');
      return null;
    }
    if (!Number.isFinite(agingHours) || agingHours < 2) {
      if (agingEl) agingEl.focus();
      toast('Aging threshold must be at least 2 hours.', 'warning');
      return null;
    }
    if (agingHours <= freshHours) {
      if (agingEl) agingEl.focus();
      toast('Aging threshold must be greater than the fresh threshold.', 'warning');
      return null;
    }
    if (freshHours > 720 || agingHours > 720) {
      const target = freshHours > 720 ? freshEl : agingEl;
      if (target) target.focus();
      toast('Freshness thresholds cannot be more than 720 hours.', 'warning');
      return null;
    }
  }

  return normalizeSnapshotFreshnessSettings({ freshHours, agingHours });
}

function addAccountViewEditorRow() {
  const current = getAccountViewEditorRows(false);
  accountViewEditorDrafts = current ? current.map(cloneAccountView) : getAccountViews().map(cloneAccountView);

  const existingIds = new Set(accountViewEditorDrafts.map(v => v.id));
  let id = `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  while (existingIds.has(id)) id = `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  accountViewEditorDrafts.push({ id, label: 'New View', accounts: [] });
  renderAccountViewsEditor();

  const inputs = document.querySelectorAll('.account-view-name-input');
  const last = inputs[inputs.length - 1];
  if (last) {
    last.focus();
    last.select();
  }
}

function deleteAccountViewEditorRow(id) {
  if (id === 'all') {
    toast('All Accounts cannot be deleted', 'warning');
    return;
  }

  const current = getAccountViewEditorRows(false) || accountViewEditorDrafts;
  const view = current.find(v => v.id === id);
  const label = view ? view.label : 'this view';
  if (!confirm(`Delete Saved View "${label}"?`)) return;

  accountViewEditorDrafts = current.filter(v => v.id !== id).map(cloneAccountView);
  renderAccountViewsEditor();
}

async function saveManagedAccountViews() {
  const drafts = getAccountViewEditorRows(true);
  if (!drafts) return;

  const nextFreshnessSettings = getSnapshotFreshnessSettingsFromControls(true);
  if (!nextFreshnessSettings) return;

  const saved = await saveAccountViews(drafts, nextFreshnessSettings);
  if (!saved) return;

  closeAccountViewsModal();
  applyAccountViewChangesAfterSave();
  renderTimers();
}
