// Pure utility helpers for the Clash Timers browser app.
// Loaded as a classic non-module script before the main inline app script.

function newId() {
  // crypto.randomUUID() is only available in secure contexts in some browsers.
  // This fallback keeps the app working over plain HTTP on an internal LAN.
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function getAccount(t) {
  return String(t.account || t.group || '').trim();
}

function getUpgradeType(t) {
  return String(t.upgradeType || '').trim();
}

function splitSeconds(secs) {
  const total = Math.max(0, Math.floor(Number(secs) || 0));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60
  };
}

function clampNonNegativeSeconds(value) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, n);
}

function fmt(secs) {
  const total = Math.max(0, Math.floor(Number(secs) || 0));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sc = total % 60;

  // Keep short timers compact, but show days once the timer is 24h+.
  if (d > 0) return `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
}

function fmtDuration(secs) {
  const total = Math.max(0, Math.floor(Number(secs) || 0));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts=[];
  if(d) parts.push(d+'d');
  if(h) parts.push(h+'h');
  if(m) parts.push(m+'m');
  if(s||!parts.length) parts.push(s+'s');
  return parts.join(' ');
}

function fmtDateTime(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  const date = d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  const time = d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  return `${date}, ${time}`;
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timerIdArg(id) {
  return esc(JSON.stringify(String(id || '')));
}

function parseBulkTimerLine(rawLine) {
  let line = String(rawLine || '').trim();
  if (!line) return null;

  // Allow copied lists with bullets or numbering, such as "1. X-Bow 3h 57m".
  line = line.replace(/^[-*•]+\s*/, '').replace(/^\d+[.)]\s*/, '').trim();

  const durationPattern = /(\d+)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;
  const matches = [...line.matchAll(durationPattern)];
  if (!matches.length) return null;

  let days = 0;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  matches.forEach(match => {
    const value = parseInt(match[1], 10) || 0;
    const unit = match[2].toLowerCase();
    if (unit.startsWith('d')) days += value;
    else if (unit.startsWith('h')) hours += value;
    else if (unit.startsWith('m')) minutes += value;
    else if (unit.startsWith('s')) seconds += value;
  });

  const firstDurationAt = matches[0].index ?? line.length;
  const name = line.slice(0, firstDurationAt).replace(/[\s:|,\-–—]+$/g, '').trim();
  if (!name) return null;

  // Normalize overflow in case a pasted value says something like 90m.
  hours += Math.floor(minutes / 60);
  minutes = minutes % 60;
  days += Math.floor(hours / 24);
  hours = hours % 24;

  return { name, days, hours, minutes, seconds };
}

// Account/view normalization helpers extracted from the main inline script.
function normalizeOptionalNonNegativeInt(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.round(Number(value)));
}

function normalizePlayerTag(tag) {
  const clean = String(tag || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!clean) return '';
  return clean.startsWith('#') ? clean : `#${clean}`;
}

function normalizeAccountNameValue(account) {
  return String(account || '').trim();
}

function compactUpgradeTypeLabel(type) {
  const labels = {
    'Capital / Other': 'Capital',
    'Equipment': 'Equip'
  };
  return labels[type] || type;
}

function dueWindow(t) {
  if (t.status === 'expired' || Number(t.remaining) <= 0) return { key:'Ready', label:'Ready now', cls:'ready', order:0 };
  if (Number(t.remaining) <= 3600) return { key:'Soon', label:'Soon', cls:'soon', order:1 };
  if (Number(t.remaining) <= 86400) return { key:'Today', label:'Today', cls:'today', order:2 };
  return { key:'Later', label:'Later', cls:'later', order:3 };
}

function sortAccountNames(accounts) {
  return Array.from(new Set((accounts || []).map(a => String(a || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric:true, sensitivity:'base' }));
}

function normalizeAccountViewId(id, fallbackLabel='view') {
  const clean = String(id || '').trim();
  if (clean) return clean;
  return `view-${String(fallbackLabel || 'view').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'custom'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeAccountView(view, index=0) {
  const source = view && typeof view === 'object' ? view : {};
  const system = source.system === true || source.id === 'all';
  const id = system ? 'all' : normalizeAccountViewId(source.id, source.label || `view-${index + 1}`);
  const label = system ? 'All Accounts' : String(source.label || '').trim();
  const accounts = source.accounts === null
    ? null
    : sortAccountNames(Array.isArray(source.accounts) ? source.accounts : []);

  return {
    id,
    label: label || (system ? 'All Accounts' : `View ${index + 1}`),
    accounts: system ? null : accounts,
    ...(system ? { system: true } : {})
  };
}

function cloneAccountView(view) {
  return {
    id: view.id,
    label: view.label,
    accounts: view.accounts === null ? null : [...(view.accounts || [])],
    ...(view.system ? { system: true } : {})
  };
}
