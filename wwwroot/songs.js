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
let songs = [];
let members = [];
let openSongId = null;
let songDetails = {}; // { id: { files } }
let activeTab = 'own';

// ---- Load ------------------------------------------------------------
async function loadSongs() {
  const res = await api("/api/songs");
  songs = await res.json();
  renderSongs();
}

async function loadMembers() {
  const res = await api("/api/members");
  members = await res.json();
}

async function loadSongDetails(id) {
  const [filesRes, ratingsRes] = await Promise.all([
    api(`/api/songs/${id}/files`),
    api(`/api/songs/${id}/ratings`)
  ]);
  songDetails[id] = {
    files: await filesRes.json(),
    ratings: await ratingsRes.json()
  };
}

// ---- Render ----------------------------------------------------------
function fileStarsHtml(fileId, currentStars) {
  return Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    return `<button class="star-btn ${n <= currentStars ? 'on' : ''}" data-file="${fileId}" data-stars="${n}" onclick="selectFileStars(${fileId},${n})">★</button>`;
  }).join("");
}

function songStarsHtml(songId, currentStars) {
  return Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    return `<button class="star-btn ${n <= currentStars ? 'on' : ''}" data-song="${songId}" data-stars="${n}" onclick="selectSongStars(${songId},${n})">★</button>`;
  }).join("");
}

function headerStarsHtml(songId, currentStars) {
  return Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    return `<button class="star-btn header-star ${n <= currentStars ? 'on' : ''}" data-hsong="${songId}" data-hstars="${n}" onclick="event.stopPropagation();quickRateSong(${songId},${n})">★</button>`;
  }).join("");
}

async function quickRateSong(songId, stars) {
  document.querySelectorAll(`[data-hsong="${songId}"]`).forEach(btn => {
    btn.classList.toggle("on", parseInt(btn.dataset.hstars) <= stars);
  });
  const existingNote = songDetails[songId]?.ratings?.find(r => r.memberId === session.id)?.note ?? "";
  await api(`/api/songs/${songId}/rating`, { method: "PUT", body: JSON.stringify({ stars, note: existingNote }) });
  await loadSongs();
}

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderSongCard(s) {
  const stars = s.avgRating ? `${s.avgRating.toFixed(1)} ★ (${s.ratingCount})` : "na";
  const files = s.fileCount === 1 ? "1 Datei" : `${s.fileCount} Dateien`;
  const dur = s.avgDurationSeconds ? `⏱ ~${fmtDuration(s.avgDurationSeconds)}` : "";
  const isOpen = openSongId === s.id;
  return `
    <div class="item-card ${isOpen ? 'open' : ''}" id="song-${s.id}">
      <div class="item-card-header" onclick="toggleSong(${s.id})">
        <span class="item-card-chevron">›</span>
        <div class="header-content">
          <div class="header-row1">
            <span class="item-card-title" id="song-title-${s.id}">${esc(s.title)}</span>
            <span class="item-card-meta">
              <span>${stars}</span>
              <span>${files}</span>
              ${dur ? `<span>${dur}</span>` : ""}
            </span>
            <button class="edit-btn" onclick="event.stopPropagation();startRenameSong(${s.id})" title="Umbenennen">✏</button>
            <button class="del" onclick="event.stopPropagation();deleteSong(${s.id})" title="Song löschen">×</button>
          </div>
          <div class="header-row2" onclick="event.stopPropagation()">
            ${headerStarsHtml(s.id, s.myStars ?? 0)}
          </div>
        </div>
      </div>
      <div class="item-card-body" id="song-body-${s.id}">
        ${isOpen ? renderSongBody(s) : ""}
      </div>
    </div>`;
}

function setTab(tab) {
  activeTab = tab;
  renderSongs();
}

function renderSongs() {
  const list = document.getElementById("songList");
  const tabsEl = document.getElementById("songTabs");

  const own = songs.filter(s => s.category === 'own' || !s.category);
  const covers = songs.filter(s => s.category === 'cover');
  const wip = songs.filter(s => s.category === 'wip');
  const ideas = songs.filter(s => s.category === 'idea');

  if (songs.length === 0) {
    tabsEl.innerHTML = "";
    list.innerHTML = `<p class="empty-state">Noch keine Songs. Klick auf "+ Song" um den ersten anzulegen.</p>`;
    return;
  }

  // Auto-switch if current tab is empty
  if (activeTab === 'own' && own.length === 0) activeTab = covers.length > 0 ? 'cover' : wip.length > 0 ? 'wip' : 'idea';
  if (activeTab === 'cover' && covers.length === 0) activeTab = own.length > 0 ? 'own' : wip.length > 0 ? 'wip' : 'idea';
  if (activeTab === 'wip' && wip.length === 0) activeTab = own.length > 0 ? 'own' : 'cover';
  if (activeTab === 'idea' && ideas.length === 0) activeTab = own.length > 0 ? 'own' : 'cover';

  tabsEl.innerHTML = `
    <button class="song-tab${activeTab === 'own' ? ' active' : ''}" onclick="setTab('own')">
      Eigene <span class="tab-count">${own.length}</span>
    </button>
    <button class="song-tab${activeTab === 'cover' ? ' active' : ''}" onclick="setTab('cover')">
      Cover <span class="tab-count">${covers.length}</span>
    </button>
    <button class="song-tab${activeTab === 'wip' ? ' active' : ''}" onclick="setTab('wip')">
      In Arbeit <span class="tab-count">${wip.length}</span>
    </button>
    <button class="song-tab${activeTab === 'idea' ? ' active' : ''}" onclick="setTab('idea')">
      Ideen <span class="tab-count">${ideas.length}</span>
    </button>`;

  const tabLabels = { own: 'eigene Songs', cover: 'Cover', wip: 'Songs in Arbeit', idea: 'Ideen' };
  const visible = activeTab === 'own' ? own : activeTab === 'cover' ? covers : activeTab === 'wip' ? wip : ideas;
  list.innerHTML = visible.length === 0
    ? `<p class="empty-state">Noch keine ${tabLabels[activeTab]} vorhanden.</p>`
    : visible.map(renderSongCard).join("");
}

function renderSongBody(song) {
  const detail = songDetails[song.id];
  if (!detail) return `<p class="empty-state">Lädt…</p>`;

  const myRating = detail.ratings.find(r => r.memberId === session.id);
  const myStars = myRating?.stars ?? 0;
  const myNote = myRating?.note ?? "";

  const allRatingsHtml = detail.ratings.length > 0
    ? `<div class="ratings-list">${detail.ratings.map(r => {
        const m = members.find(m => m.id === r.memberId);
        return `<div class="rating-item"><span class="rating-item-name">${esc(m?.name ?? "?")}</span> ${"★".repeat(r.stars)}${r.note ? `<span class="rating-item-note"> – ${esc(r.note)}</span>` : ""}</div>`;
      }).join("")}</div>`
    : "";

  const filesHtml = detail.files.length === 0
    ? `<p style="color:var(--muted);font-size:13px;margin:8px 0;">Noch keine Dateien hochgeladen.</p>`
    : `<ul class="file-list">${detail.files.map(f => renderFileItem(song.id, f)).join("")}</ul>`;

  return `
    ${song.notes ? `<p class="notes-text">${esc(song.notes)}</p>` : ""}
    <div class="category-selector">
      <button class="cat-btn${song.category === 'own' || !song.category ? ' active' : ''}" onclick="setCategory(${song.id},'own')">Eigene</button>
      <button class="cat-btn${song.category === 'cover' ? ' active' : ''}" onclick="setCategory(${song.id},'cover')">Cover</button>
      <button class="cat-btn${song.category === 'wip' ? ' active' : ''}" onclick="setCategory(${song.id},'wip')">In Arbeit</button>
      <button class="cat-btn${song.category === 'idea' ? ' active' : ''}" onclick="setCategory(${song.id},'idea')">Idee</button>
    </div>
    <div style="margin-top:14px;">
      <strong style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Song-Bewertung</strong>
      <div class="rating-row">
        <div class="stars">${songStarsHtml(song.id, myStars)}</div>
        <input class="rating-note" id="song-note-${song.id}" type="text" placeholder="Kommentar (optional)" value="${esc(myNote)}" />
        <button class="primary" style="padding:8px 14px;font-size:14px;" onclick="rateSong(${song.id})">Speichern</button>
      </div>
      ${allRatingsHtml}
    </div>
    <div style="margin-top:16px;">
      <strong style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Aufnahmen</strong>
      ${filesHtml}
      <div class="file-add-row">
        <label class="upload-label">
          ↑ Hochladen
          <input type="file" accept=".mp4,.mp3,.wav,.m4a,.ogg" onchange="uploadFile(${song.id}, this)" />
        </label>
        <button class="upload-label" onclick="openRecorder(${song.id})">🎙 Aufnehmen</button>
      </div>
      <div id="recorder-${song.id}" class="recorder-ui" hidden></div>
    </div>
  `;
}

function renderFileItem(songId, f) {
  const myStars = f.myRating?.stars ?? 0;
  const myNote = f.myRating?.note ?? "";
  const avgText = f.ratingCount > 0
    ? `<span class="file-avg">⌀ ${f.avgRating.toFixed(1)} ★ (${f.ratingCount})</span>`
    : `<span class="file-avg" style="color:var(--muted)">na</span>`;

  const otherRatings = (f.allRatings ?? []).filter(r => r.memberId !== session.id);
  const othersHtml = otherRatings.length > 0
    ? `<div class="file-other-ratings">${otherRatings.map(r => {
        const m = members.find(m => m.id === r.memberId);
        return `<span class="file-other-rating"><span class="file-other-name">${esc(m?.name ?? "?")}</span> ${"★".repeat(r.stars)}${r.note ? ` <span class="file-other-note">– ${esc(r.note)}</span>` : ""}</span>`;
      }).join("")}</div>`
    : "";

  const isVideo = /\.(mp4|mov|webm)$/i.test(f.originalName);
  const playerHtml = isVideo
    ? `<video controls src="/uploads/songs/${f.fileName}" style="width:100%;max-height:200px;border-radius:6px;margin-top:6px;"></video>`
    : `<audio controls src="/uploads/songs/${f.fileName}" style="width:100%;margin-top:6px;"></audio>`;

  return `
    <li class="file-item" id="file-item-${f.id}">
      <div class="file-item-main">
        <span class="file-link" id="file-name-${f.id}">${esc(f.originalName)}</span>
        <div class="file-meta">
          ${f.durationSeconds ? `<span>⏱ ${fmtDuration(f.durationSeconds)}</span>` : ""}
          <span>${fmtSize(f.fileSize)}</span>
          ${avgText}
          <button class="edit-btn" onclick="copyFileLink(this,${songId})" title="Link kopieren">🔗</button>
          <button class="edit-btn" onclick="notifyFile(${songId},${f.id})" title="Mitglieder benachrichtigen">🔔</button>
          <button class="edit-btn" onclick="startRenameFile(${songId},${f.id})" title="Umbenennen">✏</button>
          <button class="del" onclick="deleteFile(${songId},${f.id})" title="Löschen">×</button>
        </div>
      </div>
      ${playerHtml}
      ${othersHtml}
      <div class="file-item-rating">
        <div class="stars">${fileStarsHtml(f.id, myStars)}</div>
        <input class="rating-note" id="file-note-${f.id}" type="text" placeholder="Kommentar (optional)" value="${esc(myNote)}" />
        <button class="primary" style="padding:8px 14px;font-size:14px;" onclick="rateFile(${songId},${f.id})">Speichern</button>
      </div>
    </li>`;
}

// ---- Song Ratings ----------------------------------------------------
function selectSongStars(songId, stars) {
  document.querySelectorAll(`[data-song="${songId}"]`).forEach(btn => {
    btn.classList.toggle("on", parseInt(btn.dataset.stars) <= stars);
  });
}

function getCurrentSongStars(songId) {
  return document.querySelectorAll(`[data-song="${songId}"].on`).length;
}

async function rateSong(songId) {
  const stars = getCurrentSongStars(songId);
  if (!stars) { alert("Bitte erst Sterne auswählen."); return; }
  const note = document.getElementById(`song-note-${songId}`)?.value ?? "";
  await api(`/api/songs/${songId}/rating`, {
    method: "PUT",
    body: JSON.stringify({ stars, note })
  });
  await loadSongDetails(songId);
  await loadSongs();
}

// ---- File Ratings ----------------------------------------------------
function selectFileStars(fileId, stars) {
  document.querySelectorAll(`[data-file="${fileId}"]`).forEach(btn => {
    btn.classList.toggle("on", parseInt(btn.dataset.stars) <= stars);
  });
}

function getFileStars(fileId) {
  return document.querySelectorAll(`[data-file="${fileId}"].on`).length;
}

async function rateFile(songId, fileId) {
  const stars = getFileStars(fileId);
  if (!stars) { alert("Bitte erst Sterne auswählen."); return; }
  const note = document.getElementById(`file-note-${fileId}`)?.value ?? "";
  await api(`/api/songs/${songId}/files/${fileId}/rating`, {
    method: "PUT",
    body: JSON.stringify({ stars, note })
  });
  await loadSongDetails(songId);
  await loadSongs();
}

// ---- Actions ---------------------------------------------------------
async function toggleSong(id) {
  if (openSongId === id) {
    openSongId = null;
    renderSongs();
    return;
  }
  openSongId = id;
  if (!songDetails[id]) await loadSongDetails(id);
  renderSongs();
}

function startRenameSong(id) {
  const span = document.getElementById(`song-title-${id}`);
  if (!span || span.querySelector("input")) return;
  const current = span.textContent;
  span.innerHTML = `<input class="inline-rename" value="${esc(current)}" onclick="event.stopPropagation()" onkeydown="handleRenameSongKey(event,${id})" />`;
  const input = span.querySelector("input");
  input.focus();
  input.select();
  input.addEventListener("blur", () => saveRenameSong(id));
}

async function saveRenameSong(id) {
  const span = document.getElementById(`song-title-${id}`);
  const input = span?.querySelector("input");
  if (!input) return;
  const newTitle = input.value.trim();
  if (!newTitle) { await loadSongs(); return; }
  const song = songs.find(s => s.id === id);
  if (newTitle === song?.title) { span.textContent = newTitle; return; }
  input.removeEventListener("blur", () => saveRenameSong(id));
  await api(`/api/songs/${id}`, { method: "PUT", body: JSON.stringify({ title: newTitle, notes: song?.notes ?? null, category: song?.category ?? 'own' }) });
  await loadSongs();
}

function handleRenameSongKey(e, id) {
  e.stopPropagation();
  if (e.key === "Enter") { e.target.blur(); }
  if (e.key === "Escape") { loadSongs(); }
}

async function setCategory(id, category) {
  const song = songs.find(s => s.id === id);
  if (!song) return;
  await api(`/api/songs/${id}`, { method: "PUT", body: JSON.stringify({ title: song.title, notes: song.notes ?? null, category }) });
  activeTab = category;
  await loadSongs();
}

async function deleteSong(id) {
  const song = songs.find(s => s.id === id);
  if (!confirm(`"${song?.title}" wirklich löschen? Alle Dateien und Bewertungen gehen verloren.`)) return;
  await api(`/api/songs/${id}`, { method: "DELETE" });
  if (openSongId === id) openSongId = null;
  delete songDetails[id];
  await loadSongs();
}

// ---- Recorder --------------------------------------------------------
const recState = {};

function openRecorder(songId) {
  const ui = document.getElementById(`recorder-${songId}`);
  if (!ui) return;
  ui.hidden = false;
  ui.innerHTML = `<button class="primary" style="margin-top:4px;" onclick="beginRecording(${songId})">● Aufnahme starten</button>`;
}

async function beginRecording(songId) {
  const ui = document.getElementById(`recorder-${songId}`);
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Mikrofon wird in diesem Browser oder auf dieser Verbindung nicht unterstützt (HTTPS erforderlich).");
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      alert("Mikrofonzugriff wurde verweigert. Bitte in den Browser-Einstellungen erlauben.");
    } else if (err.name === "NotFoundError") {
      alert("Kein Mikrofon gefunden.");
    } else {
      alert("Mikrofon konnte nicht geöffnet werden: " + err.name + " – " + err.message);
    }
    return;
  }
  const chunks = [];
  const mr = new MediaRecorder(stream);
  mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  mr.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunks, { type: mr.mimeType });
    showRecordingPreview(songId, blob, mr.mimeType);
  };
  let secs = 0;
  const interval = setInterval(() => {
    secs++;
    const el = document.getElementById(`rec-timer-${songId}`);
    if (el) el.textContent = `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
  }, 1000);
  recState[songId] = { mr, chunks, stream, interval };
  mr.start();
  ui.innerHTML = `
    <div class="recorder-active">
      <span class="rec-dot"></span>
      <span id="rec-timer-${songId}">00:00</span>
      <button class="ghost danger" onclick="stopRecording(${songId})">■ Stopp</button>
    </div>`;
}

function stopRecording(songId) {
  const s = recState[songId];
  if (!s) return;
  clearInterval(s.interval);
  s.mr.stop();
}

function showRecordingPreview(songId, blob, mimeType) {
  const ui = document.getElementById(`recorder-${songId}`);
  if (!ui) return;
  const url = URL.createObjectURL(blob);
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
  const now = new Date();
  const p = n => String(n).padStart(2,'0');
  const name = `Aufnahme-${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}-${p(now.getHours())}-${p(now.getMinutes())}.${ext}`;
  recState[songId] = { ...recState[songId], blob, name, url };
  ui.innerHTML = `
    <audio controls src="${url}" style="width:100%;margin:8px 0;"></audio>
    <div class="recorder-actions">
      <button class="ghost danger" onclick="discardRecording(${songId})">Verwerfen</button>
      <button class="primary" onclick="uploadRecording(${songId})">↑ Hochladen</button>
    </div>`;
}

async function uploadRecording(songId) {
  const s = recState[songId];
  if (!s?.blob) return;
  const ui = document.getElementById(`recorder-${songId}`);
  if (ui) ui.innerHTML = '<span style="color:var(--muted);font-size:13px;">Wird hochgeladen…</span>';
  const file = new File([s.blob], s.name, { type: s.blob.type });
  const duration = await getFileDuration(file);
  const formData = new FormData();
  formData.append("file", file);
  if (duration != null) formData.append("duration", String(duration));
  const res = await fetch(`/api/songs/${songId}/files`, {
    method: "POST",
    headers: { "X-Session-Token": session.token },
    body: formData
  });
  URL.revokeObjectURL(s.url);
  delete recState[songId];
  if (!res.ok) { const b = await res.json(); alert(b.error || "Upload fehlgeschlagen."); return; }
  await loadSongDetails(songId);
  renderSongs();
}

function discardRecording(songId) {
  const s = recState[songId];
  if (s?.url) URL.revokeObjectURL(s.url);
  delete recState[songId];
  const ui = document.getElementById(`recorder-${songId}`);
  if (ui) { ui.hidden = true; ui.innerHTML = ""; }
}

async function uploadFile(songId, input) {
  const file = input.files[0];
  if (!file) return;
  input.disabled = true;
  const duration = await getFileDuration(file);
  const formData = new FormData();
  formData.append("file", file);
  if (duration != null) formData.append("duration", String(duration));
  const res = await fetch(`/api/songs/${songId}/files`, {
    method: "POST",
    headers: { "X-Session-Token": session.token },
    body: formData
  });
  input.disabled = false;
  input.value = "";
  if (!res.ok) { const b = await res.json(); alert(b.error || "Upload fehlgeschlagen."); return; }
  await loadSongDetails(songId);
  renderSongs();
}

function startRenameFile(songId, fileId) {
  const span = document.getElementById(`file-name-${fileId}`);
  if (!span || span.querySelector("input")) return;
  const current = span.textContent;
  span.innerHTML = `<input class="inline-rename" value="${esc(current)}" onkeydown="handleRenameFileKey(event,${songId},${fileId})" />`;
  const input = span.querySelector("input");
  input.focus();
  input.select();
  input.addEventListener("blur", () => saveRenameFile(songId, fileId));
}

async function saveRenameFile(songId, fileId) {
  const span = document.getElementById(`file-name-${fileId}`);
  const input = span?.querySelector("input");
  if (!input) return;
  const newName = input.value.trim();
  if (!newName) { await loadSongDetails(songId); return; }
  await api(`/api/songs/${songId}/files/${fileId}`, { method: "PUT", body: JSON.stringify({ originalName: newName }) });
  await loadSongDetails(songId);
  renderSongs();
}

function handleRenameFileKey(e, songId, fileId) {
  if (e.key === "Enter") { e.target.blur(); }
  if (e.key === "Escape") { loadSongDetails(songId).then(() => renderSongs()); }
}

async function deleteFile(songId, fileId) {
  if (!confirm("Datei löschen?")) return;
  await api(`/api/songs/${songId}/files/${fileId}`, { method: "DELETE" });
  await loadSongDetails(songId);
  renderSongs();
}

async function copyFileLink(btn, songId) {
  const url = location.origin + '/songs.html?songId=' + songId;
  await navigator.clipboard.writeText(url);
  const prev = btn.textContent;
  btn.textContent = "✓";
  setTimeout(() => btn.textContent = prev, 1500);
}

async function notifyFile(songId, fileId) {
  try {
    await api(`/api/songs/${songId}/files/${fileId}/notify`, { method: "POST" });
    alert("Benachrichtigung wurde an alle Mitglieder gesendet.");
  } catch { alert("Fehler beim Senden der Benachrichtigung."); }
}

// ---- Modal -----------------------------------------------------------
function openModal() {
  document.getElementById("songTitle").value = "";
  document.getElementById("songNotes").value = "";
  document.getElementById("songCategory").value = "own";
  document.getElementById("songModal").hidden = false;
  document.getElementById("songTitle").focus();
}
function closeModal() { document.getElementById("songModal").hidden = true; }

async function addSong() {
  const title = document.getElementById("songTitle").value.trim();
  const notes = document.getElementById("songNotes").value.trim();
  const category = document.getElementById("songCategory").value || 'own';
  if (!title) { alert("Bitte einen Titel eingeben."); return; }
  closeModal();
  const newSong = await (await api("/api/songs", { method: "POST", body: JSON.stringify({ title, notes: notes || null, category }) })).json();
  activeTab = ["own","cover","wip","idea"].includes(category) ? category : "own";
  openSongId = newSong.id;
  await loadSongs();
  await loadSongDetails(newSong.id);
  renderSongs();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.getElementById(`song-${newSong.id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("link-target");
    setTimeout(() => el.classList.remove("link-target"), 1800);
  }));
}

// ---- Dauer -----------------------------------------------------------
function fmtDuration(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function getFileDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = file.type.startsWith("video") ? document.createElement("video") : document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(el.duration) ? el.duration : null); };
    el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    el.src = url;
  });
}

// ---- Helpers ---------------------------------------------------------
function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    document.querySelector('.page-header')?.after(bar);
  } catch {}
}

// ---- Deep link / SW message navigation --------------------------------
async function openSongFromUrl(params) {
  const targetId = parseInt(params.get("songId"));
  if (!targetId) return;
  const song = songs.find(s => s.id === targetId);
  if (!song) return;
  const cat = song.category || "own";
  activeTab = ["own", "cover", "wip", "idea"].includes(cat) ? cat : "own";
  openSongId = targetId;
  if (!songDetails[targetId]) await loadSongDetails(targetId);
  renderSongs();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.getElementById(`song-${targetId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("link-target");
    setTimeout(() => el.classList.remove("link-target"), 1800);
  }));
}

if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", event => {
    if (event.data?.type === "sw-navigate") {
      const params = new URLSearchParams(new URL(event.data.url, location.origin).search);
      openSongFromUrl(params);
    }
  });
}

// ---- Events ----------------------------------------------------------
function wireEvents() {
  document.getElementById("addSongBtn").onclick = openModal;
  document.getElementById("cancelSong").onclick = closeModal;
  document.getElementById("saveSong").onclick = addSong;
  document.getElementById("songTitle").addEventListener("keydown", e => { if (e.key === "Enter") addSong(); });
}

// ---- Start -----------------------------------------------------------
(async function init() {
  if (!initAuth()) return;
  document.getElementById("adminNavLink").hidden = false;
  const res = await fetch("/api/me", { headers: { "X-Session-Token": session.token } });
  if (!res.ok) { localStorage.removeItem("session"); location.href = "/"; return; }
  wireEvents();
  await Promise.all([loadMembers(), loadSongs()]);
  reportPresence('songs');

  await openSongFromUrl(new URLSearchParams(location.search));
})();
