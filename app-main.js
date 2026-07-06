// ── State ─────────────────────────────────────────────────────────────────
let timers = [];
let sortKey = 'remaining';
let sortDir = 1;
let fleetMatrixSortKey = 'account';
let fleetMatrixSortDir = 1;
let filterGroup = 'All';
let filterDue = 'All';
let filterType = 'All';
let filterStatus = 'All';
let filterPinned = false;
let selectedAccountView = 'all';
let accountViews = [];
let accountViewsLastUpdated = null;
let accountViewControlsSignature = '';
let accountViewEditorDrafts = [];
let accountSnapshotMeta = {};
let snapshotFreshnessSettings = { freshHours: 24, agingHours: 72 };
let accountTagMap = {};
let expandedAccount = null;
let expandedGapType = null;
let editingId = null;
let tickInterval = null;
let sidebarVisible = true;
let sidebarWidth = 280;
let focusMode = false;
let compactMode = false;
let showAccountPillBuilderCounts = false;
let cardModes = {}; // id -> 'elapsed' | 'endtime'
let adjustingTimerId = null;
let expandedActionsTimerId = null;
let inlineAdjustEditing = false;
let renderQueuedUntilAdjustEditEnds = false;
let serverLastUpdated = null;
let saveInFlight = false;
let saveQueued = false;
let accountControlsSignature = '';
let accountControlsRefreshQueued = false;
let nativeSelectActive = false;
let renderQueuedUntilSelectCloses = false;
let snapshotLastSnapshot = null;
let snapshotCandidates = [];
let batchSnapshotRows = [];
let batchSnapshotDraftWarningShown = false;
let deleteSelectionMode = false;
let selectedTimerIds = new Set();
let timerCopySourceId = null;

const STORAGE_KEY = 'timerdesk_v2';
const EMERGENCY_BACKUP_KEY = STORAGE_KEY + '_emergency_backup';
const FOCUS_MODE_KEY = STORAGE_KEY + '_focus_mode';
const COMPACT_MODE_KEY = STORAGE_KEY + '_compact_mode';
const ACCOUNT_PILL_BUILDERS_KEY = STORAGE_KEY + '_account_pill_builders';
const ACCOUNT_VIEW_KEY = STORAGE_KEY + '_account_view';
const SIDEBAR_WIDTH_KEY = STORAGE_KEY + '_sidebar_width';
const SNAPSHOT_COLLECTOR_DRAFT_KEY = STORAGE_KEY + '_snapshot_collector_draft';
const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_MIN_WIDTH = 230;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_MIN_CONTENT_WIDTH = 440;

// Static app configuration is loaded from app-config.js.
const UPGRADE_TYPES = window.UPGRADE_TYPES || [];
const NOTE_TEMPLATES = window.NOTE_TEMPLATES || [];

// Static Clash object ID lookup is loaded from coc-data-map.js.
const COC_DATA_ID_MAP = window.COC_DATA_ID_MAP || {};

const ACCOUNT_PRESETS = window.ACCOUNT_PRESETS || [];
const DEFAULT_ACCOUNT_VIEWS = window.DEFAULT_ACCOUNT_VIEWS || [];
const DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS = window.DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS || { freshHours: 24, agingHours: 72 };
const DEFAULT_ACCOUNT_TAG_MAP = window.DEFAULT_ACCOUNT_TAG_MAP || {};

const HOME_BUILDER_HUT_DATA_ID = '1000015';
// Home Village markers observed on accounts with B.O.B / the sixth home builder.
// Some exports include 1000064, some include 1000093, and some include both.
const HOME_BOB_HUT_DATA_IDS = ['1000064', '1000093'];
const BUILDER_HALL_DATA_ID = '1000034';
const BOB_CONTROL_DATA_ID = '1000081';


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
