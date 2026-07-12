// Timer entry, manual timer modal, and bulk-add UI helpers for the Clash Timers browser app.
// Loaded as a classic non-module script before the main inline app script.
// These functions intentionally use globals declared by the main inline script.

const BULK_TARGET_ALL_ACCOUNTS = '__bulk_all_accounts__';
const BULK_TARGET_CURRENT_VIEW = '__bulk_current_view__';

// ── Static timer-entry form controls ───────────────────────────────────────
function upgradeTypeOptionsHtml(selected='') {
  return UPGRADE_TYPES.map(v => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${v || '— Select type —'}</option>`).join('');
}

function populateStaticSelects() {
  const typeOptions = upgradeTypeOptionsHtml();
  ['f-upgrade-type','q-upgrade-type'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = typeOptions;
  });

  const noteOptions = NOTE_TEMPLATES.map(v => `<option value="${esc(v)}">${v || '— Choose a quick note —'}</option>`).join('');
  const noteEl = document.getElementById('f-note-template');
  if (noteEl) noteEl.innerHTML = noteOptions;

  renderAccountViewPicker(true);
  populateAccountControls();
}

function applyNoteTemplate() {
  const tpl = document.getElementById('f-note-template').value;
  if (!tpl) return;
  const note = document.getElementById('f-note');
  note.value = note.value ? `${note.value} ${tpl}` : tpl;
  document.getElementById('f-note-template').value = '';
  note.focus();
}

// ── Regular timer modal UI ─────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'New Timer';
  document.getElementById('f-account').value = '';
  document.getElementById('f-upgrade-type').value = '';
  document.getElementById('f-name').value = '';
  document.getElementById('f-days').value = '0';
  document.getElementById('f-hours').value = '0';
  document.getElementById('f-mins').value = '5';
  document.getElementById('f-secs').value = '0';
  document.getElementById('f-note-template').value = '';
  document.getElementById('f-note').value = '';
  document.getElementById('f-repeat').checked = false;
  document.getElementById('f-sound').checked = true;
  document.getElementById('modal').style.display = 'flex';
  setTimeout(()=>document.getElementById('f-name').focus(),50);
}

function openEditModal(id) {
  const t = timers.find(x=>x.id===id);
  if (!t) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Edit Timer';
  document.getElementById('f-account').value = getAccount(t);
  document.getElementById('f-upgrade-type').value = getUpgradeType(t);
  document.getElementById('f-name').value = t.name;
  document.getElementById('f-days').value = Math.floor(t.duration/86400);
  document.getElementById('f-hours').value = Math.floor((t.duration%86400)/3600);
  document.getElementById('f-mins').value = Math.floor((t.duration%3600)/60);
  document.getElementById('f-secs').value = t.duration%60;
  document.getElementById('f-note-template').value = '';
  document.getElementById('f-note').value = t.note||'';
  document.getElementById('f-repeat').checked = !!t.repeat;
  document.getElementById('f-sound').checked = t.sound!==false;
  document.getElementById('modal').style.display = 'flex';
  setTimeout(()=>document.getElementById('f-name').focus(),50);
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

// ── Bulk add modal UI helpers ──────────────────────────────────────────────
function resolveBulkTargetAccounts(value=document.getElementById('bulk-account')?.value || '') {
  const target = String(value || '').trim();

  if (target === BULK_TARGET_ALL_ACCOUNTS) {
    return getKnownAccounts();
  }

  if (target === BULK_TARGET_CURRENT_VIEW) {
    return sortAccountNames(getAccountsForView(getSelectedAccountView()));
  }

  return target ? [target] : [];
}

function getBulkTargetLabel(value=document.getElementById('bulk-account')?.value || '') {
  const target = String(value || '').trim();

  if (target === BULK_TARGET_ALL_ACCOUNTS) return 'All Accounts';
  if (target === BULK_TARGET_CURRENT_VIEW) return `Current Saved View: ${getSelectedAccountView().label}`;
  return target;
}

function updateBulkTargetSummary() {
  const summary = document.getElementById('bulk-target-summary');
  const select = document.getElementById('bulk-account');
  if (!summary || !select) return;

  const value = select.value;
  const accounts = resolveBulkTargetAccounts(value);
  const label = getBulkTargetLabel(value);

  if (!value) {
    summary.textContent = 'Choose a single account, the current saved view, or all known accounts.';
    return;
  }

  if (!accounts.length) {
    summary.textContent = 'No accounts are available for this target.';
    return;
  }

  if (accounts.length === 1) {
    summary.innerHTML = `Creates timers for <strong>${esc(accounts[0])}</strong>.`;
    return;
  }

  summary.innerHTML = `Creates one copy of each timer row for <strong>${esc(label)}</strong> (${accounts.length} accounts).`;
}

function openBulkModal() {
  populateAccountControls(true);
  const accountEl = document.getElementById('bulk-account');
  const defaultTypeEl = document.getElementById('bulk-default-type');
  const quickAccount = document.getElementById('q-account');
  const quickType = document.getElementById('q-upgrade-type');

  accountEl.value = getPreferredAccountForCurrentView(filterGroup !== 'All' ? filterGroup : '', quickAccount ? quickAccount.value : '');
  updateBulkTargetSummary();
  defaultTypeEl.innerHTML = upgradeTypeOptionsHtml(quickType ? quickType.value : '');
  document.getElementById('bulk-start').checked = true;
  document.getElementById('bulk-sound').checked = true;
  clearBulkTimerText(false);

  const rows = document.getElementById('bulk-rows');
  rows.innerHTML = '';
  for (let i = 0; i < 5; i++) addBulkTimerRow();

  document.getElementById('bulk-modal').style.display = 'flex';
  setTimeout(() => {
    const pasteText = document.getElementById('bulk-paste-text');
    const firstName = document.querySelector('#bulk-rows .bulk-name');
    if (pasteText) pasteText.focus();
    else if (firstName) firstName.focus();
  }, 50);
}

function closeBulkModal() {
  document.getElementById('bulk-modal').style.display = 'none';
}

function clearBulkTimerText(showStatus=true) {
  const el = document.getElementById('bulk-paste-text');
  if (el) el.value = '';
  setBulkPasteStatus(showStatus ? 'List cleared.' : '', showStatus ? 'ok' : '');
}

function parseBulkTimerText() {
  const source = document.getElementById('bulk-paste-text');
  if (!source) return;

  const lines = source.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) {
    setBulkPasteStatus('Paste one timer per line first.', 'warning');
    source.focus();
    return;
  }

  const parsed = [];
  const skipped = [];
  lines.forEach((line, idx) => {
    const item = parseBulkTimerLine(line);
    if (item) parsed.push(item);
    else skipped.push(idx + 1);
  });

  if (!parsed.length) {
    setBulkPasteStatus('No timers found. Use format: X-Bow 3h 57m', 'error');
    toast('No timers found in pasted list.', 'warning');
    source.focus();
    return;
  }

  const rows = document.getElementById('bulk-rows');
  rows.innerHTML = '';
  parsed.forEach(item => addBulkTimerRow(item));

  const msg = skipped.length
    ? `Parsed ${parsed.length} timer${parsed.length === 1 ? '' : 's'}; skipped line${skipped.length === 1 ? '' : 's'} ${skipped.join(', ')}.`
    : `Parsed ${parsed.length} timer${parsed.length === 1 ? '' : 's'}. Verify rows below.`;
  setBulkPasteStatus(msg, skipped.length ? 'warning' : 'ok');
  toast(`Parsed ${parsed.length} timer${parsed.length === 1 ? '' : 's'}`, 'success');

  const firstName = document.querySelector('#bulk-rows .bulk-name');
  if (firstName) firstName.focus();
}

function addBulkTimerRow(values={}) {
  const rows = document.getElementById('bulk-rows');
  const defaultType = document.getElementById('bulk-default-type')?.value || '';
  const selectedType = values.upgradeType ?? defaultType;
  const row = document.createElement('div');
  row.className = 'bulk-timer-row';
  row.innerHTML = `
    <select class="bulk-type" title="Upgrade type">${upgradeTypeOptionsHtml(selectedType)}</select>
    <input type="text" class="bulk-name" placeholder="Upgrade name…" value="${esc(values.name || '')}">
    <input type="number" class="bulk-days" min="0" max="999" value="${Number(values.days) || 0}" placeholder="0" title="Days">
    <input type="number" class="bulk-hours" min="0" max="23" value="${Number(values.hours) || 0}" placeholder="0" title="Hours">
    <input type="number" class="bulk-mins" min="0" max="59" value="${values.minutes ?? 0}" placeholder="0" title="Minutes">
    <input type="number" class="bulk-secs" min="0" max="59" value="${values.seconds ?? 0}" placeholder="0" title="Seconds">
    <input type="text" class="bulk-note" placeholder="Optional note…" value="${esc(values.note || '')}">
    <button class="btn btn-sm btn-icon btn-danger bulk-remove-btn" onclick="removeBulkTimerRow(this)" title="Remove row">✕</button>
  `;
  rows.appendChild(row);
}

function removeBulkTimerRow(btn) {
  const rows = document.querySelectorAll('#bulk-rows .bulk-timer-row');
  const row = btn.closest('.bulk-timer-row');
  if (!row) return;

  // Keep at least one row available so the modal never becomes empty.
  if (rows.length <= 1) {
    row.querySelector('.bulk-type').value = document.getElementById('bulk-default-type')?.value || '';
    row.querySelector('.bulk-name').value = '';
    row.querySelector('.bulk-days').value = '0';
    row.querySelector('.bulk-hours').value = '0';
    row.querySelector('.bulk-mins').value = '0';
    row.querySelector('.bulk-secs').value = '0';
    row.querySelector('.bulk-note').value = '';
    row.querySelector('.bulk-name').focus();
    return;
  }

  row.remove();
}

function setBulkPasteStatus(message='', state='') {
  const el = document.getElementById('bulk-paste-status');
  if (!el) return;
  el.textContent = message;
  el.className = `bulk-paste-status ${state}`.trim();
}
