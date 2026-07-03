let session = null;
let members = [];
let currentEventId = null;
let editingExpenseId = null;

function token() { return session?.token; }

function authHeaders() {
  return { "Content-Type": "application/json", "X-Session-Token": token() };
}

async function api(method, path, body) {
  const opts = { method, headers: authHeaders() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (r.status === 401) { localStorage.removeItem("session"); location.href = "/"; throw new Error("unauthorized"); }
  if (!r.ok) throw await r.json().catch(() => ({ error: r.status }));
  return r.json();
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Presence ─────────────────────────────────────────────────────────────

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
    const list = await api('POST', '/api/presence', { page });
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

function fmtEur(val) {
  return (val >= 0 ? "" : "-") + "€" + Math.abs(val).toFixed(2).replace(".", ",");
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

// ── Auth ─────────────────────────────────────────────────────────────────

function initAuth() {
  const stored = localStorage.getItem("session");
  if (stored) {
    try { session = JSON.parse(stored); } catch { session = null; }
  }
  if (session?.token) {
    showApp();
    return;
  }
  document.getElementById("loginScreen").hidden = false;
  document.getElementById("loginBtn").onclick = doLogin;
  document.getElementById("loginPassword").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
}

async function doLogin() {
  const name = document.getElementById("loginName").value.trim();
  const password = document.getElementById("loginPassword").value;
  const err = document.getElementById("loginError");
  err.hidden = true;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password })
    }).then(r => r.json());
    if (res.error) { err.textContent = res.error; err.hidden = false; return; }
    session = res;
    localStorage.setItem("session", JSON.stringify(res));
    showApp();
  } catch { err.textContent = "Fehler beim Login."; err.hidden = false; }
}

function showPushBanner() {
  if (document.getElementById('pushBanner')) return;
  const b = document.createElement('div');
  b.id = 'pushBanner';
  b.style.cssText = 'position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 72px);left:12px;right:12px;background:var(--accent);color:#000;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:700;font-size:14px;font-weight:600';
  b.innerHTML = `<span style="flex:1">🔔 Benachrichtigungen aktivieren, um keine Termine zu verpassen!</span><button onclick="Notification.requestPermission().then(p=>{document.getElementById('pushBanner')?.remove();if(p==='granted')location.href='/'})" style="background:#000;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">Aktivieren</button><button onclick="document.getElementById('pushBanner').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;line-height:1;padding:0 2px;">✕</button>`;
  document.body.appendChild(b);
}

function showApp() {
  document.getElementById("loginScreen").hidden = true;
  const ud = document.getElementById("userDisplay");
  ud.hidden = false;
  const dot = document.createElement("span");
  dot.className = "user-dot";
  dot.style.background = session.color;
  ud.appendChild(dot);
  ud.appendChild(document.createTextNode(session.displayName || session.name));

  if ('Notification' in window && Notification.permission === 'default') showPushBanner();

  if (session.isAdmin) {
    document.getElementById("adminNavLink").hidden = false;
    document.getElementById("newEventBtn").hidden = false;
  }


  loadAll();
  reportPresence('finanzen');
}

// ── Data ──────────────────────────────────────────────────────────────────

async function loadAll() {
  [members] = await Promise.all([
    api("GET", "/api/members")
  ]);
  await loadEvents();
}

async function loadEvents() {
  const events = await api("GET", "/api/finance/events");
  renderEventList(events);
}

// ── Render Event List ─────────────────────────────────────────────────────

function renderEventList(events) {
  const list = document.getElementById("financeList");
  if (events.length === 0) {
    list.innerHTML = '<p class="empty-state">Noch keine Events. Admin kann eines anlegen.</p>';
    return;
  }
  list.innerHTML = "";
  for (const ev of events) {
    const net = ev.totalIncome - ev.totalExpenses;
    const netColor = net >= 0 ? "var(--frei)" : "var(--keinezeit)";
    const div = document.createElement("div");
    div.className = "item-card";
    div.style.cursor = "pointer";
    div.innerHTML = `
      <div class="item-card-header" onclick="openEvent(${ev.id})">
        <div class="header-content">
          <div class="header-row1">
            <span class="item-card-title">${esc(ev.name)}</span>
            ${ev.date ? `<span class="concert-date">${fmtDate(ev.date)}</span>` : ""}
          </div>
          <div class="item-card-meta" style="margin-top:4px;">
            <span>📤 Ausgaben: <strong>${fmtEur(ev.totalExpenses)}</strong></span>
            <span>📥 Einnahmen: <strong>${fmtEur(ev.totalIncome)}</strong></span>
            <span style="color:${netColor};font-weight:700;">⚖ ${net >= 0 ? "+" : ""}${fmtEur(net)}</span>
          </div>
        </div>
        <span class="item-card-chevron">›</span>
      </div>`;
    list.appendChild(div);
  }
}

// ── Event Detail ──────────────────────────────────────────────────────────

async function openEvent(id) {
  currentEventId = id;
  const ev = await api("GET", `/api/finance/events/${id}`);
  document.getElementById("detailTitle").textContent = ev.name;
  document.getElementById("deleteEventBtn").hidden = !session?.isAdmin;
  renderDetail(ev);
  document.getElementById("mainView").hidden = true;
  document.getElementById("detailOverlay").hidden = false;
}

function closeDetail() {
  document.getElementById("detailOverlay").hidden = true;
  document.getElementById("mainView").hidden = false;
  currentEventId = null;
  loadEvents();
}

function renderDetail(ev) {
  const content = document.getElementById("detailContent");
  const { expenses, incomes, balance } = ev;
  const isAdmin = session?.isAdmin;

  // Expenses
  let expHtml = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <span class="section-label" style="margin:0;">📤 Ausgaben</span>
      <button class="ghost" style="font-size:13px;padding:6px 12px;" onclick="openExpenseModal()">+ Ausgabe</button>
    </div>`;

  if (expenses.length === 0) {
    expHtml += `<p class="empty-state" style="padding:12px 0;">Noch keine Ausgaben.</p>`;
  } else {
    expHtml += `<ul class="file-list">`;
    for (const e of expenses) {
      const canEdit = session?.isAdmin || e.memberId === session?.id;
      expHtml += `
        <li id="expense-${e.id}" class="file-item" style="flex-direction:row;align-items:center;gap:12px;padding:10px 14px;">
          <span class="user-dot" style="background:${esc(e.memberColor)};width:10px;height:10px;border-radius:50%;flex-shrink:0;"></span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:15px;">${fmtEur(e.amount)}</div>
            <div style="font-size:13px;color:var(--muted);">${esc(e.memberName)}${e.description ? ` · ${esc(e.description)}` : ""}</div>
          </div>
          ${e.receiptUrl ? `<button class="ghost" style="font-size:12px;padding:5px 10px;" onclick="openReceiptLightbox('${esc(e.receiptUrl)}')">📎 Beleg</button>` : ""}
          ${canEdit ? `<button class="ghost" style="font-size:13px;padding:5px 10px;" onclick="openEditExpenseModal(${e.id},${e.amount},${esc(JSON.stringify(e.description))},${e.memberId})">✏️</button>` : ""}
          ${canEdit ? `<button class="del" onclick="deleteExpense(${e.id})">×</button>` : ""}
        </li>`;
    }
    expHtml += `</ul>`;
  }

  // Income
  let incHtml = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:24px;margin-bottom:10px;">
      <span class="section-label" style="margin:0;">📥 Einnahmen</span>
      <button class="ghost" style="font-size:13px;padding:6px 12px;" onclick="openIncomeModal()">+ Einnahme</button>
    </div>`;

  if (incomes.length === 0) {
    incHtml += `<p class="empty-state" style="padding:12px 0;">Noch keine Einnahmen.</p>`;
  } else {
    incHtml += `<ul class="file-list">`;
    for (const i of incomes) {
      incHtml += `
        <li id="income-${i.id}" class="file-item" style="flex-direction:row;align-items:center;gap:12px;padding:10px 14px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:15px;color:var(--frei);">+${fmtEur(i.amount)}</div>
            ${i.description ? `<div style="font-size:13px;color:var(--muted);">${esc(i.description)}</div>` : ""}
          </div>
          <button class="del" onclick="deleteIncome(${i.id})">×</button>
        </li>`;
    }
    incHtml += `</ul>`;
  }

  // Balance
  const b = balance;
  const netColor = b.net >= 0 ? "var(--frei)" : "var(--keinezeit)";
  let balHtml = `
    <div style="margin-top:28px;padding-top:20px;border-top:2px solid var(--accent);">
      <span class="section-label">⚖ Abrechnung</span>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <label style="font-size:13px;color:var(--muted);white-space:nowrap;">🏦 Bandkasse:</label>
        <input type="number" id="bandkasseInput" value="${b.totalBandkasse}" step="0.01" min="0"
          style="width:110px;padding:6px 10px;background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);color:var(--text);font-size:14px;" />
        <button class="ghost" style="font-size:13px;padding:6px 12px;" onclick="saveBandkasse()">Speichern</button>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:12px 16px;flex:1;min-width:120px;">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Ausgaben</div>
          <div style="font-size:20px;font-weight:700;">${fmtEur(b.totalExpenses)}</div>
        </div>
        <div style="background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:12px 16px;flex:1;min-width:120px;">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Einnahmen</div>
          <div style="font-size:20px;font-weight:700;color:var(--frei);">${fmtEur(b.totalIncome)}</div>
        </div>
        ${b.totalBandkasse > 0 ? `
        <div style="background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:12px 16px;flex:1;min-width:120px;">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">🏦 Bandkasse</div>
          <div style="font-size:20px;font-weight:700;color:var(--accent);">${fmtEur(b.totalBandkasse)}</div>
        </div>` : ""}
        <div style="background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:12px 16px;flex:1;min-width:120px;">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">${b.distributable >= 0 ? "Überschuss" : "Fehlbetrag"}</div>
          <div style="font-size:20px;font-weight:700;color:${netColor};">${b.distributable >= 0 ? "+" : ""}${fmtEur(b.distributable)}</div>
        </div>
      </div>
      <p style="font-size:13px;color:var(--muted);margin:0 0 12px;">Pro Mitglied: <strong style="color:var(--text);">${b.distributable >= 0 ? "+" : ""}${fmtEur(b.perMemberSplit)}</strong> ${b.distributable >= 0 ? "(Auszahlung)" : "(Einzahlung)"}</p>
      <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;">`;

  for (const m of b.memberBalances) {
    const isPositive = m.receives >= 0;
    const receiveColor = m.receives > 0.005 ? "var(--frei)" : m.receives < -0.005 ? "var(--keinezeit)" : "var(--muted)";
    balHtml += `
        <li style="display:flex;align-items:center;gap:10px;background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:10px 14px;">
          <span class="user-dot" style="background:${esc(m.color)};width:10px;height:10px;border-radius:50%;flex-shrink:0;"></span>
          <span style="font-weight:600;flex:1;">${esc(m.name)}</span>
          ${m.paid > 0 ? `<span style="font-size:13px;color:var(--muted);">bezahlt: ${fmtEur(m.paid)}</span>` : ""}
          <span style="font-weight:700;color:${receiveColor};">
            ${m.receives > 0.005 ? "erhält " : m.receives < -0.005 ? "zahlt " : ""}${fmtEur(Math.abs(m.receives))}
          </span>
        </li>`;
  }

  balHtml += `</ul></div>`;

  content.innerHTML = expHtml + incHtml + balHtml;
}

function openReceiptLightbox(url) {
  if (url.match(/\.pdf$/i)) { window.open(url, '_blank'); return; }
  document.getElementById("receiptImage").src = url;
  document.getElementById("receiptLightbox").hidden = false;
}

function closeReceiptLightbox() {
  document.getElementById("receiptLightbox").hidden = true;
  document.getElementById("receiptImage").src = "";
}

async function saveBandkasse() {
  const amount = parseFloat(document.getElementById("bandkasseInput").value) || 0;
  try {
    await api("PATCH", `/api/finance/events/${currentEventId}/bandkasse`, { amount });
    refreshDetail(true);
  } catch (e) { alert(e?.error || "Fehler beim Speichern."); }
}

async function refreshDetail(celebrate = false) {
  if (!currentEventId) return;
  const ev = await api("GET", `/api/finance/events/${currentEventId}`);
  renderDetail(ev);
  if (celebrate && ev.balance.distributable > 0) { showConfetti(); playWinSound(); }
}

function playWinSound() {
  try {
    const audio = new Audio("/win.mp3");
    audio.play().catch(() => {});
    // Fade out in den letzten 800 ms, dann stoppen – passend zur Konfetti-Dauer (4000 ms)
    setTimeout(() => {
      const fadeMs = 800;
      const steps  = 20;
      const interval = fadeMs / steps;
      let step = 0;
      const fade = setInterval(() => {
        step++;
        audio.volume = Math.max(0, 1 - step / steps);
        if (step >= steps) { clearInterval(fade); audio.pause(); }
      }, interval);
    }, 4000 - 800);
    navigator.vibrate?.([80, 60, 80, 60, 80, 150, 500]);
  } catch {}
}

function showConfetti() {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const colors = ["#f5a524","#34d399","#60a5fa","#f87171","#c084fc","#fb923c","#e8156a","#2dd4bf","#ffe040"];
  const pieces = Array.from({ length: 150 }, (_, i) => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height,
    w: i < 25 ? 36 : Math.random() * 10 + 5,
    h: i < 25 ? 18 : Math.random() * 6 + 3,
    color: i < 25 ? null : colors[Math.floor(Math.random() * colors.length)],
    bill: i < 25,
    rot: Math.random() * Math.PI * 2,
    vx: Math.random() * 2 - 1,
    vy: Math.random() * 3 + 2,
    vr: (Math.random() - 0.5) * 0.08,
  }));
  const duration = 4000;
  let start = null;
  function animate(ts) {
    if (!start) start = ts;
    const elapsed = ts - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const alpha = elapsed > duration - 800 ? Math.max(0, 1 - (elapsed - (duration - 800)) / 800) : 1;
    let any = false;
    for (const p of pieces) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y < canvas.height + 20) any = true;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.bill) {
        const w = p.w, h = p.h;
        ctx.fillStyle = "#2d7a3a";
        ctx.beginPath();
        ctx.roundRect(-w/2, -h/2, w, h, 2);
        ctx.fill();
        ctx.strokeStyle = "#4caf6a";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = "#4caf6a";
        ctx.fillRect(-w/2+3, -h/2+3, w-6, h-6);
        ctx.fillStyle = "#2d7a3a";
        ctx.font = `bold ${h*0.55}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("€", 0, 0);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (any && elapsed < duration) requestAnimationFrame(animate);
    else canvas.remove();
  }
  requestAnimationFrame(animate);
}

// ── Expense Modal ─────────────────────────────────────────────────────────

function openExpenseModal() {
  editingExpenseId = null;
  const sel = document.getElementById("expenseMember");
  if (session?.isAdmin) {
    sel.innerHTML = members.map(m => `<option value="${m.id}" ${m.id === session?.id ? "selected" : ""}>${esc(m.name)}</option>`).join("");
    sel.disabled = false;
    sel.hidden = false;
  } else {
    sel.innerHTML = `<option value="${session?.id}">${esc(session?.displayName || session?.name)}</option>`;
    sel.value = session?.id;
    sel.hidden = true;
  }
  document.getElementById("expenseAmount").value = "";
  document.getElementById("expenseDesc").value = "";
  document.getElementById("expenseReceipt").value = "";
  document.getElementById("expenseReceiptName").textContent = "";
  document.querySelector("#expenseModal .modal-box h3").textContent = "Ausgabe eintragen";
  document.getElementById("expenseModal").hidden = false;
}

function openEditExpenseModal(expId, amount, description, memberId) {
  editingExpenseId = expId;
  const sel = document.getElementById("expenseMember");
  if (session?.isAdmin) {
    sel.innerHTML = members.map(m => `<option value="${m.id}" ${m.id === memberId ? "selected" : ""}>${esc(m.name)}</option>`).join("");
    sel.disabled = false;
    sel.hidden = false;
  } else {
    sel.innerHTML = `<option value="${session?.id}">${esc(session?.displayName || session?.name)}</option>`;
    sel.value = session?.id;
    sel.hidden = true;
  }
  document.getElementById("expenseAmount").value = amount;
  document.getElementById("expenseDesc").value = description;
  document.getElementById("expenseReceipt").value = "";
  document.getElementById("expenseReceiptName").textContent = "";
  document.querySelector("#expenseModal .modal-box h3").textContent = "Ausgabe bearbeiten";
  document.getElementById("expenseModal").hidden = false;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("expenseReceipt")?.addEventListener("change", e => {
    const f = e.target.files[0];
    document.getElementById("expenseReceiptName").textContent = f ? f.name : "";
  });
});

function closeExpenseModal() {
  document.getElementById("expenseModal").hidden = true;
  editingExpenseId = null;
}

async function submitExpense() {
  const amount = document.getElementById("expenseAmount").value;
  const desc = document.getElementById("expenseDesc").value.trim();
  const memberId = document.getElementById("expenseMember").value;
  const receipt = document.getElementById("expenseReceipt").files[0];

  if (!amount || parseFloat(amount) <= 0) { alert("Bitte Betrag eingeben."); return; }

  const fd = new FormData();
  fd.append("amount", parseFloat(amount).toFixed(2));
  fd.append("description", desc);
  fd.append("memberId", memberId);
  if (receipt) fd.append("receipt", receipt);

  const btn = document.getElementById("expenseSaveBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Speichern…';
  try {
    const url = editingExpenseId
      ? `/api/finance/events/${currentEventId}/expenses/${editingExpenseId}`
      : `/api/finance/events/${currentEventId}/expenses`;
    const r = await fetch(url, {
      method: editingExpenseId ? "PUT" : "POST",
      headers: { "X-Session-Token": token() },
      body: fd
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e?.error || "Fehler beim Speichern."); return; }
    closeExpenseModal();
    refreshDetail(true);
  } catch { alert("Fehler beim Speichern."); }
  finally { btn.disabled = false; btn.innerHTML = "Speichern"; }
}

async function deleteExpense(id) {
  if (!confirm("Ausgabe löschen?")) return;
  document.getElementById(`expense-${id}`)?.remove();
  try { await api("DELETE", `/api/finance/events/${currentEventId}/expenses/${id}`); } catch {}
  await refreshDetail();
}

// ── Income Modal ──────────────────────────────────────────────────────────

function openIncomeModal() {
  document.getElementById("incomeAmount").value = "";
  document.getElementById("incomeDesc").value = "";
  document.getElementById("incomeModal").hidden = false;
}

function closeIncomeModal() {
  document.getElementById("incomeModal").hidden = true;
}

async function submitIncome() {
  const amount = parseFloat(document.getElementById("incomeAmount").value);
  const desc = document.getElementById("incomeDesc").value.trim();
  if (!amount || amount <= 0) { alert("Bitte Betrag eingeben."); return; }
  try {
    await api("POST", `/api/finance/events/${currentEventId}/income`, { amount, description: desc });
    closeIncomeModal();
    refreshDetail(true);
  } catch (e) { alert(e?.error || "Fehler beim Speichern."); }
}

async function deleteIncome(id) {
  if (!confirm("Einnahme löschen?")) return;
  document.getElementById(`income-${id}`)?.remove();
  try { await api("DELETE", `/api/finance/events/${currentEventId}/income/${id}`); } catch {}
  await refreshDetail();
}

// ── New Event Modal ───────────────────────────────────────────────────────

function openNewEventModal() {
  document.getElementById("newEventName").value = "";
  document.getElementById("newEventDate").value = "";
  document.getElementById("newEventDesc").value = "";
  document.getElementById("newEventModal").hidden = false;
}

function closeNewEventModal() {
  document.getElementById("newEventModal").hidden = true;
}

async function createFinanceEvent() {
  const name = document.getElementById("newEventName").value.trim();
  const date = document.getElementById("newEventDate").value;
  const description = document.getElementById("newEventDesc").value.trim();
  if (!name) { alert("Name fehlt."); return; }
  try {
    await api("POST", "/api/finance/events", { name, date: date || null, description: description || null });
    closeNewEventModal();
    loadEvents();
  } catch (e) { alert(e?.error || "Fehler beim Erstellen."); }
}

async function deleteCurrentEvent() {
  if (!confirm("Event und alle Ausgaben/Einnahmen löschen?")) return;
  try { await api("DELETE", `/api/finance/events/${currentEventId}`); } catch {}
  closeDetail();
}

// ── Init ──────────────────────────────────────────────────────────────────

initAuth();
