// ---- Auth ------------------------------------------------------------
let session = null;

function initAuth() {
  const s = localStorage.getItem("session");
  if (!s) { location.href = "/"; return false; }
  session = JSON.parse(s);
  const el = document.getElementById("userDisplay");
  el.innerHTML = `<span class="user-dot" style="background:${session.color}"></span>${session.displayName || session.name}`;
  el.hidden = false;
  if ('Notification' in window && Notification.permission === 'default') showPushBanner();
  return true;
}

function showPushBanner() {
  if (document.getElementById('pushBanner')) return;
  const b = document.createElement('div');
  b.id = 'pushBanner';
  b.style.cssText = 'position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 72px);left:12px;right:12px;background:var(--accent);color:#000;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:700;font-size:14px;font-weight:600';
  b.innerHTML = `<span style="flex:1">🔔 Benachrichtigungen aktivieren, um keine Termine zu verpassen!</span><button onclick="Notification.requestPermission().then(p=>{document.getElementById('pushBanner')?.remove();if(p==='granted')location.href='/'})" style="background:#000;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">Aktivieren</button><button onclick="document.getElementById('pushBanner').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;line-height:1;padding:0 2px;">✕</button>`;
  document.body.appendChild(b);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (session?.token) headers["X-Session-Token"] = session.token;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) { localStorage.removeItem("session"); location.href = "/"; throw new Error("unauthorized"); }
  return res;
}

// ---- State -----------------------------------------------------------
let setlists = [];
let allSongs = [];
let members = [];
let openSetlistId = null;
let setlistDetails = {}; // { id: { songs, ratings } }
let autofillMode = {}; // { setlistId: 'count' | 'dur' }

// ---- Load ------------------------------------------------------------
async function loadSetlists() {
  const res = await api("/api/setlists");
  setlists = await res.json();
  renderSetlists();
}

async function loadAllSongs() {
  const res = await api("/api/songs");
  allSongs = await res.json();
}

async function loadMembers() {
  const res = await api("/api/members");
  members = await res.json();
}

async function loadSetlistDetail(id) {
  const res = await api(`/api/setlists/${id}`);
  setlistDetails[id] = await res.json();
}

// ---- Render ----------------------------------------------------------
function fmtDuration(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function starsHtml(current, setlistId) {
  return Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    return `<button class="star-btn ${n <= current ? 'on' : ''}" data-setlist="${setlistId}" data-stars="${n}" onclick="rateSetlist(${setlistId},${n})">★</button>`;
  }).join("");
}

function renderSetlists() {
  const list = document.getElementById("setlistList");
  if (setlists.length === 0) {
    list.innerHTML = `<p class="empty-state">Noch keine Setlisten. Klick auf "+ Setliste" um die erste anzulegen.</p>`;
    return;
  }
  list.innerHTML = setlists.map(sl => {
    const stars = sl.avgRating ? `${sl.avgRating.toFixed(1)} ★ (${sl.ratingCount})` : "na";
    const songs = sl.songCount === 1 ? "1 Song" : `${sl.songCount} Songs`;
    const detail = setlistDetails[sl.id];
    const totalDur = detail?.totalDurationSeconds ? `⏱ ~${fmtDuration(detail.totalDurationSeconds)}` : "";
    const isOpen = openSetlistId === sl.id;
    const dateStr = sl.concertDate ? `<span class="concert-date">${sl.concertDate}</span>` : "";
    return `
      <div class="item-card ${isOpen ? 'open' : ''}" id="setlist-${sl.id}">
        <div class="item-card-header" onclick="toggleSetlist(${sl.id})">
          <span class="item-card-chevron">›</span>
          <div class="header-content">
            <div class="header-row1">
              <span class="item-card-title" id="setlist-title-${sl.id}">${esc(sl.name)}</span>
              <button class="edit-btn" onclick="event.stopPropagation();startRenameSetlist(${sl.id})" title="Umbenennen">✏</button>
              <button class="edit-btn" onclick="event.stopPropagation();playSetlist(${sl.id})" title="Abspielen">▶</button>
              <button class="copy-btn" onclick="event.stopPropagation();exportSetlistPdf(${sl.id})" title="PDF exportieren">⬇</button>
              <button class="copy-btn" onclick="event.stopPropagation();copySetlist(${sl.id})" title="Kopieren">⧉</button>
              <button class="del" onclick="event.stopPropagation();deleteSetlist(${sl.id})" title="Setliste löschen">×</button>
            </div>
            <div class="header-row2">
              <span class="item-card-meta">
                ${dateStr}
                <span>${songs}</span>
                ${totalDur ? `<span>${totalDur}</span>` : ""}
                <span>${stars}</span>
              </span>
            </div>
          </div>
        </div>
        <div class="item-card-body" id="setlist-body-${sl.id}">
          ${isOpen ? renderSetlistBody(sl) : ""}
        </div>
      </div>`;
  }).join("");
}

function renderSetlistBody(sl) {
  const detail = setlistDetails[sl.id];
  if (!detail) return `<p class="empty-state">Lädt…</p>`;

  const myRating = detail.ratings.find(r => r.memberId === session.id);
  const myStars = myRating?.stars ?? 0;
  const myNote = myRating?.note ?? "";

  const songsHtml = detail.songs.length === 0
    ? `<p style="color:var(--muted);font-size:13px;margin:8px 0;">Noch keine Songs in dieser Setliste.</p>`
    : `<ul class="setlist-songs" id="setlist-songs-${sl.id}">${detail.songs.map((entry, idx) => `
        <li class="setlist-song-item" draggable="true" data-entry="${entry.id}" data-setlist="${sl.id}"
            ondragstart="onDragStart(event)" ondragover="onDragOver(event)" ondrop="onDrop(event,${sl.id})" ondragend="onDragEnd(event)">
          <span class="drag-handle" title="Verschieben">⠿</span>
          <span class="setlist-song-pos">${idx + 1}.</span>
          <span class="setlist-song-title">${esc(entry.title)}</span>
          ${entry.avgDurationSeconds ? `<span class="file-size">~${fmtDuration(entry.avgDurationSeconds)}</span>` : ""}
          <button class="del" onclick="removeSongFromSetlist(${sl.id}, ${entry.id})" title="Entfernen">×</button>
        </li>`).join("")}
      </ul>
      ${detail.totalDurationSeconds ? `<p style="color:var(--muted);font-size:13px;margin:6px 0 0;">Gesamtlänge: ~${fmtDuration(detail.totalDurationSeconds)}</p>` : ""}`;

  const availableSongs = allSongs.filter(s => !detail.songs.some(e => e.songId === s.id));
  const addSongHtml = availableSongs.length > 0
    ? `<div class="add-song-row">
        <select id="add-song-select-${sl.id}">
          ${availableSongs.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join("")}
        </select>
        <button class="ghost" onclick="addSongToSetlist(${sl.id})">+ Song hinzufügen</button>
      </div>`
    : `<p style="color:var(--muted);font-size:13px;margin-top:8px;">Alle Songs sind bereits in der Setliste.</p>`;

  const allRatings = detail.ratings.length > 0
    ? `<div class="ratings-list">${detail.ratings.map(r => {
        const m = members.find(m => m.id === r.memberId);
        return `<div class="rating-item"><span class="rating-item-name">${esc(m?.name ?? "?")}</span> ${"★".repeat(r.stars)}${r.note ? `<span class="rating-item-note"> – ${esc(r.note)}</span>` : ""}</div>`;
      }).join("")}</div>`
    : "";

  const mode = autofillMode[sl.id] ?? 'count';
  const autofillHtml = `
    <div class="autofill-panel" id="autofill-panel-${sl.id}">
      <div class="autofill-tabs">
        <button class="autofill-tab ${mode === 'count' ? 'active' : ''}" onclick="setAutofillMode(${sl.id},'count')">Anzahl Songs</button>
        <button class="autofill-tab ${mode === 'dur' ? 'active' : ''}" onclick="setAutofillMode(${sl.id},'dur')">Länge (Min.)</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;">
        <input class="rating-note" id="autofill-val-${sl.id}" type="number" min="1" placeholder="${mode === 'count' ? 'z.B. 12 Songs' : 'z.B. 45 Min.'}" style="width:140px;min-width:90px;flex:none;" />
        <span style="color:var(--muted);font-size:13px;white-space:nowrap;">davon</span>
        <input class="rating-note" id="autofill-cover-${sl.id}" type="number" min="0" value="0" placeholder="0" style="width:70px;flex:none;" />
        <span style="color:var(--muted);font-size:13px;white-space:nowrap;">Cover</span>
        <button class="primary" style="padding:10px 16px;font-size:14px;" onclick="runAutofill(${sl.id})">Ausfüllen</button>
      </div>
      <p style="color:var(--muted);font-size:12px;margin:6px 0 0;">Wählt die am besten bewerteten Songs. Bestehende Songs werden ersetzt.</p>
    </div>`;

  return `
    ${sl.notes ? `<p class="notes-text">${esc(sl.notes)}</p>` : ""}
    <div style="margin-top:14px;">
      <strong style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Songs</strong>
      ${songsHtml}
      ${addSongHtml}
      ${autofillHtml}
    </div>
    <div style="margin-top:16px;">
      <strong style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Deine Bewertung</strong>
      <div class="rating-row">
        <div class="stars">${starsHtml(myStars, sl.id)}</div>
        <input class="rating-note" id="sl-note-${sl.id}" type="text" placeholder="Kommentar (optional)" value="${esc(myNote)}" />
        <button class="primary" style="padding:8px 14px;font-size:14px;" onclick="rateSetlist(${sl.id}, getCurrentStars(${sl.id}))">Speichern</button>
      </div>
    </div>
    ${allRatings}
  `;
}

function getCurrentStars(setlistId) {
  const on = document.querySelectorAll(`[data-setlist="${setlistId}"].on`);
  return on.length;
}

// ---- Actions ---------------------------------------------------------
async function toggleSetlist(id) {
  if (openSetlistId === id) { openSetlistId = null; renderSetlists(); return; }
  openSetlistId = id;
  if (!setlistDetails[id]) await loadSetlistDetail(id);
  renderSetlists();
}

async function copySetlist(id) {
  await api(`/api/setlists/${id}/copy`, { method: "POST" });
  await loadSetlists();
}

function startRenameSetlist(id) {
  const span = document.getElementById(`setlist-title-${id}`);
  if (!span || span.querySelector("input")) return;
  const current = span.textContent;
  span.innerHTML = `<input class="inline-rename" value="${esc(current)}" onclick="event.stopPropagation()" onkeydown="handleRenameSetlistKey(event,${id})" />`;
  const input = span.querySelector("input");
  input.focus();
  input.select();
  input.addEventListener("blur", () => saveRenameSetlist(id));
}

async function saveRenameSetlist(id) {
  const span = document.getElementById(`setlist-title-${id}`);
  const input = span?.querySelector("input");
  if (!input) return;
  const newName = input.value.trim();
  if (!newName) { await loadSetlists(); return; }
  const sl = setlists.find(s => s.id === id);
  if (newName === sl?.name) { span.textContent = newName; return; }
  await api(`/api/setlists/${id}`, { method: "PUT", body: JSON.stringify({ name: newName, concertDate: sl?.concertDate ?? null, notes: sl?.notes ?? null }) });
  await loadSetlists();
}

function handleRenameSetlistKey(e, id) {
  e.stopPropagation();
  if (e.key === "Enter") { e.target.blur(); }
  if (e.key === "Escape") { loadSetlists(); }
}

async function deleteSetlist(id) {
  const sl = setlists.find(s => s.id === id);
  if (!confirm(`Setliste "${sl?.name}" wirklich löschen?`)) return;
  await api(`/api/setlists/${id}`, { method: "DELETE" });
  if (openSetlistId === id) openSetlistId = null;
  delete setlistDetails[id];
  await loadSetlists();
}

async function addSongToSetlist(setlistId) {
  const select = document.getElementById(`add-song-select-${setlistId}`);
  const songId = parseInt(select?.value);
  if (!songId) return;
  await api(`/api/setlists/${setlistId}/songs`, { method: "POST", body: JSON.stringify({ songId }) });
  await loadSetlistDetail(setlistId);
  await loadSetlists();
}

async function removeSongFromSetlist(setlistId, entryId) {
  await api(`/api/setlists/${setlistId}/songs/${entryId}`, { method: "DELETE" });
  await loadSetlistDetail(setlistId);
  await loadSetlists();
}

// ---- Drag & Drop -----------------------------------------------------
let dragSrcEntry = null;

function onDragStart(e) {
  dragSrcEntry = e.currentTarget;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", e.currentTarget.dataset.entry);
  setTimeout(() => e.currentTarget.classList.add("dragging"), 0);
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const target = e.currentTarget;
  if (target === dragSrcEntry) return;
  target.classList.add("drag-over");
}

function onDragEnd(e) {
  document.querySelectorAll(".setlist-song-item").forEach(el => {
    el.classList.remove("dragging", "drag-over");
  });
}

async function onDrop(e, setlistId) {
  e.preventDefault();
  const target = e.currentTarget;
  target.classList.remove("drag-over");
  if (!dragSrcEntry || dragSrcEntry === target) return;

  const list = target.closest("ul");
  const items = [...list.querySelectorAll(".setlist-song-item")];
  const fromIdx = items.indexOf(dragSrcEntry);
  const toIdx = items.indexOf(target);
  if (fromIdx === -1 || toIdx === -1) return;

  // Reorder in DOM optimistically
  if (fromIdx < toIdx) list.insertBefore(dragSrcEntry, target.nextSibling);
  else list.insertBefore(dragSrcEntry, target);

  const newOrder = [...list.querySelectorAll(".setlist-song-item")].map(el => parseInt(el.dataset.entry));
  await api(`/api/setlists/${setlistId}/songs/order`, {
    method: "PUT",
    body: JSON.stringify({ entryIds: newOrder })
  });
  await loadSetlistDetail(setlistId);
  renderSetlists();
}

function setAutofillMode(setlistId, mode) {
  autofillMode[setlistId] = mode;
  // Re-render just the autofill panel without full re-render
  const panel = document.getElementById(`autofill-panel-${setlistId}`);
  if (!panel) return;
  const sl = setlists.find(s => s.id === setlistId);
  if (!sl) return;
  panel.querySelectorAll('.autofill-tab').forEach((btn, i) => {
    btn.classList.toggle('active', (i === 0 && mode === 'count') || (i === 1 && mode === 'dur'));
  });
  const input = document.getElementById(`autofill-val-${setlistId}`);
  if (input) { input.value = ""; input.placeholder = mode === 'count' ? 'z.B. 12 Songs' : 'z.B. 45 Min.'; }
}

async function runAutofill(setlistId) {
  const mode = autofillMode[setlistId] ?? 'count';
  const val = parseFloat(document.getElementById(`autofill-val-${setlistId}`)?.value);
  if (!val || val < 1) { alert(mode === 'count' ? 'Bitte Anzahl der Songs eingeben.' : 'Bitte Länge in Minuten eingeben.'); return; }

  const coverCount = parseInt(document.getElementById(`autofill-cover-${setlistId}`)?.value ?? "0") || 0;
  const base = mode === 'count' ? { count: Math.round(val) } : { targetMinutes: val };
  const body = { ...base, coverCount };
  const res = await api(`/api/setlists/${setlistId}/autofill`, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) { const b = await res.json(); alert(b.error || "Fehler beim Ausfüllen."); return; }
  const result = await res.json();

  delete setlistDetails[setlistId];
  await loadSetlistDetail(setlistId);
  await loadSetlists();

  if (result.count === 0) {
    alert(mode === 'dur' ? 'Keine Songs mit bekannter Länge gefunden.' : 'Keine Songs vorhanden.');
  }
}

async function rateSetlist(setlistId, stars) {
  document.querySelectorAll(`[data-setlist="${setlistId}"]`).forEach(btn => {
    btn.classList.toggle("on", parseInt(btn.dataset.stars) <= stars);
  });
  const note = document.getElementById(`sl-note-${setlistId}`)?.value ?? "";
  await api(`/api/setlists/${setlistId}/rating`, {
    method: "PUT",
    body: JSON.stringify({ stars, note })
  });
  await loadSetlistDetail(setlistId);
  await loadSetlists();
}

// ---- Modal -----------------------------------------------------------
function openModal() {
  document.getElementById("setlistName").value = "";
  document.getElementById("setlistDate").value = "";
  document.getElementById("setlistNotes").value = "";
  document.getElementById("setlistModal").hidden = false;
  document.getElementById("setlistName").focus();
}
function closeModal() { document.getElementById("setlistModal").hidden = true; }

async function addSetlist() {
  const name = document.getElementById("setlistName").value.trim();
  const date = document.getElementById("setlistDate").value || null;
  const notes = document.getElementById("setlistNotes").value.trim() || null;
  if (!name) { alert("Bitte einen Namen eingeben."); return; }
  closeModal();
  await api("/api/setlists", { method: "POST", body: JSON.stringify({ name, concertDate: date, notes }) });
  await loadSetlists();
}

// ---- Events ----------------------------------------------------------
// ---- Player ----------------------------------------------------------
let playerQueue = [];
let playerIndex = 0;

async function playSetlist(id) {
  const sl = setlists.find(s => s.id === id);
  try {
    const res = await api(`/api/setlists/${id}/play`);
    const queue = await res.json();
    if (!queue.length) { alert("Keine Audioaufnahmen in dieser Setliste vorhanden."); return; }
    playerQueue = queue;
    playerIndex = 0;
    document.getElementById('playerSetlistName').textContent = sl?.name ?? '';
    document.getElementById('playerOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
    renderPlayerQueue();
    playPlayerTrack(0);
  } catch { alert("Fehler beim Laden der Wiedergabeliste."); }
}

function closePlayer() {
  const audio = document.getElementById('playerAudio');
  audio.pause();
  audio.src = '';
  document.getElementById('playerOverlay').hidden = true;
  document.body.style.overflow = '';
}

function playPlayerTrack(index) {
  playerIndex = index;
  const track = playerQueue[index];
  if (!track) return;
  const audio = document.getElementById('playerAudio');
  document.getElementById('playerTrackTitle').textContent = track.title;
  document.getElementById('playerTrackMeta').textContent = `Song ${index + 1} von ${playerQueue.length}`;
  document.getElementById('playerPrev').disabled = index === 0;
  document.getElementById('playerNext').disabled = index === playerQueue.length - 1;
  audio.src = `/uploads/songs/${track.fileName}`;
  audio.load();
  audio.play().catch(() => {});
  document.querySelectorAll('#playerQueue li').forEach((el, i) => {
    el.classList.toggle('player-active', i === index);
    if (i === index) el.scrollIntoView({ block: 'nearest' });
  });
}

function playerStep(dir) {
  const next = playerIndex + dir;
  if (next >= 0 && next < playerQueue.length) playPlayerTrack(next);
}

function renderPlayerQueue() {
  const ul = document.getElementById('playerQueue');
  ul.innerHTML = playerQueue.map((t, i) =>
    `<li onclick="playPlayerTrack(${i})">
      <span class="player-num">${i + 1}</span>
      <span>${esc(t.title)}</span>
    </li>`
  ).join('');
  // Auto-advance when track ends
  const audio = document.getElementById('playerAudio');
  audio.onended = () => { if (playerIndex < playerQueue.length - 1) playPlayerTrack(playerIndex + 1); };
}

// Close player when clicking backdrop
document.getElementById('playerOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('playerOverlay')) closePlayer();
});

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
    document.querySelector('.page-header')?.after(bar);
  } catch {}
}

function wireEvents() {
  document.getElementById("addSetlistBtn").onclick = openModal;
  document.getElementById("cancelSetlist").onclick = closeModal;
  document.getElementById("saveSetlist").onclick = addSetlist;
  document.getElementById("setlistName").addEventListener("keydown", e => { if (e.key === "Enter") addSetlist(); });
}

// ---- PDF Export ------------------------------------------------------
async function loadImageAsDataUrl(src) {
  const res = await fetch(src);
  const blob = await res.blob();
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function exportSetlistPdf(setlistId) {
  if (!setlistDetails[setlistId]) await loadSetlistDetail(setlistId);
  const sl = setlists.find(s => s.id === setlistId);
  const detail = setlistDetails[setlistId];
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pink  = [232, 21, 106];
  const black = [20, 16, 28];
  const grey  = [150, 140, 160];
  const W = 210, H = 297, margin = 14;

  // Logo laden
  let logoDataUrl = null;
  try { logoDataUrl = await loadImageAsDataUrl("/logo.jpeg"); } catch {}

  // --- Header (kompakt, weißer Hintergrund) ---
  const logoSize = 20;
  if (logoDataUrl) doc.addImage(logoDataUrl, "JPEG", margin, 8, logoSize, logoSize);

  const titleX = logoDataUrl ? margin + logoSize + 5 : margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...black);
  doc.text(sl.name, titleX, 16, { maxWidth: W - titleX - margin });

  if (sl.concertDate) {
    const parts = sl.concertDate.split("-");
    const dateFormatted = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : sl.concertDate;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...grey);
    doc.text(dateFormatted, titleX, 24);
  }

  // Trennlinie unter Header
  const headerBottom = 32;
  doc.setDrawColor(...pink);
  doc.setLineWidth(0.6);
  doc.line(margin, headerBottom, W - margin, headerBottom);

  // --- Schriftgröße dynamisch berechnen ---
  const songs = detail?.songs ?? [];
  const footerH = 10;                        // Platz für Gesamtlänge unten
  const availableH = H - headerBottom - footerH - margin;
  // lineHeight in mm: gleichmäßig verteilen, max 18mm, min 7mm
  const lineH = Math.min(18, Math.max(7, availableH / Math.max(songs.length, 1)));
  // fontSize: 1mm ≈ 2.83pt, Schrift ca. 65% der lineHeight
  const fontSize = Math.round(lineH * 2.83 * 0.65);
  const numFontSize = Math.round(fontSize * 0.75);
  const durFontSize = Math.round(fontSize * 0.7);

  let y = headerBottom + lineH;

  songs.forEach((entry, i) => {
    // Zebra
    if (i % 2 === 0) {
      doc.setFillColor(248, 246, 250);
      doc.rect(margin - 2, y - lineH * 0.75, W - (margin - 2) * 2, lineH, "F");
    }

    // Nummer
    doc.setFontSize(numFontSize);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...pink);
    doc.text(`${i + 1}.`, margin, y);

    // Titel
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...black);
    const numW = doc.getTextWidth(`${songs.length}.`) + 3;
    doc.text(entry.title, margin + numW, y);

    // Dauer
    if (entry.avgDurationSeconds) {
      const dur = fmtDuration(entry.avgDurationSeconds);
      doc.setFontSize(durFontSize);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...grey);
      doc.text(dur, W - margin, y, { align: "right" });
    }

    y += lineH;
  });

  // Gesamtlänge
  if (detail?.totalDurationSeconds) {
    doc.setDrawColor(...pink);
    doc.setLineWidth(0.4);
    doc.line(margin, H - footerH - 2, W - margin, H - footerH - 2);
    doc.setFontSize(Math.max(10, durFontSize));
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...black);
    doc.text(`Gesamt: ~${fmtDuration(detail.totalDurationSeconds)}`, W - margin, H - footerH + 3, { align: "right" });
  }

  doc.save(`${sl.name.replace(/[/\\:*?"<>|]/g, "")}.pdf`);
}

// ---- Start -----------------------------------------------------------
(async function init() {
  if (!initAuth()) return;
  document.getElementById("adminNavLink").hidden = false;
  const res = await fetch("/api/me", { headers: { "X-Session-Token": session.token } });
  if (!res.ok) { localStorage.removeItem("session"); location.href = "/"; return; }
  wireEvents();
  await Promise.all([loadMembers(), loadAllSongs(), loadSetlists()]);
  reportPresence('setlists');
})();
