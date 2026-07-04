// Account view picker and account-control population UI bridge for the Clash Timers browser app.
// Loaded as a classic non-module script before the main inline app script.
// These functions intentionally use globals declared by the main inline script.

function renderAccountViewPicker(force=false) {
  const select = document.getElementById('account-view-select');
  const hint = document.getElementById('account-view-hint');
  const views = getAccountViews();

  if (!views.some(v => v.id === selectedAccountView)) selectedAccountView = 'all';
  const view = getSelectedAccountView();

  const optionSignature = views.map(v => `${v.id}:${v.label}:${Array.isArray(v.accounts) ? v.accounts.join('|') : '*'}`).join('\u001e');
  const signature = `${optionSignature}\u001e${selectedAccountView}`;

  if (select && (force || select.dataset.signature !== signature) && document.activeElement !== select) {
    select.innerHTML = views.map(v =>
      `<option value="${esc(v.id)}"${v.id === selectedAccountView ? ' selected' : ''}>${esc(v.label)}</option>`
    ).join('');
    select.value = selectedAccountView;
    select.dataset.signature = signature;
  } else if (select && document.activeElement !== select && select.value !== selectedAccountView) {
    select.value = selectedAccountView;
  }

  if (hint) {
    const accounts = getVisibleAccountsForCurrentView();
    const timerCount = getViewScopedTimers().length;
    const accountLabel = accounts.length === 1 ? '1 account' : `${accounts.length} accounts`;
    const timerLabel = timerCount === 1 ? '1 timer' : `${timerCount} timers`;
    hint.innerHTML = accountViewRestrictsAccounts(view)
      ? `<strong>${esc(view.label)}</strong>: ${accountLabel} · ${timerLabel}`
      : `<strong>${esc(view.label || 'All Accounts')}</strong>: ${accountLabel} · ${timerLabel}`;
  }
}

function setAccountView(viewId) {
  const view = getAccountViewById(viewId);
  const nextId = view.id || 'all';
  if (selectedAccountView === nextId) return;

  selectedAccountView = nextId;
  localStorage.setItem(ACCOUNT_VIEW_KEY, selectedAccountView);

  // Account filters and expanded account details are nested inside the saved view.
  // Reset them so switching views cannot leave the list filtered to a hidden account.
  filterGroup = 'All';
  expandedAccount = null;
  expandedGapType = null;
  selectedTimerIds.clear();
  accountControlsSignature = '';
  accountViewControlsSignature = '';

  populateAccountControls(true);
  renderTimers();
}

function applySavedAccountView() {
  const saved = localStorage.getItem(ACCOUNT_VIEW_KEY);
  selectedAccountView = getAccountViews().some(v => v.id === saved) ? saved : 'all';
}

function applyAccountViewChangesAfterSave() {
  const views = getAccountViews();
  if (!views.some(v => v.id === selectedAccountView)) {
    selectedAccountView = 'all';
    localStorage.setItem(ACCOUNT_VIEW_KEY, selectedAccountView);
  }

  if (filterGroup !== 'All' && !accountIsVisibleInCurrentView(filterGroup)) filterGroup = 'All';
  if (expandedAccount && !accountIsVisibleInCurrentView(expandedAccount)) expandedAccount = null;
  expandedGapType = null;
  selectedTimerIds.clear();
  accountControlsSignature = '';
  accountViewControlsSignature = '';

  populateAccountControls(true);
  renderTimers();
}

function populateAccountControls(force=false) {
  const accounts = getAccountControlAccounts();
  const restrictToView = accountViewRestrictsAccounts();
  const signature = `${selectedAccountView}\u001e${accounts.join('\u001f')}`;
  const active = document.activeElement;
  const accountSelectIsOpen = active && (active.id === 'q-account' || active.id === 'bulk-account' || active.id === 'snapshot-account' || active.id === 'delete-account-select');

  // Mobile browsers can flicker or collapse a native <select> picker if its options
  // are rebuilt while the picker is open. Most timer renders do not change the
  // account list, so avoid touching these controls unless the account list changed.
  if (!force && signature === accountControlsSignature) return;
  if (!force && accountSelectIsOpen) {
    accountControlsRefreshQueued = true;
    return;
  }

  function fillAccountSelect(selectEl, placeholderText) {
    if (!selectEl || selectEl.tagName !== 'SELECT') return;
    const current = selectEl.value;
    selectEl.innerHTML = `<option value="">${placeholderText}</option>` + accounts.map(account =>
      `<option value="${esc(account)}"${account === current ? ' selected' : ''}>${esc(account)}</option>`
    ).join('');

    // Preserve any current custom account value when showing all accounts, but keep
    // Saved View controls constrained to the accounts configured for that view.
    if (current && !accounts.includes(current) && !restrictToView) {
      const opt = document.createElement('option');
      opt.value = current;
      opt.textContent = current;
      opt.selected = true;
      selectEl.appendChild(opt);
    } else if (current && !accounts.includes(current) && restrictToView) {
      selectEl.value = '';
    }
  }

  function fillBulkTargetSelect(selectEl) {
    if (!selectEl || selectEl.tagName !== 'SELECT') return;
    const current = selectEl.value;
    const view = getSelectedAccountView();
    const viewIsRestricted = accountViewRestrictsAccounts(view);
    const allAccounts = getKnownAccounts();

    const specialOptions = [
      `<option value="${BULK_TARGET_ALL_ACCOUNTS}"${current === BULK_TARGET_ALL_ACCOUNTS ? ' selected' : ''}>All Accounts (${allAccounts.length})</option>`
    ];

    if (viewIsRestricted) {
      const viewAccounts = getAccountsForView(view);
      specialOptions.push(`<option value="${BULK_TARGET_CURRENT_VIEW}"${current === BULK_TARGET_CURRENT_VIEW ? ' selected' : ''}>Current Saved View: ${esc(view.label)} (${viewAccounts.length})</option>`);
    }

    selectEl.innerHTML = [
      `<option value="">— Select account or scope —</option>`,
      ...specialOptions,
      `<option value="" disabled>──────────</option>`,
      ...accounts.map(account => `<option value="${esc(account)}"${account === current ? ' selected' : ''}>${esc(account)}</option>`)
    ].join('');

    if (current && current !== BULK_TARGET_ALL_ACCOUNTS && current !== BULK_TARGET_CURRENT_VIEW && !accounts.includes(current)) {
      if (!restrictToView) {
        const opt = document.createElement('option');
        opt.value = current;
        opt.textContent = current;
        opt.selected = true;
        selectEl.appendChild(opt);
      } else {
        selectEl.value = '';
      }
    } else if (current === BULK_TARGET_CURRENT_VIEW && !viewIsRestricted) {
      selectEl.value = '';
    }

    updateBulkTargetSummary();
  }

  // Real selects are more reliable than datalist pulldowns over local/internal web hosting.
  fillAccountSelect(document.getElementById('q-account'), '— Select account —');
  fillBulkTargetSelect(document.getElementById('bulk-account'));
  fillAccountSelect(document.getElementById('snapshot-account'), '— Select account —');

  // The single-timer modal still uses free text plus autocomplete so you can create custom account names.
  const dl = document.getElementById('account-suggestions');
  if (dl) {
    dl.innerHTML = accounts.map(account => `<option value="${esc(account)}">`).join('');
  }

  accountControlsSignature = signature;
  accountControlsRefreshQueued = false;
}

function setupNativeSelectRenderGuard() {
  const markSelectActive = (target) => {
    if (target && target.tagName === 'SELECT') nativeSelectActive = true;
  };

  const releaseSelectGuard = () => {
    nativeSelectActive = false;
    if (accountControlsRefreshQueued) populateAccountControls(true);
    if (renderQueuedUntilSelectCloses) {
      renderQueuedUntilSelectCloses = false;
      renderTimers();
    }
  };

  document.addEventListener('pointerdown', e => markSelectActive(e.target), true);
  document.addEventListener('touchstart', e => markSelectActive(e.target), true);
  document.addEventListener('focusin', e => markSelectActive(e.target), true);
  document.addEventListener('change', e => { if (e.target && e.target.tagName === 'SELECT') setTimeout(releaseSelectGuard, 0); }, true);
  document.addEventListener('blur', e => { if (e.target && e.target.tagName === 'SELECT') setTimeout(releaseSelectGuard, 0); }, true);
}
