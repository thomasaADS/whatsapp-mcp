#!/usr/bin/env node
/**
 * CRM Command Center - Web server for Ted's dashboard
 * Integrated mode: imported by src/index.ts to share WhatsApp connection
 * Standalone mode: npx tsx src/dashboard-server.ts (read-only, no WhatsApp)
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import QRCode from 'qrcode';

// WhatsApp & tools imports (may not be available in standalone mode)
import { getConnectionState, getMessageStore, getGroupCache, setContactName, getContactNames, syncContactNames, getAgentInfos, getAgentInfo, createAgentConnection, removeAgent, setActiveAgent, getActiveAgentId } from './whatsapp.js';
import { randomUUID } from 'node:crypto';
import { getMessagesForGroup } from './store.js';
import { listGroups } from './tools/groups.js';
import { listContacts } from './tools/contacts.js';
import { sendMessage } from './tools/send.js';
import { sendPrivateMessage } from './tools/private-messages.js';
import { sendImage, sendImagePrivate } from './tools/send-media.js';
import {
  addNote, getNotes, searchNotes, deleteNote,
  addTags, removeTags, getContactsByTag, getAllTags,
  setContactMetadata, getContactProfile, updateFollowUp,
  logInteraction,
  addReminder, getReminders, getDueReminders, completeReminder, cancelReminder,
  searchContacts, getCRMOverview, renameContact,
} from './crm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = join(__dirname, '..', 'dashboard');
const CRM_FILE = join(__dirname, '..', 'store', 'crm-data.json');
const QUICK_REPLIES_FILE = join(__dirname, '..', 'store', 'quick-replies.json');

// Anthropic Claude API client for Ted AI responses
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

// ==================== HELPERS ====================

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res: ServerResponse, data: any, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

function errorResponse(res: ServerResponse, message: string, status = 400) {
  jsonResponse(res, { error: message }, status);
}

// ==================== QUICK REPLIES ====================
interface QuickReply {
  id: string;
  shortcut: string;   // e.g. "hello", "price", "address"
  text: string;        // the actual reply text
  createdAt: string;
}

function getQuickReplies(): QuickReply[] {
  try {
    if (existsSync(QUICK_REPLIES_FILE)) {
      return JSON.parse(readFileSync(QUICK_REPLIES_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveQuickReplies(replies: QuickReply[]) {
  writeFileSync(QUICK_REPLIES_FILE, JSON.stringify(replies, null, 2), 'utf-8');
}

function getCRMDataFromFile(): any {
  try {
    if (existsSync(CRM_FILE)) {
      return JSON.parse(readFileSync(CRM_FILE, 'utf-8'));
    }
  } catch {}
  return { contacts: {}, reminders: [], global_notes: [] };
}

function getActivityLog(): any[] {
  const crm = getCRMDataFromFile();
  const log: any[] = [];

  for (const [jid, contact] of Object.entries(crm.contacts) as any) {
    for (const note of contact.notes || []) {
      log.push({ type: 'note', jid, contact_name: contact.name || jid.split('@')[0], text: note.text, timestamp: note.created_at });
    }
    if (contact.last_interaction) {
      log.push({ type: 'interaction', jid, contact_name: contact.name || jid.split('@')[0], text: `אינטראקציה עם ${contact.name || jid.split('@')[0]}`, timestamp: contact.last_interaction });
    }
    if (contact.tags?.length > 0) {
      log.push({ type: 'tags', jid, contact_name: contact.name || jid.split('@')[0], text: `תגיות: ${contact.tags.join(', ')}`, timestamp: contact.updated_at || contact.created_at });
    }
  }

  for (const reminder of crm.reminders || []) {
    log.push({ type: 'reminder', text: reminder.text, status: reminder.status, due_at: reminder.due_at, timestamp: reminder.created_at });
  }
  for (const note of crm.global_notes || []) {
    log.push({ type: 'global_note', text: note.text, timestamp: note.created_at });
  }

  log.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return log;
}

// ==================== REQUEST HANDLER ====================

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url || '/';
  const parsedUrl = new URL(rawUrl, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const method = req.method || 'GET';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // ==================== ORIGINAL API ENDPOINTS ====================

    if (method === 'GET' && pathname === '/api/crm') {
      return jsonResponse(res, getCRMDataFromFile());
    }

    if (method === 'GET' && pathname === '/api/activity') {
      return jsonResponse(res, getActivityLog());
    }

    if (method === 'GET' && pathname === '/api/stats') {
      const crm = getCRMDataFromFile();
      const contacts = Object.values(crm.contacts) as any[];
      const now = new Date().toISOString();
      const stats = {
        total_contacts: contacts.length,
        total_notes: contacts.reduce((sum: number, c: any) => sum + (c.notes?.length || 0), 0) + (crm.global_notes?.length || 0),
        total_reminders: crm.reminders?.length || 0,
        pending_reminders: (crm.reminders || []).filter((r: any) => r.status === 'pending').length,
        due_reminders: (crm.reminders || []).filter((r: any) => r.status === 'pending' && r.due_at <= now).length,
        tags: (() => {
          const tagCounts: Record<string, number> = {};
          for (const c of contacts) {
            for (const tag of c.tags || []) {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
          }
          return Object.entries(tagCounts).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
        })(),
      };
      return jsonResponse(res, stats);
    }

    // ==================== NEW: WHATSAPP DATA ENDPOINTS ====================

    if (method === 'GET' && pathname === '/api/status') {
      const state = getConnectionState();
      const store = getMessageStore();
      const groupCache = getGroupCache();
      return jsonResponse(res, {
        status: state,
        groups_cached: Object.keys(groupCache).length,
        total_messages: Object.values(store).reduce((sum, msgs) => sum + msgs.length, 0),
      });
    }

    if (method === 'GET' && pathname === '/api/groups') {
      const search = parsedUrl.searchParams.get('search') || undefined;
      return jsonResponse(res, listGroups({ search }));
    }

    if (method === 'GET' && pathname === '/api/contacts') {
      const search = parsedUrl.searchParams.get('search') || undefined;
      return jsonResponse(res, listContacts({ search }));
    }

    // POST /api/contact-name - manually set contact display name
    if (method === 'POST' && pathname === '/api/contact-name') {
      const body = await readBody(req);
      if (!body.jid || !body.name) return errorResponse(res, 'jid and name required');
      setContactName(body.jid, body.name);
      return jsonResponse(res, { success: true, jid: body.jid, name: body.name });
    }

    // POST /api/rename-contact - rename contact (updates both contact cache + CRM)
    if (method === 'POST' && pathname === '/api/rename-contact') {
      const body = await readBody(req);
      if (!body.jid || !body.name) return errorResponse(res, 'jid and name required');
      const name = body.name.trim();
      // Update contact names cache
      setContactName(body.jid, name);
      // Update CRM top-level name
      renameContact(body.jid, name);
      return jsonResponse(res, { success: true, jid: body.jid, name });
    }

    // GET /api/contact-names - get all cached contact names
    if (method === 'GET' && pathname === '/api/contact-names') {
      return jsonResponse(res, getContactNames());
    }

    // POST /api/sync-contacts - force sync contact names from WhatsApp
    if (method === 'POST' && pathname === '/api/sync-contacts') {
      try {
        const synced = await syncContactNames();
        return jsonResponse(res, { success: true, synced_count: synced });
      } catch (err: any) {
        return errorResponse(res, err.message, 500);
      }
    }

    // GET /api/messages/:jid
    const messagesMatch = pathname.match(/^\/api\/messages\/(.+)$/);
    if (method === 'GET' && messagesMatch) {
      const jid = decodeURIComponent(messagesMatch[1]);
      const since = parsedUrl.searchParams.get('since') || '24h';
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '100', 10);
      const messages = getMessagesForGroup(jid, since, Math.min(limit, 500));
      return jsonResponse(res, { jid, count: messages.length, messages });
    }

    // ==================== NEW: SEND ENDPOINTS ====================

    if (method === 'POST' && pathname === '/api/send-message') {
      const body = await readBody(req);
      if (!body.jid || !body.text) return errorResponse(res, 'jid and text required');

      let result;
      if (body.jid.endsWith('@g.us')) {
        result = await sendMessage({ group_jid: body.jid, text: body.text });
      } else {
        result = await sendPrivateMessage({ phone: body.jid, text: body.text });
      }
      return jsonResponse(res, result);
    }

    if (method === 'POST' && pathname === '/api/send-image') {
      const body = await readBody(req);
      if (!body.jid || !body.url) return errorResponse(res, 'jid and url required');

      let result;
      if (body.jid.endsWith('@g.us')) {
        result = await sendImage({ group_jid: body.jid, url: body.url, caption: body.caption });
      } else {
        result = await sendImagePrivate({ phone: body.jid, url: body.url, caption: body.caption });
      }
      return jsonResponse(res, result);
    }

    // POST /api/ted-respond - Ted generates AI response using Claude and sends it
    if (method === 'POST' && pathname === '/api/ted-respond') {
      const body = await readBody(req);
      if (!body.jid || !body.instruction) return errorResponse(res, 'jid and instruction required');

      // Get recent messages for context
      let contextMsgs = '';
      try {
        const recentMessages = getMessagesForGroup(body.jid, '2h', 30);
        contextMsgs = recentMessages.map((m: any) => {
          const sender = m.sender_name || m.sender || (m.key?.fromMe ? 'Ted' : 'Unknown');
          const text = m.content || m.text || m.caption || '';
          return `${sender}: ${text}`;
        }).join('\n');
      } catch {}

      // Get CRM context if available
      let crmContext = '';
      try {
        const profile = getContactProfile(body.jid);
        if (profile) {
          const parts: string[] = [];
          if (profile.name) parts.push(`Contact name: ${profile.name}`);
          if (profile.tags?.length) parts.push(`Tags: ${profile.tags.join(', ')}`);
          if (profile.notes?.length) {
            const recentNotes = profile.notes.slice(-3).map((n: any) => n.text).join('; ');
            parts.push(`Recent notes: ${recentNotes}`);
          }
          if (profile.metadata) {
            const meta = Object.entries(profile.metadata).map(([k, v]) => `${k}: ${v}`).join(', ');
            if (meta) parts.push(`Info: ${meta}`);
          }
          if (parts.length) crmContext = '\n\nCRM info about this contact:\n' + parts.join('\n');
        }
      } catch {}

      const systemPrompt = `You are Ted, a smart, friendly and professional AI assistant operating inside a WhatsApp chat.

Core rules:
- Respond in the SAME language as the conversation (if the chat is in Hebrew, reply in Hebrew. If English, reply in English.)
- Keep responses concise and natural — like a real WhatsApp message. Don't write essays.
- Be warm, helpful, and personable. Use emojis sparingly when appropriate.
- You are operated by the dashboard owner, who gives you instructions on what to say.
- The instruction tells you what the operator WANTS you to write — interpret it and craft a proper message.
- NEVER mention that you are following instructions or that someone told you what to say.
- NEVER include prefixes like "Ted:" or "AI:" — just write the message naturally.
- If the instruction is a simple message like "hello" or "thanks", just send it naturally.
- If the instruction asks you to explain, help, or answer — do so intelligently.${crmContext}`;

      const userPrompt = contextMsgs
        ? `Recent conversation:\n${contextMsgs}\n\nOperator instruction: ${body.instruction}\n\nWrite a natural WhatsApp response based on the instruction and conversation context.`
        : `Operator instruction: ${body.instruction}\n\nWrite a natural WhatsApp response.`;

      try {
        console.error('[ted-respond] Calling Claude API...');
        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ],
        });

        // Extract text from response
        const aiText = message.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('\n')
          .trim();

        console.error(`[ted-respond] Claude response (${aiText.length} chars): ${aiText.substring(0, 100)}...`);

        if (!aiText || aiText.length < 1) {
          return errorResponse(res, 'AI generated empty response');
        }

        // Send the AI-generated message
        let result;
        if (body.jid.endsWith('@g.us')) {
          result = await sendMessage({ group_jid: body.jid, text: aiText });
        } else {
          result = await sendPrivateMessage({ phone: body.jid, text: aiText });
        }
        return jsonResponse(res, { ...result, ai_response: aiText });
      } catch (aiErr: any) {
        console.error('[ted-respond] Claude API error:', aiErr.message);

        // Fallback to Pollinations if Claude API fails
        console.error('[ted-respond] Falling back to Pollinations...');
        try {
          const fallbackResponse = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              model: 'openai',
              seed: Date.now(),
            }),
          });
          const fallbackText = await fallbackResponse.text();
          if (fallbackText && fallbackText.length >= 2) {
            let result;
            if (body.jid.endsWith('@g.us')) {
              result = await sendMessage({ group_jid: body.jid, text: fallbackText });
            } else {
              result = await sendPrivateMessage({ phone: body.jid, text: fallbackText });
            }
            return jsonResponse(res, { ...result, ai_response: fallbackText, source: 'fallback' });
          }
        } catch (fallbackErr: any) {
          console.error('[ted-respond] Fallback also failed:', fallbackErr.message);
        }

        return errorResponse(res, 'AI generation failed: ' + aiErr.message, 500);
      }
    }

    // ==================== NEW: CRM CRUD ENDPOINTS ====================

    // GET /api/crm/profile/:jid
    const profileMatch = pathname.match(/^\/api\/crm\/profile\/(.+)$/);
    if (method === 'GET' && profileMatch) {
      const jid = decodeURIComponent(profileMatch[1]);
      const profile = getContactProfile(jid);
      return jsonResponse(res, profile || { error: 'Contact not found' });
    }

    // POST /api/crm/note
    if (method === 'POST' && pathname === '/api/crm/note') {
      const body = await readBody(req);
      if (!body.text) return errorResponse(res, 'text required');
      const note = addNote(body.jid || null, body.text, body.contact_name);
      return jsonResponse(res, { success: true, note });
    }

    // DELETE /api/crm/note/:id
    const deleteNoteMatch = pathname.match(/^\/api\/crm\/note\/(.+)$/);
    if (method === 'DELETE' && deleteNoteMatch) {
      const noteId = decodeURIComponent(deleteNoteMatch[1]);
      const deleted = deleteNote(noteId);
      return jsonResponse(res, { success: deleted });
    }

    // POST /api/crm/tags
    if (method === 'POST' && pathname === '/api/crm/tags') {
      const body = await readBody(req);
      if (!body.jid || !body.tags || !body.action) return errorResponse(res, 'jid, tags, and action required');

      let tags;
      if (body.action === 'add') {
        tags = addTags(body.jid, body.tags, body.contact_name);
      } else {
        tags = removeTags(body.jid, body.tags);
      }
      return jsonResponse(res, { success: true, tags });
    }

    // POST /api/crm/metadata
    if (method === 'POST' && pathname === '/api/crm/metadata') {
      const body = await readBody(req);
      if (!body.jid || !body.key) return errorResponse(res, 'jid and key required');
      const metadata = setContactMetadata(body.jid, body.key, body.value || '', body.contact_name);
      return jsonResponse(res, { success: true, metadata });
    }

    // POST /api/crm/reminder
    if (method === 'POST' && pathname === '/api/crm/reminder') {
      const body = await readBody(req);
      if (!body.text || !body.due_at) return errorResponse(res, 'text and due_at required');
      const reminder = addReminder(body.text, body.due_at, body.target_jid, body.target_message);
      return jsonResponse(res, { success: true, reminder });
    }

    // POST /api/crm/reminder/:id/complete
    const completeMatch = pathname.match(/^\/api\/crm\/reminder\/(.+)\/complete$/);
    if (method === 'POST' && completeMatch) {
      const id = decodeURIComponent(completeMatch[1]);
      const reminder = completeReminder(id);
      return jsonResponse(res, reminder ? { success: true, reminder } : { error: 'Reminder not found' });
    }

    // POST /api/crm/reminder/:id/cancel
    const cancelMatch = pathname.match(/^\/api\/crm\/reminder\/(.+)\/cancel$/);
    if (method === 'POST' && cancelMatch) {
      const id = decodeURIComponent(cancelMatch[1]);
      const reminder = cancelReminder(id);
      return jsonResponse(res, reminder ? { success: true, reminder } : { error: 'Reminder not found' });
    }

    // POST /api/crm/follow-up
    if (method === 'POST' && pathname === '/api/crm/follow-up') {
      const body = await readBody(req);
      if (!body.jid || !body.date) return errorResponse(res, 'jid and date required');
      const contact = updateFollowUp(body.jid, body.date, body.contact_name);
      return jsonResponse(res, { success: true, follow_up_date: contact.follow_up_date });
    }

    // POST /api/crm/interaction
    if (method === 'POST' && pathname === '/api/crm/interaction') {
      const body = await readBody(req);
      if (!body.jid) return errorResponse(res, 'jid required');
      logInteraction(body.jid, body.contact_name);
      return jsonResponse(res, { success: true });
    }

    // GET /api/crm/search?q=...
    if (method === 'GET' && pathname === '/api/crm/search') {
      const q = parsedUrl.searchParams.get('q') || '';
      return jsonResponse(res, searchContacts(q));
    }

    // GET /api/crm/overview
    if (method === 'GET' && pathname === '/api/crm/overview') {
      return jsonResponse(res, getCRMOverview());
    }

    // ==================== QUICK REPLIES ENDPOINTS ====================

    // GET /api/quick-replies - List all quick replies
    if (method === 'GET' && pathname === '/api/quick-replies') {
      return jsonResponse(res, { replies: getQuickReplies() });
    }

    // POST /api/quick-replies - Create a new quick reply
    if (method === 'POST' && pathname === '/api/quick-replies') {
      const body = await readBody(req);
      if (!body.shortcut || !body.text) return errorResponse(res, 'shortcut and text required');

      const replies = getQuickReplies();
      // Check for duplicate shortcut
      const existing = replies.find(r => r.shortcut.toLowerCase() === body.shortcut.toLowerCase().trim());
      if (existing) {
        // Update existing
        existing.text = body.text.trim();
        saveQuickReplies(replies);
        return jsonResponse(res, { success: true, reply: existing, updated: true });
      }

      const newReply: QuickReply = {
        id: randomUUID().slice(0, 8),
        shortcut: body.shortcut.toLowerCase().trim().replace(/\s+/g, '-'),
        text: body.text.trim(),
        createdAt: new Date().toISOString(),
      };
      replies.push(newReply);
      saveQuickReplies(replies);
      return jsonResponse(res, { success: true, reply: newReply });
    }

    // DELETE /api/quick-replies/:id - Delete a quick reply
    const deleteReplyMatch = pathname.match(/^\/api\/quick-replies\/(.+)$/);
    if (method === 'DELETE' && deleteReplyMatch) {
      const replyId = decodeURIComponent(deleteReplyMatch[1]);
      const replies = getQuickReplies();
      const idx = replies.findIndex(r => r.id === replyId);
      if (idx === -1) return errorResponse(res, 'Quick reply not found', 404);
      replies.splice(idx, 1);
      saveQuickReplies(replies);
      return jsonResponse(res, { success: true });
    }

    // ==================== AGENT MANAGEMENT ENDPOINTS ====================

    // GET /api/agents - List all agents
    if (method === 'GET' && pathname === '/api/agents') {
      const store = getMessageStore();
      const gCache = getGroupCache();
      const currentActiveId = getActiveAgentId();

      // Main agent always uses the original connection state (not the active agent)
      const mainAgent = {
        id: 'main',
        name: 'Main Agent (Ted)',
        phone: '',
        status: 'connected', // Main connection state
        groups: Object.keys(gCache).filter(k => k.endsWith('@g.us')).length,
        messages: Object.values(store).reduce((sum, msgs) => sum + msgs.length, 0),
        isActive: currentActiveId === 'main',
      };

      const additionalAgents = getAgentInfos().map(a => ({
        id: a.id,
        name: a.name,
        phone: a.phone,
        status: a.status,
        isActive: currentActiveId === a.id,
      }));

      return jsonResponse(res, { agents: [mainAgent, ...additionalAgents], activeAgentId: currentActiveId });
    }

    // POST /api/agents/:id/activate - Switch active agent
    const agentActivateMatch = pathname.match(/^\/api\/agents\/([^/]+)\/activate$/);
    if (method === 'POST' && agentActivateMatch) {
      const agentId = decodeURIComponent(agentActivateMatch[1]);
      const success = setActiveAgent(agentId);
      if (!success) return errorResponse(res, 'Agent not found', 404);
      return jsonResponse(res, { success: true, activeAgentId: agentId });
    }

    // POST /api/agents/create - Create new agent
    if (method === 'POST' && pathname === '/api/agents/create') {
      const body = await readBody(req);
      if (!body.name || !body.phone) return errorResponse(res, 'name and phone required');

      const agentId = randomUUID().slice(0, 8);
      try {
        const agent = await createAgentConnection(agentId, body.name, body.phone);
        return jsonResponse(res, { success: true, id: agent.id, agentId: agent.id });
      } catch (err: any) {
        return errorResponse(res, err.message, 500);
      }
    }

    // GET /api/agents/:id/qr - Get QR code for agent (returns data URL image)
    const agentQrMatch = pathname.match(/^\/api\/agents\/([^/]+)\/qr$/);
    if (method === 'GET' && agentQrMatch) {
      const agentId = decodeURIComponent(agentQrMatch[1]);
      const agent = getAgentInfo(agentId);
      if (!agent) return errorResponse(res, 'Agent not found', 404);

      let qrDataUrl: string | null = null;
      if (agent.qrCode) {
        try {
          qrDataUrl = await QRCode.toDataURL(agent.qrCode, {
            width: 256,
            margin: 2,
            color: { dark: '#fafafa', light: '#18181b' },
          });
        } catch (err: any) {
          console.error('[agents] QR generation error:', err.message);
        }
      }

      return jsonResponse(res, {
        id: agent.id,
        status: agent.status,
        qr: agent.qrCode ? true : null,
        qrDataUrl,
      });
    }

    // GET /api/agents/:id/status - Get agent status
    const agentStatusMatch = pathname.match(/^\/api\/agents\/([^/]+)\/status$/);
    if (method === 'GET' && agentStatusMatch) {
      const agentId = decodeURIComponent(agentStatusMatch[1]);
      const agent = getAgentInfo(agentId);
      if (!agent) return errorResponse(res, 'Agent not found', 404);
      return jsonResponse(res, { id: agent.id, status: agent.status, name: agent.name });
    }

    // DELETE /api/agents/:id - Remove agent
    const agentDeleteMatch = pathname.match(/^\/api\/agents\/([^/]+)$/);
    if (method === 'DELETE' && agentDeleteMatch) {
      const agentId = decodeURIComponent(agentDeleteMatch[1]);
      if (agentId === 'main') return errorResponse(res, 'Cannot remove main agent');
      const removed = await removeAgent(agentId);
      return jsonResponse(res, { success: removed });
    }

    // ==================== STATIC FILES ====================

    let filePath = pathname === '/' ? '/index.html' : pathname;
    const fullPath = join(DASHBOARD_DIR, filePath);

    if (!existsSync(fullPath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const content = readFileSync(fullPath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err: any) {
    console.error('[dashboard] Error:', err.message || err);
    errorResponse(res, err.message || 'Internal server error', 500);
  }
}

// ==================== SERVER START ====================

export function startDashboardServer(port: number = 3777) {
  const server = createServer(handleRequest);
  server.listen(port, () => {
    console.error(`\n🚀 Ted Command Center running at: http://localhost:${port}\n`);
  });
  return server;
}

// Standalone mode
const isStandalone = process.argv[1]?.includes('dashboard-server');
if (isStandalone) {
  startDashboardServer(3777);
}
