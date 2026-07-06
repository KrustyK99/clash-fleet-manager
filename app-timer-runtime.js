// Timer runtime/tick helpers extracted from index.html.
// Classic browser script: these functions intentionally read and update existing global app state.

function renderTimersSafely() {
  // Keep countdown displays updating even while a mobile native <select> picker is open.
  // The flicker fix lives in populateAccountControls(), which avoids rebuilding the
  // account <select> options while the picker is active. Freezing the whole render here
  // made the timers appear stopped until focus moved away from the select.
  // Exception: while typing in the inline time-adjust fields, defer the full re-render
  // so mobile browsers do not drop focus or reset partially-entered values every tick.
  if (inlineAdjustEditing) {
    renderQueuedUntilAdjustEditEnds = true;
    return;
  }
  renderTimers();
}

// ── Audio ─────────────────────────────────────────────────────────────────
function playAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beepTimes = [0, 0.15, 0.3];
    beepTimes.forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + t + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + t + 0.12);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.15);
    });
  } catch(e) {}
}

// ── Timer logic ────────────────────────────────────────────────────────────
function getVisibleTimerIdList() {
  return getVisibleTimerList().map(t => String(t.id));
}

function timerIdListsMatch(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

function getTimerCardElement(t) {
  if (!t || t.id === undefined || t.id === null) return null;
  return document.getElementById(`tc-${t.id}`);
}

function updateTimerCardRuntimeFields(t) {
  const card = getTimerCardElement(t);
  if (!card) return false;

  const remainingEl = card.querySelector('[data-timer-remaining]');
  if (remainingEl) remainingEl.textContent = fmt(t.remaining);

  const statusEl = card.querySelector('[data-timer-status]');
  if (statusEl) statusEl.textContent = `of ${fmtDuration(t.duration)} · ${getTimerStatusLabel(t)}`;

  const secondaryEl = card.querySelector('[data-timer-secondary]');
  if (secondaryEl) {
    const secondaryText = getTimerSecondaryText(t);
    if (secondaryText) secondaryEl.textContent = `⇄ ${secondaryText}`;
  }

  const progressEl = card.querySelector('[data-timer-progress]');
  if (progressEl) progressEl.style.width = `${getTimerProgressPercent(t)}%`;

  const dueEl = card.querySelector('[data-timer-due]');
  if (dueEl) {
    const due = dueWindow(t);
    dueEl.className = `timer-due-badge ${due.cls}`;
    dueEl.title = due.label;
    dueEl.textContent = compactMode ? due.key : due.label;
  }

  return true;
}

function refreshVisibleTimerRuntimeFields(changedTimers) {
  (changedTimers || []).forEach(updateTimerCardRuntimeFields);
}

function tick() {
  let needsFullRender = false;
  let needsSave = false;
  const changedTimers = [];
  const beforeVisibleTimerIds = getVisibleTimerIdList();
  const now = Date.now();

  timers.forEach(t => {
    if (t.status !== 'running') return;

    const beforeDueKey = dueWindow(t).key;
    const rem = Math.ceil((t.endTime - now) / 1000);
    if (rem !== t.remaining) {
      t.remaining = Math.max(0, rem);
      changedTimers.push(t);
      if (dueWindow(t).key !== beforeDueKey) needsFullRender = true;
    }

    if (t.remaining <= 0) {
      if (t.repeat) {
        t.remaining = t.duration;
        t.expiredAt = null;
        t.endTime = now + t.duration * 1000;
        if (t.sound) playAlert();
        toast(`↺ ${t.name} restarted`, 'success');
      } else {
        t.status = 'expired';
        t.expiredAt = Number(t.endTime) || now;
        t.endTime = null;
        if (t.sound) playAlert();
        toast(`⏰ ${t.name} expired!`, 'expired');
      }
      needsSave = true;
      needsFullRender = true;
    }
  });

  // Do not save every one-second countdown tick to the NAS.
  // Running timers can be recalculated from endTime on any device.
  if (needsSave) save();

  if (!changedTimers.length && !needsFullRender) return;

  if (!needsFullRender) {
    const afterVisibleTimerIds = getVisibleTimerIdList();
    needsFullRender = !timerIdListsMatch(beforeVisibleTimerIds, afterVisibleTimerIds);
  }

  if (needsFullRender) {
    renderTimersSafely();
  } else {
    refreshVisibleTimerRuntimeFields(changedTimers);
  }
}
