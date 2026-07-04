// Account Snapshot import/review UI helpers.
// Loaded as a classic browser script; functions remain global for inline handlers.

function openSnapshotModal() {
  populateAccountControls(true);
  const accountEl = document.getElementById('snapshot-account');
  const quickAccount = document.getElementById('q-account');
  if (accountEl) accountEl.value = getPreferredAccountForCurrentView(filterGroup !== 'All' ? filterGroup : '', quickAccount ? quickAccount.value : '');

  document.getElementById('snapshot-start').checked = true;
  document.getElementById('snapshot-sound').checked = true;
  document.getElementById('snapshot-include-helper').checked = false;
  document.getElementById('snapshot-replace-existing').checked = false;
  document.getElementById('snapshot-preserve-manual-notes').checked = true;
  syncSnapshotReplaceOptions();
  clearSnapshotParser(false);
  document.getElementById('snapshot-modal').style.display = 'flex';

  setTimeout(() => {
    const pasteText = document.getElementById('snapshot-json-text');
    if (pasteText) pasteText.focus();
  }, 50);
}

function closeSnapshotModal() {
  document.getElementById('snapshot-modal').style.display = 'none';
}

function clearSnapshotParser(showStatus=true) {
  const textEl = document.getElementById('snapshot-json-text');
  if (textEl) textEl.value = '';
  snapshotLastSnapshot = null;
  snapshotCandidates = [];
  renderSnapshotCandidates();
  setSnapshotStatus(showStatus ? 'Snapshot cleared.' : '', showStatus ? 'ok' : '');
}

function loadSnapshotJsonFile(evt) {
  const file = evt.target.files && evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('snapshot-json-text').value = String(e.target.result || '');
    parseSnapshotJsonText();
  };
  reader.onerror = () => setSnapshotStatus('Could not read JSON file.', 'error');
  reader.readAsText(file);
  evt.target.value = '';
}

function snapshotSecondsToText(seconds) {
  seconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function snapshotTypeOptionsHtml(selected='') {
  const types = UPGRADE_TYPES.filter(Boolean);
  if (selected && !types.includes(selected)) types.push(selected);
  return types.map(type => `<option value="${esc(type)}"${type === selected ? ' selected' : ''}>${esc(type)}</option>`).join('');
}

function renderSnapshotCandidates() {
  const rows = document.getElementById('snapshot-candidate-rows');
  const summary = document.getElementById('snapshot-summary');
  if (!rows || !summary) return;

  if (!snapshotCandidates.length) {
    rows.innerHTML = '<div class="snapshot-empty">Paste and parse a snapshot to see timer candidates.</div>';
    summary.innerHTML = '';
    return;
  }

  rows.innerHTML = snapshotCandidates.map((c, index) => `
    <div class="snapshot-candidate-row">
      <label class="snapshot-use"><input type="checkbox" class="snapshot-include" data-index="${index}" ${c.include ? 'checked' : ''}> Use</label>
      <select class="snapshot-type" data-index="${index}" title="Upgrade type">${snapshotTypeOptionsHtml(c.upgradeType)}</select>
      <input type="text" class="snapshot-name" data-index="${index}" value="${esc(c.name)}" placeholder="Upgrade name…">
      <input type="number" class="snapshot-seconds" data-index="${index}" min="1" value="${Number(c.seconds) || 1}" title="Seconds">
      <span class="snapshot-time">${esc(snapshotSecondsToText(c.seconds))}</span>
      <span class="snapshot-source" title="${esc(c.path)}.${esc(c.timerKey)}">${esc(snapshotBucketLabel(c.bucket))}${c.dataId == null ? '' : ' · data ' + esc(c.dataId)}${Number.isFinite(c.level) ? ' · L' + esc(c.level) : ''}</span>
    </div>
  `).join('');

  rows.querySelectorAll('input,select').forEach(el => {
    el.addEventListener('input', syncSnapshotCandidateFromControl);
    el.addEventListener('change', syncSnapshotCandidateFromControl);
  });

  const byType = {};
  snapshotCandidates.forEach(c => byType[c.upgradeType || 'Capital / Other'] = (byType[c.upgradeType || 'Capital / Other'] || 0) + 1);
  const tag = getSnapshotPlayerTag(snapshotLastSnapshot) || 'No account tag';
  summary.innerHTML = [
    `<span class="snapshot-pill">${esc(tag)}</span>`,
    `<span class="snapshot-pill">${snapshotCandidates.length} candidate${snapshotCandidates.length === 1 ? '' : 's'}</span>`,
    ...Object.entries(byType).map(([type, count]) => `<span class="snapshot-pill">${esc(type)}: ${count}</span>`)
  ].join('');
}

function syncSnapshotCandidateFromControl(evt) {
  const el = evt.target;
  const index = Number(el.dataset.index);
  if (!Number.isInteger(index) || !snapshotCandidates[index]) return;
  const c = snapshotCandidates[index];

  if (el.classList.contains('snapshot-include')) {
    c.include = el.checked;
  } else if (el.classList.contains('snapshot-name')) {
    c.name = el.value.trim();
  } else if (el.classList.contains('snapshot-type')) {
    c.upgradeType = el.value;
  } else if (el.classList.contains('snapshot-seconds')) {
    c.seconds = Math.max(1, Math.floor(Number(el.value) || 0));
    const row = el.closest('.snapshot-candidate-row');
    const timeEl = row ? row.querySelector('.snapshot-time') : null;
    if (timeEl) timeEl.textContent = snapshotSecondsToText(c.seconds);
  }
}

function selectedSnapshotCandidatesFromControls() {
  document.querySelectorAll('.snapshot-include').forEach(el => {
    const index = Number(el.dataset.index);
    if (snapshotCandidates[index]) snapshotCandidates[index].include = el.checked;
  });
  document.querySelectorAll('.snapshot-name').forEach(el => {
    const index = Number(el.dataset.index);
    if (snapshotCandidates[index]) snapshotCandidates[index].name = el.value.trim();
  });
  document.querySelectorAll('.snapshot-type').forEach(el => {
    const index = Number(el.dataset.index);
    if (snapshotCandidates[index]) snapshotCandidates[index].upgradeType = el.value;
  });
  document.querySelectorAll('.snapshot-seconds').forEach(el => {
    const index = Number(el.dataset.index);
    if (snapshotCandidates[index]) snapshotCandidates[index].seconds = Math.max(1, Math.floor(Number(el.value) || 0));
  });

  return snapshotCandidates.filter(c => c.include && c.name && c.seconds > 0);
}

function syncSnapshotReplaceOptions() {
  const replaceEl = document.getElementById('snapshot-replace-existing');
  const preserveEl = document.getElementById('snapshot-preserve-manual-notes');
  const preserveWrap = document.getElementById('snapshot-preserve-manual-notes-wrap');
  if (!replaceEl || !preserveEl) return;

  preserveEl.disabled = !replaceEl.checked;
  if (preserveWrap) preserveWrap.classList.toggle('active', replaceEl.checked);
}

function selectSnapshotCandidates(checked) {
  snapshotCandidates.forEach(c => c.include = checked);
  renderSnapshotCandidates();
}

function getSnapshotImportOptions(prefix='snapshot') {
  return {
    shouldStart: !!document.getElementById(`${prefix}-start`)?.checked,
    sound: !!document.getElementById(`${prefix}-sound`)?.checked,
    includeHelper: !!document.getElementById(`${prefix}-include-helper`)?.checked,
    replaceExisting: !!document.getElementById(`${prefix}-replace-existing`)?.checked,
    preserveManualNotes: !!document.getElementById(`${prefix}-preserve-manual-notes`)?.checked
  };
}
