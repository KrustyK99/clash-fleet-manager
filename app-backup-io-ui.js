// Backup/import/export UI helpers.
// ── Import / Export ───────────────────────────────────────────────────────
function exportTimers() {
  const data = JSON.stringify({
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    source: 'clash-timers-nas',
    timers,
    accountSnapshotMeta,
    snapshotFreshnessSettings,
    accountTagMap
  }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data],{type:'application/json'}));
  a.download = `clash-timers-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast('Timers exported', 'success');
}

function importTimers(evt) {
  const file = evt.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const imported = Array.isArray(parsed) ? parsed : parsed.timers;
      if (!Array.isArray(imported)) throw new Error();
      const importedSnapshotMeta = Array.isArray(parsed) ? {} : normalizeAccountSnapshotMeta(parsed.accountSnapshotMeta || parsed.snapshotMeta);
      const importedAccountTagMap = Array.isArray(parsed) ? {} : normalizeAccountTagMap(parsed.accountTagMap || (parsed.settings && parsed.settings.accountTagMap));

      const validStatuses = new Set(['running','paused','stopped','expired']);
      const valid = imported.filter(t => t && t.name && Number(t.duration) > 0).map(t => ({...t}));
      const now = Date.now();

      valid.forEach(t => {
        if (!t.id) t.id = newId();
        t.duration = Number(t.duration);
        t.remaining = Number(t.remaining);
        if (!Number.isFinite(t.remaining) || t.remaining < 0 || t.remaining > t.duration) t.remaining = t.duration;
        if (!validStatuses.has(t.status)) t.status = 'stopped';
        if (t.status === 'running' && !t.endTime) {
          t.endTime = now + t.remaining * 1000;
        }
        if (t.status === 'expired' && !t.expiredAt && t.endTime) t.expiredAt = Number(t.endTime) || null;
        if (t.status !== 'running') t.endTime = null;
        if (!t.created) t.created = now;
        if (t.sound === undefined) t.sound = true;
        if (t.account === undefined && t.group !== undefined) t.account = t.group;
        if (t.group === undefined && t.account !== undefined) t.group = t.account;
        if (t.account === undefined) t.account = '';
        if (t.group === undefined) t.group = '';
        if (t.upgradeType === undefined) t.upgradeType = '';
        if (t.note === undefined) t.note = '';
        if (t.expiredAt === undefined) t.expiredAt = null;
        if (t.finishedAt !== undefined && !t.expiredAt) t.expiredAt = t.finishedAt;
      });

      // Merge: skip duplicates by id
      const existingIds = new Set(timers.map(t=>t.id));
      const newOnes = valid.filter(t=>!existingIds.has(t.id));
      timers.push(...newOnes);
      accountSnapshotMeta = normalizeAccountSnapshotMeta({ ...accountSnapshotMeta, ...importedSnapshotMeta });
      const mergedAccountTagMap = normalizeAccountTagMap({ ...accountTagMap, ...importedAccountTagMap });
      const accountTagMapChanged = JSON.stringify(mergedAccountTagMap) !== JSON.stringify(normalizeAccountTagMap(accountTagMap));
      accountTagMap = mergedAccountTagMap;
      normalizeTimersAfterLoad();
      save();
      if (accountTagMapChanged) saveAccountTagMapQuietly();
      renderTimers();
      toast(`Imported ${newOnes.length} timer(s)`, 'success');
    } catch(e) { toast('Invalid file', 'warning'); }
  };
  reader.readAsText(file);
  evt.target.value = '';
}

