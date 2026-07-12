// Account and Saved View query helpers for the Clash Timers browser app.
// Classic browser script: these functions intentionally read existing global state.
// This file avoids DOM rendering, persistence, event wiring, and timer-card generation.

function getKnownAccounts() {
  const accounts = new Set(ACCOUNT_PRESETS);
  timers.forEach(t => {
    const account = getAccount(t);
    if (account) accounts.add(account);
  });
  Object.keys(accountSnapshotMeta || {}).forEach(account => {
    const name = normalizeAccountNameValue(account);
    if (name) accounts.add(name);
  });
  Object.values(accountTagMap || {}).forEach(account => {
    const name = normalizeAccountNameValue(account);
    if (name) accounts.add(name);
  });
  getAccountViews().forEach(view => {
    if (Array.isArray(view.accounts)) {
      view.accounts.forEach(account => {
        const name = normalizeAccountNameValue(account);
        if (name) accounts.add(name);
      });
    }
  });
  return Array.from(accounts).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}


function normalizeAccountViews(rawViews) {
  const seenIds = new Set();
  const normalized = [];

  const addView = (raw, index=0) => {
    const view = normalizeAccountView(raw, index);
    let id = view.id;
    if (seenIds.has(id)) {
      if (id === 'all') return;
      let suffix = 2;
      while (seenIds.has(`${id}-${suffix}`)) suffix += 1;
      id = `${id}-${suffix}`;
    }
    seenIds.add(id);
    normalized.push({ ...view, id });
  };

  addView({ id:'all', label:'All Accounts', accounts:null, system:true }, 0);
  (Array.isArray(rawViews) && rawViews.length ? rawViews : DEFAULT_ACCOUNT_VIEWS).forEach((view, index) => addView(view, index));

  return normalized.filter((view, index) => view.id === 'all' || index > 0);
}


function getAccountViews() {
  if (!Array.isArray(accountViews) || !accountViews.length) {
    accountViews = normalizeAccountViews(DEFAULT_ACCOUNT_VIEWS);
  }
  return accountViews;
}

function getAccountViewById(id) {
  const views = getAccountViews();
  return views.find(view => view.id === id) || views[0];
}

function getSelectedAccountView() {
  return getAccountViewById(selectedAccountView);
}

function accountViewRestrictsAccounts(view=getSelectedAccountView()) {
  return Array.isArray(view.accounts);
}

function getAccountsForView(view=getSelectedAccountView()) {
  if (!accountViewRestrictsAccounts(view)) return getKnownAccounts();
  return Array.from(new Set((view.accounts || []).map(a => String(a || '').trim()).filter(Boolean)));
}

function getVisibleAccountsForCurrentView() {
  return getAccountsForView(getSelectedAccountView());
}

function accountIsVisibleInCurrentView(account) {
  const name = String(account || '').trim();
  if (!accountViewRestrictsAccounts()) return true;
  if (!name) return false;
  return getVisibleAccountsForCurrentView().includes(name);
}

function timerMatchesAccountView(t) {
  return accountIsVisibleInCurrentView(getAccount(t));
}

function getViewScopedTimers() {
  return timers.filter(timerMatchesAccountView);
}

function getAccountControlAccounts() {
  return getVisibleAccountsForCurrentView();
}

function getPreferredAccountForCurrentView(...candidates) {
  return candidates.map(v => String(v || '').trim()).find(account => account && accountIsVisibleInCurrentView(account)) || '';
}
