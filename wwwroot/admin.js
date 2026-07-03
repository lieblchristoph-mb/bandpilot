let session = null;
let allUsers = [];
let editingMemberId = null;
let pickedColor = "#f5a524";
const COLORS = ["#f5a524","#34d399","#60a5fa","#f87171","#c084fc","#fb923c","#2dd4bf","#f472b6"];

function initAuth() {
  const s = localStorage.getItem("session");
  if (!s) { location.href = "/"; return false; }
  try { session = JSON.parse(s); } catch { location.href = "/"; return false; }
  if (!session?.token) { location.href = "/"; return false; }

  const el = document.getElementById("userDisplay");
  el.innerHTML = `<span class="user-dot" style="background:${session.color}"></span>${session.displayName || session.name}`;
  el.hidden = false;

  const dot = document.getElementById("myAccountDot");
  dot.style.background = session.color;
  document.getElementById("myAccountName").textContent = session.displayName || session.name;
  document.getElementById("myAccountRole").textContent = session.isAdmin ? "Administrator" : "Mitglied";

  return true;
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (session?.token) headers["X-Session-Token"] = session.token;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) { localStorage.removeItem("session"); location.href = "/"; throw new Error("unauthorized"); }
  return res;
}

function fmtDateTime(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`;
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---- Render ----------------------------------------------------------

function renderUsers(users) {
  allUsers = users;
  const container = document.getElementById("adminUserList");
  if (!users.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:14px;">Keine Benutzer gefunden.</p>';
    return;
  }
  container.innerHTML = `
    <table class="admin-user-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Rolle</th>
          <th>Letzter Login</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => `
          <tr id="member-row-${u.id}">
            <td>
              <span class="user-dot" style="background:${esc(u.color)};display:inline-block;vertical-align:middle;margin-right:8px;"></span>
              ${esc(u.name)}
            </td>
            <td>${u.isAdmin ? '<span class="admin-badge">Admin</span>' : '<span style="color:var(--muted)">Mitglied</span>'}</td>
            <td class="${!u.lastLogin ? 'muted-cell' : ''}">${fmtDateTime(u.lastLogin)}</td>
            <td style="white-space:nowrap;text-align:right;">
              <button class="ghost" style="font-size:13px;padding:5px 10px;" onclick="openEditModal(${u.id})">✏️</button>
              ${u.id !== session?.id ? `<button class="del" onclick="deleteMember(${u.id})">×</button>` : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ---- Add Member Modal -----------------------------------------------

function openAddMemberModal() {
  pickedColor = COLORS[0];
  document.getElementById("newMemberName").value = "";
  document.getElementById("newMemberPassword").value = "";
  const row = document.getElementById("colorRow");
  row.innerHTML = "";
  COLORS.forEach((c, i) => {
    const sw = document.createElement("span");
    sw.className = "swatch" + (i === 0 ? " sel" : "");
    sw.style.background = c;
    sw.onclick = () => {
      pickedColor = c;
      [...row.children].forEach(el => el.classList.remove("sel"));
      sw.classList.add("sel");
    };
    row.appendChild(sw);
  });
  document.getElementById("addMemberModal").hidden = false;
  document.getElementById("newMemberName").focus();
}

function closeAddMemberModal() {
  document.getElementById("addMemberModal").hidden = true;
}

async function saveNewMember() {
  const name = document.getElementById("newMemberName").value.trim();
  const password = document.getElementById("newMemberPassword").value;
  if (!name) { alert("Bitte einen Namen eingeben."); return; }
  if (!password) { alert("Bitte ein Passwort eingeben."); return; }
  const btn = document.getElementById("saveMemberBtn");
  btn.disabled = true;
  try {
    const res = await api("/api/members", {
      method: "POST",
      body: JSON.stringify({ name, color: pickedColor, password })
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e?.error || "Fehler."); return; }
    closeAddMemberModal();
    await loadUsers();
  } catch { alert("Fehler beim Anlegen."); }
  finally { btn.disabled = false; }
}

// ---- Edit Modal ------------------------------------------------------

function openEditModal(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;
  editingMemberId = id;
  document.getElementById("editMemberName").value = u.name;
  document.getElementById("editMemberDisplayName").value = u.displayName || "";
  document.getElementById("editMemberColor").value = u.color;
  document.getElementById("editMemberPassword").value = "";
  document.getElementById("editMemberIsAdmin").checked = u.isAdmin;
  document.getElementById("editMemberModal").hidden = false;
}

function closeEditModal() {
  document.getElementById("editMemberModal").hidden = true;
  editingMemberId = null;
}

async function saveEditMember() {
  const name = document.getElementById("editMemberName").value.trim();
  const displayName = document.getElementById("editMemberDisplayName").value.trim();
  const color = document.getElementById("editMemberColor").value;
  const password = document.getElementById("editMemberPassword").value;
  const isAdmin = document.getElementById("editMemberIsAdmin").checked;
  if (!name) { alert("Name fehlt."); return; }
  try {
    const res = await api(`/api/admin/users/${editingMemberId}`, {
      method: "PUT",
      body: JSON.stringify({ name, displayName: displayName || null, color, password: password || null, isAdmin })
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e?.error || "Fehler."); return; }
    closeEditModal();
    await loadUsers();
  } catch { alert("Fehler beim Speichern."); }
}

// ---- Delete ----------------------------------------------------------

async function deleteMember(id) {
  const u = allUsers.find(x => x.id === id);
  if (!confirm(`${u?.name ?? "Mitglied"} wirklich löschen? Alle zugehörigen Daten werden entfernt.`)) return;
  document.getElementById(`member-row-${id}`)?.remove();
  try {
    const res = await api(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e?.error || "Fehler."); await loadUsers(); }
  } catch { alert("Fehler beim Löschen."); await loadUsers(); }
}

// ---- Load & Init -----------------------------------------------------

async function loadUsers() {
  const res = await api("/api/admin/users");
  if (!res.ok) return;
  renderUsers(await res.json());
}

// ---- Activity table ---------------------------------------------------
const PAGE_LABELS = { kalender: 'Kalender', songs: 'Songs', setlists: 'Sets', todos: 'Todos', finanzen: 'Finanzen' };

function fmtPresenceTime(isoStr) {
  if (!isoStr) return '–';
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
  if (diff < 90) return 'gerade';
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
  if (diff < 7 * 86400) return `vor ${Math.floor(diff / 86400)} Tagen`;
  return new Date(isoStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

async function loadActivity() {
  try {
    const res = await api('/api/presence');
    const list = await res.json();
    const members = [...new Map(list.map(p => [p.memberId, { id: p.memberId, name: p.memberName, color: p.memberColor }])).values()];
    // index by memberId → page
    const byMember = {};
    list.forEach(p => { (byMember[p.memberId] ??= {})[p.page] = p.lastSeenAt; });
    const pages = Object.keys(PAGE_LABELS);
    const tableEl = document.getElementById('activityTable');
    if (!members.length) { tableEl.innerHTML = '<p style="color:var(--muted);font-size:13px;">Noch keine Daten.</p>'; return; }
    tableEl.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 8px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--line);">Mitglied</th>
            ${pages.map(p => `<th style="padding:6px 8px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--line);white-space:nowrap;">${PAGE_LABELS[p]}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${members.map(m => `
            <tr>
              <td style="padding:6px 8px;font-weight:600;border-bottom:1px solid var(--line);white-space:nowrap;">
                <span class="user-dot" style="background:${m.color};width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:5px;"></span>${esc(m.name)}
              </td>
              ${pages.map(p => {
                const t = byMember[m.id]?.[p];
                return `<td style="padding:6px 8px;color:${t ? 'var(--text)' : 'var(--muted)'};border-bottom:1px solid var(--line);text-align:center;">${fmtPresenceTime(t)}</td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch {}
}

// ---- Init -------------------------------------------------------------
(async function init() {
  if (!initAuth()) return;

  document.getElementById("logoutBtn").onclick = async () => {
    try { await api("/api/logout", { method: "POST" }); } catch {}
    localStorage.removeItem("session");
    location.href = "/";
  };

  if (session.isAdmin) {
    document.getElementById("adminSection").hidden = false;
    await loadUsers();
    loadActivity();
    document.getElementById("newMemberName").addEventListener("keydown", e => {
      if (e.key === "Enter") document.getElementById("newMemberPassword").focus();
    });
    document.getElementById("newMemberPassword").addEventListener("keydown", e => {
      if (e.key === "Enter") saveNewMember();
    });
  }
})();
