// Account summary and account gap rendering helpers extracted from index.html.
// Classic browser script: these functions intentionally read and update existing global state.

function toggleGapDetails(event, type) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  expandedGapType = expandedGapType === type ? null : type;
  renderAccountSummary();
}

function selectGapAccount(event, account) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  expandedAccount = account;
  filterGroup = account;
  renderTimers();
}

function renderAccountGapPanel(rows) {
  const gapDefs = [
    { type:'Lab', icon:'🧪', label:'Lab' },
    { type:'Pet', icon:'🐾', label:'Pet' }
  ];

  const gapButtons = gapDefs.map(def => {
    const missing = getMissingAccounts(rows, def.type);
    const active = expandedGapType === def.type;
    const clear = missing.length === 0;
    const title = clear
      ? `All accounts have an active ${def.label.toLowerCase()} timer`
      : `${missing.length} account${missing.length === 1 ? '' : 's'} with no active ${def.label.toLowerCase()} timer`;
    return `
      <button class="account-gap-pill${active ? ' active' : ''}${clear ? ' clear' : ''}"
              type="button"
              onclick="${clear && !active ? '' : `toggleGapDetails(event, '${def.type}')`}"
              aria-pressed="${active ? 'true' : 'false'}"
              title="${esc(title)}">
        <span aria-hidden="true">${def.icon}</span>
        <span>${esc(def.label)}</span>
        <strong>${missing.length}</strong>
      </button>
    `;
  }).join('');

  let expandedList = '';
  if (expandedGapType) {
    const def = gapDefs.find(g => g.type === expandedGapType) || gapDefs[0];
    const missing = getMissingAccounts(rows, def.type);
    expandedList = `
      <div class="account-gap-list" aria-label="Accounts with no active ${esc(def.label.toLowerCase())} timer">
        ${missing.length
          ? missing.map(account => {
              const accountArg = esc(JSON.stringify(account));
              return `<button class="account-gap-account" type="button" onclick="selectGapAccount(event, ${accountArg})" title="Filter to ${esc(account)}">${esc(account)}</button>`;
            }).join('')
          : `<span class="account-gap-list-empty">All accounts covered.</span>`}
      </div>
    `;
  }

  return `
    <div class="account-gap-panel">
      <div class="account-gap-title">
        <span>Gaps</span>
        <span class="account-gap-title-hint">running/paused</span>
      </div>
      <div class="account-gap-actions">${gapButtons}</div>
      ${expandedList}
    </div>
  `;
}

function toggleAccountSummaryDetails(event, account) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  expandedAccount = expandedAccount === account ? null : account;
  filterGroup = account;
  renderTimers();
}

function renderAccountSummaryDetail(account, accountTimers) {
  const sorted = accountSummaryTimerSort(accountTimers);

  if (!sorted.length) {
    return `
      <div class="account-summary-detail">
        <div class="account-summary-detail-empty">No timers for this account.</div>
      </div>
    `;
  }

  return `
    <div class="account-summary-detail">
      <div class="account-summary-detail-list">
        ${sorted.map(t => {
          const type = getUpgradeType(t);
          const label = accountSummaryTimerLabel(t);
          const statusClass = ['running','paused','stopped','expired'].includes(t.status) ? t.status : '';
          return `
            <div class="account-summary-detail-row" title="${esc(t.name)} — ${esc(label)}">
              <span class="account-summary-detail-main">
                <span aria-hidden="true">↳</span>
                <span class="account-summary-detail-name">${esc(t.name)}</span>
                ${type ? `<span class="account-summary-detail-type">${esc(type)}</span>` : ''}
              </span>
              <span class="account-summary-detail-time ${statusClass}">${esc(label)}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderAccountSummary() {
  const el = document.getElementById('account-summary');
  if (!el) return;

  const previousScrollTop = el.scrollTop;
  const previousDetail = el.querySelector('.account-summary-detail-list');
  const previousDetailScrollTop = previousDetail ? previousDetail.scrollTop : 0;

  const rows = buildAccountSummaryRows();
  const accounts = new Map(rows);
  if (expandedAccount && !accounts.has(expandedAccount)) expandedAccount = null;

  if (!rows.length) {
    const emptyText = accountViewRestrictsAccounts() ? 'No accounts in this saved view.' : 'No accounts yet.';
    el.innerHTML = `<span class="account-summary-empty-message">${emptyText}</span>`;
    return;
  }

  el.innerHTML = `
    ${renderAccountGapPanel(rows)}
    <div class="account-summary-table" aria-label="Account summary by status">
      <div class="account-summary-table-header">
        <span class="account-summary-account">Acct</span>
        <span class="account-summary-cell" title="Running">R</span>
        <span class="account-summary-cell" title="Paused">P</span>
        <span class="account-summary-cell" title="Stopped">S</span>
        <span class="account-summary-cell" title="Expired">E</span>
      </div>
      ${rows.map(([account, c]) => {
        const expanded = expandedAccount === account;
        const accountArg = esc(JSON.stringify(account));
        const gaps = getAccountGapTypes(c);
        const gapText = gaps.length ? `, ${gaps.map(g => g.label.toLowerCase()).join(', ')}` : '';
        const freshness = getSnapshotFreshness(account);
        const builderText = accountSummaryBuilderTitle(account, c);
        const titleText = `${builderText} ${freshness.title} ${expanded ? 'Collapse' : 'Expand'} ${account} and filter timer list${gapText ? ' — ' + gapText : ''}`;
        return `
          <div class="account-summary-table-row${expanded ? ' expanded' : ''}"
               onclick="toggleAccountSummaryDetails(event, ${accountArg})"
               onkeydown="if(event.key==='Enter'||event.key===' '){toggleAccountSummaryDetails(event, ${accountArg})}"
               tabindex="0"
               role="button"
               title="${esc(titleText)}"
               aria-expanded="${expanded ? 'true' : 'false'}"
               aria-label="${esc(account)}: ${c.homeBuilderActive} home builder active, ${c.builderBaseBuilderActive} builder base builder active, ${freshness.label} snapshot, ${c.running} running, ${c.paused} paused, ${c.stopped} stopped, ${c.expired} expired${gapText}">
            <span class="account-summary-account">
              <span class="account-summary-account-wrap">
                <span class="account-summary-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
                ${snapshotFreshnessDotHtml(account)}
                <span class="account-summary-name">${esc(account)}</span>
                ${accountSummaryBuilderBadgeHtml(account, c)}
                ${accountGapBadgesHtml(c)}
              </span>
            </span>
            <span class="account-summary-cell running">${c.running}</span>
            <span class="account-summary-cell paused">${c.paused}</span>
            <span class="account-summary-cell stopped">${c.stopped}</span>
            <span class="account-summary-cell expired">${c.expired}</span>
          </div>
          ${expanded ? renderAccountSummaryDetail(account, c.timers) : ''}
        `;
      }).join('')}
    </div>
  `;

  el.scrollTop = previousScrollTop;
  const restoredDetail = el.querySelector('.account-summary-detail-list');
  if (restoredDetail) restoredDetail.scrollTop = previousDetailScrollTop;
}
