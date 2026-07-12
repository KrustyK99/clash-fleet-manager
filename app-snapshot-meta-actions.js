// Snapshot metadata/account-tag persistence actions for the Clash Timers browser app.
// Loaded as a classic non-module script after app-snapshot-meta.js and app-account-views.js.
// These functions intentionally read and mutate globals declared by the main inline script.

function learnAccountTagMapping(tagOrSnapshot, account) {
  const tag = typeof tagOrSnapshot === 'string' ? normalizePlayerTag(tagOrSnapshot) : getSnapshotPlayerTag(tagOrSnapshot);
  const accountName = normalizeAccountNameValue(account);
  if (!tag || !accountName) return false;

  const next = normalizeAccountTagMap({ ...accountTagMap, [tag]: accountName });
  const changed = JSON.stringify(next) !== JSON.stringify(normalizeAccountTagMap(accountTagMap));
  accountTagMap = next;
  return changed;
}

function seedAccountTagMapFromSnapshotMeta() {
  let changed = false;
  Object.entries(accountSnapshotMeta || {}).forEach(([account, meta]) => {
    const tag = meta && meta.tag;
    if (tag && learnAccountTagMapping(tag, account)) changed = true;
  });
  return changed;
}

async function saveAccountTagMapQuietly() {
  return saveAccountViews(accountViews, snapshotFreshnessSettings, accountTagMap, { quiet:true });
}

function updateSnapshotMetaFromParsedSnapshot(candidateCount, selectedCount=null, timestampMs=Date.now(), accountOverride='', snapshotOverride=null) {
  const accountEl = document.getElementById('snapshot-account');
  const account = normalizeAccountNameValue(accountOverride || (accountEl ? accountEl.value : ''));
  const snapshot = snapshotOverride || snapshotLastSnapshot;
  if (!account || !snapshot || typeof snapshot !== 'object') return null;

  const details = {
    lastLoadedAt: new Date(timestampMs).toISOString(),
    tag: getSnapshotPlayerTag(snapshot),
    candidateCount: Number.isFinite(Number(candidateCount)) ? Math.max(0, Math.round(Number(candidateCount))) : 0
  };

  if (selectedCount !== null && Number.isFinite(Number(selectedCount))) {
    details.selectedCount = Math.max(0, Math.round(Number(selectedCount)));
  }

  const builderCapacity = deriveBuilderCapacityFromSnapshot(snapshot);
  if (builderCapacity) details.builderCapacity = builderCapacity;

  updateAccountSnapshotMeta(account, details);
  return { account, builderCapacity };
}

function refreshSnapshotMetadataDependentUi() {
  renderTimers();
}
