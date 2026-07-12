// Timer list rendering orchestration.
// Classic browser script; depends on globals/state owned by index.html and
// helper functions from the extracted UI/runtime scripts.

function renderTimers() {
  renderAccountViewPicker();
  renderGroupBar();
  renderDueBar();
  renderTypeBar();
  renderAccountSummary();
  renderStats();
  // The fleet summary is intentionally static while open. The timer tick calls
  // renderTimers() frequently; rebuilding the modal during that cycle can interrupt
  // touch scrolling and make nested fleet panels snap back to previous positions.
  // Refresh the summary only when it is opened or when the modal Reload button is used.
  let list = getVisibleTimerList();
  renderCopyDataBar(list);
  renderDeleteSelectionBar(list);
  updateSearchFilterIndicators();
  const timerCountEl = document.getElementById('timer-count');
  if (timerCountEl) {
    const timerLabel = list.length === 1 ? 'timer' : 'timers';
    timerCountEl.textContent = hasActiveFilters() ? `${list.length} of ${timers.length} ${timerLabel}` : `${list.length} ${timerLabel}`;
  }
  const el = document.getElementById('timer-list');
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="big">⏱</div><p>${timers.length?'No timers match your filter.':'No timers yet. Click <strong>New Timer</strong> to get started.'}</p></div>`;
    setTimeout(updateScrollTopButton, 0);
    return;
  }
  const renderCard = renderTimerCard;

  if (sortKey === 'due') {
    const sections = [
      ['Ready','Ready now'],
      ['Soon','Soon'],
      ['Today','Today'],
      ['Later','Later']
    ];
    el.innerHTML = sections.map(([key,label]) => {
      const items = list.filter(t => dueWindow(t).key === key);
      if (!items.length) return '';
      return `<div class="due-section">${label}<span class="due-section-count">${items.length}</span></div>` + items.map(renderCard).join('');
    }).join('');
  } else {
    el.innerHTML = list.map(renderCard).join('');
  }
  setTimeout(updateScrollTopButton, 0);
}
