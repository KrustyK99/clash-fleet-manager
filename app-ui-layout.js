// UI layout and preference controls for the Clash Timers browser app.
// Loaded as a classic non-module script after app-utils.js and before the main inline app script.
// These functions intentionally use globals declared by the main inline script.

// ── Focus view ─────────────────────────────────────────────────────────────
function applyFocusMode() {
  const app = document.querySelector('.app');
  if (app) app.classList.toggle('focus-mode', focusMode);
  document.body.classList.toggle('focus-mode', focusMode);

  const mainBtn = document.getElementById('focus-toggle-btn');
  const exitBtn = document.getElementById('focus-exit-btn');
  const label = document.getElementById('focus-toggle-label');

  [mainBtn, exitBtn].forEach(btn => {
    if (!btn) return;
    btn.classList.toggle('active', focusMode);
    btn.setAttribute('aria-pressed', focusMode ? 'true' : 'false');
  });

  if (label) label.textContent = focusMode ? 'Focus On' : 'Focus';

  if (mainBtn) {
    mainBtn.title = focusMode ? 'Exit focus view' : 'Show timers only';
    mainBtn.setAttribute('aria-label', mainBtn.title);
  }
  if (exitBtn) {
    exitBtn.title = 'Exit focus view';
    exitBtn.setAttribute('aria-label', exitBtn.title);
  }

  setTimeout(updateScrollTopButton, 0);
}

function toggleFocusMode() {
  const nextFocusMode = !focusMode;
  if (nextFocusMode && deleteSelectionMode) {
    deleteSelectionMode = false;
    selectedTimerIds.clear();
    updateDeleteModeButton();
  }

  focusMode = nextFocusMode;
  localStorage.setItem(FOCUS_MODE_KEY, focusMode ? '1' : '0');
  applyFocusMode();
  renderTimers();
}

function applySavedFocusMode() {
  focusMode = localStorage.getItem(FOCUS_MODE_KEY) === '1';
  applyFocusMode();
}

// ── Compact timer cards ────────────────────────────────────────────────────
function applyCompactMode() {
  const app = document.querySelector('.app');
  if (app) app.classList.toggle('compact-mode', compactMode);
  document.body.classList.toggle('compact-mode', compactMode);

  const btn = document.getElementById('compact-toggle-btn');
  const label = document.getElementById('compact-toggle-label');
  if (btn) {
    btn.classList.toggle('active', compactMode);
    btn.setAttribute('aria-pressed', compactMode ? 'true' : 'false');
    btn.title = compactMode ? 'Use normal timer cards' : 'Use compact timer cards';
    btn.setAttribute('aria-label', btn.title);
  }
  if (label) label.textContent = compactMode ? 'Compact On' : 'Compact';

  setTimeout(updateScrollTopButton, 0);
}

function toggleCompactMode() {
  compactMode = !compactMode;
  if (!compactMode) expandedActionsTimerId = null;
  localStorage.setItem(COMPACT_MODE_KEY, compactMode ? '1' : '0');
  applyCompactMode();
  renderTimers();
}

function applySavedCompactMode() {
  compactMode = localStorage.getItem(COMPACT_MODE_KEY) === '1';
  applyCompactMode();
}

// ── Account pill builder counts ────────────────────────────────────────────
function applySavedAccountPillBuilderCounts() {
  const saved = localStorage.getItem(ACCOUNT_PILL_BUILDERS_KEY);
  showAccountPillBuilderCounts = saved === null ? false : saved === '1';
}

function toggleAccountPillBuilderCounts() {
  showAccountPillBuilderCounts = !showAccountPillBuilderCounts;
  localStorage.setItem(ACCOUNT_PILL_BUILDERS_KEY, showAccountPillBuilderCounts ? '1' : '0');
  renderTimers();
}


// ── Resizable sidebar ──────────────────────────────────────────────────────
function desktopSidebarLayoutActive() {
  return !window.matchMedia || window.matchMedia('(min-width: 1025px)').matches;
}

function clampSidebarWidth(width) {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1200;
  const maxForViewport = Math.max(SIDEBAR_MIN_WIDTH, viewportWidth - SIDEBAR_MIN_CONTENT_WIDTH);
  const maxWidth = Math.min(SIDEBAR_MAX_WIDTH, maxForViewport);
  return Math.min(Math.max(Math.round(width || SIDEBAR_DEFAULT_WIDTH), SIDEBAR_MIN_WIDTH), maxWidth);
}

function applySidebarWidth() {
  sidebarWidth = clampSidebarWidth(sidebarWidth);
  document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);

  const resizer = document.getElementById('sidebar-resizer');
  if (resizer) {
    resizer.setAttribute('aria-valuemin', String(SIDEBAR_MIN_WIDTH));
    resizer.setAttribute('aria-valuemax', String(clampSidebarWidth(SIDEBAR_MAX_WIDTH)));
    resizer.setAttribute('aria-valuenow', String(sidebarWidth));
    resizer.title = `Drag to resize menu (${sidebarWidth}px)`;
  }
}

function setSidebarWidth(width, persist=true) {
  sidebarWidth = clampSidebarWidth(width);
  applySidebarWidth();
  if (persist) localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
}

function applySavedSidebarWidth() {
  const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  sidebarWidth = Number.isFinite(saved) && saved > 0 ? saved : SIDEBAR_DEFAULT_WIDTH;
  applySidebarWidth();
}

function setupSidebarResizer() {
  const resizer = document.getElementById('sidebar-resizer');
  if (!resizer) return;

  let resizing = false;
  let startX = 0;
  let startWidth = sidebarWidth;

  const stopResize = () => {
    if (!resizing) return;
    resizing = false;
    document.removeEventListener('pointermove', moveResize);
    document.removeEventListener('pointerup', stopResize);
    document.removeEventListener('pointercancel', stopResize);
    const main = document.querySelector('.main');
    if (main) main.classList.remove('sidebar-resizing');
    document.body.classList.remove('sidebar-resize-active');
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  };

  const moveResize = (event) => {
    if (!resizing) return;
    event.preventDefault();
    setSidebarWidth(startWidth + (event.clientX - startX), false);
  };

  resizer.addEventListener('pointerdown', (event) => {
    if (!sidebarVisible || !desktopSidebarLayoutActive()) return;
    event.preventDefault();
    resizing = true;
    startX = event.clientX;
    startWidth = sidebarWidth;
    const main = document.querySelector('.main');
    if (main) main.classList.add('sidebar-resizing');
    document.body.classList.add('sidebar-resize-active');
    document.addEventListener('pointermove', moveResize);
    document.addEventListener('pointerup', stopResize);
    document.addEventListener('pointercancel', stopResize);
  });

  resizer.addEventListener('keydown', (event) => {
    if (!sidebarVisible || !desktopSidebarLayoutActive()) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSidebarWidth(sidebarWidth - 16);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSidebarWidth(sidebarWidth + 16);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === 'End') {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_MAX_WIDTH);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
    }
  });

  window.addEventListener('resize', applySidebarWidth);
}

// ── Sidebar toggle ─────────────────────────────────────────────────────────
function applySidebarToggleState() {
  const main = document.querySelector('.main');
  if (main) main.classList.toggle('sidebar-hidden', !sidebarVisible);

  const btn = document.getElementById('sidebar-toggle-btn');
  const label = document.getElementById('sidebar-toggle-label');
  if (btn) {
    btn.classList.toggle('active', sidebarVisible);
    btn.setAttribute('aria-pressed', sidebarVisible ? 'true' : 'false');
    btn.title = sidebarVisible ? 'Hide menu' : 'Show menu';
    btn.setAttribute('aria-label', btn.title);
  }
  if (label) label.textContent = sidebarVisible ? 'Menu On' : 'Menu';

  const resizer = document.getElementById('sidebar-resizer');
  if (resizer) {
    resizer.setAttribute('aria-hidden', sidebarVisible ? 'false' : 'true');
    resizer.setAttribute('aria-disabled', sidebarVisible ? 'false' : 'true');
    resizer.tabIndex = sidebarVisible ? 0 : -1;
  }

  updateSearchFilterIndicators();
}

// ── Search filter indicators ───────────────────────────────────────────────
function getSearchFilter() {
  const searchEl = document.getElementById('search-input');
  return searchEl ? searchEl.value.trim() : '';
}

function clearSearchFilter() {
  const searchEl = document.getElementById('search-input');
  if (searchEl) searchEl.value = '';
  renderTimers();
}

function updateSearchFilterIndicators() {
  const search = getSearchFilter();
  const active = !!search;

  const pill = document.getElementById('active-search-pill');
  if (pill) {
    pill.classList.toggle('visible', active);
    if (active) {
      pill.title = `Search filter active: ${search}`;
      pill.innerHTML = `
        <span class="active-search-label">🔎 Search:</span>
        <span class="active-search-value">${esc(search)}</span>
        <button class="active-search-clear" type="button" onclick="clearSearchFilter()" aria-label="Clear search filter" title="Clear search filter">×</button>
      `;
    } else {
      pill.title = '';
      pill.innerHTML = '';
    }
  }

  const menuBtn = document.getElementById('sidebar-toggle-btn');
  if (menuBtn) {
    menuBtn.classList.toggle('search-active', active);
    const baseTitle = sidebarVisible ? 'Hide menu' : 'Show menu';
    const title = active ? `${baseTitle} — search filter active: ${search}` : baseTitle;
    menuBtn.title = title;
    menuBtn.setAttribute('aria-label', title);
  }

  const focusExitBtn = document.getElementById('focus-exit-btn');
  if (focusExitBtn) {
    focusExitBtn.classList.toggle('search-active', active);
    const title = active ? `Exit focus view — search filter active: ${search}` : 'Exit focus view';
    focusExitBtn.title = title;
    focusExitBtn.setAttribute('aria-label', title);
  }
}

// ── UI feedback helpers ───────────────────────────────────────────────────
function setSyncStatus(text, state='') {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = text;
  el.className = `sync-status ${state}`.trim();
}

function setReloadButtonBusy(isBusy) {
  ['reload-timers-btn', 'fleet-reload-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !!isBusy;
    btn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  });
}

function toast(msg, type='') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(), 3500);
}

function toggleSidebar() {
  sidebarVisible = !sidebarVisible;
  applySidebarToggleState();
  setTimeout(updateScrollTopButton, 0);
}

// ── Page-level scroll-to-top button ────────────────────────────────────────
function getScrollTopTarget() {
  const timerList = document.getElementById('timer-list');
  const doc = document.documentElement;
  const body = document.body;
  const docScrollHeight = Math.max(body ? body.scrollHeight : 0, doc ? doc.scrollHeight : 0);
  const docClientHeight = window.innerHeight || (doc ? doc.clientHeight : 0);
  const docScrollable = docScrollHeight > docClientHeight + 1;

  // On mobile the app becomes full-page scrolling. On desktop the timer list is
  // the scrollable area because the overall app is fixed to the viewport.
  if (docScrollable) {
    return {
      type: 'window',
      scrollTop: window.pageYOffset || (doc ? doc.scrollTop : 0) || (body ? body.scrollTop : 0) || 0,
      scrollHeight: docScrollHeight,
      clientHeight: docClientHeight
    };
  }

  if (timerList && timerList.scrollHeight > timerList.clientHeight + 1) {
    return {
      type: 'element',
      el: timerList,
      scrollTop: timerList.scrollTop,
      scrollHeight: timerList.scrollHeight,
      clientHeight: timerList.clientHeight
    };
  }

  return null;
}

function updateScrollTopButton() {
  const btn = document.getElementById('scroll-top-btn');
  if (!btn) return;

  // The fleet summary owns its own floating top button while it is open.
  // Keep the page-level button behind the modal so the controls do not overlap.
  if (fleetSummaryModalIsOpen()) {
    btn.classList.remove('visible');
    return;
  }

  const target = getScrollTopTarget();
  const shouldShow = !!target && target.scrollHeight > target.clientHeight + 1 && target.scrollTop > 80;
  btn.classList.toggle('visible', shouldShow);
}

function scrollToPageTop() {
  const target = getScrollTopTarget();

  if (target && target.type === 'element' && target.el) {
    target.el.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  setTimeout(updateScrollTopButton, 250);
}

function setupScrollTopButton() {
  const timerList = document.getElementById('timer-list');
  if (timerList) timerList.addEventListener('scroll', updateScrollTopButton, { passive: true });
  window.addEventListener('scroll', updateScrollTopButton, { passive: true });
  window.addEventListener('resize', updateScrollTopButton);
  updateScrollTopButton();
}


function applyInitialMobileLayout() {
  // Phones do not have room for the 280px sidebar plus the timer list.
  // Start with the sidebar hidden so the timers render full-width; the Menu button still opens it.
  if (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) {
    sidebarVisible = false;
  }
  applySidebarToggleState();
}
