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
let columns = [];
let members = [];
let activeColId = null;
let openCard = null;
let newCardAssignees = [];

// ---- Load ------------------------------------------------------------
async function loadAll() {
  const [colRes, memRes] = await Promise.all([
    api("/api/todo/columns"),
    api("/api/members")
  ]);
  columns = await colRes.json();
  members = await memRes.json();
  if (columns.length > 0 && (!activeColId || !columns.find(c => c.id === activeColId))) {
    activeColId = columns[0].id;
  }
  render();
}

// ---- Render ----------------------------------------------------------
function render() {
  renderTabs();
  renderColActions();
  renderCards();
}

function renderTabs() {
  const el = document.getElementById("todoTabs");
  el.innerHTML = columns.map(c =>
    `<button class="song-tab${c.id === activeColId ? ' active' : ''}" onclick="setCol(${c.id})">${esc(c.name)} <span class="tab-count">${c.cards.length}</span></button>`
  ).join("") + `<button class="song-tab todo-add-col-tab" onclick="openAddColModal()" title="Spalte hinzufügen">+</button>`;
}

function renderColActions() {
  const el = document.getElementById("todoColActions");
  const col = columns.find(c => c.id === activeColId);
  if (!col) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <div class="todo-col-action-row">
      <span class="col-name-label" id="col-name-${col.id}">${esc(col.name)}</span>
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="edit-btn" onclick="startRenameCol(${col.id})" title="Spalte umbenennen">✏</button>
        <button class="del" onclick="deleteColumn(${col.id})" title="Spalte löschen">×</button>
        <button class="primary" style="padding:8px 14px;font-size:14px;" onclick="openAddCardModal()">+ Karte</button>
      </div>
    </div>`;
}

function renderCards() {
  const el = document.getElementById("todoCards");
  const col = columns.find(c => c.id === activeColId);
  if (!col) { el.innerHTML = ""; return; }
  if (col.cards.length === 0) {
    el.innerHTML = `<p class="empty-state">Keine Karten. Klick auf "+ Karte".</p>`;
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  el.innerHTML = col.cards.map(card => {
    const checkBadge = card.checkTotal > 0
      ? `<span class="check-badge${card.checkDone === card.checkTotal ? ' done' : ''}">${card.checkDone}/${card.checkTotal} ✓</span>` : "";
    const chips = card.assigneeMemberIds.map(mid => {
      const m = members.find(m => m.id === mid);
      return m ? `<span class="todo-assignee-chip" style="background:${m.color}22;border-color:${m.color};">${esc(m.name)}</span>` : "";
    }).join("");
    const overdue = card.dueDate && card.dueDate < today;
    const dueBadge = card.dueDate ? `<span class="todo-due-badge${overdue ? ' overdue' : ''}">${fmtDate(card.dueDate)}</span>` : "";
    return `
      <div class="item-card todo-card" onclick="openCardDetail(${card.id})">
        <div class="todo-card-inner">
          <span class="todo-card-title">${esc(card.title)}</span>
          ${chips || checkBadge || dueBadge ? `<div class="todo-card-meta">${chips}${checkBadge}${dueBadge}</div>` : ""}
        </div>
        <span class="item-card-chevron">›</span>
      </div>`;
  }).join("");
}

// ---- Column navigation -----------------------------------------------
function setCol(id) {
  activeColId = id;
  render();
}

// ---- Column management -----------------------------------------------
function openAddColModal() {
  document.getElementById("newColName").value = "";
  document.getElementById("addColModal").hidden = false;
  document.getElementById("newColName").focus();
}
function closeAddColModal() { document.getElementById("addColModal").hidden = true; }

async function saveAddCol() {
  const name = document.getElementById("newColName").value.trim();
  if (!name) return;
  closeAddColModal();
  const res = await api("/api/todo/columns", { method: "POST", body: JSON.stringify({ name }) });
  const col = await res.json();
  activeColId = col.id;
  await loadAll();
}

function startRenameCol(id) {
  const span = document.getElementById(`col-name-${id}`);
  if (!span || span.querySelector("input")) return;
  const current = span.textContent;
  span.innerHTML = `<input class="inline-rename" value="${esc(current)}" onkeydown="handleRenameColKey(event,${id})" style="width:min(200px,45vw);" />`;
  const input = span.querySelector("input");
  input.focus(); input.select();
  input.addEventListener("blur", () => saveRenameCol(id));
}

async function saveRenameCol(id) {
  const span = document.getElementById(`col-name-${id}`);
  const input = span?.querySelector("input");
  if (!input) return;
  const name = input.value.trim();
  if (!name) { await loadAll(); return; }
  await api(`/api/todo/columns/${id}`, { method: "PUT", body: JSON.stringify({ name }) });
  await loadAll();
}

function handleRenameColKey(e, id) {
  if (e.key === "Enter") e.target.blur();
  if (e.key === "Escape") loadAll();
}

async function deleteColumn(id) {
  const col = columns.find(c => c.id === id);
  const n = col?.cards.length ?? 0;
  if (!confirm(n > 0 ? `Spalte "${col?.name}" mit ${n} Karte(n) löschen?` : `Spalte "${col?.name}" löschen?`)) return;
  await api(`/api/todo/columns/${id}`, { method: "DELETE" });
  activeColId = null;
  await loadAll();
}

// ---- Card management -------------------------------------------------
function openAddCardModal() {
  newCardAssignees = [];
  document.getElementById("newCardTitle").value = "";
  document.getElementById("newCardDueDate").value = "";
  document.getElementById("newCardAssignees").innerHTML = members.map(m =>
    `<button class="assignee-chip" id="new-assign-${m.id}" onclick="toggleNewCardAssignee(${m.id})">
      <span class="user-dot" style="background:${m.color}"></span>${esc(m.name)}
    </button>`
  ).join("");
  document.getElementById("addCardModal").hidden = false;
  document.getElementById("newCardTitle").focus();
}
function closeAddCardModal() { document.getElementById("addCardModal").hidden = true; }

function toggleNewCardAssignee(memberId) {
  const btn = document.getElementById(`new-assign-${memberId}`);
  if (newCardAssignees.includes(memberId)) {
    newCardAssignees = newCardAssignees.filter(id => id !== memberId);
    btn.classList.remove("active");
    btn.style = "";
  } else {
    newCardAssignees.push(memberId);
    btn.classList.add("active");
    const m = members.find(m => m.id === memberId);
    if (m) btn.style = `border-color:${m.color};background:${m.color}22;color:var(--text)`;
  }
}

async function saveAddCard() {
  const title = document.getElementById("newCardTitle").value.trim();
  if (!title) return;
  const dueDate = document.getElementById("newCardDueDate").value || null;
  closeAddCardModal();
  const res = await api("/api/todo/cards", { method: "POST", body: JSON.stringify({ columnId: activeColId, title }) });
  const card = await res.json();
  const ps = [];
  if (newCardAssignees.length > 0)
    ps.push(api(`/api/todo/cards/${card.id}/assignees`, { method: "PUT", body: JSON.stringify({ memberIds: newCardAssignees }) }));
  if (dueDate)
    ps.push(api(`/api/todo/cards/${card.id}`, { method: "PUT", body: JSON.stringify({ dueDate }) }));
  await Promise.all(ps);
  await loadAll();
}

// ---- Card detail overlay --------------------------------------------
async function openCardDetail(cardId) {
  const res = await api(`/api/todo/cards/${cardId}`);
  if (!res.ok) return;
  openCard = await res.json();
  renderCardDetail();
  document.getElementById("cardDetailOverlay").hidden = false;
  document.body.style.overflow = "hidden";
}

async function closeCardDetail() {
  if (openCard) await saveCardDescription(openCard.id);
  document.getElementById("cardDetailOverlay").hidden = true;
  document.body.style.overflow = "";
  openCard = null;
  loadAll();
}

function renderCardDetail() {
  if (!openCard) return;
  const card = openCard;
  const col = columns.find(c => c.id === card.columnId);
  const colIdx = columns.findIndex(c => c.id === card.columnId);
  const prevCol = colIdx > 0 ? columns[colIdx - 1] : null;
  const nextCol = colIdx < columns.length - 1 ? columns[colIdx + 1] : null;
  const doneCount = card.checkItems.filter(i => i.isDone).length;
  const totalCount = card.checkItems.length;

  const assigneesHtml = members.map(m => {
    const on = card.assigneeMemberIds.includes(m.id);
    return `<button class="assignee-chip${on ? ' active' : ''}"
      style="${on ? `border-color:${m.color};background:${m.color}22;` : ''}"
      onclick="toggleAssignee(${card.id},${m.id})">
      <span class="user-dot" style="background:${m.color}"></span>${esc(m.name)}
    </button>`;
  }).join("");

  const checkHtml = card.checkItems.map(item => `
    <div class="check-item" id="ci-${item.id}">
      <label class="check-item-label">
        <input type="checkbox" ${item.isDone ? 'checked' : ''}
          onchange="toggleCheckItem(${card.id},${item.id},this.checked)"
          style="accent-color:var(--accent);width:18px;height:18px;flex-shrink:0;" />
        <span class="${item.isDone ? 'check-done' : ''}">${esc(item.text)}</span>
      </label>
      <button class="del" onclick="deleteCheckItem(${card.id},${item.id})">×</button>
    </div>`).join("");

  document.getElementById("cardDetailBody").innerHTML = `
    <div class="card-detail-content">
      <div class="card-detail-colbadge">${esc(col?.name ?? '')}</div>

      <input class="card-title-input" id="card-title-input" value="${esc(card.title)}"
        onblur="saveCardTitle(${card.id})"
        onkeydown="if(event.key==='Enter')this.blur()" />

      ${prevCol || nextCol ? `
      <div class="move-row">
        ${prevCol ? `<button class="ghost move-btn" onclick="moveCard(${card.id},${prevCol.id})">← ${esc(prevCol.name)}</button>` : '<span></span>'}
        ${nextCol ? `<button class="ghost move-btn" onclick="moveCard(${card.id},${nextCol.id})">${esc(nextCol.name)} →</button>` : ''}
      </div>` : ''}

      <div class="card-section">
        <strong class="section-label">Zugewiesen an</strong>
        <div class="assignees-row">${members.length ? assigneesHtml : '<span style="color:var(--muted);font-size:13px;">Keine Mitglieder</span>'}</div>
      </div>

      <div class="card-section">
        <strong class="section-label">Stichtag</strong>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px;">
          <input type="date" id="card-due-input" value="${esc(card.dueDate ?? '')}"
            style="background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 12px;font-family:inherit;font-size:15px;outline:none;"
            onchange="saveCardDueDate(${card.id})" />
          ${card.dueDate ? `<button class="ghost danger" onclick="clearCardDueDate(${card.id})">Entfernen</button>` : ''}
        </div>
      </div>

      <div class="card-section">
        <strong class="section-label">Beschreibung</strong>
        <textarea id="card-desc-input" rows="4" placeholder="Beschreibung (optional)"
          class="card-desc-textarea"
          onblur="saveCardDescription(${card.id})">${esc(card.description ?? '')}</textarea>
      </div>

      <div class="card-section">
        <strong class="section-label">Checkliste
          ${totalCount > 0 ? `<span class="check-progress">${doneCount}/${totalCount}</span>` : ''}
        </strong>
        ${totalCount > 0 && doneCount === totalCount ? `<div class="check-all-done">✓ Alles erledigt!</div>` : ''}
        <div id="check-list">${checkHtml}</div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <input class="rating-note" id="new-check-input" placeholder="Neuer Punkt…" style="flex:1;"
            onkeydown="if(event.key==='Enter')addCheckItem(${card.id})" />
          <button class="primary" style="padding:8px 14px;font-size:14px;" onclick="addCheckItem(${card.id})">+</button>
        </div>
      </div>
    </div>`;

  document.getElementById("deleteCardBtn").onclick = () => deleteCard(card.id);
}

async function saveCardDueDate(cardId) {
  const dueDate = document.getElementById("card-due-input")?.value || "";
  await api(`/api/todo/cards/${cardId}`, { method: "PUT", body: JSON.stringify({ dueDate }) });
  if (openCard) { openCard.dueDate = dueDate || null; renderCardDetail(); }
}

async function clearCardDueDate(cardId) {
  await api(`/api/todo/cards/${cardId}`, { method: "PUT", body: JSON.stringify({ dueDate: "" }) });
  if (openCard) { openCard.dueDate = null; renderCardDetail(); }
}

async function saveCardTitle(cardId) {
  const title = document.getElementById("card-title-input")?.value.trim();
  if (!title || !openCard || title === openCard.title) return;
  await api(`/api/todo/cards/${cardId}`, { method: "PUT", body: JSON.stringify({ title }) });
  openCard.title = title;
}

async function saveCardDescription(cardId) {
  const el = document.getElementById("card-desc-input");
  if (!el || !openCard) return;
  const desc = el.value;
  if (desc === (openCard.description ?? "")) return;
  await api(`/api/todo/cards/${cardId}`, { method: "PUT", body: JSON.stringify({ description: desc }) });
  openCard.description = desc || null;
}

async function moveCard(cardId, targetColId) {
  await api(`/api/todo/cards/${cardId}`, { method: "PUT", body: JSON.stringify({ columnId: targetColId }) });
  // Refresh columns in background, re-render detail with new position
  const [cardRes, colRes] = await Promise.all([
    api(`/api/todo/cards/${cardId}`),
    api("/api/todo/columns")
  ]);
  openCard = await cardRes.json();
  columns = await colRes.json();
  renderCardDetail();
}

async function deleteCard(cardId) {
  if (!confirm("Karte löschen?")) return;
  await api(`/api/todo/cards/${cardId}`, { method: "DELETE" });
  closeCardDetail();
}

async function toggleAssignee(cardId, memberId) {
  if (!openCard) return;
  const ids = openCard.assigneeMemberIds;
  const newIds = ids.includes(memberId) ? ids.filter(i => i !== memberId) : [...ids, memberId];
  await api(`/api/todo/cards/${cardId}/assignees`, { method: "PUT", body: JSON.stringify({ memberIds: newIds }) });
  openCard.assigneeMemberIds = newIds;
  renderCardDetail();
}

async function addCheckItem(cardId) {
  const input = document.getElementById("new-check-input");
  const text = input?.value.trim();
  if (!text) return;
  input.value = "";
  const res = await api(`/api/todo/cards/${cardId}/checklist`, { method: "POST", body: JSON.stringify({ text }) });
  const item = await res.json();
  if (openCard) {
    openCard.checkItems.push({ id: item.id, text: item.text, isDone: false, position: item.position });
    renderCardDetail();
    document.getElementById("new-check-input")?.focus();
  }
}

async function toggleCheckItem(cardId, itemId, isDone) {
  await api(`/api/todo/cards/${cardId}/checklist/${itemId}`, { method: "PUT", body: JSON.stringify({ isDone }) });
  if (openCard) {
    const item = openCard.checkItems.find(i => i.id === itemId);
    if (item) item.isDone = isDone;
    const span = document.querySelector(`#ci-${itemId} span`);
    if (span) span.className = isDone ? 'check-done' : '';
  }
}

async function deleteCheckItem(cardId, itemId) {
  await api(`/api/todo/cards/${cardId}/checklist/${itemId}`, { method: "DELETE" });
  if (openCard) {
    openCard.checkItems = openCard.checkItems.filter(i => i.id !== itemId);
    renderCardDetail();
    document.getElementById("new-check-input")?.focus();
  }
}

// ---- Helpers ---------------------------------------------------------
function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

// ---- Events ----------------------------------------------------------
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
  document.getElementById("cancelAddCol").onclick = closeAddColModal;
  document.getElementById("saveAddCol").onclick = saveAddCol;
  document.getElementById("newColName").addEventListener("keydown", e => { if (e.key === "Enter") saveAddCol(); });
  document.getElementById("cancelAddCard").onclick = closeAddCardModal;
  document.getElementById("saveAddCard").onclick = saveAddCard;
  document.getElementById("newCardTitle").addEventListener("keydown", e => { if (e.key === "Enter") saveAddCard(); });
}

// ---- Start -----------------------------------------------------------
(async function init() {
  if (!initAuth()) return;
  document.getElementById("adminNavLink").hidden = false;
  const res = await fetch("/api/me", { headers: { "X-Session-Token": session.token } });
  if (!res.ok) { localStorage.removeItem("session"); location.href = "/"; return; }
  wireEvents();
  await loadAll();
  reportPresence('todos');
  const cardParam = new URLSearchParams(location.search).get("card");
  if (cardParam) await openCardDetail(parseInt(cardParam));
})();
