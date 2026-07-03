// ---- Status-Logik ----------------------------------------------------
const CYCLE = { "": "available", "available": "maybe", "maybe": "unavailable", "unavailable": "clear" };
const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const COLORS = ["#f5a524","#34d399","#60a5fa","#f87171","#c084fc","#fb923c","#2dd4bf","#f472b6"];

// ---- State -----------------------------------------------------------
let members = [];
let entries = {};            // { "yyyy-MM-dd": { memberId: { status, note } } }
let concerts = {};           // { "yyyy-MM-dd": setlistName }
let todoDueDates = {};       // { "yyyy-MM-dd": [{id, title}] }
let rehearsals = {};         // { "yyyy-MM-dd": { id, note } }
let current = new Date();
let session = null;          // { token, id, name, color }
let currentDayDate = null;
let selectedDayStatus = null;

// ---- API-Wrapper -----------------------------------------------------
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (session?.token) headers["X-Session-Token"] = session.token;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearSession();
    showLogin();
    throw new Error("unauthorized");
  }
  return res;
}

// ---- Session ---------------------------------------------------------
function saveSession(s) {
  session = s;
  localStorage.setItem("session", JSON.stringify(s));
}

function clearSession() {
  session = null;
  localStorage.removeItem("session");
}

function showLogin() {
  document.getElementById("loginScreen").hidden = false;
  document.getElementById("loginSection").hidden = false;
  document.getElementById("setupSection").hidden = true;
  document.getElementById("loginName").focus();
}

function showSetup() {
  document.getElementById("loginScreen").hidden = false;
  document.getElementById("loginSection").hidden = true;
  document.getElementById("setupSection").hidden = false;
  document.getElementById("setupName").focus();
}

function hideLogin() {
  document.getElementById("loginScreen").hidden = true;
}

function updateUserDisplay() {
  const el = document.getElementById("userDisplay");
  if (session) {
    el.innerHTML = `<span class="user-dot" style="background:${session.color}"></span>${session.displayName || session.name}`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
  document.getElementById("adminNavLink").hidden = false;
}

// ---- Helpers ---------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function initialsOf(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

// ---- Laden -----------------------------------------------------------
async function loadMembers() {
  const res = await api("/api/members");
  members = await res.json();
  renderMemberList();
}

async function loadSetlists() {
  try {
    const res = await api("/api/setlists");
    const list = await res.json();
    concerts = {};
    for (const s of list) {
      if (s.concertDate) concerts[s.concertDate] = s.name;
    }
  } catch {}
}

async function loadRehearsals() {
  try {
    const res = await api("/api/events");
    const list = await res.json();
    rehearsals = {};
    for (const e of list) rehearsals[e.date] = { id: e.id, note: e.note, time: e.time };
  } catch {}
}

async function loadTodoDueDates() {
  try {
    const key = monthKey(current);
    const res = await api(`/api/todo/calendar?month=${key}`);
    const list = await res.json();
    todoDueDates = {};
    for (const c of list) {
      if (c.dueDate) (todoDueDates[c.dueDate] ??= []).push({ id: c.id, title: c.title });
    }
  } catch {}
}

async function loadMonth() {
  const key = monthKey(current);
  const [res] = await Promise.all([
    api(`/api/availability?month=${key}`),
    loadSetlists(),
    loadTodoDueDates(),
    loadRehearsals()
  ]);
  const list = await res.json();
  entries = {};
  for (const e of list) {
    (entries[e.date] ??= {})[e.memberId] = { status: e.status, note: e.note ?? null };
  }
  renderCalendar();
  renderMemberList();
}

// ---- Rendering -------------------------------------------------------
function renderMemberList() {
  const card = document.getElementById("membersCard");
  if (!card) return;

  card.querySelector("h3").textContent = "Anstehende Termine";
  document.getElementById("memberList").hidden = true;
  const ul = document.getElementById("rehearsalList");
  ul.hidden = false;
  ul.innerHTML = "";
  const today = ymd(new Date());
  const items = [
    ...Object.entries(rehearsals)
      .filter(([date]) => date >= today)
      .map(([date, ev]) => ({ date, type: "rehearsal", label: ev.note || "Bandprobe", time: ev.time, ics: `/api/events/${date}/ics` })),
    ...Object.entries(concerts)
      .filter(([date]) => date >= today)
      .map(([date, name]) => ({ date, type: "concert", label: name, ics: `/api/setlists/concert/${date}/ics` }))
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = "Keine anstehenden Termine.";
    ul.appendChild(li);
    return;
  }
  for (const item of items) {
    const [y, m, d] = item.date.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dateLabel = item.date === today ? "Heute" : `${DOW[dateObj.getDay()]}, ${d}. ${MONTHS[m - 1]}`;
    const icon = item.type === "concert" ? "🎸" : "🥁";
    const timeLabel = item.time ? `<span style="font-size:12px;color:var(--muted);margin-left:6px;">${esc(item.time)} Uhr</span>` : "";
    const li = document.createElement("li");
    if (item.type === "rehearsal" && session) {
      li.style.cursor = "pointer";
      li.onclick = () => openDayModal(item.date);
    }
    li.innerHTML = `
      <span style="font-size:13px;margin-right:6px;">${icon}</span>
      <span class="rehearsal-date-label${item.date === today ? " today-label" : ""}">${dateLabel}</span>
      <span class="rehearsal-note-label">${esc(item.label)}</span>${timeLabel}
      <a class="ghost" style="font-size:12px;padding:4px 10px;margin-left:auto;" href="${item.ics}" download="${item.label}-${item.date}.ics" onclick="event.stopPropagation()">📅</a>`;
    ul.appendChild(li);
  }
}

function renderCalendar() {
  document.getElementById("monthLabel").textContent =
    `${MONTHS[current.getMonth()]} ${current.getFullYear()}`;

  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  const year = current.getFullYear();
  const month = current.getMonth();
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = ymd(new Date());

  for (let i = 0; i < lead; i++) {
    const empty = document.createElement("div");
    empty.className = "day empty";
    grid.appendChild(empty);
  }

  const perfectDays = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    const dayStatuses = entries[dateStr] || {};

    const cell = document.createElement("div");
    cell.className = "day";
    if (session && members.length > 0) cell.classList.add("clickable");
    if (dateStr === todayStr) cell.classList.add("today");

    const allFree = members.length > 0 &&
      members.every((m) => dayStatuses[m.id]?.status === "available");
    if (allFree) { cell.classList.add("perfect"); perfectDays.push(d); }

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = d;
    cell.appendChild(num);

    const dots = document.createElement("div");
    dots.className = "dots";
    for (const m of members) {
      const entry = dayStatuses[m.id];
      if (!entry) continue;
      const dot = document.createElement("span");
      dot.className = `dot ${entry.status}`;
      if (session && m.id === session.id) dot.classList.add("me");
      dot.title = `${m.name}: ${labelOf(entry.status)}${entry.note ? ' – ' + entry.note : ''}`;
      dot.textContent = initialsOf(m.name);
      dots.appendChild(dot);
    }
    cell.appendChild(dots);

    if (rehearsals[dateStr]) {
      cell.classList.add("has-rehearsal");
      const badge = document.createElement("div");
      badge.className = "rehearsal-badge";
      const ev = rehearsals[dateStr];
      badge.textContent = "Bandprobe" + (ev.time ? ` · ${ev.time}` : "");
      cell.appendChild(badge);
    }

    if (concerts[dateStr]) {
      const badge = document.createElement("div");
      badge.className = "concert-badge";
      badge.title = concerts[dateStr];
      badge.textContent = "🎸 " + concerts[dateStr];
      cell.appendChild(badge);
      cell.classList.add("has-concert");
    }

    const todos = todoDueDates[dateStr] ?? [];
    if (todos.length > 0) {
      const badge = document.createElement("a");
      badge.className = "todo-cal-badge";
      badge.href = `/todo.html?card=${todos[0].id}`;
      badge.title = todos.map(t => t.title).join("\n");
      badge.textContent = todos.length > 1 ? `📋 ${todos.length}` : "📋";
      badge.addEventListener("click", e => e.stopPropagation());
      cell.appendChild(badge);
    }

    if (session && members.length > 0) {
      cell.onclick = () => openDayModal(dateStr);
    }
    grid.appendChild(cell);
  }

  renderPerfect(perfectDays);
}

function labelOf(st) {
  return st === "available" ? "frei" : st === "maybe" ? "vielleicht" : "keine Zeit";
}

function renderPerfect(days) {
  const box = document.getElementById("perfectBox");
  const txt = document.getElementById("perfectText");
  const actions = document.getElementById("perfectActions");
  // Tage ohne bestehende Probe
  days = days.filter(d => !rehearsals[`${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(d)}`]);
  if (days.length === 0) { box.hidden = true; return; }
  box.hidden = false;
  const list = days.map((d) => `${d}.`).join(", ");
  txt.textContent = days.length === 1
    ? `Perfekter Termin: ${list} ${MONTHS[current.getMonth()]} – alle haben Zeit!`
    : `Perfekte Termine: ${list} ${MONTHS[current.getMonth()]} – alle haben Zeit!`;

  actions.innerHTML = "";
  if (days.length === 1) {
    const dateStr = `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(days[0])}`;
    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.style.fontSize = "13px";
    btn.textContent = "🥁 Bandprobe ansetzen";
    btn.onclick = () => openDayModal(dateStr);
    actions.appendChild(btn);
  } else {
    const lbl = document.createElement("span");
    lbl.style.cssText = "font-size:12px;color:var(--muted);align-self:center;white-space:nowrap;";
    lbl.textContent = "🥁 Bandprobe ansetzen:";
    actions.appendChild(lbl);
    for (const d of days) {
      const dateStr = `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(d)}`;
      const btn = document.createElement("button");
      btn.className = "ghost";
      btn.style.fontSize = "12px";
      btn.textContent = `${d}. ${MONTHS[current.getMonth()].slice(0, 3)}.`;
      btn.onclick = () => openDayModal(dateStr);
      actions.appendChild(btn);
    }
  }
}


// ---- Aktionen --------------------------------------------------------
const DOW = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];

function openDayModal(dateStr) {
  if (!session) return;
  currentDayDate = dateStr;
  const myEntry = entries[dateStr]?.[session.id];
  selectedDayStatus = myEntry?.status ?? null;

  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  document.getElementById("dayModalTitle").textContent =
    `${DOW[dateObj.getDay()]}, ${d}. ${MONTHS[m - 1]} ${y}`;

  const membersEl = document.getElementById("dayModalMembers");
  membersEl.innerHTML = members.map(mb => {
    const entry = entries[dateStr]?.[mb.id];
    const chip = entry
      ? `<span class="day-chip ${entry.status}">${labelOf(entry.status)}</span>`
      : `<span style="color:var(--muted);font-size:13px;">—</span>`;
    const note = entry?.note
      ? `<span class="day-member-note">${esc(entry.note)}</span>` : "";
    return `<div class="day-member-row">
      <div class="day-member-row-top">
        <span class="user-dot" style="background:${mb.color};width:10px;height:10px;border-radius:50%;flex-shrink:0;"></span>
        <span class="day-member-name">${esc(mb.name)}</span>
        ${chip}
      </div>
      ${note}
    </div>`;
  }).join("");

  updateDayStatusBtns();
  document.getElementById("dayNote").value = myEntry?.note ?? "";
  const clrBtn = document.getElementById("clearDayBtn");
  if (clrBtn) clrBtn.disabled = false;

  const rehearsalEl = document.getElementById("dayModalRehearsal");
  if (rehearsalEl) {
    const ev = rehearsals[dateStr];
    if (ev) {
      rehearsalEl.innerHTML = `
        <p style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 8px;">Bandprobe</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <input id="rehearsalNote" type="text" value="${esc(ev.note || "")}" placeholder="Notiz (optional)" style="flex:1;min-width:100px;" />
          <input id="rehearsalTime" type="time" value="${esc(ev.time || "")}" style="width:105px;" />
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="primary" style="flex:1;font-size:13px;padding:8px 14px;" onclick="setRehearsal('${dateStr}')">Speichern</button>
          <a class="ghost" style="font-size:12px;padding:8px 10px;" href="/api/events/${dateStr}/ics" download="Bandprobe-${dateStr}.ics">📅</a>
          <button class="ghost danger" style="font-size:12px;padding:8px 10px;" onclick="removeRehearsal('${dateStr}')">Entfernen</button>
        </div>`;
    } else {
      rehearsalEl.innerHTML = `
        <p style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 8px;">Bandprobe ansetzen</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <input id="rehearsalNote" type="text" placeholder="Notiz (optional)" style="flex:1;min-width:100px;" />
          <input id="rehearsalTime" type="time" style="width:105px;" />
        </div>
        <button class="primary" style="width:100%;margin-top:8px;font-size:13px;padding:8px 14px;" onclick="setRehearsal('${dateStr}')">+ Bandprobe</button>`;
    }
  }

  document.getElementById("dayModal").hidden = false;
}

async function setRehearsal(date) {
  const note = document.getElementById("rehearsalNote")?.value.trim() || null;
  const time = document.getElementById("rehearsalTime")?.value || null;
  await api("/api/events", { method: "POST", body: JSON.stringify({ date, note, time }) });
  await loadRehearsals();
  renderCalendar();
  openDayModal(date);
}

async function removeRehearsal(date) {
  await api(`/api/events/${encodeURIComponent(date)}`, { method: "DELETE" });
  await loadRehearsals();
  renderCalendar();
  openDayModal(date);
}

function selectDayStatus(status) {
  selectedDayStatus = status;
  updateDayStatusBtns();
  autoSaveDay();
}

const STATUS_COLORS = {
  available:   { bg: "#1de97a", color: "#06040a", border: "#1de97a" },
  maybe:       { bg: "#ffe040", color: "#06040a", border: "#ffe040" },
  unavailable: { bg: "#ff2d4a", color: "#ffffff", border: "#ff2d4a" }
};

function updateDayStatusBtns() {
  document.querySelectorAll(".status-btn").forEach(btn => {
    const active = btn.dataset.status === selectedDayStatus;
    btn.classList.toggle("active", active);
    if (active) {
      const c = STATUS_COLORS[btn.dataset.status];
      btn.style.background = c.bg;
      btn.style.color = c.color;
      btn.style.borderColor = c.border;
    } else {
      btn.style.background = "";
      btn.style.color = "";
      btn.style.borderColor = "";
    }
  });
}

function closeDayModal() {
  document.getElementById("dayModal").hidden = true;
  currentDayDate = null;
  selectedDayStatus = null;
}

async function autoSaveDay() {
  if (!selectedDayStatus || !currentDayDate || !session) return;
  const note = document.getElementById("dayNote").value.trim() || null;
  try {
    await api("/api/availability", {
      method: "PUT",
      body: JSON.stringify({ memberId: session.id, date: currentDayDate, status: selectedDayStatus, note })
    });
    (entries[currentDayDate] ??= {})[session.id] = { status: selectedDayStatus, note };
    renderCalendar();
  } catch {}
}

async function clearDayModal() {
  const btn = document.getElementById("clearDayBtn");
  if (btn) btn.disabled = true;
  try {
    await api("/api/availability", {
      method: "PUT",
      body: JSON.stringify({ memberId: session.id, date: currentDayDate, status: "clear", note: null })
    });
    selectedDayStatus = null;
    updateDayStatusBtns();
    if (entries[currentDayDate]) delete entries[currentDayDate][session.id];
    renderCalendar();
  } catch {} finally {
    if (btn) btn.disabled = false;
  }
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


async function removeMember(m) {
  if (!confirm(`${m.name} wirklich entfernen? Alle Einträge gehen verloren.`)) return;
  await api(`/api/members/${m.id}`, { method: "DELETE" });
  // Wenn das eigene Konto gelöscht wurde, ausloggen
  if (session && session.id === m.id) {
    clearSession();
    showLogin();
    members = [];
    entries = {};
    renderMemberList();
    renderCalendar();
  } else {
    await loadMembers();
    await loadMonth();
  }
}

// ---- Auth ------------------------------------------------------------
async function doLogin() {
  const name = document.getElementById("loginName").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.hidden = true;

  if (!name || !password) {
    errEl.textContent = "Bitte Name und Passwort eingeben.";
    errEl.hidden = false;
    return;
  }

  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password })
    });
    if (!res.ok) {
      const body = await res.json();
      errEl.textContent = body.error || "Anmeldung fehlgeschlagen.";
      errEl.hidden = false;
      return;
    }
    const data = await res.json();
    saveSession({ token: data.token, id: data.id, name: data.name, displayName: data.displayName, color: data.color, isAdmin: data.isAdmin });
    hideLogin();
    updateUserDisplay();
    await loadMembers();
    await loadMonth();
    initPush();
  } catch {
    errEl.textContent = "Verbindungsfehler.";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

async function doLogout() {
  try { await api("/api/logout", { method: "POST" }); } catch {}
  clearSession();
  members = [];
  entries = {};
  document.getElementById("userDisplay").hidden = true;
  renderMemberList();
  renderCalendar();
  document.getElementById("loginName").value = "";
  document.getElementById("loginPassword").value = "";
  showLogin();
}


// ---- Setup (erstes Konto) --------------------------------------------
async function doSetup() {
  const name = document.getElementById("setupName").value.trim();
  const password = document.getElementById("setupPassword").value;
  const errEl = document.getElementById("setupError");
  errEl.hidden = true;

  if (!name || !password) {
    errEl.textContent = "Bitte Name und Passwort eingeben.";
    errEl.hidden = false;
    return;
  }

  const btn = document.getElementById("setupBtn");
  btn.disabled = true;
  try {
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: "#f5a524", password })
    });
    if (!res.ok) {
      const body = await res.json();
      errEl.textContent = body.error || "Fehler beim Anlegen.";
      errEl.hidden = false;
      return;
    }
    const data = await res.json();
    saveSession({ token: data.token, id: data.id, name: data.name, displayName: data.displayName, color: data.color, isAdmin: data.isAdmin });
    hideLogin();
    updateUserDisplay();
    await loadMembers();
    await loadMonth();
    initPush();
  } catch {
    errEl.textContent = "Verbindungsfehler.";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

// ---- Events ----------------------------------------------------------
function wireEvents() {
  document.getElementById("prevMonth").onclick = () => {
    current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    loadMonth();
  };
  document.getElementById("nextMonth").onclick = () => {
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    loadMonth();
  };
  document.getElementById("clearDayBtn").onclick = clearDayModal;
  document.getElementById("loginBtn").onclick = doLogin;
  document.getElementById("loginName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("loginPassword").focus();
  });
  document.getElementById("loginPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
  document.getElementById("setupBtn").onclick = doSetup;
  document.getElementById("setupName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("setupPassword").focus();
  });
  document.getElementById("setupPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSetup();
  });
}

// ---- Push Notifications ----------------------------------------------
function showPushBanner() {
  if (document.getElementById('pushBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'pushBanner';
  banner.style.cssText = [
    'position:fixed', 'bottom:calc(env(safe-area-inset-bottom,0px) + 72px)', 'left:12px', 'right:12px',
    'background:var(--accent)', 'color:#000', 'border-radius:14px',
    'padding:14px 16px', 'display:flex', 'align-items:center', 'gap:12px',
    'box-shadow:0 4px 20px rgba(0,0,0,.4)', 'z-index:700', 'font-size:14px', 'font-weight:600'
  ].join(';');
  banner.innerHTML = `
    <span style="flex:1">🔔 Benachrichtigungen aktivieren, um keine Termine zu verpassen!</span>
    <button onclick="enablePushFromButton()" style="background:#000;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">Aktivieren</button>
    <button onclick="document.getElementById('pushBanner').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;line-height:1;padding:0 2px;">✕</button>
  `;
  document.body.appendChild(banner);
}

async function initPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    if (Notification.permission === 'granted') {
      await subscribePush();
    } else if (Notification.permission !== 'denied') {
      showPushBanner();
    }
  } catch (e) { console.warn('Push SW registration failed:', e.name, e.message); }
}

async function subscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const keyRes = await fetch('/api/push/vapidkey', { headers: { 'X-Session-Token': session.token } });
    if (!keyRes.ok) return;
    const { publicKey } = await keyRes.json();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }
    const json = sub.toJSON();
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': session.token },
      body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth })
    });
    document.getElementById('pushBtn')?.setAttribute('hidden', '');
  } catch (e) { console.warn('Push subscribe failed:', e.name, e.message); }
}

async function enablePushFromButton() {
  const permission = await Notification.requestPermission();
  document.getElementById('pushBanner')?.remove();
  if (permission === 'granted') await subscribePush();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// ---- Presence ----------------------------------------------------------
function fmtPresenceTime(isoStr) {
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
  if (diff < 90) return 'gerade';
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
  if (diff < 7 * 86400) return `vor ${Math.floor(diff / 86400)} Tagen`;
  return new Date(isoStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

async function reportPresence(page) {
  try {
    const res = await api('/api/presence', { method: 'POST', body: JSON.stringify({ page }) });
    const list = await res.json();
    const others = list.filter(p => p.memberId !== session.id);
    if (!others.length) return;
    const bar = document.createElement('div');
    bar.className = 'presence-bar';
    bar.innerHTML = '👁 ' + others.map(p =>
      `<span class="presence-entry"><span class="presence-dot" style="background:${p.memberColor}"></span>${esc(p.memberName)} <span class="presence-time">${fmtPresenceTime(p.lastSeenAt)}</span></span>`
    ).join(' · ');
    document.querySelector('main .legend')?.before(bar);
  } catch {}
}

// ---- Start -----------------------------------------------------------
(async function init() {
  wireEvents();

  const stored = localStorage.getItem("session");
  if (stored) {
    try {
      const s = JSON.parse(stored);
      const res = await fetch("/api/me", {
        headers: { "X-Session-Token": s.token }
      });
      if (res.ok) {
        const me = await res.json();
        session = { token: s.token, id: me.id, name: me.name, displayName: me.displayName, color: me.color, isAdmin: me.isAdmin };
        localStorage.setItem("session", JSON.stringify(session));
        updateUserDisplay();
        hideLogin();
        await loadMembers();
        await loadMonth();
        initPush();
        reportPresence('kalender');
        return;
      }
    } catch {}
    clearSession();
  }

  // Prüfen ob noch keine Mitglieder existieren → Setup-Screen zeigen
  try {
    const cfg = await fetch("/api/config").then(r => r.json());
    if (cfg.setup) { showSetup(); return; }
  } catch {}

  showLogin();
})();
