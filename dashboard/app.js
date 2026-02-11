// Ted Command Center - Premium Dashboard Application
// ================================================================

// ==================== STATE ====================
let selectedTarget = null; // { jid, name, type: 'group'|'contact' }
let activeTab = 'groups';
let groupsList = [];
let contactsList = [];
let crmContacts = {};
let sendAs = 'me'; // 'me' or 'ted'
let agentQRPollTimer = null;
let quickReplies = [];
let qrPopupActive = false;
let qrPopupIndex = 0;

// ==================== SVG ICONS ====================
const ICONS = {
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
  attachment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
};

// ==================== AVATAR HELPERS ====================
const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

function getInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function avatarHtml(name, size = 36) {
  const initials = getInitials(name);
  const color = getAvatarColor(name);
  return `<div class="sidebar-avatar" style="width:${size}px;height:${size}px;background:${color};font-size:${Math.round(size * 0.36)}px">${escHtml(initials)}</div>`;
}

// ==================== API HELPERS ====================
async function api(path, opts = {}) {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
    return { error: err.message };
  }
}

const apiGet = (path) => api(path);
const apiPost = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
const apiDelete = (path) => api(path, { method: 'DELETE' });

// ==================== TOAST ====================
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ==================== TIME FORMATTING ====================
function relativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-US');
}

function formatPhone(jid) {
  if (!jid) return '';
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

// ==================== STATUS ====================
async function loadStatus() {
  const data = await apiGet('/api/status');
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');

  if (data.status === 'connected') {
    dot.className = 'status-dot connected';
    text.textContent = 'Connected';
  } else if (data.status === 'connecting') {
    dot.className = 'status-dot connecting';
    text.textContent = 'Connecting...';
  } else {
    dot.className = 'status-dot disconnected';
    text.textContent = 'Disconnected';
  }
}

// ==================== STATS ====================
async function loadStats() {
  const data = await apiGet('/api/stats');
  document.getElementById('stat-contacts').textContent = data.total_contacts || 0;
  document.getElementById('stat-notes').textContent = data.total_notes || 0;
  document.getElementById('stat-reminders').textContent = data.pending_reminders || 0;
  document.getElementById('stat-due').textContent = data.due_reminders || 0;
  document.getElementById('stat-tags').textContent = data.tags?.length || 0;

  const status = await apiGet('/api/status');
  document.getElementById('stat-messages').textContent =
    status.total_messages ? (status.total_messages > 1000 ? Math.floor(status.total_messages / 1000) + 'K' : status.total_messages) : 0;
}

// ==================== SIDEBAR ====================
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById('sidebar-search-input').value = '';
  renderSidebar();
}

async function loadSidebar() {
  const [groups, contacts, crm] = await Promise.all([
    apiGet('/api/groups'),
    apiGet('/api/contacts'),
    apiGet('/api/crm'),
  ]);

  groupsList = groups.groups || [];
  contactsList = contacts.contacts || [];
  crmContacts = crm.contacts || {};
  renderSidebar();
}

function renderSidebar() {
  const container = document.getElementById('sidebar-list');
  const search = document.getElementById('sidebar-search-input').value.toLowerCase();
  let html = '';

  if (activeTab === 'groups') {
    const filtered = groupsList.filter(g => !search || g.name.toLowerCase().includes(search));
    if (filtered.length === 0) {
      html = '<div class="empty-state">No groups found</div>';
    }
    for (const g of filtered) {
      const isActive = selectedTarget?.jid === g.jid;
      html += `
        <div class="sidebar-item ${isActive ? 'active' : ''}" onclick="selectTarget('${g.jid}', '${escAttr(g.name)}', 'group')">
          ${avatarHtml(g.name)}
          <div class="sidebar-item-info">
            <div class="sidebar-item-name">${escHtml(g.name)}</div>
            <div class="sidebar-item-sub">${g.participant_count} members · ${g.message_count_in_store} msgs${g.last_message_time ? ' · ' + relativeTime(g.last_message_time) : ''}</div>
          </div>
        </div>`;
    }
  } else if (activeTab === 'contacts') {
    const filtered = contactsList.filter(c => {
      if (!search) return true;
      const crmName = crmContacts[c.jid]?.name || '';
      return (c.name || '').toLowerCase().includes(search) || c.phone.includes(search) || crmName.toLowerCase().includes(search);
    });
    if (filtered.length === 0) {
      html = '<div class="empty-state">No contacts found</div>';
    }
    for (const c of filtered) {
      const isActive = selectedTarget?.jid === c.jid;
      const crmData = crmContacts[c.jid];
      const name = crmData?.name || c.name || c.phone;
      const isUnnamed = !c.name && !crmData?.name;
      const tags = crmData?.tags || [];
      html += `
        <div class="sidebar-item ${isActive ? 'active' : ''}" onclick="selectTarget('${c.jid}', '${escAttr(name)}', 'contact')">
          ${avatarHtml(name)}
          <div class="sidebar-item-info">
            <div class="sidebar-item-name">${escHtml(name)} <span class="rename-btn" onclick="event.stopPropagation();renameContact('${c.jid}','${escAttr(c.phone)}')" title="Rename">${ICONS.edit}</span></div>
            ${tags.length ? '<div class="sidebar-item-tags">' + tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('') + '</div>' : ''}
            <div class="sidebar-item-sub">${c.phone} · ${c.message_count_in_store} msgs${c.last_message_time ? ' · ' + relativeTime(c.last_message_time) : ''}</div>
          </div>
        </div>`;
    }
  } else if (activeTab === 'crm') {
    const entries = Object.entries(crmContacts);
    const filtered = entries.filter(([jid, c]) => {
      if (!search) return true;
      return (c.name || '').toLowerCase().includes(search) || jid.includes(search) || (c.tags || []).some(t => t.includes(search));
    });
    if (filtered.length === 0) {
      html = '<div class="empty-state">No CRM contacts yet</div>';
    }
    for (const [jid, c] of filtered) {
      const isActive = selectedTarget?.jid === jid;
      const displayName = c.name || formatPhone(jid);
      html += `
        <div class="sidebar-item ${isActive ? 'active' : ''}" onclick="selectTarget('${jid}', '${escAttr(displayName)}', 'contact')">
          ${avatarHtml(displayName)}
          <div class="sidebar-item-info">
            <div class="sidebar-item-name">${escHtml(displayName)}</div>
            ${c.tags?.length ? '<div class="sidebar-item-tags">' + c.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('') + '</div>' : ''}
            <div class="sidebar-item-sub">${c.notes?.length || 0} notes · ${relativeTime(c.last_interaction)}</div>
          </div>
        </div>`;
    }
  }

  container.innerHTML = html;
}

function selectTarget(jid, name, type) {
  selectedTarget = { jid, name, type };
  document.getElementById('composer-target').innerHTML = `Sending to: <strong>${escHtml(name)}</strong>`;
  renderSidebar();
  loadMessages();
  loadCRMPanel();
}

// ==================== MESSAGES ====================
async function loadMessages() {
  const container = document.getElementById('feed-body');

  if (!selectedTarget) {
    container.innerHTML = '<div class="empty-state">Select a group or contact to view messages</div>';
    return;
  }

  const since = document.getElementById('feed-period').value;
  const data = await apiGet(`/api/messages/${encodeURIComponent(selectedTarget.jid)}?since=${since}&limit=100`);

  if (!data.messages || data.messages.length === 0) {
    container.innerHTML = '<div class="empty-state">No messages in the selected time range</div>';
    return;
  }

  let html = '';
  for (const msg of data.messages) {
    const text = msg.content || msg.text || msg.caption || '';
    const type = msg.type !== 'text' ? msg.type : '';

    html += `
      <div class="feed-message">
        <div class="feed-msg-header">
          <span class="feed-msg-sender">${escHtml(msg.sender_name || msg.sender || 'Me')}</span>
          <span class="feed-msg-time">${relativeTime(msg.timestamp)}</span>
        </div>
        ${text ? `<div class="feed-msg-text">${escHtml(text)}</div>` : ''}
        ${type ? `<div class="feed-msg-type">[${type}]</div>` : ''}
      </div>`;
  }

  container.innerHTML = html;

  // Scroll to bottom to show most recent messages
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

// ==================== REMINDERS POPUP ====================
async function showRemindersPopup() {
  const crm = await apiGet('/api/crm');
  const allReminders = crm.reminders || [];

  // Build modal overlay
  let overlay = document.getElementById('reminders-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'reminders-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const pending = allReminders.filter(r => r.status === 'pending');
  const overdue = pending.filter(r => new Date(r.due_at) < new Date());
  const upcoming = pending.filter(r => new Date(r.due_at) >= new Date());
  const completed = allReminders.filter(r => r.status === 'done').slice(0, 10);
  const cancelled = allReminders.filter(r => r.status === 'cancelled').slice(0, 5);

  let html = `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);width:520px;max-height:80vh;overflow-y:auto;padding:0;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:rgba(245,158,11,0.15);border-radius:8px;color:var(--accent);">${ICONS.clock}</div>
        <h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text-primary);">All Reminders</h3>
      </div>
      <span onclick="document.getElementById('reminders-overlay').remove()" style="cursor:pointer;color:var(--text-dim);width:24px;height:24px;">${ICONS.x}</span>
    </div>
    <div style="padding:16px 20px;">`;

  if (allReminders.length === 0) {
    html += '<div style="text-align:center;color:var(--text-dim);padding:32px 0;">No reminders yet</div>';
  }

  // Overdue
  if (overdue.length > 0) {
    html += '<div style="font-size:12px;font-weight:600;color:var(--danger);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Overdue</div>';
    for (const r of overdue) {
      const contactName = r.contact_name || formatPhone(r.target_jid || '');
      html += `<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
        <div style="font-size:13px;color:var(--text-primary);font-weight:500;">${escHtml(r.text)}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">${contactName ? escHtml(contactName) + ' · ' : ''}Due: ${new Date(r.due_at).toLocaleString()}</div>
        <div style="margin-top:6px;display:flex;gap:6px;">
          <button class="btn btn-sm btn-success" onclick="completeReminderPopup('${r.id}')">Complete</button>
          <button class="btn btn-sm btn-danger" onclick="cancelReminderPopup('${r.id}')">Cancel</button>
        </div>
      </div>`;
    }
  }

  // Upcoming
  if (upcoming.length > 0) {
    html += '<div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:8px;margin-top:12px;text-transform:uppercase;letter-spacing:0.5px;">Upcoming</div>';
    for (const r of upcoming) {
      const contactName = r.contact_name || formatPhone(r.target_jid || '');
      html += `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
        <div style="font-size:13px;color:var(--text-primary);font-weight:500;">${escHtml(r.text)}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">${contactName ? escHtml(contactName) + ' · ' : ''}Due: ${new Date(r.due_at).toLocaleString()}</div>
        <div style="margin-top:6px;display:flex;gap:6px;">
          <button class="btn btn-sm btn-success" onclick="completeReminderPopup('${r.id}')">Complete</button>
          <button class="btn btn-sm btn-danger" onclick="cancelReminderPopup('${r.id}')">Cancel</button>
        </div>
      </div>`;
    }
  }

  // Completed (collapsed)
  if (completed.length > 0) {
    html += '<div style="font-size:12px;font-weight:600;color:var(--success);margin-bottom:8px;margin-top:12px;text-transform:uppercase;letter-spacing:0.5px;">Completed (last 10)</div>';
    for (const r of completed) {
      const contactName = r.contact_name || formatPhone(r.target_jid || '');
      html += `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;opacity:0.6;">
        <div style="font-size:13px;color:var(--text-muted);text-decoration:line-through;">${escHtml(r.text)}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${contactName ? escHtml(contactName) + ' · ' : ''}${new Date(r.due_at).toLocaleString()}</div>
      </div>`;
    }
  }

  html += '</div></div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}

async function completeReminderPopup(id) {
  await apiPost(`/api/crm/reminder/${id}/complete`);
  showToast('Reminder completed');
  showRemindersPopup(); // Refresh popup
  loadStats();
  if (selectedTarget) loadCRMPanel();
}

async function cancelReminderPopup(id) {
  await apiPost(`/api/crm/reminder/${id}/cancel`);
  showToast('Reminder cancelled');
  showRemindersPopup(); // Refresh popup
  loadStats();
  if (selectedTarget) loadCRMPanel();
}

// ==================== AGENT PANEL ====================
function openAgentPanel() {
  document.getElementById('agent-modal').style.display = 'flex';
  loadAgentsList();
}

function closeAgentPanel() {
  document.getElementById('agent-modal').style.display = 'none';
  if (agentQRPollTimer) {
    clearInterval(agentQRPollTimer);
    agentQRPollTimer = null;
  }
}

async function loadAgentsList() {
  const container = document.getElementById('agents-list');

  // Try to load agents from API
  const agentsData = await apiGet('/api/agents');

  let html = '';

  if (agentsData.agents && agentsData.agents.length > 0) {
    for (const agent of agentsData.agents) {
      const isConnected = agent.status === 'connected';
      const isMain = agent.id === 'main';
      const isActive = agent.isActive === true;
      html += `
        <div class="agent-card ${isActive ? 'active' : ''}">
          <div class="agent-card-header">
            <span class="agent-card-name">${escHtml(agent.name)}${isActive ? ' <span style="font-size:11px;color:var(--accent);font-weight:500;">(Active)</span>' : ''}</span>
            <span class="agent-status">
              <span class="status-dot ${isConnected ? 'connected' : 'disconnected'}"></span>
              ${isConnected ? 'Connected' : agent.status === 'pending_qr' ? 'Waiting for QR' : agent.status === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>
          <div class="agent-card-info">
            ${agent.phone ? `<span>Phone: ${escHtml(agent.phone)}</span>` : ''}
            ${agent.groups !== undefined ? `<span>Groups: ${agent.groups}</span>` : ''}
            ${agent.messages !== undefined ? `<span>Messages: ${agent.messages}</span>` : ''}
          </div>
          <div style="margin-top: 6px; display: flex; gap: 6px;">
            ${!isActive && isConnected ? `<button class="btn btn-sm btn-primary" onclick="switchAgent('${agent.id}')">Switch to this agent</button>` : ''}
            ${!isActive && !isConnected && !isMain ? `<button class="btn btn-sm btn-secondary" disabled>Not connected</button>` : ''}
            ${!isMain ? `<button class="btn btn-sm btn-danger" onclick="removeAgent('${agent.id}')">Remove</button>` : ''}
          </div>
        </div>`;
    }
  } else {
    // Fallback: show main agent from status
    const status = await apiGet('/api/status');
    html = `
      <div class="agent-card active">
        <div class="agent-card-header">
          <span class="agent-card-name">Main Agent (Ted) <span style="font-size:11px;color:var(--accent);font-weight:500;">(Active)</span></span>
          <span class="agent-status">
            <span class="status-dot ${status.status === 'connected' ? 'connected' : 'disconnected'}"></span>
            ${status.status === 'connected' ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div class="agent-card-info">
          <span>Groups: ${status.groups_cached || 0}</span>
          <span>Messages: ${status.total_messages || 0}</span>
        </div>
      </div>`;
  }

  container.innerHTML = html;
}

async function switchAgent(agentId) {
  const result = await apiPost(`/api/agents/${agentId}/activate`);
  if (result.error) {
    showToast('Error: ' + result.error, 'error');
    return;
  }
  showToast('Switched to agent');
  loadAgentsList();
  loadStatus();
  loadSidebar();
}

async function addNewAgent() {
  const nameInput = document.getElementById('agent-name-input');
  const phoneInput = document.getElementById('agent-phone-input');
  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!name || !phone) {
    showToast('Please enter agent name and phone number', 'error');
    return;
  }

  const qrContainer = document.getElementById('qr-container');
  qrContainer.innerHTML = '<div class="qr-status">Starting connection...</div>';

  const result = await apiPost('/api/agents/create', { name, phone });

  if (result.error) {
    showToast('Error: ' + result.error, 'error');
    qrContainer.innerHTML = '';
    return;
  }

  const agentId = result.agentId || result.id;
  if (!agentId) {
    showToast('Failed to create agent', 'error');
    qrContainer.innerHTML = '';
    return;
  }

  showToast('Agent created, waiting for QR code...');
  nameInput.value = '';
  phoneInput.value = '';

  // Poll for QR code
  pollAgentQR(agentId, qrContainer);
}

function pollAgentQR(agentId, container) {
  if (agentQRPollTimer) clearInterval(agentQRPollTimer);

  let attempts = 0;
  const maxAttempts = 60; // 2 minutes

  agentQRPollTimer = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(agentQRPollTimer);
      agentQRPollTimer = null;
      container.innerHTML = '<div class="qr-status" style="color: var(--danger);">QR code timed out. Try again.</div>';
      return;
    }

    const data = await apiGet(`/api/agents/${agentId}/qr`);

    if (data.status === 'connected') {
      clearInterval(agentQRPollTimer);
      agentQRPollTimer = null;
      container.innerHTML = `
        <div style="padding: 20px; color: var(--success); font-weight: 600;">
          ${ICONS.check} Connected successfully!
        </div>`;
      loadAgentsList();
      return;
    }

    if (data.qrDataUrl) {
      // Server generated QR as data URL image
      container.innerHTML = `
        <img src="${data.qrDataUrl}" alt="QR Code" style="width: 256px; height: 256px; border-radius: 8px; margin: 8px 0;">
        <div class="qr-status">Scan with WhatsApp on your phone</div>`;
    } else if (data.qr) {
      container.innerHTML = '<div class="qr-status">Generating QR code...</div>';
    } else {
      container.innerHTML = '<div class="qr-status">Waiting for QR code...</div>';
    }
  }, 2000);
}

async function removeAgent(agentId) {
  if (!confirm('Remove this agent? The WhatsApp connection will be disconnected.')) return;
  const result = await apiDelete(`/api/agents/${agentId}`);
  if (result.error) {
    showToast('Error: ' + result.error, 'error');
  } else {
    showToast('Agent removed');
    loadAgentsList();
  }
}

// ==================== SEND AS TOGGLE ====================
function toggleSendAs() {
  sendAs = sendAs === 'me' ? 'ted' : 'me';
  const btn = document.getElementById('btn-send-as');
  const textarea = document.getElementById('msg-text');
  if (sendAs === 'ted') {
    btn.textContent = 'Ted';
    btn.className = 'btn-mode ted-mode';
    textarea.placeholder = 'Write instructions for Ted...';
  } else {
    btn.textContent = 'You';
    btn.className = 'btn-mode';
    textarea.placeholder = 'Write a message...';
  }
}

// ==================== SEND MESSAGE ====================
async function sendTextMessage() {
  if (!selectedTarget) {
    showToast('Select a target first', 'error');
    return;
  }

  const textarea = document.getElementById('msg-text');
  let text = textarea.value.trim();
  if (!text) return;

  const btn = document.getElementById('btn-send');
  btn.disabled = true;

  if (sendAs === 'ted') {
    showToast('Ted is generating response...', 'info');
    const result = await apiPost('/api/ted-respond', {
      jid: selectedTarget.jid,
      instruction: text,
    });

    if (result.success || result.message_id) {
      textarea.value = '';
      showToast('Ted sent the message');
      setTimeout(loadMessages, 1000);
    } else {
      showToast('Error: ' + (result.error || 'Unknown'), 'error');
    }
    btn.disabled = false;
    return;
  }

  const result = await apiPost('/api/send-message', { jid: selectedTarget.jid, text });

  if (result.success || result.message_id) {
    textarea.value = '';
    showToast('Message sent');
    setTimeout(loadMessages, 1000);
  } else {
    showToast('Error: ' + (result.error || 'Unknown'), 'error');
  }

  btn.disabled = false;
}

// ==================== AI IMAGE ====================
let aiImageUrl = null;

function generateImage() {
  const input = document.getElementById('ai-prompt');
  const prompt = input.value.trim();
  if (!prompt) return;

  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true`;

  const preview = document.getElementById('ai-preview');
  preview.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">Generating image...</div>';

  const img = new Image();
  img.onload = () => {
    preview.innerHTML = '';
    preview.appendChild(img);
    aiImageUrl = url;
    document.getElementById('btn-send-image').disabled = false;
  };
  img.onerror = () => {
    preview.innerHTML = '<div style="color: var(--danger); padding: 20px;">Error generating image</div>';
  };
  img.src = url;
  img.style.maxWidth = '100%';
  img.style.maxHeight = '250px';
  img.style.borderRadius = '12px';
}

async function sendAiImage() {
  if (!selectedTarget || !aiImageUrl) {
    showToast('Select a target and generate an image first', 'error');
    return;
  }

  const btn = document.getElementById('btn-send-image');
  btn.disabled = true;

  const caption = document.getElementById('ai-prompt').value.trim();
  const result = await apiPost('/api/send-image', {
    jid: selectedTarget.jid,
    url: aiImageUrl,
    caption: caption,
  });

  if (result.success || result.message_id) {
    showToast('Image sent');
    document.getElementById('ai-prompt').value = '';
    document.getElementById('ai-preview').innerHTML = '';
    aiImageUrl = null;
    btn.disabled = true;
  } else {
    showToast('Error: ' + (result.error || 'Unknown'), 'error');
    btn.disabled = false;
  }
}

// ==================== CRM PANEL ====================
async function loadCRMPanel() {
  const container = document.getElementById('crm-panel-body');

  if (!selectedTarget) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">${ICONS.user}</div>
      Select a contact to view CRM profile
    </div>`;
    return;
  }

  const profile = await apiGet(`/api/crm/profile/${encodeURIComponent(selectedTarget.jid)}`);
  const crm = await apiGet('/api/crm');

  let html = '';

  // Profile header
  const profileName = selectedTarget.name;
  const autoReplyMode = profile?.auto_reply || 'default';
  html += `
    <div class="crm-profile">
      ${avatarHtml(profileName, 64)}
      <div class="crm-profile-name">${escHtml(profileName)}</div>
      <div class="crm-profile-phone">${formatPhone(selectedTarget.jid)}</div>
      ${profile?.last_interaction ? `<div class="crm-profile-last">Last interaction: ${relativeTime(profile.last_interaction)}</div>` : ''}
    </div>`;

  // Auto-reply toggle per contact
  const isPrivateChat = !selectedTarget.jid.endsWith('@g.us');
  if (isPrivateChat) {
    html += `<div class="crm-section">
      <div class="crm-section-header">
        <div class="crm-section-icon cyan">${ICONS.send}</div>
        <div class="crm-section-title">Ted Auto-Reply</div>
      </div>
      <div class="crm-section-body">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm ${autoReplyMode === 'on' ? 'btn-success' : 'btn-secondary'}" onclick="setContactAutoReply('on')" style="min-width:60px;">On</button>
          <button class="btn btn-sm ${autoReplyMode === 'off' ? 'btn-danger' : 'btn-secondary'}" onclick="setContactAutoReply('off')" style="min-width:60px;">Off</button>
          <button class="btn btn-sm ${autoReplyMode === 'default' ? 'btn-primary' : 'btn-secondary'}" onclick="setContactAutoReply('default')" style="min-width:80px;">Default</button>
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px;">
          ${autoReplyMode === 'on' ? 'Ted will always reply to this contact' :
            autoReplyMode === 'off' ? 'Ted will never reply to this contact' :
            'Using global setting'}
        </div>
      </div></div>`;
  }

  // Tags section
  html += `<div class="crm-section">
    <div class="crm-section-header">
      <div class="crm-section-icon amber">${ICONS.tag}</div>
      <div class="crm-section-title">Tags</div>
    </div>
    <div class="crm-section-body">`;
  if (profile?.tags?.length) {
    html += '<div class="tags-wrap">';
    for (const tag of profile.tags) {
      html += `<span class="tag">${escHtml(tag)} <span class="tag-remove" onclick="removeTag('${escAttr(tag)}')">×</span></span>`;
    }
    html += '</div>';
  } else {
    html += '<div class="no-data">No tags yet</div>';
  }
  html += `<div class="inline-add">
      <input type="text" id="new-tag" placeholder="Add tag..." onkeypress="if(event.key==='Enter')addTag()">
      <button class="btn btn-sm btn-primary" onclick="addTag()">Add</button>
    </div>
    </div></div>`;

  // Notes section
  html += `<div class="crm-section">
    <div class="crm-section-header">
      <div class="crm-section-icon green">${ICONS.note}</div>
      <div class="crm-section-title">Notes</div>
    </div>
    <div class="crm-section-body">`;
  if (profile?.notes?.length) {
    for (const note of profile.notes) {
      html += `
        <div class="note-item">
          <div class="note-text">${escHtml(note.text)}</div>
          <span class="note-delete" onclick="deleteNote('${note.id}')" title="Delete">${ICONS.trash}</span>
        </div>`;
    }
  }
  html += `<div class="inline-add">
      <input type="text" id="new-note" placeholder="Add note..." onkeypress="if(event.key==='Enter')addNote()">
      <button class="btn btn-sm btn-primary" onclick="addNote()">Add</button>
    </div>
    </div></div>`;

  // Metadata section
  html += `<div class="crm-section">
    <div class="crm-section-header">
      <div class="crm-section-icon blue">${ICONS.clipboard}</div>
      <div class="crm-section-title">Metadata</div>
    </div>
    <div class="crm-section-body">`;
  if (profile?.metadata && Object.keys(profile.metadata).length) {
    for (const [key, value] of Object.entries(profile.metadata)) {
      html += `<div class="meta-item"><span class="meta-key">${escHtml(key)}</span><span class="meta-value">${escHtml(String(value))}</span></div>`;
    }
  }
  html += `<div class="inline-add">
      <input type="text" id="meta-key" placeholder="Field" style="max-width: 80px;">
      <input type="text" id="meta-value" placeholder="Value" onkeypress="if(event.key==='Enter')setMetadata()">
      <button class="btn btn-sm btn-primary" onclick="setMetadata()">Add</button>
    </div>
    </div></div>`;

  // Follow-up section
  html += `<div class="crm-section">
    <div class="crm-section-header">
      <div class="crm-section-icon purple">${ICONS.calendar}</div>
      <div class="crm-section-title">Follow-up</div>
    </div>
    <div class="crm-section-body">
      <div class="inline-add">
        <input type="date" id="follow-up-date" value="${profile?.follow_up_date?.split('T')[0] || ''}">
        <button class="btn btn-sm btn-primary" onclick="setFollowUp()">Set</button>
      </div>
      ${profile?.follow_up_date ? `<div style="font-size: 11px; color: var(--warning); margin-top: 6px;">Scheduled: ${new Date(profile.follow_up_date).toLocaleDateString('en-US')}</div>` : ''}
    </div></div>`;

  // Reminders section
  html += `<div class="crm-section">
    <div class="crm-section-header">
      <div class="crm-section-icon red">${ICONS.clock}</div>
      <div class="crm-section-title">Reminders</div>
    </div>
    <div class="crm-section-body">`;
  const contactReminders = (crm.reminders || []).filter(r => r.target_jid === selectedTarget.jid);
  for (const r of contactReminders) {
    const statusClass = r.status === 'done' ? 'done' : r.status === 'cancelled' ? 'cancelled' : '';
    html += `
      <div class="reminder-item ${statusClass}">
        <div class="reminder-text">${escHtml(r.text)}</div>
        <div class="reminder-due">${new Date(r.due_at).toLocaleString('en-US')} · ${r.status}</div>
        ${r.status === 'pending' ? `
          <div class="reminder-actions">
            <button class="btn btn-sm btn-success" onclick="completeReminder('${r.id}')">Complete</button>
            <button class="btn btn-sm btn-danger" onclick="cancelReminder('${r.id}')">Cancel</button>
          </div>` : ''}
      </div>`;
  }
  html += `<div class="inline-add" style="flex-wrap: wrap;">
      <input type="text" id="reminder-text" placeholder="Reminder..." style="min-width: 120px;">
      <input type="datetime-local" id="reminder-due" style="max-width: 180px;">
      <button class="btn btn-sm btn-primary" onclick="addReminder()">Add</button>
    </div>
    </div></div>`;

  container.innerHTML = html;
}

// ==================== CRM ACTIONS ====================
async function addTag() {
  const input = document.getElementById('new-tag');
  const tag = input.value.trim();
  if (!tag || !selectedTarget) return;

  await apiPost('/api/crm/tags', {
    jid: selectedTarget.jid,
    tags: [tag],
    action: 'add',
    contact_name: selectedTarget.name,
  });
  input.value = '';
  showToast(`Tag "${tag}" added`);
  loadCRMPanel();
  loadSidebar();
}

async function removeTag(tag) {
  if (!selectedTarget) return;
  await apiPost('/api/crm/tags', {
    jid: selectedTarget.jid,
    tags: [tag],
    action: 'remove',
  });
  showToast(`Tag "${tag}" removed`);
  loadCRMPanel();
  loadSidebar();
}

async function addNote() {
  const input = document.getElementById('new-note');
  const text = input.value.trim();
  if (!text || !selectedTarget) return;

  await apiPost('/api/crm/note', {
    jid: selectedTarget.jid,
    text,
    contact_name: selectedTarget.name,
  });
  input.value = '';
  showToast('Note added');
  loadCRMPanel();
}

async function deleteNote(noteId) {
  await apiDelete(`/api/crm/note/${noteId}`);
  showToast('Note deleted');
  loadCRMPanel();
}

async function setMetadata() {
  const key = document.getElementById('meta-key').value.trim();
  const value = document.getElementById('meta-value').value.trim();
  if (!key || !selectedTarget) return;

  await apiPost('/api/crm/metadata', {
    jid: selectedTarget.jid,
    key,
    value,
    contact_name: selectedTarget.name,
  });
  document.getElementById('meta-key').value = '';
  document.getElementById('meta-value').value = '';
  showToast(`${key} updated`);
  loadCRMPanel();
}

async function setFollowUp() {
  const date = document.getElementById('follow-up-date').value;
  if (!date || !selectedTarget) return;

  await apiPost('/api/crm/follow-up', {
    jid: selectedTarget.jid,
    date: new Date(date).toISOString(),
    contact_name: selectedTarget.name,
  });
  showToast('Follow-up set');
  loadCRMPanel();
}

async function addReminder() {
  const text = document.getElementById('reminder-text').value.trim();
  const dueAt = document.getElementById('reminder-due').value;
  if (!text || !dueAt) return;

  await apiPost('/api/crm/reminder', {
    text,
    due_at: new Date(dueAt).toISOString(),
    target_jid: selectedTarget?.jid,
  });
  document.getElementById('reminder-text').value = '';
  document.getElementById('reminder-due').value = '';
  showToast('Reminder added');
  loadCRMPanel();
  loadStats();
}

async function completeReminder(id) {
  await apiPost(`/api/crm/reminder/${id}/complete`);
  showToast('Reminder completed');
  loadCRMPanel();
  loadStats();
}

async function cancelReminder(id) {
  await apiPost(`/api/crm/reminder/${id}/cancel`);
  showToast('Reminder cancelled');
  loadCRMPanel();
  loadStats();
}

async function setContactAutoReply(mode) {
  if (!selectedTarget) return;
  await apiPost('/api/crm/auto-reply', {
    jid: selectedTarget.jid,
    mode,
    name: selectedTarget.name,
  });
  const label = mode === 'on' ? 'Auto-reply ON for this contact' :
                mode === 'off' ? 'Auto-reply OFF for this contact' :
                'Auto-reply set to default';
  showToast(label);
  loadCRMPanel();
}

// ==================== RIGHT PANEL TABS ====================
function switchRightTab(tab) {
  document.querySelectorAll('.right-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-rtab="${tab}"]`).classList.add('active');
  document.getElementById('right-crm').style.display = tab === 'crm' ? 'flex' : 'none';
  document.getElementById('right-tools').style.display = tab === 'tools' ? 'flex' : 'none';
  if (tab === 'tools') renderQuickRepliesManager();
}

function summarizeChat() {
  if (!selectedTarget) { showToast('Select a chat first', 'error'); return; }
  showToast('Use Claude CLI for full chat summary', 'info');
}

function exportMessages() {
  if (!selectedTarget) { showToast('Select a chat first', 'error'); return; }
  showToast('Export coming soon', 'info');
}

// ==================== RENAME CONTACT ====================
async function renameContact(jid, phone) {
  const currentName = contactsList.find(c => c.jid === jid)?.name || crmContacts[jid]?.name || '';
  const newName = prompt(`Enter name for ${phone}:`, currentName);
  if (newName === null) return; // cancelled
  if (!newName.trim()) return;

  const result = await apiPost('/api/rename-contact', { jid, name: newName.trim() });
  if (result.error) {
    showToast('Error: ' + result.error, 'error');
    return;
  }

  // Update selected target name if this is the active contact
  if (selectedTarget && selectedTarget.jid === jid) {
    selectedTarget.name = newName.trim();
    document.getElementById('composer-target').innerHTML = `Sending to: <strong>${escHtml(newName.trim())}</strong>`;
  }

  showToast(`Renamed to ${newName.trim()}`);
  await loadData();
}

// ==================== QUICK REPLIES ====================
async function loadQuickReplies() {
  const data = await apiGet('/api/quick-replies');
  quickReplies = data.replies || [];
  renderQuickRepliesManager();
}

function renderQuickRepliesManager() {
  const container = document.getElementById('qr-manage-list');
  if (!container) return;

  if (quickReplies.length === 0) {
    container.innerHTML = '<div style="font-size: 12px; color: var(--text-dim); padding: 4px 0;">No quick replies yet</div>';
    return;
  }

  let html = '';
  for (const qr of quickReplies) {
    html += `
      <div class="qr-manage-item">
        <span class="qr-manage-shortcut">/${escHtml(qr.shortcut)}</span>
        <span class="qr-manage-text">${escHtml(qr.text)}</span>
        <span class="qr-manage-delete" onclick="deleteQuickReply('${qr.id}')" title="Delete">${ICONS.trash}</span>
      </div>`;
  }
  container.innerHTML = html;
}

async function addQuickReply() {
  const shortcutInput = document.getElementById('qr-new-shortcut');
  const textInput = document.getElementById('qr-new-text');
  const shortcut = shortcutInput.value.trim().replace(/^\//, ''); // remove leading /
  const text = textInput.value.trim();

  if (!shortcut || !text) {
    showToast('Enter shortcut and reply text', 'error');
    return;
  }

  const result = await apiPost('/api/quick-replies', { shortcut, text });
  if (result.error) {
    showToast('Error: ' + result.error, 'error');
    return;
  }

  shortcutInput.value = '';
  textInput.value = '';
  showToast(result.updated ? `Updated /${shortcut}` : `Added /${shortcut}`);
  await loadQuickReplies();
}

async function deleteQuickReply(id) {
  await apiDelete(`/api/quick-replies/${id}`);
  showToast('Quick reply deleted');
  await loadQuickReplies();
}

function showQuickRepliesPopup(filter) {
  const popup = document.getElementById('qr-popup');
  const searchTerm = filter.replace(/^\//, '').toLowerCase();

  const filtered = searchTerm
    ? quickReplies.filter(qr => qr.shortcut.toLowerCase().includes(searchTerm) || qr.text.toLowerCase().includes(searchTerm))
    : quickReplies;

  if (filtered.length === 0 && quickReplies.length === 0) {
    popup.innerHTML = '<div class="qr-popup-empty">No quick replies saved. Add them in Tools panel.</div>';
    popup.classList.add('visible');
    qrPopupActive = true;
    qrPopupIndex = -1;
    return;
  }

  if (filtered.length === 0) {
    popup.innerHTML = `<div class="qr-popup-empty">No match for "${escHtml(searchTerm)}"</div>`;
    popup.classList.add('visible');
    qrPopupActive = true;
    qrPopupIndex = -1;
    return;
  }

  let html = '<div class="qr-popup-header">Quick Replies</div>';
  filtered.forEach((qr, i) => {
    html += `
      <div class="qr-popup-item ${i === 0 ? 'active' : ''}" data-index="${i}" onclick="selectQuickReply('${escAttr(qr.text)}')" onmouseenter="highlightQRItem(${i})">
        <span class="qr-popup-shortcut">/${escHtml(qr.shortcut)}</span>
        <span class="qr-popup-text">${escHtml(qr.text)}</span>
      </div>`;
  });

  popup.innerHTML = html;
  popup.classList.add('visible');
  qrPopupActive = true;
  qrPopupIndex = 0;
  popup._filtered = filtered;
}

function hideQuickRepliesPopup() {
  const popup = document.getElementById('qr-popup');
  popup.classList.remove('visible');
  qrPopupActive = false;
  qrPopupIndex = 0;
}

function highlightQRItem(index) {
  const popup = document.getElementById('qr-popup');
  const items = popup.querySelectorAll('.qr-popup-item');
  items.forEach((el, i) => el.classList.toggle('active', i === index));
  qrPopupIndex = index;
}

function selectQuickReply(text) {
  const textarea = document.getElementById('msg-text');
  textarea.value = text;
  textarea.focus();
  hideQuickRepliesPopup();
}

function handleComposerInput(e) {
  const textarea = e.target;
  const value = textarea.value;

  // Show popup when text starts with /
  if (value.startsWith('/') && value.length >= 1) {
    showQuickRepliesPopup(value);
  } else {
    hideQuickRepliesPopup();
  }
}

// ==================== UTILS ====================
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  return escHtml(str).replace(/'/g, '&#39;');
}

function handleComposerKey(e) {
  // Quick replies popup navigation
  if (qrPopupActive) {
    const popup = document.getElementById('qr-popup');
    const items = popup.querySelectorAll('.qr-popup-item');
    const count = items.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (count > 0) {
        qrPopupIndex = (qrPopupIndex + 1) % count;
        highlightQRItem(qrPopupIndex);
        items[qrPopupIndex]?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (count > 0) {
        qrPopupIndex = (qrPopupIndex - 1 + count) % count;
        highlightQRItem(qrPopupIndex);
        items[qrPopupIndex]?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && count > 0 && qrPopupIndex >= 0) {
      e.preventDefault();
      const filtered = popup._filtered;
      if (filtered && filtered[qrPopupIndex]) {
        selectQuickReply(filtered[qrPopupIndex].text);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideQuickRepliesPopup();
      return;
    }
    if (e.key === 'Tab' && count > 0 && qrPopupIndex >= 0) {
      e.preventDefault();
      const filtered = popup._filtered;
      if (filtered && filtered[qrPopupIndex]) {
        selectQuickReply(filtered[qrPopupIndex].text);
      }
      return;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTextMessage();
  }
}

// ==================== DATA LOADING ====================
async function loadData() {
  await Promise.all([loadStatus(), loadStats(), loadSidebar()]);
  loadCRMPanel();
}

// ==================== INIT ====================
async function init() {
  await Promise.all([loadData(), loadQuickReplies()]);

  // Auto-refresh
  setInterval(loadStatus, 10000);
  setInterval(loadStats, 30000);
  setInterval(() => { if (selectedTarget) loadMessages(); }, 15000);
  setInterval(loadSidebar, 60000);

  // Close quick replies popup when clicking outside
  document.addEventListener('click', (e) => {
    if (qrPopupActive) {
      const popup = document.getElementById('qr-popup');
      const textarea = document.getElementById('msg-text');
      if (!popup.contains(e.target) && e.target !== textarea) {
        hideQuickRepliesPopup();
      }
    }
  });
}

// Start
init();
