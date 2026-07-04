// Snapshot metadata and builder-capacity helpers for the Clash Timers browser app.
// Loaded as a classic non-module script after app-utils.js and before the main inline app script.
// These functions intentionally use globals declared by the main inline script.

function normalizeSnapshotFreshnessSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  let freshHours = Number(source.freshHours);
  let agingHours = Number(source.agingHours);

  if (!Number.isFinite(freshHours)) freshHours = DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS.freshHours;
  if (!Number.isFinite(agingHours)) agingHours = DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS.agingHours;

  freshHours = Math.max(1, Math.min(720, Math.round(freshHours)));
  agingHours = Math.max(2, Math.min(720, Math.round(agingHours)));
  if (agingHours <= freshHours) agingHours = Math.min(720, freshHours + 1);

  return { freshHours, agingHours };
}

function normalizeBuilderCapacity(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const homeTotal = normalizeOptionalNonNegativeInt(raw.homeTotal);
  const builderBaseTotal = normalizeOptionalNonNegativeInt(raw.builderBaseTotal);
  if (homeTotal === null && builderBaseTotal === null) return null;

  const normalized = {};
  if (homeTotal !== null) normalized.homeTotal = homeTotal;
  if (builderBaseTotal !== null) normalized.builderBaseTotal = builderBaseTotal;
  return normalized;
}

function normalizeAccountSnapshotMeta(raw) {
  const normalized = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return normalized;

  Object.entries(raw).forEach(([account, meta]) => {
    const name = String(account || '').trim();
    if (!name || !meta || typeof meta !== 'object' || Array.isArray(meta)) return;

    const loadedAt = meta.lastLoadedAt || meta.loadedAt || meta.lastSnapshotLoadedAt || meta.updatedAt;
    const loadedMs = Date.parse(loadedAt);
    if (!Number.isFinite(loadedMs)) return;

    const entry = {
      lastLoadedAt: new Date(loadedMs).toISOString(),
      tag: String(meta.tag || '').trim(),
      candidateCount: Number.isFinite(Number(meta.candidateCount)) ? Math.max(0, Math.round(Number(meta.candidateCount))) : 0,
      selectedCount: Number.isFinite(Number(meta.selectedCount)) ? Math.max(0, Math.round(Number(meta.selectedCount))) : 0
    };

    const builderCapacity = normalizeBuilderCapacity(meta.builderCapacity);
    if (builderCapacity) entry.builderCapacity = builderCapacity;

    normalized[name] = entry;
  });

  return normalized;
}

function normalizeAccountTagMap(raw) {
  const normalized = {};
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : DEFAULT_ACCOUNT_TAG_MAP;

  Object.entries(source || {}).forEach(([rawTag, rawAccount]) => {
    const tag = normalizePlayerTag(rawTag);
    const account = normalizeAccountNameValue(rawAccount);
    if (!tag || !account) return;
    normalized[tag] = account;
  });

  return Object.fromEntries(Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric:true, sensitivity:'base' })));
}

function getSnapshotPlayerTag(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return '';
  return normalizePlayerTag(snapshot.tag || snapshot.playerTag || snapshot.player_tag || snapshot.accountTag || snapshot.account_tag || '');
}

function getSnapshotPlayerName(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const fields = ['name', 'playerName', 'player_name', 'accountName', 'account_name', 'villageName', 'village_name'];
  for (const field of fields) {
    const value = snapshot[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function snapshotFreshnessAgeLabel(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'just now';
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(Date.now() - ageMs).toLocaleDateString([], { month:'short', day:'numeric' });
}

function snapshotCompactAgeLabel(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'now';
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getSnapshotFreshness(account) {
  const name = String(account || '').trim();
  const meta = name ? accountSnapshotMeta[name] : null;
  const loadedAt = meta && meta.lastLoadedAt;
  const loadedMs = Date.parse(loadedAt || '');

  if (!name || !Number.isFinite(loadedMs)) {
    return {
      key: 'unknown',
      cls: 'unknown',
      label: 'Unknown',
      shortLabel: 'No snapshot',
      compactAgeLabel: '',
      title: 'No snapshot loaded yet for this account.'
    };
  }

  const now = Date.now();
  const ageMs = Math.max(0, now - loadedMs);
  const ageHours = ageMs / 3600000;
  const settings = normalizeSnapshotFreshnessSettings(snapshotFreshnessSettings);
  const key = ageHours <= settings.freshHours ? 'fresh' : (ageHours <= settings.agingHours ? 'aging' : 'stale');
  const labels = { fresh:'Fresh', aging:'Aging', stale:'Stale' };
  const loadedText = new Date(loadedMs).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const tagText = meta && meta.tag ? ` (${meta.tag})` : '';
  const countText = meta && Number(meta.selectedCount) ? ` — ${meta.selectedCount} timer${Number(meta.selectedCount) === 1 ? '' : 's'} loaded` : '';
  const ageLabel = snapshotFreshnessAgeLabel(ageMs);
  const compactAgeLabel = snapshotCompactAgeLabel(ageMs);

  return {
    key,
    cls: key,
    label: labels[key],
    shortLabel: ageLabel,
    compactAgeLabel,
    title: `${labels[key]} snapshot: loaded ${ageLabel}${tagText} on ${loadedText}${countText}.`
  };
}

function snapshotFreshnessDotHtml(account) {
  const freshness = getSnapshotFreshness(account);
  return `<span class="account-summary-freshness-dot ${freshness.cls}" title="${esc(freshness.title)}" aria-label="${esc(freshness.title)}"></span>`;
}

function updateAccountSnapshotMeta(account, details={}) {
  const name = String(account || '').trim();
  if (!name) return;

  accountSnapshotMeta = normalizeAccountSnapshotMeta({
    ...accountSnapshotMeta,
    [name]: {
      ...(accountSnapshotMeta[name] || {}),
      ...details,
      lastLoadedAt: details.lastLoadedAt || new Date().toISOString()
    }
  });
}

function getAccountBuilderCapacity(account) {
  const name = String(account || '').trim();
  const meta = name ? accountSnapshotMeta[name] : null;
  return normalizeBuilderCapacity(meta && meta.builderCapacity) || {};
}

function snapshotItemCount(snapshot, bucket, dataId) {
  const rows = snapshot && Array.isArray(snapshot[bucket]) ? snapshot[bucket] : [];
  const target = String(dataId);

  return rows.reduce((total, item) => {
    if (!item || typeof item !== 'object' || String(item.data ?? item.id ?? item.data_id ?? '') !== target) return total;
    const count = Number(item.cnt);
    return total + (Number.isFinite(count) && count > 0 ? Math.round(count) : 1);
  }, 0);
}

function snapshotMaxItemLevel(snapshot, bucket, dataId) {
  const rows = snapshot && Array.isArray(snapshot[bucket]) ? snapshot[bucket] : [];
  const target = String(dataId);
  let maxLevel = null;

  rows.forEach(item => {
    if (!item || typeof item !== 'object' || String(item.data ?? item.id ?? item.data_id ?? '') !== target) return;
    const level = Number(item.lvl);
    if (!Number.isFinite(level)) return;
    maxLevel = maxLevel === null ? level : Math.max(maxLevel, level);
  });

  return maxLevel;
}

function snapshotHasAnyDataId(snapshot, dataIds) {
  if (!snapshot || typeof snapshot !== 'object') return false;

  const targets = new Set((Array.isArray(dataIds) ? dataIds : [dataIds]).map(value => String(value)));
  let found = false;

  function visit(node) {
    if (found || !node || typeof node !== 'object') return;

    if (!Array.isArray(node)) {
      const id = String(node.data ?? node.id ?? node.data_id ?? '');
      if (targets.has(id)) {
        found = true;
        return;
      }
    }

    Object.values(node).forEach(visit);
  }

  visit(snapshot);
  return found;
}

function deriveBuilderCapacityFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;

  const homeBuilderHuts = snapshotItemCount(snapshot, 'buildings', HOME_BUILDER_HUT_DATA_ID);
  const hasHomeBobMarker = HOME_BOB_HUT_DATA_IDS.some(dataId => snapshotItemCount(snapshot, 'buildings', dataId) > 0)
    || snapshotHasAnyDataId(snapshot, HOME_BOB_HUT_DATA_IDS);
  const bobControlLevel = snapshotMaxItemLevel(snapshot, 'buildings2', BOB_CONTROL_DATA_ID);
  const builderHallLevel = snapshotMaxItemLevel(snapshot, 'buildings2', BUILDER_HALL_DATA_ID);
  const hasBuilderBase = Array.isArray(snapshot.buildings2) && snapshot.buildings2.length > 0;

  const hasSixthHomeBuilder = hasHomeBobMarker || (Number.isFinite(bobControlLevel) && bobControlLevel >= 5);
  let homeTotal = null;

  if (homeBuilderHuts > 0) {
    // B.O.B / the sixth builder is represented as a separate marker in the export,
    // not as another Builder's Hut row. Guard with Math.max so accounts that already
    // report six huts are not accidentally inflated to seven, while accounts such as
    // bruh with 5 huts + B.O.B markers correctly save as 6.
    homeTotal = hasSixthHomeBuilder
      ? Math.max(6, homeBuilderHuts >= 6 ? homeBuilderHuts : homeBuilderHuts + 1)
      : homeBuilderHuts;
  } else if (hasSixthHomeBuilder) {
    // Defensive fallback for future export shapes where the hut count is omitted but
    // a completed B.O.B marker is still present.
    homeTotal = 6;
  }

  const builderBaseTotal = hasBuilderBase
    ? 1 + (Number.isFinite(builderHallLevel) && builderHallLevel >= 6 ? 1 : 0)
    : null;

  return normalizeBuilderCapacity({ homeTotal, builderBaseTotal });
}

function snapshotBuilderCapacityStatusText(snapshot) {
  const capacity = deriveBuilderCapacityFromSnapshot(snapshot);
  if (!capacity) return '';

  const parts = [];
  const homeTotal = normalizeOptionalNonNegativeInt(capacity.homeTotal);
  const builderBaseTotal = normalizeOptionalNonNegativeInt(capacity.builderBaseTotal);
  if (homeTotal !== null) parts.push(`${homeTotal} home builder${homeTotal === 1 ? '' : 's'}`);
  if (builderBaseTotal !== null) parts.push(`${builderBaseTotal} Builder Base builder${builderBaseTotal === 1 ? '' : 's'}`);

  return parts.length ? ` Detected capacity: ${parts.join(', ')}.` : '';
}

