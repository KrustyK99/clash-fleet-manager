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

function toggleSidebar() {
  sidebarVisible = !sidebarVisible;
  applySidebarToggleState();
  setTimeout(updateScrollTopButton, 0);
}


function applyInitialMobileLayout() {
  // Phones do not have room for the 280px sidebar plus the timer list.
  // Start with the sidebar hidden so the timers render full-width; the Menu button still opens it.
  if (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) {
    sidebarVisible = false;
  }
  applySidebarToggleState();
}
