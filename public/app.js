/* ═══════════════════════════════════════════
   IT LITIGATION MANAGER v3 — FRONTEND APP
   Core, Dashboard, Clients, PDF AI Extraction
═══════════════════════════════════════════ */

const API = '';
let currentPage = 'dashboard';
let confirmCallback = null;
let allStaff = [];
let allClients = [];
let extractedPdfFilename = null; // stores filename from AI PDF extraction

// ─── ROUTING ─────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  const titles = {
    'dashboard': 'Dashboard', 'clients': 'Client Database', 'notices': 'Notice Tracker',
    'reply-generator': 'Reply Generator', 'documents': 'Document Manager',
    'tasks': 'Task Allocation', 'staff': 'Staff Management', 'hearings': 'Hearing Calendar',
    'library': 'IT Law Library', 'penalties': 'Penalty Reference', 'settings': 'Settings'
  };
  document.getElementById('topbar-title').textContent = titles[page] || page;
  currentPage = page;
  const loaders = { 'dashboard': loadDashboard, 'clients': loadClients, 'notices': loadNotices,
    'reply-generator': loadReplyClients, 'documents': loadDocClients, 'tasks': loadTasks,
    'staff': loadStaff, 'hearings': loadHearings, 'library': loadLibrary, 'settings': loadSettings };
  if (loaders[page]) loaders[page]();
  if (window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ─── TOAST ─────────────────────────────────
function toast(msg, type = 'success', duration = 3500) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  t.onclick = () => t.remove();
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(100%)'; t.style.transition='all 0.3s'; setTimeout(()=>t.remove(),300); }, duration);
}

// ─── MODAL ─────────────────────────────────
function openModal(id) { const el = document.getElementById(id); if(el){ el.style.display='flex'; el.classList.add('open'); } }
function closeModal(id) { const el = document.getElementById(id); if(el){ el.style.display='none'; el.classList.remove('open'); } }

function confirmDelete(msg, cb) {
  document.getElementById('confirm-msg').textContent = msg;
  confirmCallback = cb;
  document.getElementById('confirm-ok-btn').onclick = () => { cb(); closeModal('confirm-modal-overlay'); };
  openModal('confirm-modal-overlay');
}

// ─── UTILS ─────────────────────────────────
function togglePwd(id) {
  const i = document.getElementById(id);
  i.type = i.type === 'password' ? 'text' : 'password';
}

function showFileList(input, listId) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = '';
  Array.from(input.files).forEach(f => {
    const size = f.size > 1048576 ? (f.size/1048576).toFixed(1)+'MB' : (f.size/1024).toFixed(0)+'KB';
    list.innerHTML += `<div class="file-item"><span>📄</span><span class="file-item-name">${f.name}</span><span style="color:var(--text3)">${size}</span></div>`;
  });
}

function showSingleFile(input, previewId) {
  const el = document.getElementById(previewId);
  if (!el || !input.files[0]) return;
  el.innerHTML = `<div class="file-item" style="margin-top:8px">📄 ${input.files[0].name} (${(input.files[0].size/1024).toFixed(0)}KB)</div>`;
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); } catch { return d; }
}

function urgencyBadge(days, status) {
  if (['Reply Filed','Closed'].includes(status)) return '<span class="badge badge-green">Replied ✅</span>';
  if (days === null) return '<span class="badge badge-gray">No Due Date</span>';
  if (days < 0) return `<span class="badge badge-red">Overdue ${Math.abs(days)}d</span>`;
  if (days <= 7) return `<span class="badge badge-red">🔴 ${days}d left</span>`;
  if (days <= 15) return `<span class="badge badge-yellow">🟡 ${days}d left</span>`;
  return `<span class="badge badge-green">🟢 ${days}d left</span>`;
}

function priorityBadge(p) {
  const map = {High:'badge-red',Medium:'badge-yellow',Low:'badge-green'};
  return `<span class="badge ${map[p]||'badge-gray'}">${p||'Medium'}</span>`;
}

async function api(url, opts={}) {
  const r = await fetch(API+url, opts);
  return r.json();
}

// ─── DASHBOARD ─────────────────────────────────
async function loadDashboard() {
  try {
    const [statsR, upcomingR, overdueR, summaryR] = await Promise.all([
      api('/api/dashboard/stats'), api('/api/dashboard/upcoming'),
      api('/api/dashboard/overdue'), api('/api/dashboard/client-summary')
    ]);
    if (statsR.success) {
      const s = statsR.data;
      document.getElementById('stat-clients').textContent = s.total_clients;
      document.getElementById('stat-notices').textContent = s.total_notices;
      document.getElementById('stat-pending').textContent = s.pending;
      document.getElementById('stat-overdue').textContent = s.overdue;
      document.getElementById('stat-replied').textContent = s.replied;
      document.getElementById('stat-due7').textContent = s.due_in_7;
      document.getElementById('stat-tasks').textContent = s.total_tasks;
      document.getElementById('stat-hearings').textContent = s.hearing_scheduled;
      const subtitle = [];
      if (s.overdue > 0) subtitle.push(`⚠️ ${s.overdue} overdue`);
      if (s.due_in_7 > 0) subtitle.push(`⚡ ${s.due_in_7} due this week`);
      document.getElementById('dash-subtitle').textContent = subtitle.length ? subtitle.join(' · ') : '✅ All notices up to date';
      // Update sidebar badge
      const badge = document.getElementById('nav-overdue-badge');
      if (s.overdue > 0) { badge.textContent = s.overdue; badge.style.display = 'block'; }
      else badge.style.display = 'none';
      const taskBadge = document.getElementById('nav-tasks-badge');
      if (s.total_tasks > 0) { taskBadge.textContent = s.total_tasks; taskBadge.style.display = 'block'; }
      else taskBadge.style.display = 'none';
    }
    // Upcoming
    const ul = document.getElementById('upcoming-list');
    if (upcomingR.success && upcomingR.data.length > 0) {
      ul.innerHTML = upcomingR.data.slice(0,8).map(n => `
        <div class="notice-card ${n.days_remaining<=7?'critical':'safe'}" onclick="viewNotice(${n.id})">
          <div class="notice-card-header">
            <span class="notice-card-client">${n.client_name}</span>
            <span class="notice-card-section">${n.notice_type.replace('Section ','§')}</span>
          </div>
          <div class="notice-card-body">
            <span>AY: ${n.assessment_year||'—'}</span>
            <span>Due: ${fmtDate(n.due_date)}</span>
            ${urgencyBadge(n.days_remaining, n.status)}
          </div>
        </div>`).join('');
    } else ul.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-icon">🎉</div><p>No notices due in next 30 days</p></div>';
    // Overdue
    const ol = document.getElementById('overdue-list');
    document.getElementById('overdue-count').textContent = overdueR.data?.length || 0;
    if (overdueR.success && overdueR.data.length > 0) {
      ol.innerHTML = overdueR.data.slice(0,8).map(n => `
        <div class="notice-card overdue" onclick="viewNotice(${n.id})">
          <div class="notice-card-header">
            <span class="notice-card-client">${n.client_name}</span>
            <span class="notice-card-section">${n.notice_type.replace('Section ','§')}</span>
            <span class="badge badge-red" style="margin-left:auto">${n.days_overdue}d overdue</span>
          </div>
          <div class="notice-card-body">
            ${n.penalty_applicable ? `<span class="penalty-amt">⚠️ ${n.penalty_applicable}</span>` : ''}
          </div>
        </div>`).join('');
    } else ol.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-icon">✅</div><p>No overdue notices!</p></div>';
    // Client summary
    const tbody = document.getElementById('client-summary-tbody');
    if (summaryR.success) {
      tbody.innerHTML = summaryR.data.length ? summaryR.data.map(c => `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td><code style="font-size:11px;color:var(--accent2)">${c.pan}</code></td>
          <td>${c.category}</td>
          <td style="color:var(--text3)">${c.ca_assigned||'—'}</td>
          <td>${c.total_notices}</td>
          <td><span class="${c.pending>0?'urgency-warning':''}">${c.pending}</span></td>
          <td><span class="${c.overdue>0?'urgency-overdue':''}">${c.overdue}</span></td>
          <td><button class="btn btn-outline btn-sm" onclick="showPage('notices');document.getElementById('notice-client-filter').value='${c.id}';loadNotices()">View →</button></td>
        </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:30px">No clients yet. <a href="#" onclick="showPage(\'clients\');openClientModal()" style="color:var(--accent)">Add first client →</a></td></tr>';
    }
  } catch(e) { console.error('Dashboard error:', e); }
}

// ─── CLIENTS ─────────────────────────────────
async function loadClients() {
  const search = document.getElementById('client-search')?.value || '';
  const category = document.getElementById('client-cat-filter')?.value || '';
  const r = await api(`/api/clients?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`);
  allClients = r.data || [];
  const el = document.getElementById('clients-content');
  if (!r.success || !r.data.length) {
    el.innerHTML = `<div class="empty-state card"><div class="empty-icon">👥</div><h3>No clients found</h3><p>Add your first client to get started</p><button class="btn btn-gold" style="margin-top:16px" onclick="openClientModal()">+ Add Client</button></div>`;
    return;
  }
  el.innerHTML = r.data.map(c => `
    <div class="client-card">
      <div class="client-avatar">${c.name[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="client-name">${c.name}</div>
        <div class="client-meta"><code style="color:var(--accent2)">${c.pan}</code> · ${c.category} · ${c.email||'No email'} ${c.phone?'· '+c.phone:''}</div>
        ${c.ca_assigned?`<div class="client-meta" style="margin-top:2px">👤 ${c.ca_assigned}</div>`:''}
      </div>
      <div class="client-stats">
        <div><div class="client-stat-val">${c.total||0}</div><div class="client-stat-label">Total</div></div>
        <div><div class="client-stat-val ${c.pending>0?'urgency-warning':''}">${c.pending||0}</div><div class="client-stat-label">Pending</div></div>
        <div><div class="client-stat-val ${c.overdue>0?'urgency-overdue':''}">${c.overdue||0}</div><div class="client-stat-label">Overdue</div></div>
      </div>
      <div class="client-actions">
        <button class="btn btn-outline btn-sm" onclick="copyCredentials(${c.id})" title="Copy IT Credentials">🔑</button>
        <button class="btn btn-outline btn-sm" onclick="editClient(${c.id})">✏️</button>
        <button class="btn btn-outline btn-sm" onclick="confirmDelete('Delete client ${c.name}? All notices will also be deleted.',()=>deleteClient(${c.id}))" style="color:var(--danger)">🗑</button>
      </div>
    </div>`).join('');
}

function openClientModal() {
  ['client-id','c-name','c-pan','c-email','c-phone','c-gstin','c-ca','c-address','c-it-user','c-it-pass','c-notes'].forEach(id => { const el=document.getElementById(id); if(el)el.value=''; });
  document.getElementById('c-category').value = 'Individual';
  document.getElementById('client-modal-title').textContent = 'Add New Client';
  openModal('client-modal-overlay');
}

async function editClient(id) {
  const r = await api(`/api/clients/${id}`);
  if (!r.success) return toast('Failed to load client', 'error');
  const c = r.data;
  document.getElementById('client-id').value = c.id;
  document.getElementById('c-name').value = c.name;
  document.getElementById('c-pan').value = c.pan;
  document.getElementById('c-email').value = c.email||'';
  document.getElementById('c-phone').value = c.phone||'';
  document.getElementById('c-category').value = c.category;
  document.getElementById('c-gstin').value = c.gstin||'';
  document.getElementById('c-ca').value = c.ca_assigned||'';
  document.getElementById('c-address').value = c.address||'';
  document.getElementById('c-it-user').value = c.it_username||'';
  document.getElementById('c-it-pass').value = c.it_password_dec||'';
  document.getElementById('c-notes').value = c.notes||'';
  document.getElementById('client-modal-title').textContent = 'Edit Client';
  openModal('client-modal-overlay');
}

async function saveClient() {
  const id = document.getElementById('client-id').value;
  const body = {
    name: document.getElementById('c-name').value.trim(),
    pan: document.getElementById('c-pan').value.trim(),
    email: document.getElementById('c-email').value.trim(),
    phone: document.getElementById('c-phone').value.trim(),
    category: document.getElementById('c-category').value,
    gstin: document.getElementById('c-gstin').value.trim(),
    ca_assigned: document.getElementById('c-ca').value.trim(),
    address: document.getElementById('c-address').value.trim(),
    it_username: document.getElementById('c-it-user').value.trim(),
    it_password: document.getElementById('c-it-pass').value,
    notes: document.getElementById('c-notes').value.trim()
  };
  if (!body.name || !body.pan) return toast('Name and PAN are required', 'error');
  const r = await api(id ? `/api/clients/${id}` : '/api/clients', {
    method: id ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if (r.success) { toast(id ? 'Client updated' : 'Client added'); closeModal('client-modal-overlay'); loadClients(); }
  else toast(r.message || 'Error saving client', 'error');
}

async function deleteClient(id) {
  const r = await api(`/api/clients/${id}`, { method: 'DELETE' });
  if (r.success) { toast('Client deleted'); loadClients(); }
  else toast(r.message||'Error', 'error');
}

async function copyCredentials(id) {
  const r = await api(`/api/clients/${id}/credentials`);
  if (r.success) {
    const text = `Username: ${r.data.username}\nPassword: ${r.data.password}`;
    navigator.clipboard.writeText(text).then(() => toast('Credentials copied to clipboard')).catch(() => toast('Copy failed', 'error'));
  }
}

async function importClients(input) {
  if (!input.files[0]) return;
  const fd = new FormData();
  fd.append('file', input.files[0]);
  const r = await api('/api/export/clients/import', { method: 'POST', body: fd });
  if (r.success) { toast(r.message); loadClients(); }
  else toast(r.message||'Import failed', 'error');
  input.value = '';
}

// ─── NOTICE CLIENT FILTER POPULATION ─────────────────────────────────
async function populateClientFilter(selectId) {
  const r = await api('/api/clients');
  if (!r.success) return;
  allClients = r.data;
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const cur = sel.value;
  const first = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(first);
  r.data.forEach(c => {
    const o = new Option(`${c.name} (${c.pan})`, c.id);
    sel.appendChild(o);
  });
  if (cur) sel.value = cur;
}

// ─── NOTICES ─────────────────────────────────
async function loadNotices() {
  const search = document.getElementById('notice-search')?.value || '';
  const status = document.getElementById('notice-status-filter')?.value || '';
  const priority = document.getElementById('notice-priority-filter')?.value || '';
  const client_id = document.getElementById('notice-client-filter')?.value || '';
  await populateClientFilter('notice-client-filter');
  if (client_id) document.getElementById('notice-client-filter').value = client_id;
  const r = await api(`/api/notices?search=${encodeURIComponent(search)}&status=${status}&priority=${priority}&client_id=${client_id}`);
  const el = document.getElementById('notices-content');
  if (!r.success || !r.data.length) {
    el.innerHTML = `<div class="empty-state card"><div class="empty-icon">📋</div><h3>No notices found</h3><p>Add your first notice to start tracking</p><button class="btn btn-gold" style="margin-top:16px" onclick="openNoticeModal()">+ Add Notice</button></div>`;
    return;
  }
  el.innerHTML = r.data.map(n => `
    <div class="notice-card ${n.urgency}" onclick="viewNotice(${n.id})">
      <div class="notice-card-header">
        <span class="notice-card-client">${n.client_name}</span>
        <span class="notice-card-section">${n.notice_type.replace('Section ','§')}</span>
        ${priorityBadge(n.priority)}
        <span style="margin-left:auto">${urgencyBadge(n.days_remaining, n.status)}</span>
      </div>
      <div class="notice-card-body">
        <span>PAN: ${n.pan}</span>
        <span>AY: ${n.assessment_year||'—'}</span>
        <span>Due: ${fmtDate(n.due_date)}</span>
        ${n.din?`<span>DIN: ${n.din}</span>`:''}
        ${n.assigned_to?`<span>👤 ${n.assigned_to}</span>`:''}
        ${n.status?`<span class="badge badge-gray">${n.status}</span>`:''}
      </div>
      ${n.penalty_applicable&&n.urgency==='overdue'?`<div class="penalty-banner" style="margin-top:8px"><span>⚠️</span><span>${n.penalty_applicable}</span></div>`:''}
      <div class="notice-card-actions" onclick="event.stopPropagation()">
        <button class="btn btn-gold btn-sm" onclick="openReplyGen(${n.id},${n.client_id})">✍️ Reply</button>
        <button class="btn btn-outline btn-sm" onclick="editNotice(${n.id})">✏️ Edit</button>
        <button class="btn btn-outline btn-sm" onclick="confirmDelete('Delete this notice?',()=>deleteNotice(${n.id}))" style="color:var(--danger)">🗑</button>
      </div>
    </div>`).join('');
}

async function openNoticeModal() {
  await populateClientFilter('n-client');
  document.getElementById('notice-id').value = '';
  ['n-section','n-din','n-authority','n-desc','n-remarks','n-assigned'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('n-type').value = '';
  document.getElementById('n-ay').value = '';
  document.getElementById('n-date').value = '';
  document.getElementById('n-due').value = '';
  document.getElementById('n-status').value = 'Pending';
  document.getElementById('n-priority').value = 'Medium';
  document.getElementById('notice-modal-title').textContent = 'Add Notice';
  document.getElementById('notice-explanation-box').style.display = 'none';
  document.getElementById('notice-file-preview').textContent = 'No file uploaded yet';
  // Reset PDF extraction state
  extractedPdfFilename = null;
  const statusEl = document.getElementById('pdf-extract-status');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.innerHTML = ''; }
  const pdfZone = document.getElementById('pdf-extract-zone');
  if (pdfZone) pdfZone.style.display = 'block';
  const pdfInput = document.getElementById('pdf-ai-input');
  if (pdfInput) pdfInput.value = '';
  openModal('notice-modal-overlay');
}

async function editNotice(id) {
  await populateClientFilter('n-client');
  const r = await api(`/api/notices/${id}`);
  if (!r.success) return toast('Failed to load notice','error');
  const n = r.data;
  document.getElementById('notice-id').value = n.id;
  document.getElementById('n-client').value = n.client_id;
  document.getElementById('n-type').value = n.notice_type;
  document.getElementById('n-section').value = n.section||'';
  document.getElementById('n-ay').value = n.assessment_year||'';
  document.getElementById('n-date').value = n.notice_date||'';
  document.getElementById('n-due').value = n.due_date||'';
  document.getElementById('n-din').value = n.din||'';
  document.getElementById('n-authority').value = n.issuing_authority||'';
  document.getElementById('n-status').value = n.status||'Pending';
  document.getElementById('n-priority').value = n.priority||'Medium';
  document.getElementById('n-assigned').value = n.assigned_to||'';
  document.getElementById('n-desc').value = n.description||'';
  document.getElementById('n-remarks').value = n.remarks||'';
  document.getElementById('notice-modal-title').textContent = 'Edit Notice';
  // Hide PDF extract zone when editing (already has a file)
  const pdfZone = document.getElementById('pdf-extract-zone');
  if (pdfZone) pdfZone.style.display = 'none';
  document.getElementById('notice-file-preview').textContent = n.notice_file ? `📄 ${n.notice_file}` : 'No file attached';
  extractedPdfFilename = n.notice_file || null;
  openModal('notice-modal-overlay');
}

async function onNoticeTypeChange() {
  const type = document.getElementById('n-type').value;
  const sectionMap = {
    'Section 143(1) Intimation':'143(1)','Section 143(2) Scrutiny':'143(2)','Section 143(3) Assessment':'143(3)',
    'Section 144 Best Judgment':'144','Section 148 Reassessment':'148','Section 148A Show Cause':'148A',
    'Section 131 Summons':'131','Section 133(6) Information':'133(6)','Section 142(1) Enquiry':'142(1)',
    'Section 156 Demand':'156','Section 245 Refund Adjustment':'245','Section 263 Revision CIT':'263',
    'Section 264 Revision Taxpayer':'264','Section 271 Penalty Proceedings':'271',
    'Section 270A Penalty Under-reporting':'270A','Section 68 Unexplained Credit':'68'
  };
  const section = sectionMap[type];
  if (section) document.getElementById('n-section').value = section;
  if (section) {
    const r = await api(`/api/library?search=${section}&category=Notice+Explanation`);
    const box = document.getElementById('notice-explanation-box');
    const txt = document.getElementById('notice-explanation-text');
    if (r.success && r.data.length > 0) {
      txt.textContent = r.data[0].content.substring(0,400) + (r.data[0].content.length>400?'...':'');
      box.style.display = 'block';
    } else box.style.display = 'none';
  }
}

// ─── PDF AI EXTRACTION ──────────────────────────────────
async function uploadAndExtractPDF(input) {
  if (!input.files[0]) return;
  const statusEl = document.getElementById('pdf-extract-status');
  statusEl.style.display = 'block';
  statusEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px;background:rgba(59,130,246,0.08);border-radius:8px;border:1px solid rgba(59,130,246,0.2)"><div class="loading" style="width:16px;height:16px;border-width:2px"></div><span style="font-size:13px;color:var(--accent1)">Uploading PDF and extracting details with AI...</span></div>';
  try {
    const fd = new FormData();
    fd.append('notice_pdf', input.files[0]);
    const res = await fetch('/api/notices/upload-pdf', { method: 'POST', body: fd });
    const r = await res.json();
    if (!r.success) throw new Error(r.message || 'Upload failed');
    extractedPdfFilename = r.filename;
    document.getElementById('notice-file-preview').innerHTML = `<span style="color:var(--accent1)">✅ PDF uploaded: ${r.filename}</span>`;
    if (r.extracted) {
      const e = r.extracted;
      // Auto-fill form fields from AI extraction
      if (e.section) document.getElementById('n-section').value = e.section;
      if (e.assessment_year) {
        const ayEl = document.getElementById('n-ay');
        for (const opt of ayEl.options) { if (opt.value === e.assessment_year) { ayEl.value = e.assessment_year; break; } }
      }
      if (e.notice_date) document.getElementById('n-date').value = e.notice_date;
      if (e.due_date) document.getElementById('n-due').value = e.due_date;
      if (e.din) document.getElementById('n-din').value = e.din;
      if (e.issuing_authority) document.getElementById('n-authority').value = e.issuing_authority;
      if (e.main_issue) document.getElementById('n-desc').value = e.main_issue;
      // Auto-select notice type if section identified
      if (e.notice_type) {
        const typeEl = document.getElementById('n-type');
        for (const opt of typeEl.options) {
          if (opt.value && opt.value.toLowerCase().includes((e.section||'').toLowerCase())) {
            typeEl.value = opt.value; break;
          }
        }
        if (!typeEl.value) { typeEl.options[0].text = e.notice_type; }
      }
      const aiUsed = r.ai_used;
      statusEl.innerHTML = `<div style="padding:12px;background:rgba(${aiUsed?'16,185,129':'245,158,11'},0.1);border-radius:8px;border:1px solid rgba(${aiUsed?'16,185,129':'245,158,11'},0.3)">
        <div style="font-weight:600;margin-bottom:6px;color:var(--${aiUsed?'success':'accent2'})">${aiUsed?'🤖 AI extracted notice details':'📋 Basic extraction done'} — Please review and confirm below</div>
        ${e.section?`<div style="font-size:12px;color:var(--text3)">Section: <strong>${e.section}</strong></div>`:''}  
        ${e.assessment_year?`<div style="font-size:12px;color:var(--text3)">AY: <strong>${e.assessment_year}</strong></div>`:''}
        ${e.due_date?`<div style="font-size:12px;color:var(--text3)">Due Date: <strong style="color:var(--danger)">${e.due_date}</strong></div>`:''}
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${r.message}</div>
      </div>`;
    } else {
      statusEl.innerHTML = `<div style="padding:12px;background:rgba(245,158,11,0.1);border-radius:8px;border:1px solid rgba(245,158,11,0.3);font-size:13px">${r.message}</div>`;
    }
  } catch(err) {
    statusEl.innerHTML = `<div style="padding:12px;background:rgba(239,68,68,0.1);border-radius:8px;font-size:13px;color:var(--danger)">❌ ${err.message || 'Upload failed — please fill fields manually'}</div>`;
  }
}

async function saveNotice() {
  const id = document.getElementById('notice-id').value;
  const fd = new FormData();
  const fields = {client_id:'n-client',notice_type:'n-type',section:'n-section',assessment_year:'n-ay',
    notice_date:'n-date',due_date:'n-due',din:'n-din',issuing_authority:'n-authority',
    status:'n-status',priority:'n-priority',assigned_to:'n-assigned',description:'n-desc',remarks:'n-remarks'};
  for (const [k,v] of Object.entries(fields)) fd.append(k, document.getElementById(v)?.value||'');
  // Use already-extracted PDF filename (no re-upload needed)
  if (extractedPdfFilename && !id) {
    fd.append('extracted_filename', extractedPdfFilename);
  }
  if (!fd.get('client_id')||!fd.get('notice_type')) return toast('Client and Notice Type are required','error');
  const r = await api(id?`/api/notices/${id}`:'/api/notices', { method: id?'PUT':'POST', body: fd });
  if (r.success) { toast(id?'Notice updated':'Notice added'); closeModal('notice-modal-overlay'); loadNotices(); extractedPdfFilename = null; }
  else toast(r.message||'Error saving notice','error');
}

async function deleteNotice(id) {
  const r = await api(`/api/notices/${id}`, {method:'DELETE'});
  if (r.success) { toast('Notice deleted'); loadNotices(); }
  else toast(r.message||'Error','error');
}

async function viewNotice(id) {
  const r = await api(`/api/notices/${id}`);
  if (!r.success) return;
  const n = r.data;
  const today = new Date().toISOString().split('T')[0];
  const days = n.due_date ? Math.ceil((new Date(n.due_date) - new Date(today)) / 86400000) : null;
  document.getElementById('nd-title').textContent = `${n.notice_type} — ${n.client_name}`;
  document.getElementById('nd-body').innerHTML = `
    <div class="form-row" style="margin-bottom:16px">
      <div><div class="form-label">Client</div><strong>${n.client_name}</strong> <code style="color:var(--accent2)">${n.pan}</code></div>
      <div><div class="form-label">Assessment Year</div>${n.assessment_year||'—'}</div>
    </div>
    <div class="form-row" style="margin-bottom:16px">
      <div><div class="form-label">Notice Type</div>${n.notice_type}</div>
      <div><div class="form-label">Section</div>${n.section||'—'}</div>
    </div>
    <div class="form-row" style="margin-bottom:16px">
      <div><div class="form-label">Notice Date</div>${fmtDate(n.notice_date)}</div>
      <div><div class="form-label">Due Date</div>${fmtDate(n.due_date)} ${urgencyBadge(days,n.status)}</div>
    </div>
    <div class="form-row" style="margin-bottom:16px">
      <div><div class="form-label">DIN / Reference</div>${n.din||'—'}</div>
      <div><div class="form-label">Issuing Authority</div>${n.issuing_authority||'—'}</div>
    </div>
    <div class="form-row" style="margin-bottom:16px">
      <div><div class="form-label">Status</div>${n.status}</div>
      <div><div class="form-label">Priority</div>${priorityBadge(n.priority)}</div>
    </div>
    ${n.assigned_to?`<div style="margin-bottom:12px"><div class="form-label">Assigned To</div>${n.assigned_to}</div>`:''}
    ${n.description?`<div style="margin-bottom:12px"><div class="form-label">Description</div><p style="color:var(--text2)">${n.description}</p></div>`:''}
    ${n.remarks?`<div style="margin-bottom:12px"><div class="form-label">Remarks</div><p style="color:var(--text2)">${n.remarks}</p></div>`:''}
    ${n.penalty_applicable?`<div class="penalty-banner"><span>⚠️</span><div><strong>Potential Penalty:</strong> ${n.penalty_applicable}</div></div>`:''}
    ${n.notice_file?`<div style="margin-top:16px"><a href="/uploads/notices/${n.notice_file}" target="_blank" class="btn btn-outline btn-sm">📄 View Notice PDF</a></div>`:''}`;
  document.getElementById('nd-edit-btn').onclick = () => { closeModal('notice-detail-overlay'); editNotice(id); };
  document.getElementById('nd-reply-btn').onclick = () => { closeModal('notice-detail-overlay'); openReplyGen(id, n.client_id); };
  document.getElementById('nd-task-btn').onclick = () => { closeModal('notice-detail-overlay'); openTaskModal(id, n.client_id); };
  document.getElementById('nd-hearing-btn').onclick = () => { closeModal('notice-detail-overlay'); openHearingModalForNotice(id, n.client_id); };
  openModal('notice-detail-overlay');
}

// ─── REPLY GENERATOR ─────────────────────────────────
async function loadReplyClients() { await populateClientFilter('reply-client'); }

async function loadClientNoticesForReply() {
  const client_id = document.getElementById('reply-client').value;
  const sel = document.getElementById('reply-notice');
  sel.innerHTML = '<option value="">Select notice...</option>';
  document.getElementById('reply-notice-info').style.display = 'none';
  if (!client_id) return;
  const r = await api(`/api/notices?client_id=${client_id}`);
  if (r.success) r.data.forEach(n => sel.appendChild(new Option(`${n.notice_type} — AY ${n.assessment_year||'?'} — Due: ${fmtDate(n.due_date)}`, n.id)));
}

async function onReplyNoticeChange() {
  const nid = document.getElementById('reply-notice').value;
  const infoBox = document.getElementById('reply-notice-info');
  if (!nid) { infoBox.style.display='none'; return; }
  const r = await api(`/api/notices/${nid}`);
  if (r.success) {
    const n = r.data;
    const today = new Date().toISOString().split('T')[0];
    const days = n.due_date ? Math.ceil((new Date(n.due_date) - new Date(today)) / 86400000) : null;
    infoBox.innerHTML = `<strong>${n.notice_type}</strong> | AY: ${n.assessment_year||'—'} | DIN: ${n.din||'—'} | ${urgencyBadge(days,n.status)}${n.penalty_applicable?`<br><span class="penalty-amt">⚠️ ${n.penalty_applicable}</span>`:''}`;
    infoBox.style.display = 'block';
    loadReplyHistory(nid);
  }
}

function openReplyGen(noticeId, clientId) {
  showPage('reply-generator');
  setTimeout(async () => {
    await loadReplyClients();
    document.getElementById('reply-client').value = clientId;
    await loadClientNoticesForReply();
    document.getElementById('reply-notice').value = noticeId;
    await onReplyNoticeChange();
  }, 100);
}

async function generateReply() {
  const notice_id = document.getElementById('reply-notice').value;
  const client_id = document.getElementById('reply-client').value;
  if (!notice_id || !client_id) return toast('Select a client and notice first','error');
  const btn = document.getElementById('generate-reply-btn');
  btn.textContent = '⏳ Generating...'; btn.disabled = true;
  try {
    const fd = new FormData();
    fd.append('notice_id', notice_id); fd.append('client_id', client_id);
    fd.append('facts', document.getElementById('reply-facts').value);
    fd.append('legal_provisions', document.getElementById('reply-provisions').value);
    fd.append('client_explanation', document.getElementById('reply-explanation').value);
    fd.append('additional_remarks', document.getElementById('reply-remarks').value);
    const files = document.getElementById('reply-docs');
    if (files?.files) for (const f of files.files) fd.append('supporting_docs', f);
    const r = await api('/api/replies/generate', { method:'POST', body:fd });
    if (r.success) {
      document.getElementById('reply-output').textContent = r.reply;
      document.getElementById('reply-output-card').style.display = 'block';
      document.getElementById('reply-ai-source').textContent = r.ai_used ? '🤖 Generated with AI' : '📝 Template-based reply (add Gemini/OpenAI key in Settings for AI)';
      document.getElementById('save-reply-btn').onclick = () => updateReply(r.id);
      document.getElementById('download-reply-pdf-btn').onclick = () => downloadReplyPDF(r.reply);
      toast(r.message);
      loadReplyHistory(notice_id);
    } else toast(r.message||'Generation failed','error');
  } finally { btn.textContent = '✨ Generate AI Reply'; btn.disabled = false; }
}

async function loadReplyHistory(notice_id) {
  const r = await api(`/api/replies/notice/${notice_id}`);
  const el = document.getElementById('reply-history-list');
  if (!r.success || !r.data.length) { el.innerHTML = '<p class="text-muted">No saved replies yet</p>'; return; }
  el.innerHTML = r.data.map(rep => `
    <div class="notice-card" style="cursor:pointer" onclick="loadReply(${rep.id})">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="badge badge-blue">v${rep.version}</span>
        <span style="font-size:12px;color:var(--text3)">${new Date(rep.created_at).toLocaleDateString('en-IN')}</span>
        <span class="badge ${rep.status==='Sent'?'badge-green':'badge-gray'}">${rep.status}</span>
      </div>
    </div>`).join('');
}

async function loadReply(id) {
  const r = await api(`/api/replies/${id}`);
  if (r.success) {
    document.getElementById('reply-output').textContent = r.data.generated_reply;
    document.getElementById('reply-output-card').style.display = 'block';
    document.getElementById('save-reply-btn').onclick = () => updateReply(id);
    document.getElementById('download-reply-pdf-btn').onclick = () => downloadReplyPDF(r.data.generated_reply);
  }
}

async function updateReply(id) {
  const text = document.getElementById('reply-output').textContent;
  const r = await api(`/api/replies/${id}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({generated_reply:text,status:'Draft'})});
  if (r.success) toast('Reply saved'); else toast('Save failed','error');
}

function copyReply() {
  const text = document.getElementById('reply-output').textContent;
  navigator.clipboard.writeText(text).then(() => toast('Reply copied to clipboard')).catch(() => toast('Copy failed','error'));
}

function downloadReplyPDF(text) {
  const blob = new Blob([text||document.getElementById('reply-output').textContent], {type:'text/plain'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'IT_Reply.txt'; a.click();
}

// ─── DOCUMENTS ─────────────────────────────────
async function loadDocClients() { await populateClientFilter('doc-client-select'); }

async function loadClientDocs() {
  const client_id = document.getElementById('doc-client-select').value;
  const el = document.getElementById('documents-content');
  const zipBtn = document.getElementById('doc-zip-btn');
  if (!client_id) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div><h3>Select a Client</h3><p>Choose a client to view documents</p></div>'; zipBtn.style.display='none'; return; }
  zipBtn.style.display = 'block';
  const r = await api(`/api/documents?client_id=${client_id}`);
  if (!r.success || !r.data.length) {
    el.innerHTML = `<div class="empty-state card"><div class="empty-icon">📂</div><h3>No documents</h3><p>No documents uploaded for this client yet</p></div>`;
    return;
  }
  // Group by notice
  const byNotice = {};
  r.data.forEach(d => { if (!byNotice[d.notice_id]) byNotice[d.notice_id] = {type:d.notice_type,section:d.section,docs:[]}; byNotice[d.notice_id].docs.push(d); });
  el.innerHTML = Object.entries(byNotice).map(([nid,g]) => `
    <div class="card" style="margin-bottom:12px">
      <div class="card-header"><h3 class="card-title">📋 ${g.type||'Notice'} ${g.section?'§'+g.section:''}</h3></div>
      <div class="table-wrap"><table><thead><tr><th>File</th><th>Tag</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>
        ${g.docs.map(d=>`<tr>
          <td><a href="/uploads/documents/${d.filename}" target="_blank" style="color:var(--accent2)">📄 ${d.original_name}</a></td>
          <td><span class="badge badge-gray">${d.tag||'Other'}</span></td>
          <td style="font-size:12px;color:var(--text3)">${d.size?(d.size/1024).toFixed(0)+'KB':'—'}</td>
          <td style="font-size:12px;color:var(--text3)">${new Date(d.uploaded_at).toLocaleDateString('en-IN')}</td>
          <td><button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="confirmDelete('Delete this document?',()=>deleteDoc(${d.id}))">🗑</button></td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>`).join('');
}

async function deleteDoc(id) {
  const r = await api(`/api/documents/${id}`,{method:'DELETE'});
  if (r.success) { toast('Document deleted'); loadClientDocs(); }
}

function downloadClientZip() {
  const client_id = document.getElementById('doc-client-select').value;
  if (client_id) window.open(`/api/documents/zip/${client_id}`);
}

// ─── TASKS ─────────────────────────────────
async function loadTasks() {
  await Promise.all([populateStaffFilter('task-filter-staff'), populateClientFilter('t-client')]);
  const status = document.getElementById('task-filter-status')?.value||'';
  const assigned_to_id = document.getElementById('task-filter-staff')?.value||'';
  const r = await api(`/api/tasks?status=${status}&assigned_to_id=${assigned_to_id}`);
  const el = document.getElementById('tasks-content');
  if (!r.success||!r.data.length) {
    el.innerHTML = `<div class="empty-state card"><div class="empty-icon">✅</div><h3>No tasks found</h3><p>Create tasks linked to notices and assign them to staff</p><button class="btn btn-gold" style="margin-top:16px" onclick="openTaskModal()">+ Add Task</button></div>`;
    return;
  }
  const lanes = {Pending:[],['In Progress']:[],Done:[]};
  r.data.forEach(t => { if(lanes[t.status]) lanes[t.status].push(t); else lanes.Pending.push(t); });
  const colors = {Pending:'badge-yellow','In Progress':'badge-blue',Done:'badge-green'};
  el.innerHTML = `<div class="task-board">${Object.entries(lanes).map(([status,tasks])=>`
    <div class="task-lane">
      <div class="task-lane-title"><span class="badge ${colors[status]}">${status}</span> <span style="color:var(--text3)">${tasks.length}</span></div>
      ${tasks.length ? tasks.map(t=>`
        <div class="task-card ${t.is_overdue?'overdue':''}">
          <div class="task-card-title">${t.title}</div>
          ${t.client_name?`<div style="font-size:12px;color:var(--accent2)">${t.client_name}</div>`:''}
          <div class="task-card-meta">
            ${t.assigned_to_name?`<span>👤 ${t.assigned_to_name}</span>`:'<span style="color:var(--text3)">Unassigned</span>'}
            ${t.due_date?`<span>${t.is_overdue?'⚠️':''} ${fmtDate(t.due_date)}</span>`:''}
            ${priorityBadge(t.priority)}
          </div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn btn-outline btn-sm" onclick="editTask(${t.id})">✏️</button>
            ${t.status!=='Done'?`<button class="btn btn-success btn-sm" onclick="markTaskDone(${t.id})">✓ Done</button>`:''}
            <button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="confirmDelete('Delete task?',()=>deleteTask(${t.id}))">🗑</button>
          </div>
        </div>`).join('') : '<p class="text-muted" style="font-size:12px;text-align:center;padding:16px">No tasks</p>'}
    </div>`).join('')}</div>`;
}

async function populateStaffFilter(selectId) {
  const r = await api('/api/staff');
  const sel = document.getElementById(selectId);
  if (!sel||!r.success) return;
  const cur = sel.value;
  const first = sel.options[0];
  sel.innerHTML = ''; sel.appendChild(first);
  r.data.forEach(s => sel.appendChild(new Option(`${s.name} (${s.role})`, s.id)));
  if (cur) sel.value = cur;
  allStaff = r.data;
}

async function openTaskModal(notice_id=null, client_id=null) {
  document.getElementById('task-id').value = '';
  document.getElementById('t-title').value = '';
  document.getElementById('t-desc').value = '';
  document.getElementById('t-due').value = '';
  document.getElementById('t-priority').value = 'Medium';
  document.getElementById('t-status').value = 'Pending';
  await Promise.all([populateClientFilter('t-client'), populateStaffInModal()]);
  if (notice_id) await loadNoticesForTaskModal(client_id, notice_id);
  if (client_id) { document.getElementById('t-client').value = client_id; await loadNoticesForTaskModal(client_id, notice_id); }
  document.getElementById('task-modal-title').textContent = 'Add Task';
  openModal('task-modal-overlay');
}

async function populateStaffInModal() {
  const r = await api('/api/staff');
  const sel = document.getElementById('t-staff');
  if (!sel||!r.success) return;
  sel.innerHTML = '<option value="">Unassigned</option>';
  r.data.forEach(s => sel.appendChild(new Option(`${s.name} (${s.role})`, s.id)));
  allStaff = r.data;
}

async function loadNoticesForTaskModal(client_id, select_id=null) {
  if (!client_id) return;
  const r = await api(`/api/notices?client_id=${client_id}`);
  const sel = document.getElementById('t-notice');
  sel.innerHTML = '<option value="">None</option>';
  if (r.success) r.data.forEach(n => sel.appendChild(new Option(`${n.notice_type} — AY ${n.assessment_year||'?'}`, n.id)));
  if (select_id) sel.value = select_id;
}

async function editTask(id) {
  const r = await api(`/api/tasks?status=`);
  const task = (r.data||[]).find(t=>t.id==id);
  if (!task) return;
  await openTaskModal();
  document.getElementById('task-id').value = task.id;
  document.getElementById('t-title').value = task.title;
  document.getElementById('t-desc').value = task.description||'';
  document.getElementById('t-due').value = task.due_date||'';
  document.getElementById('t-priority').value = task.priority;
  document.getElementById('t-status').value = task.status;
  if (task.client_id) { document.getElementById('t-client').value = task.client_id; await loadNoticesForTaskModal(task.client_id, task.notice_id); }
  if (task.assigned_to_id) document.getElementById('t-staff').value = task.assigned_to_id;
  document.getElementById('task-modal-title').textContent = 'Edit Task';
}

async function saveTask() {
  const id = document.getElementById('task-id').value;
  const body = {
    title: document.getElementById('t-title').value.trim(),
    description: document.getElementById('t-desc').value.trim(),
    notice_id: document.getElementById('t-notice').value||null,
    client_id: document.getElementById('t-client').value||null,
    assigned_to_id: document.getElementById('t-staff').value||null,
    due_date: document.getElementById('t-due').value,
    priority: document.getElementById('t-priority').value,
    status: document.getElementById('t-status').value
  };
  if (!body.title) return toast('Title is required','error');
  const r = await api(id?`/api/tasks/${id}`:'/api/tasks',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if (r.success) { toast(id?'Task updated':'Task created'); closeModal('task-modal-overlay'); loadTasks(); }
  else toast(r.message||'Error','error');
}

async function markTaskDone(id) {
  await api(`/api/tasks/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'Done'})});
  toast('Task marked as done ✅'); loadTasks();
}

async function deleteTask(id) {
  await api(`/api/tasks/${id}`,{method:'DELETE'});
  toast('Task deleted'); loadTasks();
}

// ─── STAFF ─────────────────────────────────
async function loadStaff() {
  const r = await api('/api/staff');
  const el = document.getElementById('staff-content');
  if (!r.success || !r.data.length) {
    el.innerHTML = `<div class="empty-state card"><div class="empty-icon">🧑‍💼</div><h3>No staff yet</h3><p>Add your team members to assign tasks</p><button class="btn btn-gold" style="margin-top:16px" onclick="openStaffModal()">+ Add Staff</button></div>`;
    return;
  }
  const roleColors = {Admin:'badge-red',CA:'badge-blue',Article:'badge-yellow',Assistant:'badge-gray'};
  el.innerHTML = `<div class="staff-grid">${r.data.map(s => `
    <div class="staff-card">
      <div class="staff-avatar">${s.name[0].toUpperCase()}</div>
      <div class="staff-name">${s.name}</div>
      <div class="staff-role"><span class="badge ${roleColors[s.role]||'badge-gray'}">${s.role}</span></div>
      ${s.email ? `<div style="font-size:12px;color:var(--text3);margin-bottom:4px">✉️ ${s.email}</div>` : ''}
      ${s.phone ? `<div style="font-size:12px;color:var(--text3);margin-bottom:12px">📞 ${s.phone}</div>` : ''}
      ${s.active_tasks > 0 ? `<div class="badge badge-yellow" style="margin-bottom:12px">${s.active_tasks} active tasks</div>` : ''}
      <div class="staff-actions">
        <button class="btn btn-outline btn-sm" onclick="editStaff(${s.id})">✏️ Edit</button>
        <button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="confirmDelete('Remove ${s.name}?',()=>deleteStaff(${s.id}))">🗑</button>
      </div>
    </div>`).join('')}</div>`;
}

function openStaffModal() {
  document.getElementById('staff-id').value = '';
  document.getElementById('st-name').value = '';
  document.getElementById('st-email').value = '';
  document.getElementById('st-phone').value = '';
  document.getElementById('st-role').value = 'Article';
  document.getElementById('staff-modal-title').textContent = 'Add Staff Member';
  openModal('staff-modal-overlay');
}

async function editStaff(id) {
  const r = await api('/api/staff/all');
  const s = (r.data||[]).find(x=>x.id==id);
  if (!s) return;
  document.getElementById('staff-id').value = s.id;
  document.getElementById('st-name').value = s.name;
  document.getElementById('st-email').value = s.email||'';
  document.getElementById('st-phone').value = s.phone||'';
  document.getElementById('st-role').value = s.role;
  document.getElementById('staff-modal-title').textContent = 'Edit Staff';
  openModal('staff-modal-overlay');
}

async function saveStaff() {
  const id = document.getElementById('staff-id').value;
  const body = { name:document.getElementById('st-name').value.trim(), email:document.getElementById('st-email').value.trim(), phone:document.getElementById('st-phone').value.trim(), role:document.getElementById('st-role').value };
  if (!body.name) return toast('Name is required','error');
  const r = await api(id?`/api/staff/${id}`:'/api/staff',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if (r.success) { toast(id?'Staff updated':'Staff added'); closeModal('staff-modal-overlay'); loadStaff(); }
  else toast(r.message||'Error','error');
}

async function deleteStaff(id) {
  await api(`/api/staff/${id}`,{method:'DELETE'});
  toast('Staff removed'); loadStaff();
}

// ─── HEARINGS ─────────────────────────────────
async function loadHearings() {
  const status = document.getElementById('hearing-status-filter')?.value || '';
  const r = await api(`/api/hearings?status=${status}`);
  const el = document.getElementById('hearings-content');
  if (!r.success || !r.data.length) {
    el.innerHTML = `<div class="empty-state card"><div class="empty-icon">🗓️</div><h3>No hearings scheduled</h3><p>Schedule ITAT, HC, or CIT(A) hearings</p><button class="btn btn-gold" style="margin-top:16px" onclick="openHearingModal()">+ Schedule Hearing</button></div>`;
    return;
  }
  const statusColors = {Scheduled:'badge-blue',Completed:'badge-green',Adjourned:'badge-yellow',Cancelled:'badge-gray'};
  el.innerHTML = r.data.map(h => {
    const d = new Date(h.hearing_date+'T00:00:00');
    const day = d.getDate();
    const month = d.toLocaleString('en',{month:'short'}).toUpperCase();
    return `<div class="hearing-card">
      <div class="hearing-date-box"><div class="hearing-day">${day}</div><div class="hearing-month">${month}</div></div>
      <div class="hearing-info">
        <div class="hearing-client">${h.client_name} <code style="color:var(--accent2);font-size:11px">${h.pan}</code></div>
        <div class="hearing-meta">
          ${h.notice_type?`${h.notice_type} | `:''}${h.authority||'Authority N/A'} ${h.venue?'| '+h.venue:''}
          ${h.hearing_time?` | ⏰ ${h.hearing_time}`:''}
        </div>
        ${h.notes?`<div style="font-size:12px;color:var(--text3);margin-top:4px">${h.notes}</div>`:''}
        ${h.outcome?`<div style="font-size:12px;color:var(--success);margin-top:4px">📝 ${h.outcome}</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <span class="badge ${statusColors[h.status]||'badge-gray'}">${h.status}</span>
        <div class="hearing-actions">
          <button class="btn btn-outline btn-sm" onclick="editHearing(${h.id})">✏️</button>
          <button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="confirmDelete('Delete hearing?',()=>deleteHearing(${h.id}))">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function openHearingModal() {
  await populateClientFilter('h-client');
  document.getElementById('hearing-id').value = '';
  ['h-date','h-time','h-authority','h-venue','h-notes','h-outcome'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('h-status').value = 'Scheduled';
  document.getElementById('h-notice').innerHTML = '<option value="">Select notice (optional)...</option>';
  document.getElementById('hearing-modal-title').textContent = 'Schedule Hearing';
  openModal('hearing-modal-overlay');
}

async function openHearingModalForNotice(notice_id, client_id) {
  await openHearingModal();
  if (client_id) { document.getElementById('h-client').value = client_id; await loadClientNoticesForHearing(); }
  if (notice_id) document.getElementById('h-notice').value = notice_id;
}

async function loadClientNoticesForHearing() {
  const client_id = document.getElementById('h-client').value;
  const sel = document.getElementById('h-notice');
  sel.innerHTML = '<option value="">Select notice (optional)...</option>';
  if (!client_id) return;
  const r = await api(`/api/notices?client_id=${client_id}`);
  if (r.success) r.data.forEach(n => sel.appendChild(new Option(`${n.notice_type} — AY ${n.assessment_year||'?'}`, n.id)));
}

async function editHearing(id) {
  const r = await api(`/api/hearings?status=`);
  const h = (r.data||[]).find(x=>x.id==id);
  if (!h) return;
  await openHearingModal();
  document.getElementById('hearing-id').value = h.id;
  document.getElementById('h-client').value = h.client_id;
  await loadClientNoticesForHearing();
  document.getElementById('h-notice').value = h.notice_id||'';
  document.getElementById('h-date').value = h.hearing_date||'';
  document.getElementById('h-time').value = h.hearing_time||'';
  document.getElementById('h-authority').value = h.authority||'';
  document.getElementById('h-venue').value = h.venue||'';
  document.getElementById('h-notes').value = h.notes||'';
  document.getElementById('h-outcome').value = h.outcome||'';
  document.getElementById('h-status').value = h.status||'Scheduled';
  document.getElementById('hearing-modal-title').textContent = 'Edit Hearing';
}

async function saveHearing() {
  const id = document.getElementById('hearing-id').value;
  const body = {
    client_id: document.getElementById('h-client').value,
    notice_id: document.getElementById('h-notice').value||null,
    hearing_date: document.getElementById('h-date').value,
    hearing_time: document.getElementById('h-time').value,
    authority: document.getElementById('h-authority').value,
    venue: document.getElementById('h-venue').value,
    notes: document.getElementById('h-notes').value,
    outcome: document.getElementById('h-outcome').value,
    status: document.getElementById('h-status').value
  };
  if (!body.client_id || !body.hearing_date) return toast('Client and hearing date are required','error');
  const r = await api(id?`/api/hearings/${id}`:'/api/hearings',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if (r.success) { toast(id?'Hearing updated':'Hearing scheduled'); closeModal('hearing-modal-overlay'); loadHearings(); }
  else toast(r.message||'Error','error');
}

async function deleteHearing(id) {
  await api(`/api/hearings/${id}`,{method:'DELETE'});
  toast('Hearing deleted'); loadHearings();
}

// ─── LIBRARY ─────────────────────────────────
async function loadLibrary() {
  const search = document.getElementById('library-search')?.value || '';
  const category = document.getElementById('library-cat-filter')?.value || '';
  const r = await api(`/api/library?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`);
  const el = document.getElementById('library-content');
  if (!r.success || !r.data.length) {
    el.innerHTML = `<div class="empty-state card"><div class="empty-icon">📚</div><h3>No entries found</h3><p>The library contains IT Act sections, CBDT circulars, case laws and notice guides</p></div>`;
    return;
  }
  const catColors = {'Notice Explanation':'badge-blue','Penalty Reference':'badge-red','CBDT Circulars':'badge-yellow','Case Laws':'badge-purple','IT Act Sections':'badge-green','Other':'badge-gray'};
  el.innerHTML = r.data.map(e => `
    <div class="lib-card" onclick="this.classList.toggle('expanded')">
      <div class="lib-card-header">
        <div class="lib-card-title">${e.title}</div>
        ${e.section_ref?`<span class="section-tag">${e.section_ref}</span>`:''}
        <span class="badge ${catColors[e.category]||'badge-gray'} ">${e.category}</span>
        <div style="margin-left:auto;display:flex;gap:6px" onclick="event.stopPropagation()">
          <button class="btn btn-outline btn-sm" onclick="editLibraryEntry(${e.id})">✏️</button>
          <button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="confirmDelete('Delete library entry?',()=>deleteLibraryEntry(${e.id}))">🗑</button>
        </div>
      </div>
      <div class="lib-card-content">${e.content}</div>
      ${e.source?`<div style="font-size:11px;color:var(--text3);margin-top:6px">📖 Source: ${e.source}</div>`:''}
    </div>`).join('');
}

function openLibraryModal() {
  document.getElementById('lib-id').value = '';
  ['lib-title','lib-section','lib-content','lib-tags','lib-source'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('lib-cat').value = 'Notice Explanation';
  document.getElementById('library-modal-title').textContent = 'Add Library Entry';
  openModal('library-modal-overlay');
}

async function editLibraryEntry(id) {
  const r = await api(`/api/library/${id}`);
  if (!r.success) return;
  const e = r.data;
  document.getElementById('lib-id').value = e.id;
  document.getElementById('lib-title').value = e.title;
  document.getElementById('lib-cat').value = e.category;
  document.getElementById('lib-section').value = e.section_ref||'';
  document.getElementById('lib-content').value = e.content;
  document.getElementById('lib-tags').value = e.tags||'';
  document.getElementById('lib-source').value = e.source||'';
  document.getElementById('library-modal-title').textContent = 'Edit Library Entry';
  openModal('library-modal-overlay');
}

async function saveLibraryEntry() {
  const id = document.getElementById('lib-id').value;
  const body = { title:document.getElementById('lib-title').value.trim(), category:document.getElementById('lib-cat').value, section_ref:document.getElementById('lib-section').value.trim(), content:document.getElementById('lib-content').value.trim(), tags:document.getElementById('lib-tags').value.trim(), source:document.getElementById('lib-source').value.trim() };
  if (!body.title||!body.content) return toast('Title and Content are required','error');
  const r = await api(id?`/api/library/${id}`:'/api/library',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if (r.success) { toast(id?'Entry updated':'Entry added'); closeModal('library-modal-overlay'); loadLibrary(); }
  else toast(r.message||'Error','error');
}

async function deleteLibraryEntry(id) {
  await api(`/api/library/${id}`,{method:'DELETE'});
  toast('Entry deleted'); loadLibrary();
}

// ─── SETTINGS ─────────────────────────────────
async function loadSettings() {
  const r = await api('/api/settings');
  if (!r.success) return;
  const s = r.data;
  document.getElementById('s-office-name').value = s.office_name||'';
  document.getElementById('s-office-address').value = s.office_address||'';
  document.getElementById('s-ca-membership').value = s.ca_membership||'';
  document.getElementById('s-ai-provider').value = s.ai_provider||'gemini';
  document.getElementById('s-gemini-key').placeholder = s.gemini_api_key ? `Current: ${s.gemini_api_key}` : 'Enter Gemini API key';
  document.getElementById('s-openai-key').placeholder = s.openai_api_key ? `Current: ${s.openai_api_key}` : 'Enter OpenAI API key';
  const statusEl = document.getElementById('settings-ai-status');
  if (!s.gemini_api_key_set && !s.openai_api_key_set) statusEl.style.display='flex';
  else statusEl.style.display='none';
  // Update sidebar office name
  const sidebarOfficeName = document.getElementById('sidebar-office-name');
  if (sidebarOfficeName && s.office_name) sidebarOfficeName.textContent = s.office_name;
}

async function saveSettings() {
  const body = { office_name:document.getElementById('s-office-name').value.trim(), office_address:document.getElementById('s-office-address').value.trim(), ca_membership:document.getElementById('s-ca-membership').value.trim() };
  const r = await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if (r.success) { toast('Office details saved'); loadSettings(); }
  else toast('Error saving settings','error');
}

async function saveAISettings() {
  const body = { ai_provider:document.getElementById('s-ai-provider').value, gemini_api_key:document.getElementById('s-gemini-key').value, openai_api_key:document.getElementById('s-openai-key').value };
  const r = await api('/api/settings/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if (r.success) {
    toast('AI settings saved');
    document.getElementById('s-gemini-key').value = '';
    document.getElementById('s-openai-key').value = '';
    document.getElementById('s-ai-key-status').textContent = '✅ API key saved successfully';
    loadSettings();
  } else toast('Error saving AI settings','error');
}

// ─── INIT ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Nav item click handlers
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => showPage(item.dataset.page));
  });
  // Load initial page
  loadDashboard();
  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => { m.style.display='none'; m.classList.remove('open'); });
    }
  });
});
