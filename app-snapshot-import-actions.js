// ── Account Snapshot parsing/import actions ───────────────────────────────
function snapshotGetBucket(path) {
  const match = String(path || '').match(/^([^\[.]+)/);
  return match ? match[1] : 'root';
}

function snapshotBucketLabel(bucket) {
  const labels = {
    helpers: 'Helper',
    guardians: 'Guardian',
    buildings: 'Building',
    traps: 'Trap',
    units: 'Lab',
    siege_machines: 'Siege Machine',
    heroes: 'Hero',
    spells: 'Spell',
    pets: 'Pet',
    equipment: 'Equipment',
    buildings2: 'Builder Base Building',
    traps2: 'Builder Base Trap',
    heroes2: 'Builder Base Hero',
    units2: 'Builder Base Lab'
  };
  return labels[bucket] || bucket || 'Item';
}

function snapshotInferUpgradeType(bucket, timerKey, dataId) {
  if (['buildings2','traps2','heroes2','units2'].includes(bucket)) return 'Builder Base';
  const known = COC_DATA_ID_MAP[String(dataId)];
  if (known && known.type) return known.type;
  if (timerKey === 'helper_cooldown') return 'Capital / Other';
  if (isGuardianSnapshotBucket(bucket)) return 'Builder';
  if (bucket === 'heroes') return 'Hero';
  if (bucket === 'units' || bucket === 'spells' || bucket === 'siege_machines') return 'Lab';
  if (bucket === 'pets') return 'Pet';
  if (bucket === 'equipment') return 'Equipment';
  if (bucket === 'buildings' || bucket === 'traps') return 'Builder';
  return 'Capital / Other';
}

function snapshotInferWorkQueue(bucket, timerKey) {
  if (timerKey === 'helper_cooldown') return 'other';
  if (bucket === 'buildings' || bucket === 'traps' || bucket === 'heroes' || isGuardianSnapshotBucket(bucket)) return 'home_builder';
  if (bucket === 'buildings2' || bucket === 'traps2' || bucket === 'heroes2') return 'builder_base_builder';
  if (bucket === 'units2') return 'builder_base_lab';
  if (bucket === 'units' || bucket === 'spells' || bucket === 'siege_machines') return 'lab';
  if (bucket === 'pets') return 'pet';
  if (bucket === 'equipment') return 'equipment';
  return 'other';
}

function snapshotExtractInlineName(node) {
  const nameFields = ['name', 'Name', 'displayName', 'display_name', 'debugName', 'debug_name', 'uiName', 'ui_name'];
  for (const field of nameFields) {
    const value = node && node[field];
    if (typeof value === 'string' && value.trim() && !/^\d+$/.test(value.trim())) {
      return value.trim();
    }
  }
  return '';
}

function snapshotMakeCandidateName(entry) {
  const dataId = entry.dataId == null ? '' : String(entry.dataId);
  const known = COC_DATA_ID_MAP[dataId];
  const inlineName = snapshotExtractInlineName(entry.raw);
  const base = known ? known.name : (inlineName || `${snapshotBucketLabel(entry.bucket)}${dataId ? ' ' + dataId : ''}`);

  if (entry.timerKey === 'helper_cooldown') return `${base} cooldown`;
  if (Number.isFinite(entry.level)) return `${base} L${entry.level} -> L${entry.level + 1}`;
  return base;
}

function parseAccountSnapshot(snapshot, options={}) {
  const helperEl = document.getElementById('snapshot-include-helper');
  const includeHelper = Object.prototype.hasOwnProperty.call(options || {}, 'includeHelper') ? !!options.includeHelper : !!(helperEl && helperEl.checked);
  const found = [];

  function visit(node, path) {
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }

    if (!node || typeof node !== 'object') return;

    const bucket = snapshotGetBucket(path);
    const collectKeys = ['timer'];
    if (includeHelper) collectKeys.push('helper_cooldown');

    for (const key of collectKeys) {
      const rawSeconds = node[key];
      if (typeof rawSeconds === 'number' && Number.isFinite(rawSeconds) && rawSeconds > 0) {
        const entry = {
          include: true,
          timerKey: key,
          seconds: Math.floor(rawSeconds),
          path,
          bucket,
          dataId: node.data ?? node.id ?? node.data_id ?? null,
          level: typeof node.lvl === 'number' ? node.lvl : null,
          count: typeof node.cnt === 'number' ? node.cnt : null,
          raw: node
        };
        entry.upgradeType = snapshotInferUpgradeType(entry.bucket, entry.timerKey, entry.dataId);
        entry.workQueue = snapshotInferWorkQueue(entry.bucket, entry.timerKey);
        entry.name = snapshotMakeCandidateName(entry);
        found.push(entry);
      }
    }

    Object.keys(node).forEach(key => visit(node[key], path ? `${path}.${key}` : key));
  }

  visit(snapshot, '');
  return found;
}

function parseSnapshotJsonText() {
  const source = document.getElementById('snapshot-json-text');
  const raw = source.value.trim();
  if (!raw) {
    setSnapshotStatus('Paste account JSON first.', 'warning');
    source.focus();
    return;
  }

  try {
    snapshotLastSnapshot = JSON.parse(raw);
    snapshotCandidates = parseAccountSnapshot(snapshotLastSnapshot);
    renderSnapshotCandidates();

    const metaUpdate = updateSnapshotMetaFromParsedSnapshot(snapshotCandidates.length);
    const mapChanged = metaUpdate ? learnAccountTagMapping(snapshotLastSnapshot, metaUpdate.account) : false;
    const mapText = mapChanged ? ' Tag mapping learned.' : '';
    const metaText = metaUpdate ? ` Updated ${metaUpdate.account} snapshot metadata.${mapText}` : ' Choose an account to update snapshot metadata.';
    setSnapshotStatus(`Parsed ${snapshotCandidates.length} timer candidate${snapshotCandidates.length === 1 ? '' : 's'}.${snapshotBuilderCapacityStatusText(snapshotLastSnapshot)}${metaText}`, snapshotCandidates.length ? 'ok' : 'warning');

    if (metaUpdate) {
      refreshSnapshotMetadataDependentUi();
      save();
      if (mapChanged) saveAccountTagMapQuietly();
    }

    if (snapshotCandidates.length) toast(`Parsed ${snapshotCandidates.length} snapshot candidate${snapshotCandidates.length === 1 ? '' : 's'}`, 'success');
  } catch (err) {
    snapshotLastSnapshot = null;
    snapshotCandidates = [];
    renderSnapshotCandidates();
    setSnapshotStatus(`Invalid JSON: ${err.message}`, 'error');
    toast('Snapshot JSON is invalid.', 'warning');
  }
}

function snapshotCandidateToTimer(c, now, account, shouldStart, sound, snapshot=snapshotLastSnapshot, capturedAtMs=now) {
  const tag = getSnapshotPlayerTag(snapshot);
  const sourcePath = `${c.path}.${c.timerKey}`;
  const dataPart = c.dataId == null ? 'no data id' : `data ${c.dataId}`;
  const levelPart = Number.isFinite(c.level) ? `L${c.level}` : 'no level';
  const captureMs = Number.isFinite(Number(capturedAtMs)) ? Number(capturedAtMs) : now;
  const endAt = captureMs + Number(c.seconds || 0) * 1000;
  const remainingAtImport = Math.max(0, Math.ceil((endAt - now) / 1000));
  const initialStatus = shouldStart
    ? (remainingAtImport > 0 ? 'running' : 'expired')
    : 'stopped';

  return {
    id: newId(),
    name: c.name,
    duration: c.seconds,
    remaining: shouldStart ? remainingAtImport : Math.max(0, remainingAtImport),
    account,
    group: account,
    upgradeType: c.upgradeType || 'Capital / Other',
    note: `Snapshot${tag ? ' ' + tag : ''} | ${sourcePath} | ${dataPart} | ${levelPart}`,
    workQueue: c.workQueue || snapshotInferWorkQueue(c.bucket, c.timerKey),
    snapshotBucket: c.bucket,
    snapshotPath: c.path,
    snapshotTimerKey: c.timerKey,
    snapshotDataId: c.dataId == null ? null : String(c.dataId),
    snapshotLevel: Number.isFinite(c.level) ? c.level : null,
    snapshotCapturedAt: new Date(captureMs).toISOString(),
    snapshotImportedAt: new Date(now).toISOString(),
    repeat: false,
    sound,
    status: initialStatus,
    endTime: shouldStart && remainingAtImport > 0 ? endAt : null,
    expiredAt: shouldStart && remainingAtImport <= 0 ? endAt : null,
    pinned: false,
    created: now
  };
}

function isGeneratedSnapshotNote(note) {
  const text = String(note || '').trim();
  if (!text) return false;

  // Current generated snapshot notes look like:
  // Snapshot #TAG | buildings[0].timer | data 1000000 | L12
  // Snapshot #TAG | helpers[0].helper_cooldown | data 93000001 | L1
  return /^Snapshot(?:\s+[^|]+)?\s+\|\s+[^|]+\.(?:timer|helper_cooldown)\s+\|\s+(?:data\s+\d+|no data id)\s+\|\s+(?:L\d+|no level)$/i.test(text);
}

function timerHasManualNote(timer) {
  const note = String(timer && timer.note ? timer.note : '').trim();
  return note !== '' && !isGeneratedSnapshotNote(note);
}

function timerHasSnapshotOrigin(timer) {
  if (!timer || typeof timer !== 'object') return false;
  if (isGeneratedSnapshotNote(timer.note)) return true;

  return [
    'snapshotBucket',
    'snapshotPath',
    'snapshotTimerKey',
    'snapshotDataId',
    'snapshotCapturedAt',
    'snapshotImportedAt'
  ].some(field => {
    const value = timer[field];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
}

function shouldPreserveTimerDuringSnapshotReplace(timer, options) {
  if (!options.preserveManualNotes) return false;

  // Preserve timers that originated from manual entry even when they have no
  // note. Also retain the older supported case where a snapshot timer was
  // deliberately annotated with a real/manual note.
  return !timerHasSnapshotOrigin(timer) || timerHasManualNote(timer);
}

function snapshotGeneratedNoteKey(note) {
  const text = String(note || '').trim();
  return isGeneratedSnapshotNote(text) ? text : '';
}

function buildPinnedSnapshotNoteCounts(account) {
  const counts = new Map();

  timers.forEach(timer => {
    if (getAccount(timer) !== account || !isTimerPinned(timer)) return;

    const key = snapshotGeneratedNoteKey(timer.note);
    if (!key) return;

    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

function retainPinnedSnapshotTimers(newTimers, pinnedSnapshotNoteCounts) {
  let retainedCount = 0;

  newTimers.forEach(timer => {
    const key = snapshotGeneratedNoteKey(timer.note);
    const pinnedMatches = key ? (pinnedSnapshotNoteCounts.get(key) || 0) : 0;

    if (pinnedMatches <= 0) return;

    timer.pinned = true;
    retainedCount += 1;

    if (pinnedMatches === 1) {
      pinnedSnapshotNoteCounts.delete(key);
    } else {
      pinnedSnapshotNoteCounts.set(key, pinnedMatches - 1);
    }
  });

  return retainedCount;
}


function applySnapshotImportForAccount(account, snapshot, candidates, options, now=Date.now(), capturedAtMs=now) {
  const accountName = normalizeAccountNameValue(account);
  const captureMs = Number.isFinite(Number(capturedAtMs)) ? Number(capturedAtMs) : now;
  const selected = (Array.isArray(candidates) ? candidates : []).filter(c => c && c.include !== false && c.name && Number(c.seconds) > 0);
  const newTimers = selected.map(c => snapshotCandidateToTimer(c, now, accountName, options.shouldStart, options.sound, snapshot, captureMs));
  const pinnedSnapshotNoteCounts = options.replaceExisting ? buildPinnedSnapshotNoteCounts(accountName) : new Map();
  let removedCount = 0;
  let preservedCount = 0;
  let retainedPinCount = 0;

  if (options.replaceExisting) {
    const nextTimers = [];

    timers.forEach(timer => {
      if (getAccount(timer) !== accountName) {
        nextTimers.push(timer);
        return;
      }

      if (shouldPreserveTimerDuringSnapshotReplace(timer, options)) {
        nextTimers.push(timer);
        preservedCount += 1;
        return;
      }

      removedCount += 1;
    });

    timers = nextTimers;
    retainedPinCount = retainPinnedSnapshotTimers(newTimers, pinnedSnapshotNoteCounts);
  }

  timers.push(...newTimers);
  updateSnapshotMetaFromParsedSnapshot(candidates.length, selected.length, captureMs, accountName, snapshot);
  const mapChanged = learnAccountTagMapping(snapshot, accountName);

  return {
    account: accountName,
    addedCount: newTimers.length,
    candidateCount: candidates.length,
    selectedCount: selected.length,
    removedCount,
    preservedCount,
    retainedPinCount,
    mapChanged,
    capturedAtMs: captureMs
  };
}

function saveSnapshotTimers() {
  const account = document.getElementById('snapshot-account').value.trim();
  if (!account) {
    toast('Choose an account first.', 'warning');
    document.getElementById('snapshot-account').focus();
    return;
  }

  if (!snapshotCandidates.length) {
    toast('Parse a snapshot first.', 'warning');
    document.getElementById('snapshot-json-text').focus();
    return;
  }

  const selected = selectedSnapshotCandidatesFromControls();
  if (!selected.length) {
    toast('Select at least one snapshot candidate.', 'warning');
    return;
  }

  const now = Date.now();
  const options = getSnapshotImportOptions('snapshot');
  const result = applySnapshotImportForAccount(account, snapshotLastSnapshot, snapshotCandidates, options, now);
  filterGroup = account;
  save();
  if (result.mapChanged) saveAccountTagMapQuietly();
  closeSnapshotModal();
  renderTimers();

  if (options.replaceExisting) {
    const preservedText = result.preservedCount ? `; ${result.preservedCount} manual timer${result.preservedCount === 1 ? '' : 's'} preserved` : '';
    const retainedPinText = result.retainedPinCount ? `; ${result.retainedPinCount} pin${result.retainedPinCount === 1 ? '' : 's'} retained` : '';
    toast(`${result.addedCount} snapshot timer${result.addedCount === 1 ? '' : 's'} added for ${account}; ${result.removedCount} existing timer${result.removedCount === 1 ? '' : 's'} replaced${preservedText}${retainedPinText}`, 'success');
  } else {
    toast(`${result.addedCount} snapshot timer${result.addedCount === 1 ? '' : 's'} added for ${account}`, 'success');
  }
}

// Re-parse if helper cooldown inclusion changes after a snapshot is already loaded.
document.getElementById('snapshot-include-helper').addEventListener('change', () => {
  if (!snapshotLastSnapshot) return;
  snapshotCandidates = parseAccountSnapshot(snapshotLastSnapshot);
  renderSnapshotCandidates();
  const metaUpdate = updateSnapshotMetaFromParsedSnapshot(snapshotCandidates.length);
  const mapChanged = metaUpdate ? learnAccountTagMapping(snapshotLastSnapshot, metaUpdate.account) : false;
  const mapText = mapChanged ? ' Tag mapping learned.' : '';
  const metaText = metaUpdate ? ` Updated ${metaUpdate.account} snapshot metadata.${mapText}` : ' Choose an account to update snapshot metadata.';
  setSnapshotStatus(`Parsed ${snapshotCandidates.length} timer candidate${snapshotCandidates.length === 1 ? '' : 's'}.${snapshotBuilderCapacityStatusText(snapshotLastSnapshot)}${metaText}`, snapshotCandidates.length ? 'ok' : 'warning');
  if (metaUpdate) {
    refreshSnapshotMetadataDependentUi();
    save();
    if (mapChanged) saveAccountTagMapQuietly();
  }
});


// Snapshot Collector UI helpers are loaded from app-snapshot-collector-ui.js.
async function saveBatchSnapshotTimers() {
  if (!batchSnapshotRows.length) {
    toast('Add at least one snapshot first.', 'warning');
    document.getElementById('batch-snapshot-json-text').focus();
    return;
  }

  const selectedRows = getImportableBatchSnapshotRows(true);
  const selectedCount = batchSnapshotRows.filter(row => row.include).length;
  if (!selectedRows.length) {
    toast(selectedCount ? 'Fix duplicate or unmapped rows before importing.' : 'Select at least one valid account snapshot.', 'warning');
    renderBatchSnapshotRows();
    return;
  }

  if (selectedRows.length !== selectedCount) {
    toast('Some selected rows need attention before import.', 'warning');
    renderBatchSnapshotRows();
    return;
  }

  const importNow = Date.now();
  const options = getSnapshotImportOptions('batch-snapshot');
  let totalAdded = 0;
  let totalRemoved = 0;
  let totalPreserved = 0;
  let totalPins = 0;
  let zeroTimerSnapshotCount = 0;
  let mapChanged = false;
  const importedAccounts = [];

  selectedRows.forEach(row => {
    const capturedAtMs = normalizeSnapshotCaptureMs(row.capturedAtMs, importNow);
    const zeroTimerSnapshot = !row.candidates.length;

    // A zero-timer snapshot is the current authoritative state for the account.
    // Apply the normal replacement rules so stale snapshot-derived timers are
    // removed while manual/manual-noted timers are preserved when requested.
    const result = applySnapshotImportForAccount(row.account, row.snapshot, row.candidates, options, importNow, capturedAtMs);
    totalAdded += result.addedCount;
    totalRemoved += result.removedCount;
    totalPreserved += result.preservedCount;
    totalPins += result.retainedPinCount;
    if (zeroTimerSnapshot) zeroTimerSnapshotCount += 1;
    mapChanged = mapChanged || result.mapChanged;
    importedAccounts.push(result.account);
  });

  filterGroup = importedAccounts.length === 1 ? importedAccounts[0] : 'All';
  const saveOk = await save();
  if (mapChanged) await saveAccountTagMapQuietly();
  renderTimers();

  if (!saveOk) {
    saveBatchSnapshotCollectorDraft();
    setBatchSnapshotStatus('Server save failed. Snapshot Collector recovery draft was kept in this browser.', 'error');
    toast('Import was applied in this browser, but the server save failed. Collector draft was kept for recovery.', 'warning');
    return;
  }

  clearBatchSnapshotCollectorDraft();
  closeBatchSnapshotModal();

  const replaceText = options.replaceExisting ? `; ${totalRemoved} existing replaced` : '';
  const preservedText = totalPreserved ? `; ${totalPreserved} manual timer${totalPreserved === 1 ? '' : 's'} preserved` : '';
  const pinText = totalPins ? `; ${totalPins} pin${totalPins === 1 ? '' : 's'} retained` : '';
  const metadataText = zeroTimerSnapshotCount ? `; ${zeroTimerSnapshotCount} zero-timer current state${zeroTimerSnapshotCount === 1 ? '' : 's'} recorded` : '';
  const mapText = mapChanged ? '; tag map updated' : '';
  toast(`${totalAdded} snapshot timer${totalAdded === 1 ? '' : 's'} imported for ${importedAccounts.length} account${importedAccounts.length === 1 ? '' : 's'}${replaceText}${preservedText}${pinText}${metadataText}${mapText}`, 'success');
}
