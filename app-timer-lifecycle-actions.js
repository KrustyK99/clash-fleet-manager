// Timer lifecycle/control action bridge extracted from index.html.
// Classic browser script: these functions intentionally read and update existing global app state.

// ── Timer lifecycle/control actions ───────────────────────────────────────
function startTimer(id) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  if (t.remaining <= 0) t.remaining = t.duration;
  t.status = 'running';
  t.expiredAt = null;
  t.endTime = Date.now() + t.remaining * 1000;
  save(); renderTimers();
}

function pauseTimer(id) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  t.status = 'paused';
  t.endTime = null;
  save(); renderTimers();
}

function resetTimer(id) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  t.status = 'stopped';
  t.remaining = t.duration;
  t.endTime = null;
  t.expiredAt = null;
  save(); renderTimers();
}

function deleteTimer(id) {
  const t = timers.find(x => String(x.id) === String(id));
  const label = t ? `"${t.name}"` : 'this timer';
  if (!confirm(`Delete ${label}?`)) return;

  timers = timers.filter(x => String(x.id) !== String(id));
  selectedTimerIds.delete(String(id));
  if (String(timerCopySourceId) === String(id)) timerCopySourceId = null;
  save(); renderTimers();
}

function startAll() {
  let changed = false;
  getViewScopedTimers().filter(t => t.status === 'stopped' || t.status === 'paused').forEach(t => {
    if (t.remaining <= 0) t.remaining = t.duration;
    t.status = 'running';
    t.expiredAt = null;
    t.endTime = Date.now() + t.remaining * 1000;
    changed = true;
  });
  if (changed) { save(); renderTimers(); }
}

function pauseAll() {
  let changed = false;
  getViewScopedTimers().filter(t => t.status === 'running').forEach(t => {
    t.status = 'paused';
    t.endTime = null;
    changed = true;
  });
  if (changed) { save(); renderTimers(); }
}

function resetExpired() {
  let changed = false;
  getViewScopedTimers().filter(t => t.status === 'expired').forEach(t => {
    t.status = 'stopped';
    t.remaining = t.duration;
    t.endTime = null;
    t.expiredAt = null;
    changed = true;
  });
  if (changed) save();
  renderTimers();
}
