// Timer list interaction/action UI helpers extracted from index.html.
// Classic browser script: these functions intentionally read and update existing global app state.

// ── Pinning actions ───────────────────────────────────────────────────────


function toggleTimerPinned(id, event) {
  if (event) event.stopPropagation();

  const t = getTimerById(id);
  if (!t) {
    toast('Timer was not found.', 'warning');
    return;
  }

  t.pinned = !isTimerPinned(t);
  save();
  renderTimers();
  toast(`${t.pinned ? 'Pinned' : 'Unpinned'} "${t.name}"`, 'success');
}

// ── Inline time adjustment ────────────────────────────────────────────────
function toggleTimerAdjustPanel(id) {
  adjustingTimerId = adjustingTimerId === id ? null : id;
  inlineAdjustEditing = false;
  renderQueuedUntilAdjustEditEnds = false;
  renderTimers();
}

function closeTimerAdjustPanel(id) {
  if (adjustingTimerId === id) adjustingTimerId = null;
  inlineAdjustEditing = false;
  renderQueuedUntilAdjustEditEnds = false;
  renderTimers();
}

function enterTimerAdjustEdit() {
  inlineAdjustEditing = true;
}

function leaveTimerAdjustEdit() {
  setTimeout(() => {
    const active = document.activeElement;
    if (!active || !active.closest || !active.closest('.timer-adjust-panel')) {
      inlineAdjustEditing = false;
      if (renderQueuedUntilAdjustEditEnds) {
        renderQueuedUntilAdjustEditEnds = false;
        renderTimers();
      }
    }
  }, 0);
}

function applyTimerRemaining(t, newRemaining, actionLabel='updated') {
  if (!t) return;
  const previousRemaining = Number(t.remaining) || 0;
  const previousDuration = Math.max(Number(t.duration) || 0, previousRemaining);
  const elapsed = Math.max(0, previousDuration - previousRemaining);
  const remaining = clampNonNegativeSeconds(newRemaining);

  t.remaining = remaining;

  // Keep the original duration unless the correction extends the total expected time.
  // This preserves useful progress for builder-potion reductions, while preventing
  // negative progress if the original timer was entered too short.
  const correctedDuration = elapsed + remaining;
  if (correctedDuration > previousDuration) t.duration = correctedDuration;

  if (remaining <= 0) {
    t.remaining = 0;
    t.status = 'expired';
    t.endTime = null;
    t.expiredAt = Date.now();
  } else if (t.status === 'running' || t.status === 'expired') {
    t.status = 'running';
    t.expiredAt = null;
    t.endTime = Date.now() + remaining * 1000;
  } else {
    t.endTime = null;
    t.expiredAt = null;
  }

  save();
  renderTimers();
  toast(`${t.name} time ${actionLabel}: ${fmt(remaining)}`, 'success');
}

function adjustTimerRemainingBy(id, deltaSeconds) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  const current = Number(t.remaining) || 0;
  const next = current + Number(deltaSeconds || 0);
  const label = deltaSeconds < 0 ? `adjusted by -${fmtDuration(Math.abs(deltaSeconds))}` : `adjusted by +${fmtDuration(deltaSeconds)}`;
  applyTimerRemaining(t, next, label);
}

function setTimerRemainingFromPanel(id) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  const d = parseInt(document.getElementById(`adj-days-${id}`)?.value, 10) || 0;
  const h = parseInt(document.getElementById(`adj-hours-${id}`)?.value, 10) || 0;
  const m = parseInt(document.getElementById(`adj-mins-${id}`)?.value, 10) || 0;
  const s = parseInt(document.getElementById(`adj-secs-${id}`)?.value, 10) || 0;
  const remaining = d*86400 + h*3600 + m*60 + s;
  inlineAdjustEditing = false;
  renderQueuedUntilAdjustEditEnds = false;
  applyTimerRemaining(t, remaining, 'set to');
}

function renderTimerAdjustPanel(t) {
  if (!t || adjustingTimerId !== t.id) return '';
  const parts = splitSeconds(t.remaining);
  const id = t.id;
  const idArg = timerIdArg(id);
  const quickAdjustments = [
    [-86400, '-1d'],
    [-21600, '-6h'],
    [-3600, '-1h'],
    [-1800, '-30m'],
    [1800, '+30m'],
    [3600, '+1h'],
    [21600, '+6h'],
    [86400, '+1d']
  ];

  return `
    <div class="timer-adjust-panel" onclick="event.stopPropagation()">
      <div class="timer-adjust-head">
        <span class="timer-adjust-title">Adjust remaining time</span>
        <span class="timer-adjust-current">Now ${esc(fmt(t.remaining))}</span>
      </div>
      <div class="timer-adjust-quick" aria-label="Quick time adjustments">
        ${quickAdjustments.map(([delta, label]) => `<button class="timer-adjust-chip" type="button" onclick="adjustTimerRemainingBy(${idArg}, ${delta})">${label}</button>`).join('')}
      </div>
      <div class="timer-adjust-exact">
        <div class="timer-adjust-field">
          <label for="adj-days-${esc(id)}">days</label>
          <input type="number" id="adj-days-${esc(id)}" value="${parts.d}" min="0" max="999" onfocus="enterTimerAdjustEdit()" onblur="leaveTimerAdjustEdit()" onkeydown="if(event.key==='Enter')setTimerRemainingFromPanel(${idArg})">
        </div>
        <div class="timer-adjust-field">
          <label for="adj-hours-${esc(id)}">hrs</label>
          <input type="number" id="adj-hours-${esc(id)}" value="${parts.h}" min="0" max="23" onfocus="enterTimerAdjustEdit()" onblur="leaveTimerAdjustEdit()" onkeydown="if(event.key==='Enter')setTimerRemainingFromPanel(${idArg})">
        </div>
        <div class="timer-adjust-field">
          <label for="adj-mins-${esc(id)}">min</label>
          <input type="number" id="adj-mins-${esc(id)}" value="${parts.m}" min="0" max="59" onfocus="enterTimerAdjustEdit()" onblur="leaveTimerAdjustEdit()" onkeydown="if(event.key==='Enter')setTimerRemainingFromPanel(${idArg})">
        </div>
        <div class="timer-adjust-field">
          <label for="adj-secs-${esc(id)}">sec</label>
          <input type="number" id="adj-secs-${esc(id)}" value="${parts.s}" min="0" max="59" onfocus="enterTimerAdjustEdit()" onblur="leaveTimerAdjustEdit()" onkeydown="if(event.key==='Enter')setTimerRemainingFromPanel(${idArg})">
        </div>
        <div class="timer-adjust-actions">
          <button class="btn btn-sm btn-primary" type="button" onclick="setTimerRemainingFromPanel(${idArg})">Apply</button>
          <button class="btn btn-sm" type="button" onclick="closeTimerAdjustPanel(${idArg})">Close</button>
        </div>
      </div>
    </div>
  `;
}

// ── Sort ──────────────────────────────────────────────────────────────────
function updateSortControls() {
  const labels = {name:'Name', remaining:'Time remaining', due:'Due window', duration:'Duration', status:'Status', group:'Account', created:'Date added'};
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));

  const activeBtn = document.getElementById('sort-' + sortKey);
  if (activeBtn) activeBtn.classList.add('active');

  ['name','remaining','due','duration','status','group','created'].forEach(k => {
    const el = document.getElementById('arr-' + k);
    if (el) el.textContent = k === sortKey ? (sortDir === 1 ? '↑' : '↓') : '';
  });

  const label = document.getElementById('sort-label');
  if (label) {
    const pinnedSuffix = timers.some(isTimerPinned) && !filterPinned ? ' · pinned first' : '';
    label.textContent = (labels[sortKey] || sortKey) + (sortDir === 1 ? ' ↑' : ' ↓') + pinnedSuffix;
  }
}

function setSort(key) {
  if (sortKey === key) sortDir *= -1;
  else { sortKey = key; sortDir = 1; }
  updateSortControls();
  renderTimers();
}

// ── Delete selection workflow ───────────────────────────────────────────────


function pruneSelectedTimerIds() {
  const liveIds = new Set(timers.map(t => String(t.id)));
  selectedTimerIds = new Set(Array.from(selectedTimerIds).filter(id => liveIds.has(String(id))));
}

function updateDeleteModeButton() {
  const btn = document.getElementById('delete-mode-btn');
  const label = document.getElementById('delete-mode-label');
  if (!btn) return;

  btn.classList.toggle('active', deleteSelectionMode);
  btn.classList.toggle('btn-danger', deleteSelectionMode);
  btn.setAttribute('aria-pressed', deleteSelectionMode ? 'true' : 'false');
  btn.title = deleteSelectionMode ? 'Exit delete selection mode' : 'Select timers to delete';
  btn.setAttribute('aria-label', btn.title);
  if (label) label.textContent = deleteSelectionMode ? 'Delete On' : 'Delete';
}

function enterDeleteSelectionMode() {
  if (!getViewScopedTimers().length) {
    toast('No timers in this saved view to delete.', 'warning');
    return;
  }

  deleteSelectionMode = true;
  selectedTimerIds.clear();
  timerCopySourceId = null;
  expandedActionsTimerId = null;
  adjustingTimerId = null;

  if (focusMode) {
    focusMode = false;
    localStorage.setItem(FOCUS_MODE_KEY, '0');
    applyFocusMode();
  }

  updateDeleteModeButton();
  renderTimers();
}

function exitDeleteSelectionMode() {
  deleteSelectionMode = false;
  selectedTimerIds.clear();
  updateDeleteModeButton();
  renderTimers();
}

function toggleDeleteSelectionMode() {
  if (deleteSelectionMode) exitDeleteSelectionMode();
  else enterDeleteSelectionMode();
}

function toggleTimerDeleteSelection(id, event) {
  if (event) event.stopPropagation();
  if (!deleteSelectionMode) return;

  const key = String(id || '');
  if (!key) return;

  if (selectedTimerIds.has(key)) selectedTimerIds.delete(key);
  else selectedTimerIds.add(key);

  renderTimers();
}

function selectVisibleTimersForDeletion() {
  if (!deleteSelectionMode) return;
  const visible = getVisibleTimerList();
  visible.forEach(t => selectedTimerIds.add(String(t.id)));
  renderTimers();

  if (visible.length) toast(`Selected ${visible.length} visible timer${visible.length === 1 ? '' : 's'}.`, 'success');
  else toast('No visible timers to select.', 'warning');
}

function selectTimersByDeleteAccount() {
  if (!deleteSelectionMode) return;

  const select = document.getElementById('delete-account-select');
  const account = select ? select.value : '';
  if (!account) {
    toast('Choose an account first.', 'warning');
    if (select) select.focus();
    return;
  }

  const matches = getViewScopedTimers().filter(t => getAccount(t) === account);
  matches.forEach(t => selectedTimerIds.add(String(t.id)));
  renderTimers();

  toast(`Selected ${matches.length} timer${matches.length === 1 ? '' : 's'} for ${account}.`, matches.length ? 'success' : 'warning');
}

function clearDeleteSelection() {
  selectedTimerIds.clear();
  renderTimers();
}

function deleteSelectedTimers() {
  pruneSelectedTimerIds();

  if (!selectedTimerIds.size) {
    toast('Select at least one timer to delete.', 'warning');
    return;
  }

  const ids = new Set(Array.from(selectedTimerIds).map(String));
  const selected = timers.filter(t => ids.has(String(t.id)));
  const count = selected.length;
  const accounts = Array.from(new Set(selected.map(t => getAccount(t)).filter(Boolean)));
  const accountText = accounts.length === 1 ? ` from ${accounts[0]}` : '';

  if (!confirm(`Delete ${count} selected timer${count === 1 ? '' : 's'}${accountText}?`)) return;

  timers = timers.filter(t => !ids.has(String(t.id)));
  selectedTimerIds.clear();
  deleteSelectionMode = false;
  timerCopySourceId = null;
  adjustingTimerId = null;
  expandedActionsTimerId = null;

  save();
  renderTimers();
  toast(`Deleted ${count} timer${count === 1 ? '' : 's'}.`, 'success');
}


function getTimerById(id) {
  return timers.find(t => String(t.id) === String(id));
}

function pruneTimerCopySource() {
  if (!timerCopySourceId) return;
  if (!getTimerById(timerCopySourceId)) timerCopySourceId = null;
}

function currentRemainingForCopy(t, now=Date.now()) {
  if (!t) return 0;
  if (t.status === 'running' && t.endTime) {
    return Math.max(0, Math.ceil((Number(t.endTime) - now) / 1000));
  }
  return Math.max(0, Math.floor(Number(t.remaining) || 0));
}

function beginTimerDataCopy(id, event) {
  if (event) event.stopPropagation();
  const source = getTimerById(id);
  if (!source) {
    toast('Copy source timer was not found.', 'warning');
    return;
  }

  timerCopySourceId = String(source.id);
  expandedActionsTimerId = null;
  adjustingTimerId = null;
  renderTimers();
  toast(`Copy source selected: ${source.name}`, 'success');
}

function cancelTimerDataCopy(event) {
  if (event) event.stopPropagation();
  timerCopySourceId = null;
  renderTimers();
}

function applyCopiedTimerDataToTarget(targetId, event) {
  if (event) event.stopPropagation();
  pruneTimerCopySource();

  const source = getTimerById(timerCopySourceId);
  const target = getTimerById(targetId);
  if (!source) {
    timerCopySourceId = null;
    renderTimers();
    toast('Copy source timer was not found.', 'warning');
    return;
  }
  if (!target) {
    toast('Target timer was not found.', 'warning');
    return;
  }
  if (String(source.id) === String(target.id)) {
    toast('Choose a different timer as the copy target.', 'warning');
    return;
  }

  const sourceName = source.name || 'source timer';
  const targetName = target.name || 'target timer';
  const keepNote = target.note ? ' The target note/comment will be kept.' : '';
  if (!confirm(`Copy timer data from "${sourceName}" into "${targetName}"?${keepNote}`)) return;

  const now = Date.now();
  const targetNote = target.note || '';
  const targetAccount = getAccount(target);
  const targetGroup = target.group !== undefined ? target.group : targetAccount;
  const targetRepeat = !!target.repeat;
  const targetSound = target.sound !== false;
  const targetCreated = target.created || now;
  const sourceDuration = Math.max(1, Math.floor(Number(source.duration) || 0));
  const sourceRemaining = Math.min(sourceDuration, currentRemainingForCopy(source, now));

  target.name = source.name;
  target.duration = sourceDuration;
  target.remaining = sourceRemaining;
  target.upgradeType = getUpgradeType(source);
  target.note = targetNote;
  target.repeat = targetRepeat;
  target.sound = targetSound;
  target.created = targetCreated;

  // Preserve the curated timer's account unless it was blank.
  if (targetAccount) {
    target.account = targetAccount;
    target.group = targetGroup || targetAccount;
  } else {
    const sourceAccount = getAccount(source);
    target.account = sourceAccount;
    target.group = sourceAccount;
  }

  if (source.status === 'expired' || sourceRemaining <= 0) {
    target.status = 'expired';
    target.remaining = 0;
    target.endTime = null;
    target.expiredAt = source.expiredAt || source.finishedAt || now;
  } else if (source.status === 'running') {
    target.status = 'running';
    target.expiredAt = null;
    target.endTime = source.endTime && Number(source.endTime) > now
      ? Number(source.endTime)
      : now + sourceRemaining * 1000;
  } else if (source.status === 'paused') {
    target.status = 'paused';
    target.endTime = null;
    target.expiredAt = null;
  } else {
    target.status = 'stopped';
    target.endTime = null;
    target.expiredAt = null;
  }

  timerCopySourceId = null;
  save();
  renderTimers();
  toast(`Copied timer data into "${target.name}" and kept its note.`, 'success');
}

function renderCopyDataBar(visibleList) {
  pruneTimerCopySource();

  const bar = document.getElementById('copy-data-bar');
  if (!bar) return;

  const source = getTimerById(timerCopySourceId);
  if (!source || deleteSelectionMode) {
    bar.classList.remove('visible');
    bar.innerHTML = '';
    return;
  }

  const visibleTargets = Array.isArray(visibleList)
    ? visibleList.filter(t => String(t.id) !== String(source.id)).length
    : 0;
  const targetLabel = visibleTargets === 1 ? '1 visible target' : `${visibleTargets} visible targets`;
  const account = getAccount(source);
  const type = getUpgradeType(source);

  bar.classList.add('visible');
  bar.innerHTML = `
    <span class="copy-data-summary">⧉ Copy data mode</span>
    <span class="copy-data-source-pill" title="${esc(source.name)}">
      Source: <span class="copy-data-source-name">${esc(source.name)}</span>${account ? ` · ${esc(account)}` : ''}${type ? ` · ${esc(type)}` : ''}
    </span>
    <span class="copy-data-help">Tap a target timer or use Paste on a card. Name, type, timing, and status are copied; the target note/comment is kept.</span>
    <button class="btn btn-sm" type="button" onclick="cancelTimerDataCopy()">Cancel</button>
    <span class="copy-data-target-count">${targetLabel}</span>
  `;
}

function renderDeleteSelectionBar(visibleList) {
  pruneSelectedTimerIds();
  updateDeleteModeButton();

  const bar = document.getElementById('delete-selection-bar');
  if (!bar) return;

  if (!deleteSelectionMode) {
    bar.classList.remove('visible');
    bar.innerHTML = '';
    return;
  }

  const accounts = getAccountsWithTimers();
  const currentSelect = document.getElementById('delete-account-select');
  const preferredAccount = currentSelect && currentSelect.value
    ? currentSelect.value
    : (filterGroup !== 'All' && accounts.includes(filterGroup) ? filterGroup : '');

  const accountOptions = [`<option value="">— Account —</option>`].concat(accounts.map(account => {
    const selected = account === preferredAccount ? ' selected' : '';
    const count = timers.filter(t => getAccount(t) === account).length;
    return `<option value="${esc(account)}"${selected}>${esc(account)} (${count})</option>`;
  })).join('');

  const selectedCount = selectedTimerIds.size;
  const visibleCount = Array.isArray(visibleList) ? visibleList.length : 0;
  const selectedLabel = selectedCount === 1 ? '1 selected' : `${selectedCount} selected`;
  const deleteDisabled = selectedCount ? '' : ' disabled';
  const visibleDisabled = visibleCount ? '' : ' disabled';
  const accountDisabled = accounts.length ? '' : ' disabled';

  bar.classList.add('visible');
  bar.innerHTML = `
    <span class="delete-selection-summary">🗑 Delete mode · ${selectedLabel}</span>
    <span class="delete-selection-help">Tap timer cards or checkboxes, or select an entire account.</span>
    <select id="delete-account-select" class="delete-account-select" title="Account to select for deletion"${accountDisabled}>${accountOptions}</select>
    <button class="btn btn-sm" type="button" onclick="selectTimersByDeleteAccount()"${accountDisabled}>Select Account</button>
    <button class="btn btn-sm" type="button" onclick="selectVisibleTimersForDeletion()"${visibleDisabled}>Select Visible (${visibleCount})</button>
    <button class="btn btn-sm" type="button" onclick="clearDeleteSelection()"${deleteDisabled}>Clear</button>
    <button class="btn btn-sm btn-danger" type="button" onclick="deleteSelectedTimers()"${deleteDisabled}>Delete Selected</button>
    <button class="btn btn-sm" type="button" onclick="exitDeleteSelectionMode()">Cancel</button>
  `;
}

function handleTimerCardClick(event, id) {
  if (deleteSelectionMode) {
    const interactive = event.target.closest('button,input,select,textarea,a,[role="button"],label,.timer-secondary,.timer-adjust-panel');
    if (interactive) return;
    toggleTimerDeleteSelection(id, event);
    return;
  }

  if (timerCopySourceId) {
    const interactive = event.target.closest('button,input,select,textarea,a,[role="button"],label,.timer-secondary,.timer-adjust-panel');
    if (interactive) return;
    if (String(timerCopySourceId) === String(id)) {
      toast('Tap a different timer to paste the copied timer data.', 'warning');
      return;
    }
    applyCopiedTimerDataToTarget(id, event);
    return;
  }

  toggleTimerActionsFromCard(event, id);
}



function toggleTimerActions(id, event) {
  if (event) event.stopPropagation();
  expandedActionsTimerId = expandedActionsTimerId === id ? null : id;
  renderTimers();
}

function toggleTimerActionsFromCard(event, id) {
  if (!compactMode) return;
  const interactive = event.target.closest('button,input,select,textarea,a,[role="button"],.timer-secondary,.timer-adjust-panel');
  if (interactive) return;
  expandedActionsTimerId = expandedActionsTimerId === id ? null : id;
  renderTimers();
}
