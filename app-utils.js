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
