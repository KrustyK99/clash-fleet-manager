// Timer filter/status bar UI helpers extracted from index.html.
// Classic browser script: these functions intentionally read and update existing global state.

function togglePinnedFilter() {
  filterPinned = !filterPinned;
  renderTimers();
}

function renderGroupBar() {
  const bar = document.getElementById('group-bar');
  const groups = getGroups();
  if (filterGroup !== 'All' && !groups.includes(filterGroup)) filterGroup = 'All';
  if (!groups.some(g => g !== 'All') && filterGroup === 'All') {
    bar.style.display = 'none';
  } else {
    const summaryByAccount = new Map(buildAccountSummaryRows());
    const builderToggleLabel = showAccountPillBuilderCounts ? 'Builders On' : 'Builders Off';
    const builderToggleTitle = showAccountPillBuilderCounts
      ? 'Hide builder counts in account filter pills'
      : 'Show builder counts in account filter pills';
    const builderToggle = `
      <button class="group-pill account-pill-builder-toggle${showAccountPillBuilderCounts ? ' active' : ''}"
              type="button"
              title="${esc(builderToggleTitle)}"
              aria-label="${esc(builderToggleTitle)}"
              aria-pressed="${showAccountPillBuilderCounts ? 'true' : 'false'}"
              onclick="toggleAccountPillBuilderCounts()">🏠 ${esc(builderToggleLabel)}</button>`;

    bar.style.display = 'flex';
    bar.innerHTML = [`<span class="filter-bar-label">Account</span>`, builderToggle].concat(groups.map(g => {
      const isAll = g === 'All';
      const freshness = isAll ? null : getSnapshotFreshness(g);
      const freshnessClass = freshness ? ` freshness-${freshness.cls}` : '';
      const pinnedCount = isAll ? 0 : getPinnedTimerCountForAccount(g);
      const pinnedClass = pinnedCount ? ' has-pinned' : '';
      const pinnedLabel = pinnedCount === 1 ? '1 pinned timer' : `${pinnedCount} pinned timers`;
      const pinnedBadge = pinnedCount
        ? `<span class="group-pill-pin-count" aria-label="${esc(pinnedLabel)}">★${pinnedCount}</span>`
        : '';
      const builderBadge = (!isAll && showAccountPillBuilderCounts)
        ? accountPillBuilderBadgeHtml(g, summaryByAccount.get(g) || createAccountSummaryRow())
        : '';
      const snapshotAgeBadge = (!isAll && showAccountPillBuilderCounts && freshness && freshness.compactAgeLabel)
        ? `<span class="account-pill-snapshot-age" title="${esc(freshness.title)}" aria-label="${esc(freshness.title)}">${esc(freshness.compactAgeLabel)}</span>`
        : '';
      const titleParts = [];
      if (freshness) titleParts.push(freshness.title);
      if (builderBadge) titleParts.push(accountSummaryBuilderTitle(g, summaryByAccount.get(g) || createAccountSummaryRow()));
      if (pinnedCount) titleParts.push(pinnedLabel);
      const title = titleParts.length ? titleParts.join(' · ') : 'Show all accounts';
      const groupArg = esc(JSON.stringify(g));
      return `<button class="group-pill account-pill${g===filterGroup?' active':''}${freshnessClass}${pinnedClass}" title="${esc(title)}" onclick="setGroup(${groupArg})"><span>${esc(g)}</span>${builderBadge}${snapshotAgeBadge}${pinnedBadge}</button>`;
    })).join('');
  }

  populateAccountControls();
}


function renderDueBar() {
  const bar = document.getElementById('due-bar');

  // Due pill counts should reflect the currently selected account/search context,
  // but should not be reduced by the currently selected due pill.
  const countBase = timers.filter(t => timerMatchesAccountAndSearch(t) && timerMatchesType(t) && timerMatchesStatus(t) && timerMatchesPinned(t));
  const counts = {All: countBase.length, Ready:0, Soon:0, Today:0, Later:0};
  countBase.forEach(t => counts[dueWindow(t).key]++);

  const windows = [
    ['All', 'All'],
    ['Ready', 'Ready now'],
    ['Soon', 'Soon'],
    ['Today', 'Today'],
    ['Later', 'Later']
  ];
  if (!getViewScopedTimers().length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = [`<span class="filter-bar-label">Due</span>`].concat(windows.map(([key,label]) =>
    `<button class="group-pill${key===filterDue?' active':''}" onclick="setDueFilter('${key}')">${label} (${counts[key] || 0})</button>`
  )).join('');
}

function getTypeFilterKeys() {
  const preferred = UPGRADE_TYPES.filter(Boolean);
  const dynamic = Array.from(new Set(getViewScopedTimers().map(timerTypeKey).filter(Boolean)));

  const ordered = preferred.filter(type => dynamic.includes(type));
  dynamic
    .filter(type => !preferred.includes(type))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric:true, sensitivity:'base' }))
    .forEach(type => ordered.push(type));

  // Keep the configured upgrade types visible even when their current count is zero,
  // so the Type row behaves like the Due row and does not jump around while filtering.
  preferred.forEach(type => {
    if (!ordered.includes(type)) ordered.push(type);
  });

  return ['All', ...ordered];
}

function renderTypeBar() {
  const bar = document.getElementById('type-bar');
  if (!bar) return;

  if (!getViewScopedTimers().length) {
    bar.style.display = 'none';
    return;
  }

  const keys = getTypeFilterKeys();
  if (filterType !== 'All' && !keys.includes(filterType)) keys.push(filterType);

  // Type pill counts reflect account/search/due/status context,
  // but not the currently selected type pill.
  const countBase = timers.filter(t => timerMatchesAccountSearchAndDue(t) && timerMatchesStatus(t) && timerMatchesPinned(t));
  const counts = { All: countBase.length };
  countBase.forEach(t => {
    const key = timerTypeKey(t);
    counts[key] = (counts[key] || 0) + 1;
  });

  bar.style.display = 'flex';
  bar.innerHTML = [`<span class="filter-bar-label">Type</span>`].concat(keys.map(key => {
    const active = key === filterType;
    const arg = esc(JSON.stringify(key));
    const label = key === 'All' ? 'All' : key;
    return `<button class="group-pill${active ? ' active' : ''}" onclick="setTypeFilter(${arg})">${esc(label)} (${counts[key] || 0})</button>`;
  })).join('');
}

function setGroup(g) {
  filterGroup = g;
  renderTimers();
}

function setDueFilter(g) {
  filterDue = g;
  renderTimers();
}

function setTypeFilter(type) {
  filterType = type;
  renderTimers();
}

function setStatusFilter(status) {
  filterStatus = filterStatus === status ? 'All' : status;
  renderTimers();
}

function resetFilters() {
  filterGroup = 'All';
  filterDue = 'All';
  filterType = 'All';
  filterStatus = 'All';
  filterPinned = false;
  expandedAccount = null;
  expandedGapType = null;

  const searchEl = document.getElementById('search-input');
  if (searchEl) searchEl.value = '';

  renderTimers();
}


function renderStats() {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;

  // Status pill counts reflect the current account/search/due/type context,
  // but not the currently selected status pill. That keeps the pills useful
  // for switching status filters without making the other counts disappear.
  const countBase = timers.filter(t => timerMatchesAccountSearchAndDue(t) && timerMatchesType(t) && timerMatchesPinned(t));
  const pinCountBase = timers.filter(t => timerMatchesAccountSearchAndDue(t) && timerMatchesType(t) && timerMatchesStatus(t));
  const pinnedCount = pinCountBase.filter(isTimerPinned).length;
  const counts = {
    All: countBase.length,
    running: countBase.filter(t => t.status === 'running').length,
    paused: countBase.filter(t => t.status === 'paused').length,
    stopped: countBase.filter(t => t.status === 'stopped').length,
    expired: countBase.filter(t => t.status === 'expired').length
  };

  const statuses = [
    ['All', 'All', ''],
    ['running', 'running', 'var(--accent)'],
    ['paused', 'paused', 'var(--amber)'],
    ['stopped', 'stopped', 'var(--text3)'],
    ['expired', 'expired', 'var(--red)']
  ];

  const view = getSelectedAccountView();
  const viewIsActive = view && view.id !== 'all' && accountViewRestrictsAccounts(view);
  const viewStatusPill = viewIsActive ? (() => {
    const accounts = getVisibleAccountsForCurrentView();
    const accountText = accounts.length === 1 ? '1 account' : `${accounts.length} accounts`;
    const label = view.label || 'Saved View';
    const title = `Saved View active: ${label} (${accountText}). Tap to return to All Accounts.`;
    return `
      <button class="view-status-pill"
              type="button"
              onclick="setAccountView('all')"
              aria-label="${esc(title)}"
              title="${esc(title)}">
        <span aria-hidden="true">👁</span>
        <span>View:</span>
        <span class="view-status-name">${esc(label)}</span>
        <span class="view-status-count">${esc(accountText)}</span>
        <span class="view-status-clear" aria-hidden="true">×</span>
      </button>
    `;
  })() : '';

  const resetButton = `
    <button class="filter-reset-pill"
            type="button"
            onclick="resetFilters()"
            title="Reset account, due, type, status, pinned, and search filters. Saved View stays active; use the View pill to return to All Accounts.">
      ↺ Reset filters
    </button>
  `;

  const pinnedButton = `
    <button class="stat pinned-filter${filterPinned ? ' active' : ''}"
            type="button"
            onclick="togglePinnedFilter()"
            aria-pressed="${filterPinned ? 'true' : 'false'}"
            title="${filterPinned ? 'Clear pinned filter' : 'Show pinned timers only'}">
      📌 Pinned (${pinnedCount})
    </button>
  `;

  const statusButtons = statuses.map(([key, label, color]) => {
    const active = filterStatus === key;
    const title = key === 'All'
      ? 'Show all status timers'
      : (active ? `Clear ${label} filter` : `Show ${label} timers`);
    const dot = color ? `<span class="stat-dot" style="background:${color}"></span>` : '';
    const displayCount = counts[key] || 0;
    const displayText = key === 'All' ? `${label} (${displayCount})` : `${displayCount} ${label}`;

    return `
      <button class="stat${active ? ' active' : ''}"
              type="button"
              onclick="setStatusFilter('${key}')"
              aria-pressed="${active ? 'true' : 'false'}"
              title="${title}">
        ${dot}${displayText}
      </button>
    `;
  }).join('');

  bar.innerHTML = `<span class="filter-bar-label">Status</span>${viewStatusPill}${resetButton}${pinnedButton}${statusButtons}`;
}
