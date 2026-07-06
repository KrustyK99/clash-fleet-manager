// Timer runtime/tick helpers live in app-timer-runtime.js.

// ── Persistence ──────────────────────────────────────────────────────────
function normalizeTimersAfterLoad() {
  let needsSave = false;
  const now = Date.now();

  timers = (Array.isArray(timers) ? timers : []).filter(t => t && t.id && t.name && Number(t.duration) > 0);

  timers.forEach(t => {
    t.duration = Number(t.duration) || 0;
    t.remaining = Number(t.remaining);
    if (!Number.isFinite(t.remaining) || t.remaining < 0 || t.remaining > t.duration) t.remaining = t.duration;
    if (!['running','paused','stopped','expired'].includes(t.status)) t.status = 'stopped';
    if (!t.created) t.created = now;
    if (t.sound === undefined) t.sound = true;
    if (t.account === undefined && t.group !== undefined) t.account = t.group;
    if (t.group === undefined && t.account !== undefined) t.group = t.account;
    if (t.account === undefined) t.account = '';
    if (t.group === undefined) t.group = '';
    if (t.upgradeType === undefined) t.upgradeType = '';
    if (t.note === undefined) t.note = '';
    t.pinned = t.pinned === true;
    if (t.expiredAt === undefined) t.expiredAt = null;
    if (t.finishedAt !== undefined && !t.expiredAt) t.expiredAt = t.finishedAt;
    if (t.status === 'expired' && !t.expiredAt && t.endTime) {
      t.expiredAt = Number(t.endTime) || null;
      needsSave = true;
    }
    if (t.status !== 'running' && t.endTime) {
      t.endTime = null;
      needsSave = true;
    }
    if (t.status !== 'expired' && t.expiredAt) {
      t.expiredAt = null;
      needsSave = true;
    }

    // Recalculate remaining for running timers based on stored endTime.
    // This is what lets multiple devices share the same countdown without saving every second.
    if (t.status === 'running' && t.endTime) {
      const rem = Math.ceil((Number(t.endTime) - now) / 1000);
      if (rem <= 0) {
        if (t.repeat) {
          t.remaining = t.duration;
          t.expiredAt = null;
          t.endTime = now + t.duration * 1000;
        } else {
          t.remaining = 0;
          t.status = 'expired';
          t.expiredAt = Number(t.endTime) || now;
          t.endTime = null;
        }
        needsSave = true;
      } else {
        t.remaining = rem;
      }
    }
  });

  return needsSave;
}

async function loadAccountViews() {
  try {
    const data = await window.FleetApiClient.loadAccountViews();

    const payload = Array.isArray(data) ? {} : (data || {});
    accountViews = normalizeAccountViews(Array.isArray(data) ? data : data.views);
    snapshotFreshnessSettings = normalizeSnapshotFreshnessSettings(payload.snapshotFreshnessSettings || (payload.settings && payload.settings.snapshotFreshnessSettings));
    accountTagMap = normalizeAccountTagMap(payload.accountTagMap || (payload.settings && payload.settings.accountTagMap));
    accountViewsLastUpdated = data.lastUpdated || null;
    return true;
  } catch (e) {
    console.error(e);
    accountViews = normalizeAccountViews(DEFAULT_ACCOUNT_VIEWS);
    snapshotFreshnessSettings = normalizeSnapshotFreshnessSettings(DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS);
    accountTagMap = normalizeAccountTagMap(DEFAULT_ACCOUNT_TAG_MAP);
    accountViewsLastUpdated = null;
    toast('Could not load shared Saved Views. Using defaults in this browser.', 'warning');
    return false;
  }
}

async function saveAccountViews(nextViews, nextFreshnessSettings=snapshotFreshnessSettings, nextAccountTagMap=accountTagMap, options={}) {
  const normalized = normalizeAccountViews(nextViews);
  const normalizedFreshnessSettings = normalizeSnapshotFreshnessSettings(nextFreshnessSettings);
  const normalizedAccountTagMap = normalizeAccountTagMap(nextAccountTagMap);
  const quiet = options && options.quiet === true;

  try {
    const data = await window.FleetApiClient.saveAccountViews({
      schemaVersion: 3,
      lastKnownLastUpdated: accountViewsLastUpdated,
      views: normalized,
      snapshotFreshnessSettings: normalizedFreshnessSettings,
      accountTagMap: normalizedAccountTagMap
    });

    accountViews = normalized;
    snapshotFreshnessSettings = normalizedFreshnessSettings;
    accountTagMap = normalizedAccountTagMap;
    accountViewsLastUpdated = data.lastUpdated || accountViewsLastUpdated;
    if (!quiet) toast('Saved views and settings updated', 'success');
    return true;
  } catch (e) {
    console.error(e);
    if (e.code === 'STALE_VIEWS') {
      if (!quiet) toast('Saved Views changed on another device. Reloaded the latest shared views.', 'warning');
      await loadAccountViews();
      renderAccountViewsEditor();
    } else {
      if (!quiet) toast('Could not save Saved Views.', 'warning');
    }
    return false;
  }
}


async function save() {
  if (saveInFlight) {
    saveQueued = true;
    return false;
  }

  saveInFlight = true;
  setSyncStatus('Saving…', 'saving');
  let ok = false;

  try {
    const data = await window.FleetApiClient.saveTimers({
      schemaVersion: 2,
      lastKnownLastUpdated: serverLastUpdated,
      timers,
      accountSnapshotMeta
    });

    serverLastUpdated = data.lastUpdated || serverLastUpdated;
    const stamp = serverLastUpdated ? new Date(serverLastUpdated).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}) : 'now';
    setSyncStatus(`Saved ${stamp}`, 'ok');
    ok = true;
  } catch (e) {
    console.error(e);
    try {
      localStorage.setItem(EMERGENCY_BACKUP_KEY, JSON.stringify({
        schemaVersion: 2,
        savedAt: new Date().toISOString(),
        timers,
        accountSnapshotMeta
      }));
    } catch (backupErr) {
      console.error(backupErr);
    }
    setSyncStatus('Save failed', 'error');
    toast('Save failed. Emergency backup saved in this browser.', 'warning');
  } finally {
    saveInFlight = false;
    if (saveQueued) {
      saveQueued = false;
      save();
    }
  }

  return ok;
}

async function load() {
  setSyncStatus('Loading…', 'saving');

  try {
    const data = await window.FleetApiClient.loadTimers();

    const payload = Array.isArray(data) ? {} : (data || {});
    timers = Array.isArray(data) ? data : (Array.isArray(data.timers) ? data.timers : []);
    accountSnapshotMeta = normalizeAccountSnapshotMeta(payload.accountSnapshotMeta || payload.snapshotMeta);
    const seededAccountTagMap = seedAccountTagMapFromSnapshotMeta();
    if (seededAccountTagMap) saveAccountTagMapQuietly();
    serverLastUpdated = data.lastUpdated || null;

    const needsSave = normalizeTimersAfterLoad();

    const stamp = serverLastUpdated ? new Date(serverLastUpdated).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}) : 'ready';
    setSyncStatus(`Loaded ${stamp}`, 'ok');

    if (needsSave) save();
    return true;
  } catch (e) {
    console.error(e);
    setSyncStatus('Load failed', 'error');

    const backupRaw = localStorage.getItem(EMERGENCY_BACKUP_KEY);
    if (backupRaw) {
      try {
        const backup = JSON.parse(backupRaw);
        timers = Array.isArray(backup.timers) ? backup.timers : [];
        accountSnapshotMeta = normalizeAccountSnapshotMeta(backup.accountSnapshotMeta || backup.snapshotMeta);
        normalizeTimersAfterLoad();
        toast('NAS load failed. Loaded emergency browser backup.', 'warning');
        return false;
      } catch (_) {}
    }

    timers = [];
    accountSnapshotMeta = {};
    toast('Could not load timers from NAS.', 'warning');
    return false;
  }
}

function getViewState() {
  const searchEl = document.getElementById('search-input');
  return {
    sortKey,
    sortDir,
    filterGroup,
    selectedAccountView,
    filterDue,
    filterType,
    filterStatus,
    filterPinned,
    search: searchEl ? searchEl.value : ''
  };
}

function restoreViewState(state) {
  if (!state) return;
  sortKey = state.sortKey || sortKey;
  sortDir = Number(state.sortDir) || sortDir;
  selectedAccountView = getAccountViews().some(v => v.id === state.selectedAccountView) ? state.selectedAccountView : selectedAccountView;
  filterGroup = state.filterGroup || 'All';
  if (filterGroup !== 'All' && !accountIsVisibleInCurrentView(filterGroup)) filterGroup = 'All';
  filterDue = state.filterDue || 'All';
  filterType = state.filterType || 'All';
  filterStatus = state.filterStatus || 'All';
  filterPinned = state.filterPinned === true;

  const searchEl = document.getElementById('search-input');
  if (searchEl) searchEl.value = state.search || '';

  updateSortControls();
}

async function reloadTimerFile() {
  const preservedState = getViewState();
  setReloadButtonBusy(true);

  try {
    const loadedFromServer = await load();
    restoreViewState(preservedState);
    renderTimers();

    if (loadedFromServer) {
      toast('Reloaded timer file.', 'success');
    }
  } finally {
    setReloadButtonBusy(false);
  }
}

// Timer runtime/tick helpers live in app-timer-runtime.js.

// Timer lifecycle/control action bridge lives in app-timer-lifecycle-actions.js.

// Timer list interaction/action UI helpers live in app-timer-list-actions-ui.js.

// ── Format ────────────────────────────────────────────────────────────────
function timerDateTimeLabel(t) {
  if (!t) return '';
  if (t.status === 'running' && t.endTime) {
    const due = fmtDateTime(t.endTime);
    return due ? `Ends ${due}` : '';
  }
  if (t.status === 'expired') {
    const expiredAt = t.expiredAt || t.finishedAt;
    const when = fmtDateTime(expiredAt);
    return when ? `Expired ${when}` : 'Expired time not recorded';
  }
  return '';
}

// ── Render ────────────────────────────────────────────────────────────────


// Delete/copy/card interaction helpers live in app-timer-list-actions-ui.js.

// Timer list rendering orchestration lives in app-timer-list-render-ui.js.

// Timer entry action/save bridge helpers live in app-timer-entry-actions-ui.js.

// ── Snapshot Add Modal ─────────────────────────────────────────────────────
// Account Snapshot import/review UI helpers live in app-snapshot-import-ui.js.
// Account Snapshot parsing/import actions live in app-snapshot-import-actions.js.

// Backup/import/export UI helpers live in app-backup-io-ui.js.
