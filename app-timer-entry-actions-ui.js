// Timer entry action/save bridge helpers for the Clash Timers browser app.
// Loaded as a classic non-module script before the main inline app script.
// These functions intentionally read and mutate globals declared by the main inline script.

// ── Modal save handling ───────────────────────────────────────────────────
function saveTimer() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { document.getElementById('f-name').focus(); return; }
  const d = parseInt(document.getElementById('f-days').value)||0;
  const h = parseInt(document.getElementById('f-hours').value)||0;
  const m = parseInt(document.getElementById('f-mins').value)||0;
  const s = parseInt(document.getElementById('f-secs').value)||0;
  const duration = d*86400 + h*3600 + m*60 + s;
  if (duration <= 0) { toast('Duration must be > 0', 'warning'); return; }
  const account = document.getElementById('f-account').value.trim();
  const upgradeType = document.getElementById('f-upgrade-type').value.trim();
  const note = document.getElementById('f-note').value.trim();
  const repeat = document.getElementById('f-repeat').checked;
  const sound = document.getElementById('f-sound').checked;

  if (editingId) {
    const t = timers.find(x=>x.id===editingId);
    if (t) {
      const wasRunning = t.status === 'running';
      t.name = name; t.account = account; t.group = account; t.upgradeType = upgradeType; t.note = note; t.repeat = repeat; t.sound = sound;
      if (t.duration !== duration) {
        t.duration = duration;
        t.remaining = duration;
        t.status = 'stopped';
        t.endTime = null;
        t.expiredAt = null;
      }
    }
  } else {
    timers.push({
      id: newId(),
      name, duration, remaining: duration,
      account, group: account, upgradeType, note, repeat, sound,
      status: 'stopped',
      endTime: null,
      expiredAt: null,
      pinned: false,
      created: Date.now()
    });
  }
  save(); closeModal(); renderTimers();
  toast(editingId ? `Updated "${name}"` : `Timer "${name}" added`, 'success');
}

// ── Bulk Add Modal save handling ──────────────────────────────────────────
function saveBulkTimers() {
  const targetValue = document.getElementById('bulk-account').value.trim();
  const targetAccounts = resolveBulkTargetAccounts(targetValue);
  const targetLabel = getBulkTargetLabel(targetValue);

  if (!targetValue || !targetAccounts.length) {
    toast('Choose an account or account scope first.', 'warning');
    document.getElementById('bulk-account').focus();
    return;
  }

  const defaultType = document.getElementById('bulk-default-type').value.trim();
  const shouldStart = document.getElementById('bulk-start').checked;
  const sound = document.getElementById('bulk-sound').checked;
  const now = Date.now();
  const timerRows = [];

  for (const row of document.querySelectorAll('#bulk-rows .bulk-timer-row')) {
    const nameEl = row.querySelector('.bulk-name');
    const name = nameEl.value.trim();
    const rowType = row.querySelector('.bulk-type').value.trim();
    const upgradeType = rowType || defaultType;
    const note = row.querySelector('.bulk-note').value.trim();
    const d = parseInt(row.querySelector('.bulk-days').value) || 0;
    const h = parseInt(row.querySelector('.bulk-hours').value) || 0;
    const m = parseInt(row.querySelector('.bulk-mins').value) || 0;
    const s = parseInt(row.querySelector('.bulk-secs').value) || 0;
    const duration = d*86400 + h*3600 + m*60 + s;
    const rowHasAnything = name || rowType || note || d || h || m || s;

    if (!rowHasAnything) continue;

    if (!name) {
      toast('Each non-blank row needs an upgrade name.', 'warning');
      nameEl.focus();
      return;
    }

    if (duration <= 0) {
      toast(`Set a duration > 0 for "${name}".`, 'warning');
      row.querySelector('.bulk-days').focus();
      return;
    }

    timerRows.push({ name, duration, upgradeType, note });
  }

  if (!timerRows.length) {
    toast('Enter at least one timer row.', 'warning');
    const firstName = document.querySelector('#bulk-rows .bulk-name');
    if (firstName) firstName.focus();
    return;
  }

  const totalTimerCount = timerRows.length * targetAccounts.length;
  if (targetAccounts.length > 1) {
    const rowLabel = `${timerRows.length} timer row${timerRows.length === 1 ? '' : 's'}`;
    const accountLabel = `${targetAccounts.length} account${targetAccounts.length === 1 ? '' : 's'}`;
    const timerLabel = `${totalTimerCount} timer${totalTimerCount === 1 ? '' : 's'}`;
    const confirmed = window.confirm(`Add ${rowLabel} to ${accountLabel}?\n\nTarget: ${targetLabel}\nThis will create ${timerLabel}.`);
    if (!confirmed) return;
  }

  const newTimers = [];
  targetAccounts.forEach(account => {
    timerRows.forEach(row => {
      newTimers.push({
        id: newId(),
        name: row.name,
        duration: row.duration,
        remaining: row.duration,
        account,
        group: account,
        upgradeType: row.upgradeType,
        note: row.note,
        repeat: false,
        sound,
        status: shouldStart ? 'running' : 'stopped',
        endTime: shouldStart ? now + row.duration * 1000 : null,
        expiredAt: null,
        pinned: false,
        created: now
      });
    });
  });

  timers.push(...newTimers);

  if (targetAccounts.length === 1) {
    filterGroup = targetAccounts[0];
  } else {
    filterGroup = 'All';
  }

  save();
  closeBulkModal();
  renderTimers();

  if (targetAccounts.length === 1) {
    toast(`${newTimers.length} timer${newTimers.length === 1 ? '' : 's'} added for ${targetAccounts[0]}`, 'success');
  } else {
    toast(`${newTimers.length} timer${newTimers.length === 1 ? '' : 's'} added for ${targetAccounts.length} accounts`, 'success');
  }
}

// ── Quick add ─────────────────────────────────────────────────────────────
function quickAdd() {
  const account = document.getElementById('q-account').value.trim();
  const upgradeType = document.getElementById('q-upgrade-type').value.trim();
  const name = document.getElementById('q-name').value.trim();
  if (!name) { document.getElementById('q-name').focus(); return; }
  const d = parseInt(document.getElementById('q-days').value)||0;
  const h = parseInt(document.getElementById('q-hours').value)||0;
  const m = parseInt(document.getElementById('q-mins').value)||0;
  const s = parseInt(document.getElementById('q-secs').value)||0;
  const duration = d*86400 + h*3600 + m*60 + s;
  if (duration <= 0) { toast('Set a duration > 0', 'warning'); return; }
  const id = newId();
  timers.push({ id, name, duration, remaining: duration, account, group: account, upgradeType, note:'', repeat:false, sound:true, status:'stopped', endTime:null, expiredAt:null, pinned:false, created:Date.now() });
  startTimer(id);
  document.getElementById('q-name').value = '';
  document.getElementById('q-days').value = '0';
  document.getElementById('q-hours').value = '0';
  document.getElementById('q-mins').value = '0';
  document.getElementById('q-secs').value = '0';
  document.getElementById('q-name').focus();
  toast(`▶ "${name}" started`, 'success');
}
