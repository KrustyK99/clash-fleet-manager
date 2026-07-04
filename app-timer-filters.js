// Timer filtering and visibility helpers extracted from index.html.
// Classic browser script: these functions intentionally read existing global state.

function timerMatchesPinned(t) {
  return !filterPinned || isTimerPinned(t);
}

function getGroups() {
  return ['All', ...getVisibleAccountsForCurrentView()];
}

function getVisibleTimerList() {
  let list = timers.filter(t => {
    if (!timerMatchesAccountSearchAndDue(t)) return false;
    if (!timerMatchesType(t)) return false;
    if (!timerMatchesStatus(t)) return false;
    if (!timerMatchesPinned(t)) return false;
    return true;
  });
  return sortedTimers(list);
}

function getAccountsWithTimers() {
  return sortAccountNames(getViewScopedTimers().map(t => getAccount(t)).filter(Boolean));
}

function hasActiveFilters() {
  return selectedAccountView !== 'all' || filterGroup !== 'All' || filterDue !== 'All' || filterType !== 'All' || filterStatus !== 'All' || filterPinned || !!getSearchFilter();
}

function timerMatchesAccountAndSearch(t) {
  const search = getSearchFilter().toLowerCase();

  if (!timerMatchesAccountView(t)) return false;
  if (filterGroup !== 'All' && getAccount(t) !== filterGroup) return false;
  if (search && !t.name.toLowerCase().includes(search) && !(t.note||'').toLowerCase().includes(search) && !getAccount(t).toLowerCase().includes(search) && !getUpgradeType(t).toLowerCase().includes(search)) return false;
  return true;
}

function timerMatchesStatus(t) {
  return filterStatus === 'All' || t.status === filterStatus;
}

function timerTypeKey(t) {
  return getUpgradeType(t) || 'No type';
}

function timerMatchesType(t) {
  return filterType === 'All' || timerTypeKey(t) === filterType;
}

function timerMatchesAccountSearchAndDue(t) {
  if (!timerMatchesAccountAndSearch(t)) return false;
  if (filterDue !== 'All' && dueWindow(t).key !== filterDue) return false;
  return true;
}
