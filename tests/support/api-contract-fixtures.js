const WRONG_LAST_UPDATED = 'deliberately-wrong-last-updated';

function createTimerSavePayload(current, overrides = {}) {
  const payload = {
    lastKnownLastUpdated: current.lastUpdated,
    timers: current.timers,
    accountSnapshotMeta: current.accountSnapshotMeta
  };

  return applyOverrides(payload, overrides);
}

function createSavedViewsSavePayload(current, overrides = {}) {
  const payload = {
    lastKnownLastUpdated: current.lastUpdated,
    views: current.views,
    snapshotFreshnessSettings: current.snapshotFreshnessSettings,
    accountTagMap: current.accountTagMap
  };

  return applyOverrides(payload, overrides);
}

function applyOverrides(payload, overrides) {
  const result = { ...payload };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }

  return result;
}

module.exports = {
  WRONG_LAST_UPDATED,
  createTimerSavePayload,
  createSavedViewsSavePayload
};
