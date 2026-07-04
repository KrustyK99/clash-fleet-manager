// Account summary calculation and badge helpers extracted from index.html.
// Classic browser script: these functions intentionally read existing global state.

function accountSummaryTimerLabel(t) {
  if (t.status === 'expired' || Number(t.remaining) <= 0) return 'Ready';
  if (t.status === 'running') return fmt(t.remaining);
  if (t.status === 'paused') return `Paused ${fmt(t.remaining)}`;
  if (t.status === 'stopped') return 'Stopped';
  return fmt(t.remaining);
}

function accountSummaryTimerSort(list) {
  const statusOrder = { expired:0, running:1, paused:2, stopped:3 };
  return [...list].sort((a,b) => {
    const aw = dueWindow(a).order;
    const bw = dueWindow(b).order;
    if (aw !== bw) return aw - bw;

    const as = statusOrder[a.status] ?? 9;
    const bs = statusOrder[b.status] ?? 9;
    if (as !== bs) return as - bs;

    if (Number(a.remaining) !== Number(b.remaining)) return Number(a.remaining) - Number(b.remaining);
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric:true, sensitivity:'base' });
  });
}

function isActiveAccountWorkTimer(t) {
  const status = String(t.status || '').toLowerCase();
  return Number(t.remaining) > 0 && (status === 'running' || status === 'paused');
}

function getTimerSnapshotBucket(t) {
  const explicit = String(t && t.snapshotBucket ? t.snapshotBucket : '').trim();
  if (explicit) return explicit;

  const note = String(t && t.note ? t.note : '');
  const match = note.match(/^Snapshot(?:\s+[^|]+)?\s+\|\s+([^|]+)\.(?:timer|helper_cooldown)\s+\|/i);
  return match ? snapshotGetBucket(match[1].trim()) : '';
}

function getExplicitTimerWorkQueue(t) {
  const explicit = String(t && t.workQueue ? t.workQueue : '').trim();
  if (explicit) return explicit;

  const bucket = getTimerSnapshotBucket(t);
  if (bucket) return snapshotInferWorkQueue(bucket, 'timer');

  return '';
}

function isGuardianSnapshotBucket(bucket) {
  const normalized = String(bucket || '').trim().toLowerCase();
  return normalized === 'guardian' || normalized === 'guardians';
}

function isGuardianWorkTimer(t) {
  const snapshotTimerKey = String(t && t.snapshotTimerKey ? t.snapshotTimerKey : '').trim().toLowerCase();
  const note = String(t && t.note ? t.note : '');

  // Helper cooldowns can also come from snapshot metadata, but they do not consume builders.
  if (snapshotTimerKey === 'helper_cooldown' || /\.helper_cooldown\s+\|/i.test(note)) return false;

  const explicitBucket = String(t && t.snapshotBucket ? t.snapshotBucket : '').trim();
  if (isGuardianSnapshotBucket(explicitBucket)) return true;

  const inferredBucket = getTimerSnapshotBucket(t);
  if (isGuardianSnapshotBucket(inferredBucket)) return true;

  const snapshotPath = String(t && t.snapshotPath ? t.snapshotPath : '').trim().toLowerCase();
  if (/^guardians?(?:\[|\.|$)/.test(snapshotPath)) return true;

  const type = getUpgradeType(t).toLowerCase();
  if (type === 'guardian' || type === 'guardians') return true;

  const name = String(t && t.name ? t.name : '').trim().toLowerCase();
  return /\bguardians?\b/.test(name);
}

function isHomeBuilderWorkTimer(t) {
  if (!isActiveAccountWorkTimer(t)) return false;

  // Guardians use home builders. Check this before trusting an older saved workQueue
  // value so snapshot timers previously classified as `other` are counted correctly.
  if (isGuardianWorkTimer(t)) return true;

  const workQueue = getExplicitTimerWorkQueue(t);
  if (workQueue) return workQueue === 'home_builder';

  const type = getUpgradeType(t).toLowerCase();
  return type === 'builder' || type === 'hero';
}

function isBuilderBaseBuilderWorkTimer(t) {
  if (!isActiveAccountWorkTimer(t)) return false;

  const workQueue = getExplicitTimerWorkQueue(t);
  if (workQueue) return workQueue === 'builder_base_builder';

  return getUpgradeType(t).toLowerCase() === 'builder base';
}

function timerIsActiveUpgradeType(t, type) {
  return getUpgradeType(t).toLowerCase() === String(type || '').toLowerCase() && isActiveAccountWorkTimer(t);
}

function createAccountSummaryRow() {
  return {
    running:0,
    paused:0,
    stopped:0,
    expired:0,
    timers:[],
    homeBuilderActive:0,
    builderBaseBuilderActive:0,
    hasActiveLab:false,
    hasActivePet:false
  };
}

function buildAccountSummaryRows() {
  const accounts = new Map();

  getVisibleAccountsForCurrentView().forEach(account => {
    if (account) accounts.set(account, createAccountSummaryRow());
  });

  getViewScopedTimers().forEach(t => {
    const account = getAccount(t) || 'Unassigned';
    if (!accounts.has(account)) accounts.set(account, createAccountSummaryRow());
    const row = accounts.get(account);
    row.timers.push(t);
    if (t.status === 'running') row.running++;
    else if (t.status === 'paused') row.paused++;
    else if (t.status === 'stopped') row.stopped++;
    else if (t.status === 'expired') row.expired++;
  });

  accounts.forEach(row => {
    row.homeBuilderActive = row.timers.filter(isHomeBuilderWorkTimer).length;
    row.builderBaseBuilderActive = row.timers.filter(isBuilderBaseBuilderWorkTimer).length;
    row.hasActiveLab = row.timers.some(t => timerIsActiveUpgradeType(t, 'Lab'));
    row.hasActivePet = row.timers.some(t => timerIsActiveUpgradeType(t, 'Pet'));
  });

  return Array.from(accounts.entries()).sort((a,b)=>a[0].localeCompare(b[0], undefined, { numeric:true, sensitivity:'base' }));
}

function accountSummaryBuilderTitle(account, c) {
  const capacity = getAccountBuilderCapacity(account);
  const homeTotal = normalizeOptionalNonNegativeInt(capacity.homeTotal);
  const builderBaseTotal = normalizeOptionalNonNegativeInt(capacity.builderBaseTotal);
  const homeActive = Number(c.homeBuilderActive) || 0;
  const builderBaseActive = Number(c.builderBaseBuilderActive) || 0;

  const homeText = homeTotal === null
    ? `Home builders: ${homeActive} active; total unknown until a snapshot is loaded.`
    : `Home builders: ${homeActive}/${homeTotal} active, ${Math.max(0, homeTotal - homeActive)} idle.`;

  const builderBaseText = builderBaseTotal === null
    ? `Builder Base builders: ${builderBaseActive} active; total unknown until a snapshot is loaded.`
    : `Builder Base builders: ${builderBaseActive}/${builderBaseTotal} active, ${Math.max(0, builderBaseTotal - builderBaseActive)} idle.`;

  return `${homeText} ${builderBaseText}`;
}

function accountSummaryBuilderBadgeHtml(account, c) {
  const homeActive = Number(c.homeBuilderActive) || 0;
  const builderBaseActive = Number(c.builderBaseBuilderActive) || 0;
  const label = `${homeActive}/${builderBaseActive}`;
  const title = accountSummaryBuilderTitle(account, c);

  return `
    <span class="account-summary-builder-badge" title="${esc(title)}" aria-label="${esc(title)}">
      <span class="account-summary-builder-icon" aria-hidden="true">🛠</span>${esc(label)}
    </span>
  `;
}

function accountPillBuilderBadgeHtml(account, c) {
  const capacity = getAccountBuilderCapacity(account);
  const homeTotal = normalizeOptionalNonNegativeInt(capacity.homeTotal);
  const builderBaseTotal = normalizeOptionalNonNegativeInt(capacity.builderBaseTotal);
  const homeActive = Number(c && c.homeBuilderActive) || 0;
  const builderBaseActive = Number(c && c.builderBaseBuilderActive) || 0;
  const homeTotalLabel = homeTotal === null ? '?' : String(homeTotal);
  const builderBaseTotalLabel = builderBaseTotal === null ? '?' : String(builderBaseTotal);
  const title = accountSummaryBuilderTitle(account, c || createAccountSummaryRow());
  const knownTotals = homeTotal !== null || builderBaseTotal !== null;
  const hasIdleHome = homeTotal !== null && homeActive < homeTotal;
  const hasIdleBuilderBase = builderBaseTotal !== null && builderBaseActive < builderBaseTotal;
  const statusClass = !knownTotals ? 'unknown' : (hasIdleHome || hasIdleBuilderBase ? 'has-idle' : 'all-busy');

  return `
    <span class="account-pill-builder-count ${statusClass}" title="${esc(title)}" aria-label="${esc(title)}">
      <span class="account-pill-builder-home-icon" aria-hidden="true">🏠</span>${esc(`${homeActive}/${homeTotalLabel}`)}<span class="account-pill-builder-count-separator" aria-hidden="true">·</span>${esc(`${builderBaseActive}/${builderBaseTotalLabel}`)}
    </span>
  `;
}

function getAccountGapTypes(c) {
  const gaps = [];
  if (!c.hasActiveLab) gaps.push({ type:'Lab', icon:'🧪', label:'No active lab timer' });
  if (!c.hasActivePet) gaps.push({ type:'Pet', icon:'🐾', label:'No active pet timer' });
  return gaps;
}

function accountGapBadgesHtml(c) {
  const gaps = getAccountGapTypes(c);
  if (!gaps.length) return '';
  return `
    <span class="account-summary-gap-badges" aria-label="Missing active work">
      ${gaps.map(g => `<span class="account-summary-gap-badge" title="${esc(g.label)}" aria-label="${esc(g.label)}">${g.icon}</span>`).join('')}
    </span>
  `;
}

function getMissingAccounts(rows, type) {
  const property = type === 'Lab' ? 'hasActiveLab' : 'hasActivePet';
  return rows.filter(([,c]) => !c[property]).map(([account]) => account);
}
