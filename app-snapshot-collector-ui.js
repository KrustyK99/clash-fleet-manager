// Snapshot Collector UI and staging helpers.
// Loaded as a classic browser script; functions remain global for inline handlers.

// ── Snapshot Collector ─────────────────────────────────────────────────────
function openBatchSnapshotModal() {
  batchSnapshotRows = [];
  document.getElementById('batch-snapshot-start').checked = true;
  document.getElementById('batch-snapshot-sound').checked = true;
  document.getElementById('batch-snapshot-include-helper').checked = false;
  document.getElementById('batch-snapshot-replace-existing').checked = true;
  document.getElementById('batch-snapshot-preserve-manual-notes').checked = true;
  syncBatchSnapshotReplaceOptions();
  document.getElementById('batch-snapshot-modal').style.display = 'flex';
  setupBatchSnapshotFloatingImportButton();

  if (!restoreBatchSnapshotCollectorDraft()) {
    clearBatchSnapshotParser(false, false);
  }

  updateBatchSnapshotFloatingImportButton();

  setTimeout(() => {
    const pasteText = document.getElementById('batch-snapshot-json-text');
    if (pasteText) pasteText.focus();
    updateBatchSnapshotFloatingImportButton();
  }, 50);
}

function closeBatchSnapshotModal() {
  document.getElementById('batch-snapshot-modal').style.display = 'none';
  updateBatchSnapshotFloatingImportButton(0);
}

let batchSnapshotFloatingImportListenersBound = false;
let batchSnapshotFloatingImportLastActivation = 0;

function updateBatchSnapshotKeyboardOffset(modalOpen=null) {
  const modal = document.getElementById('batch-snapshot-modal');
  const isOpen = modalOpen === null
    ? !!modal && window.getComputedStyle(modal).display !== 'none'
    : !!modalOpen;

  if (!isOpen || !window.visualViewport) {
    document.documentElement.style.setProperty('--batch-snapshot-keyboard-offset', '0px');
    return 0;
  }

  const viewport = window.visualViewport;
  const keyboardOffset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  const roundedOffset = Math.round(keyboardOffset);
  document.documentElement.style.setProperty('--batch-snapshot-keyboard-offset', `${roundedOffset}px`);
  return roundedOffset;
}

function getBatchSnapshotVisibleViewportBounds() {
  if (!window.visualViewport) {
    return { top: 0, bottom: window.innerHeight };
  }

  return {
    top: window.visualViewport.offsetTop,
    bottom: window.visualViewport.offsetTop + window.visualViewport.height
  };
}

function isBatchSnapshotPrimaryImportVisible() {
  const modal = document.getElementById('batch-snapshot-modal');
  const primaryBtn = document.getElementById('batch-snapshot-primary-import');
  if (!modal || !primaryBtn || window.getComputedStyle(modal).display === 'none') return false;

  const rect = primaryBtn.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const viewport = getBatchSnapshotVisibleViewportBounds();
  const modalPanel = modal.querySelector('.modal');
  const panelRect = modalPanel ? modalPanel.getBoundingClientRect() : null;
  const visibleTop = panelRect ? Math.max(viewport.top, panelRect.top) : viewport.top;
  const visibleBottom = panelRect ? Math.min(viewport.bottom, panelRect.bottom) : viewport.bottom;
  const margin = 8;

  return rect.top >= visibleTop + margin && rect.bottom <= visibleBottom - margin;
}

function activateBatchSnapshotFloatingImportButton(evt=null) {
  const btn = document.getElementById('batch-snapshot-floating-import');
  if (!btn || btn.disabled) return;

  if (evt) {
    evt.preventDefault();
    evt.stopPropagation();
  }

  const now = Date.now();
  if (now - batchSnapshotFloatingImportLastActivation < 700) return;
  batchSnapshotFloatingImportLastActivation = now;

  saveBatchSnapshotTimers();
}

function handleBatchSnapshotFloatingImportPointerDown(evt) {
  // On mobile, the first tap on a fixed button above the soft keyboard can be
  // consumed by focus/viewport changes before a normal click is dispatched.
  // Fire on touch/pen pointer-down, while leaving mouse activation to click.
  if (evt.pointerType && evt.pointerType !== 'mouse') {
    activateBatchSnapshotFloatingImportButton(evt);
  }
}

function handleBatchSnapshotFloatingImportClick(evt) {
  activateBatchSnapshotFloatingImportButton(evt);
}

function setupBatchSnapshotFloatingImportButton() {
  if (batchSnapshotFloatingImportListenersBound) return;
  batchSnapshotFloatingImportListenersBound = true;

  const refresh = () => updateBatchSnapshotFloatingImportButton();
  const modal = document.getElementById('batch-snapshot-modal');
  const modalPanel = modal ? modal.querySelector('.modal') : null;
  const pasteText = document.getElementById('batch-snapshot-json-text');

  if (modalPanel) modalPanel.addEventListener('scroll', refresh, { passive: true });
  if (pasteText) {
    pasteText.addEventListener('focus', refresh);
    pasteText.addEventListener('blur', refresh);
  }

  const floatingImportBtn = document.getElementById('batch-snapshot-floating-import');
  if (floatingImportBtn) {
    floatingImportBtn.addEventListener('click', handleBatchSnapshotFloatingImportClick);
    if (window.PointerEvent) {
      floatingImportBtn.addEventListener('pointerdown', handleBatchSnapshotFloatingImportPointerDown);
    } else {
      floatingImportBtn.addEventListener('touchstart', activateBatchSnapshotFloatingImportButton, { passive:false });
    }
  }

  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', refresh);
    window.visualViewport.addEventListener('scroll', refresh);
  }
}

function updateBatchSnapshotFloatingImportButton(importableCount=null) {
  const btn = document.getElementById('batch-snapshot-floating-import');
  const modal = document.getElementById('batch-snapshot-modal');
  if (!btn || !modal) return;

  const modalOpen = window.getComputedStyle(modal).display !== 'none';
  updateBatchSnapshotKeyboardOffset(modalOpen);

  const stagedCount = batchSnapshotRows.length;
  const resolvedImportableCount = importableCount === null || importableCount === undefined
    ? getImportableBatchSnapshotRows(false).length
    : Number(importableCount);
  const count = Number.isFinite(resolvedImportableCount)
    ? resolvedImportableCount
    : getImportableBatchSnapshotRows(false).length;
  const primaryImportVisible = isBatchSnapshotPrimaryImportVisible();

  btn.classList.toggle('visible', modalOpen && stagedCount > 0 && count > 0 && !primaryImportVisible);
  btn.disabled = count === 0;
  btn.textContent = count > 0
    ? `Import ${count} Account${count === 1 ? '' : 's'}`
    : 'Import Selected';
  btn.title = count > 0
    ? `Import ${count} selected staged account snapshot${count === 1 ? '' : 's'}`
    : 'Select at least one valid staged snapshot to import';
}

function getBatchSnapshotCollectorOptionsState() {
  return {
    start: !!document.getElementById('batch-snapshot-start')?.checked,
    sound: !!document.getElementById('batch-snapshot-sound')?.checked,
    includeHelper: !!document.getElementById('batch-snapshot-include-helper')?.checked,
    replaceExisting: !!document.getElementById('batch-snapshot-replace-existing')?.checked,
    preserveManualNotes: !!document.getElementById('batch-snapshot-preserve-manual-notes')?.checked
  };
}

function applyBatchSnapshotCollectorOptionsState(options={}) {
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (el && typeof value === 'boolean') el.checked = value;
  };

  setChecked('batch-snapshot-start', options.start);
  setChecked('batch-snapshot-sound', options.sound);
  setChecked('batch-snapshot-include-helper', options.includeHelper);
  setChecked('batch-snapshot-replace-existing', options.replaceExisting);
  setChecked('batch-snapshot-preserve-manual-notes', options.preserveManualNotes);
  syncBatchSnapshotReplaceOptions();
}

function serializeBatchSnapshotRowsForStorage(rows=batchSnapshotRows) {
  return rows
    .filter(row => row && row.snapshot && typeof row.snapshot === 'object')
    .map(row => ({
      snapshot: row.snapshot,
      capturedAtMs: normalizeSnapshotCaptureMs(row.capturedAtMs, Date.now()),
      capturedAt: row.capturedAt || new Date(normalizeSnapshotCaptureMs(row.capturedAtMs, Date.now())).toISOString(),
      providedAccount: row.providedAccount || '',
      account: row.account || '',
      include: !!row.include
    }));
}

function saveBatchSnapshotCollectorDraft() {
  if (!batchSnapshotRows.length) {
    clearBatchSnapshotCollectorDraft();
    return true;
  }

  const draftRows = serializeBatchSnapshotRowsForStorage(batchSnapshotRows);
  if (!draftRows.length) {
    clearBatchSnapshotCollectorDraft();
    return true;
  }

  try {
    localStorage.setItem(SNAPSHOT_COLLECTOR_DRAFT_KEY, JSON.stringify({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      options: getBatchSnapshotCollectorOptionsState(),
      rows: draftRows
    }));
    batchSnapshotDraftWarningShown = false;
    return true;
  } catch (err) {
    console.error(err);
    if (!batchSnapshotDraftWarningShown) {
      batchSnapshotDraftWarningShown = true;
      setBatchSnapshotStatus('Could not save collector recovery draft in this browser. Local storage may be full.', 'warning');
      toast('Snapshot Collector draft could not be saved locally.', 'warning');
    }
    return false;
  }
}

function clearBatchSnapshotCollectorDraft() {
  try {
    localStorage.removeItem(SNAPSHOT_COLLECTOR_DRAFT_KEY);
  } catch (err) {
    console.error(err);
  }
}

function restoreBatchSnapshotCollectorDraft() {
  let raw = null;
  try {
    raw = localStorage.getItem(SNAPSHOT_COLLECTOR_DRAFT_KEY);
  } catch (err) {
    console.error(err);
    return false;
  }

  if (!raw) return false;

  try {
    const draft = JSON.parse(raw);
    const rows = Array.isArray(draft.rows) ? draft.rows : [];
    if (!rows.length) {
      clearBatchSnapshotCollectorDraft();
      return false;
    }

    applyBatchSnapshotCollectorOptionsState(draft.options || {});
    const includeHelper = !!document.getElementById('batch-snapshot-include-helper')?.checked;
    batchSnapshotRows = rows.map((row, index) => {
      const preferredAccount = normalizeAccountNameValue(row.account || row.providedAccount || '');
      const entry = {
        index,
        snapshot: row.snapshot,
        providedAccount: preferredAccount,
        capturedAtMs: normalizeSnapshotCaptureMs(row.capturedAtMs || row.capturedAt, Date.now()),
        error: ''
      };
      const restored = buildBatchSnapshotRow(entry, index, includeHelper);
      if (preferredAccount) {
        restored.account = preferredAccount;
        const mapped = restored.tag ? normalizeAccountNameValue(accountTagMap[restored.tag]) : '';
        restored.resolvedBy = mapped === preferredAccount ? 'tag-map' : 'recovered';
        restored.warning = mapped && mapped !== preferredAccount
          ? `Recovered account ${preferredAccount}, but tag map currently resolves to ${mapped}.`
          : (restored.tag && !mapped ? 'Recovered manual mapping; tag mapping will be learned on import.' : restored.warning);
      }
      restored.include = row.include !== false && !restored.error && !!restored.account;
      return restored;
    });

    renderBatchSnapshotRows();
    const savedAt = draft.savedAt ? new Date(draft.savedAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
    setBatchSnapshotStatus(`Recovered ${batchSnapshotRows.length} staged snapshot${batchSnapshotRows.length === 1 ? '' : 's'} from this browser${savedAt ? ` (${savedAt})` : ''}.`, 'warning');
    return true;
  } catch (err) {
    console.error(err);
    clearBatchSnapshotCollectorDraft();
    setBatchSnapshotStatus('Discarded an unreadable Snapshot Collector recovery draft.', 'warning');
    return false;
  }
}

function clearBatchSnapshotPaste(showStatus=true) {
  const textEl = document.getElementById('batch-snapshot-json-text');
  if (textEl) {
    textEl.value = '';
    textEl.focus();
  }
  if (showStatus) setBatchSnapshotStatus('Paste box cleared. Staged snapshots were kept.', 'ok');
}

function clearBatchSnapshotParser(showStatus=true, clearDraft=true) {
  const textEl = document.getElementById('batch-snapshot-json-text');
  if (textEl) textEl.value = '';
  batchSnapshotRows = [];
  if (clearDraft) clearBatchSnapshotCollectorDraft();
  renderBatchSnapshotRows();
  setBatchSnapshotStatus(showStatus ? 'Staged snapshots cleared.' : '', showStatus ? 'ok' : '');
}

function normalizeSnapshotCaptureMs(value, fallback=Date.now()) {
  if (Number.isFinite(Number(value))) {
    const n = Number(value);
    // Treat small numeric values as Unix seconds, large values as JavaScript ms.
    return n < 100000000000 ? n * 1000 : n;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }

  return Number.isFinite(Number(fallback)) ? Number(fallback) : Date.now();
}

function batchSnapshotCapturedLabel(capturedAtMs, now=Date.now()) {
  const captureMs = normalizeSnapshotCaptureMs(capturedAtMs, now);
  const capturedTime = new Date(captureMs).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const ageMs = Math.max(0, now - captureMs);
  return {
    time: capturedTime,
    age: `${snapshotCompactAgeLabel(ageMs)} old`,
    title: `Captured ${new Date(captureMs).toLocaleString()} (${snapshotFreshnessAgeLabel(ageMs)})`
  };
}

async function readBatchSnapshotClipboard() {
  const textEl = document.getElementById('batch-snapshot-json-text');

  if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
    setBatchSnapshotStatus('Clipboard read is not available here. Paste manually, then click Add Snapshot.', 'warning');
    if (textEl) textEl.focus();
    return;
  }

  try {
    const text = await navigator.clipboard.readText();
    if (!String(text || '').trim()) {
      setBatchSnapshotStatus('Clipboard is empty.', 'warning');
      return;
    }
    textEl.value = text;
    addSnapshotCollectorPaste();
  } catch (err) {
    setBatchSnapshotStatus('Clipboard read was blocked. Paste manually, then click Add Snapshot.', 'warning');
    if (textEl) textEl.focus();
  }
}

function loadBatchSnapshotJsonFile(evt) {
  const file = evt.target.files && evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('batch-snapshot-json-text').value = String(e.target.result || '');
    parseBatchSnapshotJsonText({ append:false, clearAfter:true, sourceLabel:'Loaded file' });
  };
  reader.onerror = () => setBatchSnapshotStatus('Could not read snapshot JSON file.', 'error');
  reader.readAsText(file);
  evt.target.value = '';
}

function syncBatchSnapshotReplaceOptions() {
  const replaceEl = document.getElementById('batch-snapshot-replace-existing');
  const preserveEl = document.getElementById('batch-snapshot-preserve-manual-notes');
  const preserveWrap = document.getElementById('batch-snapshot-preserve-manual-notes-wrap');
  if (!replaceEl || !preserveEl) return;

  preserveEl.disabled = !replaceEl.checked;
  if (preserveWrap) preserveWrap.classList.toggle('active', replaceEl.checked);
}

function extractBatchSnapshotEntries(parsed, fallbackCapturedAtMs=Date.now()) {
  let source;

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.snapshots)) {
    source = parsed.snapshots;
  } else if (Array.isArray(parsed)) {
    source = parsed;
  } else if (parsed && typeof parsed === 'object') {
    source = [parsed];
  } else {
    throw new Error('Snapshot data must be a JSON object, array, or object with a snapshots array.');
  }

  return source.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { index, snapshot: null, providedAccount: '', capturedAtMs: fallbackCapturedAtMs, error: 'Row is not a JSON object.' };
    }

    const capturedAtMs = normalizeSnapshotCaptureMs(
      item.capturedAt ?? item.captured_at ?? item.snapshotCapturedAt ?? item.snapshot_captured_at,
      fallbackCapturedAtMs
    );

    if (item.snapshot && typeof item.snapshot === 'object' && !Array.isArray(item.snapshot)) {
      return {
        index,
        snapshot: item.snapshot,
        providedAccount: normalizeAccountNameValue(item.account || item.accountName || item.account_name || ''),
        capturedAtMs,
        error: ''
      };
    }

    // Also allow a bare raw game export object. This is the main Snapshot Collector workflow.
    return {
      index,
      snapshot: item,
      providedAccount: normalizeAccountNameValue(item.account || item.accountName || item.account_name || ''),
      capturedAtMs,
      error: ''
    };
  });
}

function resolveBatchSnapshotAccount(tag, providedAccount='') {
  const normalizedTag = normalizePlayerTag(tag);
  const provided = normalizeAccountNameValue(providedAccount);
  const mapped = normalizedTag ? normalizeAccountNameValue(accountTagMap[normalizedTag]) : '';

  if (mapped) {
    return {
      account: mapped,
      source: 'tag-map',
      warning: provided && provided !== mapped ? `File says ${provided}, but tag map resolves to ${mapped}.` : ''
    };
  }

  if (provided) {
    return { account: provided, source: 'file-account', warning: normalizedTag ? 'New tag mapping will be learned from this labelled row.' : 'No player tag found; using file account only.' };
  }

  return { account: '', source: 'unmapped', warning: normalizedTag ? 'Choose an account to map this player tag.' : 'No player tag found; choose an account manually.' };
}

function buildBatchSnapshotRow(entry, index, includeHelper) {
  const snapshot = entry.snapshot;
  const tag = getSnapshotPlayerTag(snapshot);
  const gameName = getSnapshotPlayerName(snapshot);
  const resolved = entry.error ? { account:'', source:'error', warning:entry.error } : resolveBatchSnapshotAccount(tag, entry.providedAccount);
  const candidates = snapshot && !entry.error ? parseAccountSnapshot(snapshot, { includeHelper }) : [];
  const builderCapacity = snapshot && !entry.error ? deriveBuilderCapacityFromSnapshot(snapshot) : null;
  const capturedAtMs = normalizeSnapshotCaptureMs(entry.capturedAtMs, Date.now());

  return {
    id: `collector-${capturedAtMs.toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    index,
    snapshot,
    capturedAtMs,
    capturedAt: new Date(capturedAtMs).toISOString(),
    tag,
    gameName,
    providedAccount: entry.providedAccount,
    account: resolved.account,
    resolvedBy: resolved.source,
    warning: resolved.warning,
    error: entry.error || (!snapshot ? 'Missing snapshot object.' : ''),
    candidates,
    builderCapacity,
    include: !entry.error && !!snapshot && !!resolved.account
  };
}

function addSnapshotCollectorPaste() {
  parseBatchSnapshotJsonText({ append:true, clearAfter:true, sourceLabel:'Added' });
}

function parseBatchSnapshotJsonText({ append=true, clearAfter=false, sourceLabel='Parsed' }={}) {
  const source = document.getElementById('batch-snapshot-json-text');
  const raw = source.value.trim();
  if (!raw) {
    setBatchSnapshotStatus('Paste one game snapshot first.', 'warning');
    source.focus();
    return;
  }

  const capturedAtMs = Date.now();

  try {
    const parsed = JSON.parse(raw);
    const entries = extractBatchSnapshotEntries(parsed, capturedAtMs);
    const includeHelper = !!document.getElementById('batch-snapshot-include-helper')?.checked;
    const newRows = entries.map((entry, index) => buildBatchSnapshotRow(entry, batchSnapshotRows.length + index, includeHelper));

    batchSnapshotRows = append ? [...batchSnapshotRows, ...newRows] : newRows;
    saveBatchSnapshotCollectorDraft();
    renderBatchSnapshotRows();

    const validCount = getImportableBatchSnapshotRows().length;
    const warningCount = batchSnapshotRows.filter(row => row.warning || row.error || !row.account).length;
    setBatchSnapshotStatus(`${sourceLabel} ${newRows.length} snapshot${newRows.length === 1 ? '' : 's'}; ${batchSnapshotRows.length} staged; ${validCount} ready to import${warningCount ? `; ${warningCount} need attention` : ''}.`, validCount ? 'ok' : 'warning');

    if (clearAfter) clearBatchSnapshotPaste(false);
  } catch (err) {
    setBatchSnapshotStatus(`Invalid snapshot JSON: ${err.message}`, 'error');
    toast('Snapshot JSON is invalid.', 'warning');
  }
}

function batchSnapshotAccountOptionsHtml(selected='') {
  const accounts = getKnownAccounts();
  const current = normalizeAccountNameValue(selected);
  const options = [`<option value="">— Choose account —</option>`];

  accounts.forEach(account => {
    options.push(`<option value="${esc(account)}"${account === current ? ' selected' : ''}>${esc(account)}</option>`);
  });

  if (current && !accounts.includes(current)) {
    options.push(`<option value="${esc(current)}" selected>${esc(current)} (custom)</option>`);
  }

  return options.join('');
}

function refreshBatchSnapshotRowValidation() {
  const selectedRows = batchSnapshotRows.filter(row => row.include && !row.error && row.account);
  const accountCounts = new Map();
  const tagCounts = new Map();

  selectedRows.forEach(row => {
    accountCounts.set(row.account, (accountCounts.get(row.account) || 0) + 1);
    if (row.tag) tagCounts.set(row.tag, (tagCounts.get(row.tag) || 0) + 1);
  });

  batchSnapshotRows.forEach(row => {
    row.validationMessages = [];
    if (row.error) row.validationMessages.push(row.error);
    if (!Number.isFinite(Number(row.capturedAtMs))) row.validationMessages.push('Invalid captured timestamp.');
    if (!row.error && !row.tag) row.validationMessages.push('No player tag found; mapping cannot be learned automatically.');
    if (!row.error && !row.account) row.validationMessages.push('Choose an app account.');
    if (!row.error && row.include && row.account && accountCounts.get(row.account) > 1) row.validationMessages.push('Duplicate selected app account in this collection.');
    if (!row.error && row.include && row.tag && tagCounts.get(row.tag) > 1) row.validationMessages.push('Duplicate selected player tag in this collection.');
    if (!row.error && !row.candidates.length) row.validationMessages.push('No active timers found. Import will record zero timers; with replacement enabled, stale snapshot timers will be removed while manual timers are preserved.');
    if (!row.error && row.warning) row.validationMessages.push(row.warning);
  });
}

function renderBatchSnapshotRows() {
  const rowsEl = document.getElementById('batch-snapshot-rows');
  const summaryEl = document.getElementById('batch-snapshot-summary');
  if (!rowsEl || !summaryEl) return;

  if (!batchSnapshotRows.length) {
    rowsEl.innerHTML = '<div class="batch-snapshot-empty">Paste a snapshot and click Add Snapshot to stage account imports.</div>';
    summaryEl.innerHTML = '';
    updateBatchSnapshotFloatingImportButton(0);
    return;
  }

  refreshBatchSnapshotRowValidation();
  const renderNow = Date.now();
  const importable = getImportableBatchSnapshotRows(false);
  const mappedCount = batchSnapshotRows.filter(row => row.resolvedBy === 'tag-map').length;
  const labelledCount = batchSnapshotRows.filter(row => row.resolvedBy === 'file-account').length;
  const candidateCount = batchSnapshotRows.reduce((total, row) => total + row.candidates.length, 0);
  const oldestCapturedAt = Math.min(...batchSnapshotRows.map(row => normalizeSnapshotCaptureMs(row.capturedAtMs, renderNow)));
  const oldestAge = Number.isFinite(oldestCapturedAt) ? snapshotCompactAgeLabel(Math.max(0, renderNow - oldestCapturedAt)) : 'now';
  summaryEl.innerHTML = [
    `<span class="snapshot-pill">${batchSnapshotRows.length} staged snapshot${batchSnapshotRows.length === 1 ? '' : 's'}</span>`,
    `<span class="snapshot-pill">${importable.length} selected/importable</span>`,
    `<span class="snapshot-pill">${candidateCount} timer candidate${candidateCount === 1 ? '' : 's'}</span>`,
    `<span class="snapshot-pill">oldest ${oldestAge} old</span>`,
    `<span class="snapshot-pill">${mappedCount} matched by tag</span>`,
    `<span class="snapshot-pill">${labelledCount} labelled fallback</span>`
  ].join('');
  updateBatchSnapshotFloatingImportButton(importable.length);

  rowsEl.innerHTML = batchSnapshotRows.map((row, index) => {
    const hasBlocking = row.error || !row.account;
    const hasWarnings = row.validationMessages && row.validationMessages.length;
    const rowClass = hasBlocking ? 'error' : (hasWarnings ? 'warning' : '');
    const messageClass = hasBlocking ? 'error' : (hasWarnings ? 'warning' : '');
    const messages = hasWarnings ? row.validationMessages.join(' ') : (row.resolvedBy === 'tag-map' ? 'Ready — matched by player tag.' : 'Ready — labelled/manual row will teach this tag mapping.');
    const capacityText = row.builderCapacity ? snapshotBuilderCapacityStatusText(row.snapshot).replace(/^\s*Detected capacity:\s*/i, '').replace(/\.$/, '') : '';
    const countTitle = capacityText ? `${row.candidates.length} candidates · ${capacityText}` : `${row.candidates.length} candidates`;
    const captured = batchSnapshotCapturedLabel(row.capturedAtMs, renderNow);

    return `
      <div class="batch-snapshot-row ${rowClass}">
        <label class="batch-snapshot-use"><input type="checkbox" class="batch-snapshot-include" data-index="${index}" ${row.include ? 'checked' : ''} ${hasBlocking ? 'disabled' : ''}> Use</label>
        <span class="batch-snapshot-captured" title="${esc(captured.title)}">${esc(captured.time)}<span class="batch-snapshot-captured-age">${esc(captured.age)}</span></span>
        <span class="batch-snapshot-tag" title="${esc(row.tag || 'No tag')}">${esc(row.tag || 'No tag')}</span>
        <span class="batch-snapshot-game-name" title="${esc(row.gameName || 'Unknown')}">${esc(row.gameName || 'Unknown')}</span>
        <select class="batch-snapshot-account" data-index="${index}" title="App account">${batchSnapshotAccountOptionsHtml(row.account)}</select>
        <span class="batch-snapshot-count" title="${esc(countTitle)}">${row.candidates.length}</span>
        <span class="batch-snapshot-message ${messageClass}">${esc(messages)}</span>
      </div>
    `;
  }).join('');

  rowsEl.querySelectorAll('input,select').forEach(el => {
    el.addEventListener('input', syncBatchSnapshotRowFromControl);
    el.addEventListener('change', syncBatchSnapshotRowFromControl);
  });
}

function syncBatchSnapshotRowFromControl(evt) {
  const el = evt.target;
  const index = Number(el.dataset.index);
  if (!Number.isInteger(index) || !batchSnapshotRows[index]) return;
  const row = batchSnapshotRows[index];

  if (el.classList.contains('batch-snapshot-include')) {
    row.include = el.checked;
  } else if (el.classList.contains('batch-snapshot-account')) {
    row.account = normalizeAccountNameValue(el.value);
    row.include = !!row.account && !row.error;
    const mapped = row.tag ? normalizeAccountNameValue(accountTagMap[row.tag]) : '';
    if (!row.account) {
      row.resolvedBy = 'unmapped';
      row.warning = row.tag ? 'Choose an account to map this player tag.' : 'No player tag found; choose an account manually.';
    } else if (mapped && mapped === row.account) {
      row.resolvedBy = 'tag-map';
      row.warning = '';
    } else {
      row.resolvedBy = 'manual';
      row.warning = row.tag ? 'New tag mapping will be learned from this manual selection.' : 'No player tag found; using manual account only.';
    }
  }

  saveBatchSnapshotCollectorDraft();
  renderBatchSnapshotRows();
}

function getImportableBatchSnapshotRows(readControls=true) {
  if (readControls) {
    document.querySelectorAll('.batch-snapshot-include').forEach(el => {
      const index = Number(el.dataset.index);
      if (batchSnapshotRows[index]) batchSnapshotRows[index].include = el.checked;
    });
    document.querySelectorAll('.batch-snapshot-account').forEach(el => {
      const index = Number(el.dataset.index);
      if (batchSnapshotRows[index]) batchSnapshotRows[index].account = normalizeAccountNameValue(el.value);
    });
  }

  refreshBatchSnapshotRowValidation();
  return batchSnapshotRows.filter(row => row.include && !row.error && row.account && !(row.validationMessages || []).some(msg => /Duplicate selected|Invalid captured/i.test(msg)));
}

function selectBatchSnapshotRows(checked) {
  batchSnapshotRows.forEach(row => {
    row.include = !!checked && !row.error && !!row.account;
  });
  saveBatchSnapshotCollectorDraft();
  renderBatchSnapshotRows();
}


// Re-parse staged rows if helper cooldown inclusion changes after snapshots are already collected.
document.getElementById('batch-snapshot-include-helper').addEventListener('change', () => {
  if (!batchSnapshotRows.length) return;
  const includeHelper = !!document.getElementById('batch-snapshot-include-helper')?.checked;
  batchSnapshotRows.forEach(row => {
    if (!row.snapshot || row.error) return;
    row.candidates = parseAccountSnapshot(row.snapshot, { includeHelper });
    row.include = !!row.account && !row.error;
  });
  saveBatchSnapshotCollectorDraft();
  renderBatchSnapshotRows();
});

