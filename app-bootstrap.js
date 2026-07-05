// ── Keyboard ──────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const regularModalOpen = document.getElementById('modal').style.display !== 'none';
  const bulkModalOpen = document.getElementById('bulk-modal').style.display !== 'none';
  const snapshotModalOpen = document.getElementById('snapshot-modal').style.display !== 'none';
  const batchSnapshotModalOpen = document.getElementById('batch-snapshot-modal').style.display !== 'none';
  const accountViewsModalOpen = document.getElementById('account-views-modal').style.display !== 'none';
  const anyModalOpen = regularModalOpen || bulkModalOpen || snapshotModalOpen || batchSnapshotModalOpen || accountViewsModalOpen;

  if (e.key === 'Escape') {
    if (accountViewsModalOpen) closeAccountViewsModal();
    else if (batchSnapshotModalOpen) closeBatchSnapshotModal();
    else if (snapshotModalOpen) closeSnapshotModal();
    else if (bulkModalOpen) closeBulkModal();
    else if (regularModalOpen) closeModal();
  }

  if (e.key === 'Enter' && regularModalOpen) saveTimer();
  if (e.key === 'Enter' && bulkModalOpen && (e.ctrlKey || e.metaKey)) saveBulkTimers();
  if (e.key === 'Enter' && accountViewsModalOpen && (e.ctrlKey || e.metaKey)) saveManagedAccountViews();
  if (e.key === 'Enter' && batchSnapshotModalOpen && (e.ctrlKey || e.metaKey)) saveBatchSnapshotTimers();
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !anyModalOpen && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') openAddModal();
  if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !anyModalOpen && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'SELECT') toggleFocusMode();
  if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !anyModalOpen && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'SELECT') toggleCompactMode();
});

// Quick-add behavior lives in app-timer-entry-actions-ui.js.



// ── Boot ──────────────────────────────────────────────────────────────────
async function boot() {
  setupNativeSelectRenderGuard();
  applySavedSidebarWidth();
  setupSidebarResizer();
  applyInitialMobileLayout();
  await loadAccountViews();
  applySavedAccountView();
  applySavedFocusMode();
  applySavedCompactMode();
  applySavedAccountPillBuilderCounts();
  populateStaticSelects();
  await load();
  renderTimers();
  setupScrollTopButton();
  setupFleetSummaryFloatingControls();
  setupBatchSnapshotFloatingImportButton();
  tickInterval = setInterval(tick, 500);
}

boot();
