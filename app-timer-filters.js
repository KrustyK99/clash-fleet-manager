// Timer filtering, visibility, pinning, and ordering helpers extracted from index.html.
// Classic browser script: these functions intentionally read existing global state.


// ── Pinning and ordering helpers ───────────────────────────────────────────
function isTimerPinned(t) {
  return !!(t && t.pinned === true);
}

function getPinnedTimerCountForAccount(account) {
  const name = String(account || '').trim();
  if (!name || name === 'All') return 0;
  return getViewScopedTimers().filter(t => getAccount(t) === name && isTimerPinned(t)).length;
}

function sortedTimers(list) {
  const statusOrder = {running:0,paused:1,stopped:2,expired:3};
  return [...list].sort((a,b) => {
    const pinnedDiff = Number(isTimerPinned(b)) - Number(isTimerPinned(a));
    if (pinnedDiff) return pinnedDiff;

    let av, bv;
    switch(sortKey) {
      case 'name': av=a.name.toLowerCase(); bv=b.name.toLowerCase(); break;
      case 'remaining': av=a.remaining; bv=b.remaining; break;
      case 'due': av=dueWindow(a).order; bv=dueWindow(b).order; break;
      case 'duration': av=a.duration; bv=b.duration; break;
      case 'status': av=statusOrder[a.status]??9; bv=statusOrder[b.status]??9; break;
      case 'group': av=getAccount(a).toLowerCase(); bv=getAccount(b).toLowerCase(); break;
      case 'created': av=a.created; bv=b.created; break;
      default: av=a.name.toLowerCase(); bv=b.name.toLowerCase();
    }
    if (av < bv) return -1 * sortDir;
    if (av > bv) return 1 * sortDir;
    return 0;
  });
}

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
