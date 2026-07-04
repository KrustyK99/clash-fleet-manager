// Fleet Summary modal and dashboard rendering helpers extracted from index.html.
// Classic browser script: these functions intentionally read and update existing global app state.

// ── Fleet summary modal ───────────────────────────────────────────────────
function getFleetSummaryScroller() {
  const modal = document.getElementById('fleet-summary-modal');
  return modal ? modal.querySelector('.fleet-summary-modal') : null;
}

function openFleetSummaryModal() {
  const modal = document.getElementById('fleet-summary-modal');
  if (!modal) return;
  renderFleetSummaryModal();
  modal.style.display = 'flex';
  const scroller = getFleetSummaryScroller();
  if (scroller) scroller.scrollTop = 0;
  updateScrollTopButton();
  updateFleetSummaryFloatingButtons();
}

function closeFleetSummaryModal() {
  closeFleetSummarySectionMenu();
  const modal = document.getElementById('fleet-summary-modal');
  if (modal) modal.style.display = 'none';
  updateFleetSummaryFloatingButtons();
  updateScrollTopButton();
}

function fleetSummaryModalIsOpen() {
  const modal = document.getElementById('fleet-summary-modal');
  return !!modal && modal.style.display !== 'none';
}

function updateFleetSummaryFloatingButtons() {
  const scrollTopBtn = document.getElementById('fleet-scroll-top-btn');
  if (!scrollTopBtn) return;

  const isOpen = fleetSummaryModalIsOpen();
  const scroller = getFleetSummaryScroller();
  const shouldShow = isOpen
    && !!scroller
    && scroller.scrollHeight > scroller.clientHeight + 1
    && scroller.scrollTop > 80;

  if (!isOpen) closeFleetSummarySectionMenu();
  scrollTopBtn.classList.toggle('visible', shouldShow);
}

function scrollFleetSummaryToTop() {
  closeFleetSummarySectionMenu();
  const scroller = getFleetSummaryScroller();
  if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(updateFleetSummaryFloatingButtons, 250);
}

function closeFleetSummarySectionMenu() {
  const menu = document.getElementById('fleet-section-menu');
  const button = document.getElementById('fleet-section-menu-btn');
  if (menu) menu.classList.remove('visible');
  if (button) button.setAttribute('aria-expanded', 'false');
}

function toggleFleetSummarySectionMenu(event) {
  if (event) event.stopPropagation();
  if (!fleetSummaryModalIsOpen()) return;
  const menu = document.getElementById('fleet-section-menu');
  const button = document.getElementById('fleet-section-menu-btn');
  if (!menu) return;
  const nextVisible = !menu.classList.contains('visible');
  menu.classList.toggle('visible', nextVisible);
  if (button) button.setAttribute('aria-expanded', nextVisible ? 'true' : 'false');
}

function scrollFleetSummaryToSection(sectionId) {
  const scroller = getFleetSummaryScroller();
  const target = document.getElementById(sectionId);
  closeFleetSummarySectionMenu();
  if (!scroller || !target) return;

  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = Math.max(0, scroller.scrollTop + targetRect.top - scrollerRect.top - 8);
  scroller.scrollTo({ top, behavior: 'smooth' });
  setTimeout(updateFleetSummaryFloatingButtons, 250);
}

function closeFleetSummarySectionMenuOnOutsideClick(event) {
  if (!fleetSummaryModalIsOpen()) return;
  const target = event && event.target;
  const insideMenu = target && target.closest && target.closest('.fleet-section-menu-wrap');
  if (!insideMenu) closeFleetSummarySectionMenu();
}

async function reloadFleetSummary() {
  closeFleetSummarySectionMenu();
  await reloadTimerFile();
  renderFleetSummaryModal();
  updateFleetSummaryFloatingButtons();
}

function setupFleetSummaryFloatingControls() {
  const scroller = getFleetSummaryScroller();
  if (scroller) scroller.addEventListener('scroll', updateFleetSummaryFloatingButtons, { passive: true });
  window.addEventListener('resize', updateFleetSummaryFloatingButtons);
  document.addEventListener('click', closeFleetSummarySectionMenuOnOutsideClick);
  updateFleetSummaryFloatingButtons();
}

function fleetAccountArg(account) {
  return esc(JSON.stringify(String(account || '')));
}

function fleetPercent(value, max) {
  const n = Math.max(0, Number(value) || 0);
  if (n <= 0) return 0;
  const m = Math.max(1, Number(max) || 1);
  return Math.max(2, Math.min(100, Math.round((n / m) * 100)));
}

function fleetActiveTimer(t) {
  const status = String(t && t.status || '').toLowerCase();
  if (status === 'stopped') return false;
  return status === 'running' || status === 'paused' || status === 'expired' || Number(t && t.remaining) <= 0;
}

function fleetDueBucket(t) {
  if (String(t && t.status || '').toLowerCase() === 'stopped') return null;
  const remaining = Math.max(0, Number(t && t.remaining) || 0);
  if (String(t && t.status || '').toLowerCase() === 'expired' || remaining <= 0) return 'ready';
  if (remaining <= 8 * 3600) return 'next8';
  if (remaining <= 24 * 3600) return 'next24';
  if (remaining <= 3 * 86400) return 'next3d';
  if (remaining <= 7 * 86400) return 'next7d';
  return 'later';
}

function fleetDueBucketDefs() {
  return [
    { key:'ready', label:'Ready now', cls:'danger' },
    { key:'next8', label:'0–8h', cls:'warn' },
    { key:'next24', label:'8–24h', cls:'' },
    { key:'next3d', label:'1–3d', cls:'' },
    { key:'next7d', label:'3–7d', cls:'' },
    { key:'later', label:'7d+', cls:'muted' }
  ];
}

function fleetStatusClassForCapacity(active, total) {
  const capacity = normalizeOptionalNonNegativeInt(total);
  const n = Number(active) || 0;
  if (capacity === null) return n > 0 ? 'good' : 'muted';
  if (n >= capacity) return 'good';
  if (n === 0) return 'danger';
  return 'warn';
}

function fleetQueuePill(active, total, labelWhenNone='—') {
  const capacity = normalizeOptionalNonNegativeInt(total);
  const n = Number(active) || 0;
  const cls = fleetStatusClassForCapacity(n, capacity);
  const text = capacity === null ? (n ? String(n) : labelWhenNone) : `${n}/${capacity}`;
  return `<span class="fleet-pill ${cls}">${esc(text)}</span>`;
}

function fleetBinaryPill(active, yesLabel='On', noLabel='Off') {
  return `<span class="fleet-pill ${active ? 'good' : 'danger'}">${esc(active ? yesLabel : noLabel)}</span>`;
}

function fleetSnapshotPill(account) {
  const freshness = getSnapshotFreshness(account);
  const cls = freshness.key === 'fresh' ? 'good' : (freshness.key === 'aging' ? 'warn' : (freshness.key === 'stale' ? 'danger' : 'muted'));
  const label = freshness.compactAgeLabel || '—';
  return `<span class="fleet-pill ${cls}" title="${esc(freshness.title)}" aria-label="${esc(freshness.title)}">${esc(label)}</span>`;
}

function fleetKpiCard(label, value, note='', cls='') {
  return `
    <div class="fleet-kpi-card ${cls}">
      <div class="fleet-kpi-label">${esc(label)}</div>
      <div class="fleet-kpi-value">${esc(value)}</div>
      ${note ? `<div class="fleet-kpi-note">${esc(note)}</div>` : ''}
    </div>
  `;
}

function fleetAttentionItem(icon, label, detail, count, cls='') {
  return `
    <div class="fleet-attention-item ${cls}">
      <div class="fleet-attention-icon" aria-hidden="true">${icon}</div>
      <div class="fleet-attention-main">
        <div class="fleet-attention-label">${esc(label)}</div>
        <div class="fleet-attention-detail">${esc(detail)}</div>
      </div>
      <div class="fleet-attention-count">${esc(count)}</div>
    </div>
  `;
}

function fleetSelectAccount(account) {
  const name = String(account || '').trim();
  if (!name) return;
  filterGroup = name;
  expandedAccount = name;
  closeFleetSummaryModal();
  renderTimers();
}

function buildFleetSummaryData() {
  const rows = buildAccountSummaryRows();
  const viewTimers = getViewScopedTimers();
  const activeTimers = viewTimers.filter(fleetActiveTimer);
  const pinnedCount = viewTimers.filter(isTimerPinned).length;
  const dueCounts = Object.fromEntries(fleetDueBucketDefs().map(def => [def.key, 0]));

  activeTimers.forEach(t => {
    const key = fleetDueBucket(t);
    if (key && Object.prototype.hasOwnProperty.call(dueCounts, key)) dueCounts[key] += 1;
  });

  const missingLab = getMissingAccounts(rows, 'Lab');
  const missingPet = getMissingAccounts(rows, 'Pet');
  const staleOrUnknown = rows.filter(([account]) => {
    const key = getSnapshotFreshness(account).key;
    return key === 'stale' || key === 'unknown';
  }).map(([account]) => account);

  const idleHome = [];
  const idleBuilderBase = [];
  let homeActiveTotal = 0;
  let homeCapacityTotal = 0;
  let knownHomeCapacityAccounts = 0;
  let builderBaseActiveTotal = 0;
  let builderBaseCapacityTotal = 0;
  let knownBuilderBaseCapacityAccounts = 0;

  rows.forEach(([account, c]) => {
    const capacity = getAccountBuilderCapacity(account);
    const homeTotal = normalizeOptionalNonNegativeInt(capacity.homeTotal);
    const builderBaseTotal = normalizeOptionalNonNegativeInt(capacity.builderBaseTotal);
    const homeActive = Number(c.homeBuilderActive) || 0;
    const builderBaseActive = Number(c.builderBaseBuilderActive) || 0;

    homeActiveTotal += homeActive;
    builderBaseActiveTotal += builderBaseActive;

    if (homeTotal !== null) {
      knownHomeCapacityAccounts += 1;
      homeCapacityTotal += homeTotal;
      if (homeActive < homeTotal) idleHome.push({ account, active:homeActive, total:homeTotal, idle:homeTotal - homeActive });
    }

    if (builderBaseTotal !== null) {
      knownBuilderBaseCapacityAccounts += 1;
      builderBaseCapacityTotal += builderBaseTotal;
      if (builderBaseActive < builderBaseTotal) idleBuilderBase.push({ account, active:builderBaseActive, total:builderBaseTotal, idle:builderBaseTotal - builderBaseActive });
    }
  });

  const nextTimers = activeTimers
    .slice()
    .sort((a,b) => {
      const ao = dueWindow(a).order;
      const bo = dueWindow(b).order;
      if (ao !== bo) return ao - bo;
      return (Number(a.remaining) || 0) - (Number(b.remaining) || 0);
    })
    .slice(0, 14);

  return {
    rows,
    viewTimers,
    activeTimers,
    pinnedCount,
    dueCounts,
    missingLab,
    missingPet,
    staleOrUnknown,
    idleHome,
    idleBuilderBase,
    homeActiveTotal,
    homeCapacityTotal,
    knownHomeCapacityAccounts,
    builderBaseActiveTotal,
    builderBaseCapacityTotal,
    knownBuilderBaseCapacityAccounts,
    nextTimers
  };
}

function fleetSnapshotAgeBadgeHtml(account) {
  const freshness = getSnapshotFreshness(account);
  const label = freshness.compactAgeLabel || 'no snap';
  return `<span class="fleet-bar-snapshot-age ${freshness.cls}" title="${esc(freshness.title)}" aria-label="${esc(freshness.title)}">${esc(label)}</span>`;
}

function fleetSnapshotAgeSortValue(account) {
  const name = String(account || '').trim();
  const meta = name ? accountSnapshotMeta[name] : null;
  const loadedMs = Date.parse((meta && meta.lastLoadedAt) || '');
  return Number.isFinite(loadedMs) ? Math.max(0, Date.now() - loadedMs) : Number.POSITIVE_INFINITY;
}

function fleetHomeBuilderAttention(row) {
  const [account, c] = row;
  const capacity = getAccountBuilderCapacity(account);
  const total = normalizeOptionalNonNegativeInt(capacity.homeTotal);
  if (total === null) return 0;
  const active = Number(c.homeBuilderActive) || 0;
  return Math.max(0, total - active);
}

function renderFleetHomeBuilderBars(rows) {
  if (!rows.length) return '<div class="fleet-empty">No accounts in this view.</div>';
  const sorted = rows.slice().sort((a,b) => {
    const attentionDelta = fleetHomeBuilderAttention(b) - fleetHomeBuilderAttention(a);
    if (attentionDelta !== 0) return attentionDelta;

    const aAge = fleetSnapshotAgeSortValue(a[0]);
    const bAge = fleetSnapshotAgeSortValue(b[0]);
    if (!Number.isFinite(aAge) && Number.isFinite(bAge)) return -1;
    if (Number.isFinite(aAge) && !Number.isFinite(bAge)) return 1;
    if (Number.isFinite(aAge) && Number.isFinite(bAge) && bAge !== aAge) return bAge - aAge;

    return a[0].localeCompare(b[0], undefined, { numeric:true, sensitivity:'base' });
  });
  const maxActive = Math.max(1, ...sorted.map(([,c]) => Number(c.homeBuilderActive) || 0));

  return `
    <div class="fleet-bar-list">
      ${sorted.map(([account, c]) => {
        const capacity = getAccountBuilderCapacity(account);
        const total = normalizeOptionalNonNegativeInt(capacity.homeTotal);
        const active = Number(c.homeBuilderActive) || 0;
        const cls = fleetStatusClassForCapacity(active, total);
        const denom = total === null ? maxActive : Math.max(1, total);
        const label = total === null ? `${active}` : `${active}/${total}`;
        const builderTitle = accountSummaryBuilderTitle(account, c);
        const freshness = getSnapshotFreshness(account);
        const accountArg = fleetAccountArg(account);
        return `
          <div class="fleet-bar-row" title="${esc(`${builderTitle} ${freshness.title}`)}">
            <span class="fleet-bar-label fleet-bar-account-label">
              <a href="#" class="fleet-bar-account-name fleet-bar-account-link" onclick="fleetSelectAccount(${accountArg}); return false;" title="Filter main page to ${esc(account)}">${esc(account)}</a>
              ${fleetSnapshotAgeBadgeHtml(account)}
            </span>
            <span class="fleet-bar-track"><span class="fleet-bar-fill ${cls}" style="width:${fleetPercent(active, denom)}%"></span></span>
            <span class="fleet-bar-value">${esc(label)}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderFleetDueBars(dueCounts) {
  const defs = fleetDueBucketDefs();
  const maxCount = Math.max(1, ...defs.map(def => Number(dueCounts[def.key]) || 0));
  return `
    <div class="fleet-due-grid">
      ${defs.map(def => {
        const count = Number(dueCounts[def.key]) || 0;
        return `
          <div class="fleet-bar-row">
            <span class="fleet-bar-label">${esc(def.label)}</span>
            <span class="fleet-bar-track"><span class="fleet-bar-fill ${def.cls}" style="width:${fleetPercent(count, maxCount)}%"></span></span>
            <span class="fleet-bar-value">${count}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function fleetMatrixDefaultSortDir(key) {
  return key === 'snap' ? -1 : 1;
}

function fleetMatrixHeaderButton(key, label, accountClass=false) {
  const active = fleetMatrixSortKey === key;
  const nextDir = active ? -fleetMatrixSortDir : fleetMatrixDefaultSortDir(key);
  const nextLabel = nextDir === 1 ? 'ascending' : 'descending';
  const arrow = active ? (fleetMatrixSortDir === 1 ? '↑' : '↓') : '';
  return `
    <button class="fleet-matrix-sort-btn ${accountClass ? 'account' : ''} ${active ? 'active' : ''}" type="button" onclick="setFleetMatrixSort('${key}')" title="Sort ${esc(label)} ${esc(nextLabel)}" aria-label="Sort ${esc(label)} ${esc(nextLabel)}">
      <span class="fleet-matrix-sort-label">${esc(label)}</span><span class="fleet-matrix-sort-arrow" aria-hidden="true">${arrow}</span>
    </button>
  `;
}

function setFleetMatrixSort(key) {
  if (fleetMatrixSortKey === key) fleetMatrixSortDir *= -1;
  else {
    fleetMatrixSortKey = key;
    fleetMatrixSortDir = fleetMatrixDefaultSortDir(key);
  }
  renderFleetSummaryModal();
}

function fleetMatrixSortData(row) {
  const [account, c] = row;
  const capacity = getAccountBuilderCapacity(account);
  const homeTotal = normalizeOptionalNonNegativeInt(capacity.homeTotal);
  const builderBaseTotal = normalizeOptionalNonNegativeInt(capacity.builderBaseTotal);
  const homeActive = Number(c.homeBuilderActive) || 0;
  const builderBaseActive = Number(c.builderBaseBuilderActive) || 0;
  const homeCapacity = homeTotal === null ? Math.max(1, homeActive) : Math.max(1, homeTotal);
  const builderBaseCapacity = builderBaseTotal === null ? Math.max(1, builderBaseActive) : Math.max(1, builderBaseTotal);
  return {
    account: String(account || '').toLowerCase(),
    home: homeActive / homeCapacity,
    homeActive,
    homeTotal: homeTotal === null ? Number.POSITIVE_INFINITY : homeTotal,
    bb: builderBaseActive / builderBaseCapacity,
    bbActive: builderBaseActive,
    bbTotal: builderBaseTotal === null ? Number.POSITIVE_INFINITY : builderBaseTotal,
    lab: c.hasActiveLab ? 1 : 0,
    pet: c.hasActivePet ? 1 : 0,
    snap: fleetSnapshotAgeSortValue(account)
  };
}

function compareFleetMatrixRows(a, b) {
  const av = fleetMatrixSortData(a);
  const bv = fleetMatrixSortData(b);
  const key = fleetMatrixSortKey;
  let delta = 0;

  if (key === 'account') {
    delta = av.account.localeCompare(bv.account, undefined, { numeric:true, sensitivity:'base' });
  } else {
    let aVal = av[key];
    let bVal = bv[key];
    if (key === 'snap') {
      const aFinite = Number.isFinite(aVal);
      const bFinite = Number.isFinite(bVal);
      if (!aFinite && bFinite) delta = 1;
      else if (aFinite && !bFinite) delta = -1;
      else if (!aFinite && !bFinite) delta = 0;
      else delta = aVal - bVal;
    } else {
      delta = aVal - bVal;
    }

    if (delta === 0 && (key === 'home' || key === 'bb')) {
      const activeKey = key === 'home' ? 'homeActive' : 'bbActive';
      const totalKey = key === 'home' ? 'homeTotal' : 'bbTotal';
      delta = av[activeKey] - bv[activeKey];
      if (delta === 0) delta = av[totalKey] - bv[totalKey];
    }

    if (delta === 0) delta = av.account.localeCompare(bv.account, undefined, { numeric:true, sensitivity:'base' });
  }

  return delta * fleetMatrixSortDir;
}

function renderFleetMatrix(rows) {
  if (!rows.length) return '<div class="fleet-empty">No accounts in this view.</div>';
  const sortedRows = rows.slice().sort(compareFleetMatrixRows);
  return `
    <div class="fleet-matrix" aria-label="Account queue coverage matrix">
      <div class="fleet-matrix-header">
        ${fleetMatrixHeaderButton('account', 'Account', true)}
        ${fleetMatrixHeaderButton('home', 'Home')}
        ${fleetMatrixHeaderButton('bb', 'BB')}
        ${fleetMatrixHeaderButton('lab', 'Lab')}
        ${fleetMatrixHeaderButton('pet', 'Pet')}
        ${fleetMatrixHeaderButton('snap', 'Snap')}
      </div>
      ${sortedRows.map(([account, c]) => {
        const capacity = getAccountBuilderCapacity(account);
        const homeTotal = normalizeOptionalNonNegativeInt(capacity.homeTotal);
        const builderBaseTotal = normalizeOptionalNonNegativeInt(capacity.builderBaseTotal);
        return `
          <div class="fleet-matrix-row">
            <span class="fleet-matrix-account" title="${esc(account)}">${esc(account)}</span>
            ${fleetQueuePill(c.homeBuilderActive, homeTotal)}
            ${fleetQueuePill(c.builderBaseBuilderActive, builderBaseTotal)}
            ${fleetBinaryPill(c.hasActiveLab, 'Lab', '—')}
            ${fleetBinaryPill(c.hasActivePet, 'Pet', '—')}
            ${fleetSnapshotPill(account)}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderFleetNextTimers(nextTimers) {
  if (!nextTimers.length) return '<div class="fleet-empty">No active timers in this view.</div>';
  return `
    <div class="fleet-next-list">
      ${nextTimers.map(t => {
        const account = getAccount(t) || 'Unassigned';
        const due = dueWindow(t);
        const timeLabel = accountSummaryTimerLabel(t);
        return `
          <div class="fleet-next-row" onclick="fleetSelectAccount(${fleetAccountArg(account)})" title="Filter to ${esc(account)}">
            <span class="fleet-next-account">${esc(account)}</span>
            <span class="fleet-next-name">${esc(t.name || 'Untitled timer')}</span>
            <span class="fleet-next-time ${due.cls}">${esc(timeLabel)}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderFleetSummaryModal() {
  const el = document.getElementById('fleet-summary-content');
  if (!el) return;

  // The countdown tick re-renders the timer UI frequently. Preserve the
  // fleet modal scroll positions so mobile scrolling does not snap back
  // to the top while the summary is open.
  const modal = el.closest('.fleet-summary-modal');
  const oldMatrix = el.querySelector('.fleet-matrix');
  const oldNextList = el.querySelector('.fleet-next-list');
  const scrollState = {
    modalTop: modal ? modal.scrollTop : 0,
    matrixTop: oldMatrix ? oldMatrix.scrollTop : 0,
    matrixLeft: oldMatrix ? oldMatrix.scrollLeft : 0,
    nextTop: oldNextList ? oldNextList.scrollTop : 0
  };

  const data = buildFleetSummaryData();
  const view = getSelectedAccountView();
  const viewLabel = view && view.label ? view.label : 'All Accounts';
  const accountCount = data.rows.length;
  const accountLabel = accountCount === 1 ? '1 account' : `${accountCount} accounts`;
  const due24 = (Number(data.dueCounts.ready) || 0) + (Number(data.dueCounts.next8) || 0) + (Number(data.dueCounts.next24) || 0);
  const totalTimers = data.viewTimers.length;
  const activeTimers = data.activeTimers.length;
  const runningTimers = data.viewTimers.filter(t => t.status === 'running').length;
  const expiredTimers = data.viewTimers.filter(t => t.status === 'expired' || Number(t.remaining) <= 0).length;
  const lastUpdatedText = serverLastUpdated ? new Date(serverLastUpdated).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : 'local state';

  const homeCapacityNote = data.knownHomeCapacityAccounts
    ? `${data.homeCapacityTotal ? Math.max(0, data.homeCapacityTotal - data.homeActiveTotal) : 0} idle known`
    : 'capacity unknown';
  const builderBaseCapacityNote = data.knownBuilderBaseCapacityAccounts
    ? `${data.builderBaseCapacityTotal ? Math.max(0, data.builderBaseCapacityTotal - data.builderBaseActiveTotal) : 0} idle known`
    : 'capacity unknown';

  const attentionItems = [
    fleetAttentionItem('⏰', 'Ready timers', 'Expired or zero remaining timers that need collection/action.', expiredTimers, expiredTimers ? 'danger' : 'good'),
    fleetAttentionItem('🌙', 'Due within 8h', 'Likely today/tonight account checks.', data.dueCounts.next8 || 0, data.dueCounts.next8 ? 'warn' : 'good'),
    fleetAttentionItem('🧪', 'No active Lab', data.missingLab.length ? data.missingLab.join(', ') : 'Every account has lab coverage.', data.missingLab.length, data.missingLab.length ? 'warn' : 'good'),
    fleetAttentionItem('🐾', 'No active Pet', data.missingPet.length ? data.missingPet.join(', ') : 'Every account has pet coverage.', data.missingPet.length, data.missingPet.length ? 'warn' : 'good'),
    fleetAttentionItem('🛠', 'Idle home builders', data.idleHome.length ? data.idleHome.map(x => `${x.account} ${x.active}/${x.total}`).join(', ') : 'Known home builders are fully occupied.', data.idleHome.reduce((sum,x)=>sum+x.idle,0), data.idleHome.length ? 'warn' : 'good'),
    fleetAttentionItem('📸', 'Stale/no snapshot', data.staleOrUnknown.length ? data.staleOrUnknown.join(', ') : 'Snapshots are fresh or aging within your threshold.', data.staleOrUnknown.length, data.staleOrUnknown.length ? 'warn' : 'good')
  ].join('');

  el.innerHTML = `
    <div class="fleet-summary-head fleet-section-anchor" id="fleet-section-overview">
      <div class="fleet-summary-title-wrap">
        <h2 class="fleet-summary-title"><span aria-hidden="true">▦</span> Fleet summary</h2>
        <div class="fleet-summary-subtitle">Scope: ${esc(viewLabel)} · ${esc(accountLabel)} · reads current timers and snapshot metadata only.</div>
      </div>
      <span class="fleet-summary-refresh">Updated ${esc(lastUpdatedText)}</span>
    </div>

    <div class="fleet-kpi-grid">
      ${fleetKpiCard('Accounts', accountCount, viewLabel)}
      ${fleetKpiCard('Active timers', `${activeTimers}/${totalTimers}`, `${runningTimers} running`)}
      ${fleetKpiCard('Due < 24h', due24, 'ready + next 24h', due24 ? 'warn' : 'good')}
      ${fleetKpiCard('Pinned', data.pinnedCount, 'important timers')}
      ${fleetKpiCard('Home builders', data.knownHomeCapacityAccounts ? `${data.homeActiveTotal}/${data.homeCapacityTotal}` : data.homeActiveTotal, homeCapacityNote, data.idleHome.length ? 'warn' : 'good')}
      ${fleetKpiCard('BB builders', data.knownBuilderBaseCapacityAccounts ? `${data.builderBaseActiveTotal}/${data.builderBaseCapacityTotal}` : data.builderBaseActiveTotal, builderBaseCapacityNote, data.idleBuilderBase.length ? 'warn' : 'good')}
    </div>

    <div class="fleet-summary-grid">
      <div>
        <div class="fleet-panel fleet-section-anchor" id="fleet-section-attention">
          <div class="fleet-panel-title"><span>Needs attention</span><strong>${expiredTimers + Number(data.dueCounts.next8 || 0)} urgent-ish</strong></div>
          <div class="fleet-attention-list">${attentionItems}</div>
        </div>

        <div class="fleet-panel fleet-section-anchor" id="fleet-section-due">
          <div class="fleet-panel-title"><span>Due window</span><strong>${activeTimers} active</strong></div>
          ${renderFleetDueBars(data.dueCounts)}
        </div>

        <div class="fleet-panel fleet-section-anchor" id="fleet-section-next">
          <div class="fleet-panel-title"><span>Next up</span><strong>tap account to filter</strong></div>
          ${renderFleetNextTimers(data.nextTimers)}
        </div>
      </div>

      <div>
        <div class="fleet-panel fleet-section-anchor" id="fleet-section-builders">
          <div class="fleet-panel-title"><span>Active home builders</span><strong>guardians included</strong></div>
          ${renderFleetHomeBuilderBars(data.rows)}
        </div>

        <div class="fleet-panel fleet-section-anchor" id="fleet-section-matrix">
          <div class="fleet-panel-title"><span>Queue coverage matrix</span><strong>Home · BB · Lab · Pet · Snapshot</strong></div>
          ${renderFleetMatrix(data.rows)}
        </div>
      </div>
    </div>
  `;

  const restoreFleetScroll = () => {
    if (modal) modal.scrollTop = scrollState.modalTop;
    const newMatrix = el.querySelector('.fleet-matrix');
    const newNextList = el.querySelector('.fleet-next-list');
    if (newMatrix) {
      newMatrix.scrollTop = scrollState.matrixTop;
      newMatrix.scrollLeft = scrollState.matrixLeft;
    }
    if (newNextList) newNextList.scrollTop = scrollState.nextTop;
  };
  restoreFleetScroll();
  requestAnimationFrame(() => {
    restoreFleetScroll();
    updateFleetSummaryFloatingButtons();
  });
}
