// app-state.js
// Classic browser script. Owns shared app state declarations for Clash Fleet Manager.
// This intentionally preserves existing global variable names while making shared state explicit.

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
