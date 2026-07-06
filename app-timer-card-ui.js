// Timer card rendering helpers extracted from index.html.
// Classic browser script: these functions intentionally read existing global app state.

function getTimerProgressPercent(t) {
  return t.duration > 0 ? Math.round(100*(1 - t.remaining/t.duration)) : 100;
}

function getTimerStatusLabel(t) {
  return String(t.status || '').charAt(0).toUpperCase() + String(t.status || '').slice(1);
}

function getTimerSecondaryText(t) {
  const showEndTime = (cardModes[t.id] === 'endtime');

  if (t.status === 'running' || t.status === 'paused') {
    const elapsed = t.duration - t.remaining;
    if (showEndTime && t.endTime) {
      return `ends ${fmtDateTime(t.endTime)}`;
    }
    return `elapsed ${fmt(elapsed)}`;
  }

  if (t.status === 'expired') {
    if (showEndTime) {
      const expiredAt = t.expiredAt || t.finishedAt;
      const when = fmtDateTime(expiredAt);
      return when ? `expired ${when}` : 'expired time not recorded';
    }
    return `elapsed ${fmtDuration(t.duration)}`;
  }

  return '';
}

function renderTimerCard(t) {
  const pct = getTimerProgressPercent(t);
  const isPaused = t.status==='paused';
  const isRunning = t.status==='running';
  const isExpired = t.status==='expired';
  const isStopped = t.status==='stopped';
  const idArg = timerIdArg(t.id);
  const isDeleteSelected = selectedTimerIds.has(String(t.id));
  const isCopySource = timerCopySourceId && String(timerCopySourceId) === String(t.id);
  const isCopyTargetable = timerCopySourceId && !isCopySource && !deleteSelectionMode;
  const isPinned = isTimerPinned(t);
  const pinButton = deleteSelectionMode
    ? ''
    : `<button class="timer-pin-btn${isPinned ? ' pinned' : ''}" type="button" onclick="toggleTimerPinned(${idArg}, event)" title="${isPinned ? 'Unpin timer' : 'Pin timer'}" aria-label="${isPinned ? 'Unpin' : 'Pin'} ${esc(t.name)}" aria-pressed="${isPinned ? 'true' : 'false'}">${isPinned ? '★' : '☆'}</button>`;
  const deleteSelectControl = deleteSelectionMode
    ? `<label class="timer-select-wrap" onclick="event.stopPropagation()" title="Select this timer for deletion"><input class="timer-select-checkbox" type="checkbox" ${isDeleteSelected ? 'checked' : ''} onchange="toggleTimerDeleteSelection(${idArg}, event)" aria-label="Select ${esc(t.name)} for deletion"></label>`
    : '';
  const playBtn = (isStopped||isPaused||isExpired) ?
    `<button class="btn btn-sm btn-success" onclick="startTimer('${t.id}')" title="Start">▶</button>` : '';
  const pauseBtn = isRunning ?
    `<button class="btn btn-sm btn-warning-text" onclick="pauseTimer('${t.id}')" title="Pause">⏸</button>` : '';
  const resetBtn = (!isStopped) ?
    `<button class="btn btn-sm btn-muted-text" onclick="resetTimer('${t.id}')" title="Reset">↺</button>` : '';
  const repeatIcon = t.repeat ? `<span class="timer-card-state-icon" title="Repeating">↺</span>` : '';
  const soundIcon = t.sound ? `<span class="timer-card-state-icon" title="Alert on">🔔</span>` : '';
  const due = dueWindow(t);
  const dueLabel = compactMode ? due.key : due.label;
  const upgradeType = getUpgradeType(t);
  const upgradeTypeLabel = compactMode ? compactUpgradeTypeLabel(upgradeType) : upgradeType;
  const actionsExpanded = expandedActionsTimerId === t.id;
  const copyDataBtn = deleteSelectionMode
    ? ''
    : (isCopySource
      ? `<button class="btn btn-sm copy-mode-card-action" onclick="cancelTimerDataCopy(event)" title="Cancel copy source">✓ Source</button>`
      : (timerCopySourceId
        ? `<button class="btn btn-sm copy-mode-card-action" onclick="applyCopiedTimerDataToTarget(${idArg}, event)" title="Paste copied timer data here and keep this timer's note/comment">Paste</button>`
        : `<button class="btn btn-sm btn-icon" onclick="beginTimerDataCopy(${idArg}, event)" title="Use this timer as the copy-data source">⧉</button>`));
  // Secondary info: elapsed or end time
  const secondaryText = getTimerSecondaryText(t);
  const secondaryEl = (!deleteSelectionMode && secondaryText)
    ? `<span class="timer-secondary" data-timer-secondary onclick="toggleCardMode('${t.id}')" title="Click to switch view">⇄ ${secondaryText}</span>`
    : '';
  return `<div class="timer-card ${t.status}${isPinned ? ' pinned' : ''}${actionsExpanded ? ' actions-expanded' : ''}${deleteSelectionMode ? ' delete-selectable' : ''}${isDeleteSelected ? ' delete-selected' : ''}${isCopySource ? ' copy-source' : ''}${isCopyTargetable ? ' copy-targetable' : ''}" id="tc-${t.id}" data-timer-id="${esc(t.id)}" onclick="handleTimerCardClick(event, ${idArg})" aria-selected="${isDeleteSelected ? 'true' : 'false'}">
    <div class="card-left">
      <div class="card-title-row">
        ${deleteSelectControl}
        <span class="timer-name" title="${esc(t.name)}">${esc(t.name)}</span>
        ${pinButton}
      </div>
      <div class="card-top">
        ${getAccount(t)?`<span class="timer-group-badge">${esc(getAccount(t))}</span>`:''}
        ${upgradeType?`<span class="timer-type-badge" title="${esc(upgradeType)}">${esc(upgradeTypeLabel)}</span>`:''}
        <span class="timer-due-badge ${due.cls}" data-timer-due title="${esc(due.label)}">${dueLabel}</span>
        ${repeatIcon}${soundIcon}
      </div>
      <div class="timer-display${deleteSelectionMode ? '' : ' adjustable'}" data-timer-remaining${deleteSelectionMode ? ' title="Tap card to select for deletion"' : ` onclick="toggleTimerAdjustPanel(${idArg})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleTimerAdjustPanel(${idArg})}" role="button" tabindex="0" title="Tap to adjust remaining time"`}>${fmt(t.remaining)}</div>
      <div class="timer-meta" data-timer-status>of ${fmtDuration(t.duration)} · ${getTimerStatusLabel(t)}</div>
      ${secondaryEl}
      ${t.note?`<div class="timer-note" title="${esc(t.note)}">📝 ${esc(t.note)}</div>`:''}
      <div class="progress-bar"><div class="progress-fill" data-timer-progress style="width:${pct}%"></div></div>
    </div>
    <div class="card-right">
      ${deleteSelectionMode
        ? `<button class="btn btn-sm ${isDeleteSelected ? 'delete-mode-card-action' : ''}" onclick="toggleTimerDeleteSelection(${idArg}, event)" title="${isDeleteSelected ? 'Unselect timer' : 'Select timer'}">${isDeleteSelected ? '✓ Selected' : 'Select'}</button>`
        : `<button class="btn btn-sm btn-icon card-actions-toggle" onclick="toggleTimerActions(${idArg}, event)" title="${actionsExpanded ? 'Hide actions' : 'Show actions'}" aria-label="${actionsExpanded ? 'Hide timer actions' : 'Show timer actions'}" aria-expanded="${actionsExpanded ? 'true' : 'false'}">⋯</button>
      <div class="card-actions">
        ${playBtn}${pauseBtn}${resetBtn}
        <button class="btn btn-sm btn-icon" onclick="toggleTimerPinned(${idArg}, event)" title="${isPinned ? 'Unpin timer' : 'Pin timer'}">${isPinned ? '★' : '☆'}</button>
        <button class="btn btn-sm btn-icon" onclick="toggleTimerAdjustPanel(${idArg})" title="Adjust time">⏱</button>
        ${copyDataBtn}
        <button class="btn btn-sm btn-icon" onclick="openEditModal('${t.id}')" title="Edit full timer">✎</button>
        <button class="btn btn-sm btn-icon btn-danger" onclick="deleteTimer('${t.id}')" title="Delete">✕</button>
      </div>`}
    </div>
    ${deleteSelectionMode ? '' : renderTimerAdjustPanel(t)}
  </div>`;
}
