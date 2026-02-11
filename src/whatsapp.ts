import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
  type GroupMetadata,
  type proto,
  type Contact,
} from '@whiskeysockets/baileys';
// USyncQuery etc. available but WhatsApp doesn't expose saved contact names via web protocol
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { getAutoReplyForContact } from './crm.js';


export type WAMessage = proto.IWebMessageInfo;

const logger = pino({ level: 'silent' });
const log = (...args: unknown[]) => console.error('[whatsapp]', ...args);

const AUTH_DIR = './auth_info';
const STORE_FILE = './store/message-store.json';
const STORE_FLUSH_INTERVAL = 30_000;
const AUTO_REPLY_FILE = './store/auto-reply.json';

// Auto-reply configuration
interface AutoReplyConfig {
  enabled: boolean;
  privateOnly: boolean;  // only reply to private chats (not groups)
  groupJids: string[];   // specific group JIDs to auto-reply in (if privateOnly is false)
}

let autoReplyConfig: AutoReplyConfig = { enabled: false, privateOnly: true, groupJids: [] };

// Restore auto-reply config
if (fs.existsSync(AUTO_REPLY_FILE)) {
  try {
    autoReplyConfig = JSON.parse(fs.readFileSync(AUTO_REPLY_FILE, 'utf-8'));
    log(`Auto-reply config restored: enabled=${autoReplyConfig.enabled}`);
  } catch {}
}

function saveAutoReplyConfig() {
  try {
    const dir = path.dirname(AUTO_REPLY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(AUTO_REPLY_FILE, JSON.stringify(autoReplyConfig, null, 2));
  } catch {}
}

export function getAutoReplyConfig(): AutoReplyConfig { return autoReplyConfig; }

export function setAutoReplyConfig(config: Partial<AutoReplyConfig>) {
  Object.assign(autoReplyConfig, config);
  saveAutoReplyConfig();
  log(`Auto-reply updated: enabled=${autoReplyConfig.enabled}, privateOnly=${autoReplyConfig.privateOnly}`);
}

// ==================== LID ↔ Phone JID Mapping ====================
// WhatsApp uses two JID formats: phone-based (@s.whatsapp.net) and anonymous LID (@lid)
// Messages can arrive on either format. We need to map between them to unify conversations.
const LID_MAP_FILE = './store/lid-map.json';

// Bidirectional map: lid -> phone JID, phone JID -> lid
let lidToPhone: Record<string, string> = {};
let phoneToLid: Record<string, string> = {};

// Restore LID map from file
if (fs.existsSync(LID_MAP_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(LID_MAP_FILE, 'utf-8'));
    lidToPhone = data.lidToPhone || {};
    phoneToLid = data.phoneToLid || {};
    log(`LID map restored: ${Object.keys(lidToPhone).length} mappings`);
  } catch {}
}

function saveLidMap() {
  try {
    const dir = path.dirname(LID_MAP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LID_MAP_FILE, JSON.stringify({ lidToPhone, phoneToLid }, null, 2));
  } catch {}
}

// Register a LID ↔ Phone mapping from contact data
function registerLidMapping(lid: string, phoneJid: string) {
  if (!lid || !phoneJid) return;
  // Normalize: ensure lid ends with @lid, phoneJid ends with @s.whatsapp.net
  if (!lid.endsWith('@lid')) return;
  if (!phoneJid.endsWith('@s.whatsapp.net')) return;

  const existed = lidToPhone[lid];
  lidToPhone[lid] = phoneJid;
  phoneToLid[phoneJid] = lid;

  if (!existed) {
    log(`LID mapping: ${lid} → ${phoneJid}`);
  }
}

// Extract LID↔Phone mapping from a Contact object
function extractLidFromContact(contact: Contact) {
  const id = contact.id;
  const lid = contact.lid;
  const jid = contact.jid;

  // Case 1: id is phone format, lid is available
  if (id?.endsWith('@s.whatsapp.net') && lid?.endsWith('@lid')) {
    registerLidMapping(lid, id);
  }
  // Case 2: id is LID format, jid is phone format
  if (id?.endsWith('@lid') && jid?.endsWith('@s.whatsapp.net')) {
    registerLidMapping(id, jid);
  }
  // Case 3: lid and jid both available
  if (lid?.endsWith('@lid') && jid?.endsWith('@s.whatsapp.net')) {
    registerLidMapping(lid, jid);
  }
}

// Resolve a JID to its preferred phone-based format
// If it's a LID and we have a mapping, return the phone JID
// Otherwise return the original JID
export function resolveJid(jid: string): string {
  if (!jid) return jid;
  if (jid.endsWith('@lid') && lidToPhone[jid]) {
    return lidToPhone[jid];
  }
  return jid;
}

// Get the LID for a phone JID (if known)
export function getLidForPhone(phoneJid: string): string | undefined {
  return phoneToLid[phoneJid];
}

// Get all LID mappings
export function getLidMap(): { lidToPhone: Record<string, string>; phoneToLid: Record<string, string> } {
  return { lidToPhone, phoneToLid };
}

// Expose registerLidMapping for external use (e.g., API endpoints)
export { registerLidMapping };

// Flush LID map periodically (will be set up with other intervals)
setInterval(() => { saveLidMap(); }, STORE_FLUSH_INTERVAL);

// Bootstrap LID mappings using onWhatsApp for contacts that only have LID
export async function bootstrapLidMappings(): Promise<number> {
  if (!sock) return 0;
  let count = 0;

  // Find all phone-based JIDs and try to get their LIDs
  const phoneJids = Object.keys(messageStore)
    .filter(jid => jid.endsWith('@s.whatsapp.net'))
    .filter(jid => !phoneToLid[jid]); // Only ones without a LID mapping

  if (phoneJids.length === 0) return 0;

  try {
    // onWhatsApp returns { jid, exists, lid } for each phone number
    const results = await (sock as any).onWhatsApp(...phoneJids);
    if (results && Array.isArray(results)) {
      for (const result of results) {
        if (result.jid && result.lid) {
          const lid = typeof result.lid === 'string' ? result.lid :
                     result.lid?.id ? result.lid.id : null;
          if (lid) {
            registerLidMapping(
              lid.endsWith('@lid') ? lid : `${lid}@lid`,
              result.jid.endsWith('@s.whatsapp.net') ? result.jid : `${result.jid}@s.whatsapp.net`
            );
            count++;
          }
        }
      }
    }
    if (count > 0) {
      log(`Bootstrapped ${count} LID mappings via onWhatsApp`);
      saveLidMap();
      // Migrate messages from LID JIDs to phone JIDs
      migrateLidMessages();
    }
  } catch (err: any) {
    log(`LID bootstrap error: ${err.message}`);
  }
  return count;
}

// Migrate messages stored under LID JIDs to their phone JID counterparts
function migrateLidMessages() {
  let migrated = 0;
  for (const [lid, phoneJid] of Object.entries(lidToPhone)) {
    if (messageStore[lid] && messageStore[lid].length > 0) {
      if (!messageStore[phoneJid]) messageStore[phoneJid] = [];
      for (const msg of messageStore[lid]) {
        const exists = messageStore[phoneJid].some(m => m.key.id === msg.key.id);
        if (!exists) {
          messageStore[phoneJid].push(msg);
          migrated++;
        }
      }
      log(`Migrated ${messageStore[lid].length} messages from ${lid} → ${phoneJid}`);
      delete messageStore[lid];
    }
  }
  if (migrated > 0) log(`Total messages migrated: ${migrated}`);
}

// Ted auto-reply handler
async function handleAutoReply(msg: WAMessage) {
  if (msg.key.fromMe) return;

  const rawJid = msg.key.remoteJid;
  if (!rawJid) return;

  // Resolve LID to phone JID if possible
  const jid = resolveJid(rawJid);

  const isGroup = jid.endsWith('@g.us');
  const isLid = rawJid.endsWith('@lid');

  // Check per-contact auto-reply override first
  const contactAutoReply = getAutoReplyForContact(jid);
  if (contactAutoReply === 'off') {
    // This contact has auto-reply explicitly disabled
    return;
  }
  if (contactAutoReply === 'on') {
    // This contact has auto-reply explicitly enabled - skip global checks
    // (but still check group logic below)
  } else {
    // No per-contact override - use global config
    if (!autoReplyConfig.enabled) return;
  }

  // Check if we should reply to this chat
  // LID JIDs are private chats (not groups)
  if (autoReplyConfig.privateOnly && isGroup) return;
  if (!autoReplyConfig.privateOnly && isGroup && !autoReplyConfig.groupJids.includes(jid)) return;

  // Get message text
  const m = msg.message;
  if (!m) return;
  const text = m.conversation || m.extendedTextMessage?.text || '';
  if (!text || text.length < 1) return;

  // Don't reply to status updates
  if (jid === 'status@broadcast' || rawJid === 'status@broadcast') return;

  // Use the phone JID for sending replies (Ted needs to reply to the right JID)
  // If we only have a LID and no phone mapping, use the LID directly
  const replyJid = jid;
  log(`[auto-reply] Incoming from ${rawJid}${rawJid !== jid ? ` (resolved: ${jid})` : ''}: "${text.substring(0, 50)}..."`);

  // Call Ted API on localhost
  try {
    const response = await fetch('http://localhost:3777/api/ted-respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jid: replyJid,
        instruction: `Someone sent this message: "${text}". Reply naturally as Ted, the AI assistant. Be helpful and friendly.`,
      }),
    });
    const result = await response.json();
    if (result.success) {
      log(`[auto-reply] Replied to ${replyJid}`);
    } else {
      log(`[auto-reply] Failed: ${result.error}`);
    }
  } catch (err: any) {
    log(`[auto-reply] Error: ${err.message}`);
  }
}

// Custom in-memory message store: jid -> WAMessage[]
const messageStore: Record<string, WAMessage[]> = {};

// Restore store from JSON file
if (fs.existsSync(STORE_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
    for (const [jid, messages] of Object.entries(data)) {
      if (Array.isArray(messages)) {
        messageStore[jid] = messages as WAMessage[];
      }
    }
    const totalMsgs = Object.values(messageStore).reduce((acc, msgs) => acc + msgs.length, 0);
    log(`Store restored: ${Object.keys(messageStore).length} chats, ${totalMsgs} messages`);
  } catch (err) {
    log('Failed to restore store:', err);
  }
}

// Periodically flush store to disk
setInterval(() => {
  try {
    const dir = path.dirname(STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(messageStore));
  } catch (err) {
    log('Failed to flush store:', err);
  }
}, STORE_FLUSH_INTERVAL);

let sock: WASocket | null = null;
let groupCache: Record<string, GroupMetadata> = {};
let connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

// Multi-agent support
export interface AgentInfo {
  id: string;
  name: string;
  phone: string;
  status: 'pending_qr' | 'connecting' | 'connected' | 'disconnected';
  qrCode?: string;
  authDir: string;
  createdAt: string;
}

const agentSockets: Map<string, WASocket> = new Map();
const agentInfos: Map<string, AgentInfo> = new Map();
const AGENTS_FILE = './store/agents.json';
let activeAgentId: string = 'main'; // 'main' = original connection, or agent id

// Restore agents from file (metadata only, not connections)
if (fs.existsSync(AGENTS_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf-8'));
    for (const agent of data) {
      agentInfos.set(agent.id, { ...agent, status: 'disconnected', qrCode: undefined });
    }
    log(`Agents restored: ${agentInfos.size} agents`);
  } catch {}
}

function saveAgentsFile() {
  try {
    const agents = Array.from(agentInfos.values()).map(a => ({
      id: a.id,
      name: a.name,
      phone: a.phone,
      authDir: a.authDir,
      createdAt: a.createdAt,
    }));
    const dir = path.dirname(AGENTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2));
  } catch (err) {
    log('Failed to save agents file:', err);
  }
}

export function getAgentInfos(): AgentInfo[] {
  return Array.from(agentInfos.values());
}

export function getAgentInfo(id: string): AgentInfo | undefined {
  return agentInfos.get(id);
}

export async function createAgentConnection(
  agentId: string,
  name: string,
  phone: string,
): Promise<AgentInfo> {
  const authDir = `./auth_info_agent_${agentId}`;

  const agent: AgentInfo = {
    id: agentId,
    name,
    phone,
    status: 'pending_qr',
    authDir,
    createdAt: new Date().toISOString(),
  };

  agentInfos.set(agentId, agent);
  saveAgentsFile();

  // Start connection in background
  connectAgent(agent).catch(err => {
    log(`Agent ${agentId} connection error:`, err);
    agent.status = 'disconnected';
  });

  return agent;
}

async function connectAgent(agent: AgentInfo): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(agent.authDir);
  const { version } = await fetchLatestBaileysVersion();

  const agentSock = makeWASocket({
    version,
    auth: state,
    logger,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    defaultQueryTimeoutMs: 60_000,
  });

  agentSock.ev.on('creds.update', saveCreds);

  agentSock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      agent.qrCode = qr;
      agent.status = 'pending_qr';
      log(`Agent ${agent.id} (${agent.name}): QR code generated`);
    }

    if (connection === 'close') {
      agent.status = 'disconnected';
      agent.qrCode = undefined;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      log(`Agent ${agent.id} disconnected. Status: ${statusCode}, Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        agent.status = 'connecting';
        setTimeout(() => connectAgent(agent), 5000);
      }
    } else if (connection === 'open') {
      agent.status = 'connected';
      agent.qrCode = undefined;
      log(`Agent ${agent.id} (${agent.name}): Connected!`);
    } else if (connection === 'connecting') {
      agent.status = 'connecting';
    }
  });

  agentSockets.set(agent.id, agentSock);
}

export async function removeAgent(agentId: string): Promise<boolean> {
  const agent = agentInfos.get(agentId);
  if (!agent) return false;

  const agentSock = agentSockets.get(agentId);
  if (agentSock) {
    try { agentSock.end(undefined); } catch {}
    agentSockets.delete(agentId);
  }

  agentInfos.delete(agentId);
  saveAgentsFile();

  try {
    if (fs.existsSync(agent.authDir)) {
      fs.rmSync(agent.authDir, { recursive: true });
    }
  } catch {}

  return true;
}

// Contact name cache: jid -> { pushName, verifiedBizName, notify }
const CONTACT_NAMES_FILE = './store/contact-names.json';
let contactNames: Record<string, { name: string; source?: string; updatedAt: string }> = {};

// Restore contact names from file
if (fs.existsSync(CONTACT_NAMES_FILE)) {
  try {
    contactNames = JSON.parse(fs.readFileSync(CONTACT_NAMES_FILE, 'utf-8'));
    log(`Contact names restored: ${Object.keys(contactNames).length} contacts`);
  } catch {}
}

export function getContactNames(): Record<string, { name: string; source?: string; updatedAt: string }> {
  return contactNames;
}

export function setContactName(jid: string, name: string) {
  saveContactName(jid, name, 'phone');
}

// Re-bootstrap contact names from message store (for unnamed contacts)
export async function syncContactNames(): Promise<number> {
  let count = 0;
  for (const [jid, messages] of Object.entries(messageStore)) {
    if (!jid.endsWith('@s.whatsapp.net')) continue;
    if (contactNames[jid]) continue;
    let bestName: string | null = null;
    let bestTs = 0;
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.pushName) {
        const ts = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp :
                   typeof msg.messageTimestamp === 'string' ? parseInt(msg.messageTimestamp) : 0;
        if (ts > bestTs) { bestTs = ts; bestName = msg.pushName; }
      }
    }
    if (bestName) {
      saveContactName(jid, bestName, 'push');
      count++;
    }
  }
  if (count > 0) log(`Re-bootstrapped ${count} contact names from messages`);
  return count;
}

function saveContactName(jid: string, name: string, source: 'phone' | 'push' | 'verified' | 'chat' = 'push') {
  if (!name || !jid) return;
  // Don't overwrite a phone-saved name with a pushName
  const existing = contactNames[jid];
  if (existing) {
    // If we already have a phone-saved name, only overwrite with another phone-saved name
    if (existing.source === 'phone' && source !== 'phone') return;
  }
  contactNames[jid] = { name, source, updatedAt: new Date().toISOString() };
}

// Flush contact names periodically
setInterval(() => {
  try {
    const dir = path.dirname(CONTACT_NAMES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONTACT_NAMES_FILE, JSON.stringify(contactNames, null, 2));
  } catch {}
}, STORE_FLUSH_INTERVAL);

// Bootstrap contact names from message store on startup
function bootstrapContactNamesFromStore() {
  let count = 0;
  for (const [jid, messages] of Object.entries(messageStore)) {
    if (!jid.endsWith('@s.whatsapp.net')) continue;
    // Already have a name? skip
    if (contactNames[jid]) continue;
    // Find the most recent pushName from inbound messages
    let bestName: string | null = null;
    let bestTs = 0;
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.pushName) {
        const ts = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp :
                   typeof msg.messageTimestamp === 'string' ? parseInt(msg.messageTimestamp) : 0;
        if (ts > bestTs) {
          bestTs = ts;
          bestName = msg.pushName;
        }
      }
    }
    if (bestName) {
      saveContactName(jid, bestName, 'push');
      count++;
    }
  }
  if (count > 0) {
    log(`Bootstrapped ${count} contact names from message store`);
  }
}

// Run bootstrap after store restore
bootstrapContactNamesFromStore();

export function getMessageStore(): Record<string, WAMessage[]> {
  return messageStore;
}

export function getStoreCount(): { conversations: number; messages: number } {
  const conversations = Object.keys(messageStore).length;
  const messages = Object.values(messageStore).reduce((acc, msgs) => acc + msgs.length, 0);
  return { conversations, messages };
}

export async function requestMessageHistory(groupJid: string, count: number = 500): Promise<string> {
  if (!sock) throw new Error('Not connected');

  const messages = messageStore[groupJid];
  if (!messages || messages.length === 0) {
    throw new Error(`No messages in store for ${groupJid}. Need at least one message as anchor.`);
  }

  // Find the oldest message to use as anchor
  let oldest = messages[0];
  let oldestTs = getTimestamp(oldest);
  for (const msg of messages) {
    const ts = getTimestamp(msg);
    if (ts > 0 && (ts < oldestTs || oldestTs === 0)) {
      oldestTs = ts;
      oldest = msg;
    }
  }

  log(`Requesting ${count} messages before ${new Date(oldestTs).toISOString()} for ${groupJid}`);
  const requestId = await sock.fetchMessageHistory(count, oldest.key, oldestTs);
  return requestId;
}

function getTimestamp(msg: WAMessage): number {
  const ts = msg.messageTimestamp;
  if (typeof ts === 'number') return ts * 1000;
  if (typeof ts === 'string') return parseInt(ts) * 1000;
  if (typeof ts === 'object' && ts !== null && 'low' in ts) {
    return (ts as { low: number }).low * 1000;
  }
  return 0;
}

export function getSocket(): WASocket | null {
  if (activeAgentId === 'main') return sock;
  return agentSockets.get(activeAgentId) || sock;
}

export function getMainSocket(): WASocket | null {
  return sock;
}

export function getGroupCache(): Record<string, GroupMetadata> {
  return groupCache;
}

export function getConnectionState() {
  if (activeAgentId === 'main') return connectionState;
  const agent = agentInfos.get(activeAgentId);
  if (!agent) return connectionState;
  if (agent.status === 'connected') return 'connected';
  if (agent.status === 'connecting' || agent.status === 'pending_qr') return 'connecting';
  return 'disconnected';
}

export function getActiveAgentId(): string {
  return activeAgentId;
}

export function setActiveAgent(agentId: string): boolean {
  if (agentId === 'main') {
    activeAgentId = 'main';
    log(`Switched to main agent`);
    return true;
  }
  const agent = agentInfos.get(agentId);
  if (!agent) return false;
  activeAgentId = agentId;
  log(`Switched to agent ${agentId} (${agent.name})`);
  return true;
}

export async function connectWhatsApp(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    generateHighQualityLinkPreview: false,
    syncFullHistory: true,
    defaultQueryTimeoutMs: 120_000,
    getMessage: async (key) => {
      const rawJid = key.remoteJid;
      if (!rawJid) return undefined;
      // Try both the raw JID and resolved JID
      const resolved = resolveJid(rawJid);
      const messages = messageStore[rawJid] || messageStore[resolved];
      if (!messages) return undefined;
      const msg = messages.find((m) => m.key.id === key.id);
      return msg?.message || undefined;
    },
  });

  sock.ev.on('creds.update', saveCreds);

  // Helper to upsert a message into the store
  // Resolves LID JIDs to phone JIDs when a mapping exists
  function upsertMsg(msg: WAMessage) {
    const rawJid = msg.key.remoteJid;
    if (!rawJid) return;

    // Resolve LID to phone JID if mapping exists
    const jid = resolveJid(rawJid);

    // If the JID was resolved from LID, also store under the resolved JID
    // and merge any existing messages from the LID JID into the phone JID
    if (rawJid !== jid && rawJid.endsWith('@lid')) {
      // Migrate existing LID messages to phone JID on first encounter
      if (messageStore[rawJid] && messageStore[rawJid].length > 0) {
        if (!messageStore[jid]) messageStore[jid] = [];
        for (const oldMsg of messageStore[rawJid]) {
          const exists = messageStore[jid].some((m) => m.key.id === oldMsg.key.id);
          if (!exists) {
            messageStore[jid].push(oldMsg);
          }
        }
        log(`Migrated ${messageStore[rawJid].length} messages from ${rawJid} to ${jid}`);
        delete messageStore[rawJid];
      }
    }

    if (!messageStore[jid]) {
      messageStore[jid] = [];
    }

    const existingIdx = messageStore[jid].findIndex(
      (m) => m.key.id === msg.key.id
    );
    if (existingIdx >= 0) {
      messageStore[jid][existingIdx] = msg;
    } else {
      messageStore[jid].push(msg);
    }
  }

  // Listen for contacts updates (synced from WhatsApp)
  sock.ev.on('contacts.upsert', (contacts) => {
    let phoneSaved = 0, pushSaved = 0, lidMapped = 0;
    for (const contact of contacts) {
      const jid = contact.id;

      // Extract LID ↔ Phone mapping from contact data
      extractLidFromContact(contact as Contact);
      if (contact.lid || contact.jid) lidMapped++;

      // Priority: phone-saved name > verified business name > pushName (notify)
      if (contact.name && jid) {
        saveContactName(jid, contact.name, 'phone');
        // Also save under the resolved JID
        const resolved = resolveJid(jid);
        if (resolved !== jid) saveContactName(resolved, contact.name, 'phone');
        phoneSaved++;
      } else if (contact.verifiedName && jid) {
        saveContactName(jid, contact.verifiedName, 'verified');
        const resolved = resolveJid(jid);
        if (resolved !== jid) saveContactName(resolved, contact.verifiedName, 'verified');
      } else if (contact.notify && jid) {
        saveContactName(jid, contact.notify, 'push');
        const resolved = resolveJid(jid);
        if (resolved !== jid) saveContactName(resolved, contact.notify, 'push');
        pushSaved++;
      }
    }
    log(`Contacts synced: ${contacts.length} total, ${phoneSaved} phone-saved, ${pushSaved} push, ${lidMapped} with LID data`);
  });

  sock.ev.on('contacts.update', (updates) => {
    for (const update of updates) {
      const jid = update.id;

      // Extract LID mapping from update
      extractLidFromContact(update as Contact);

      // Same priority for updates
      if ((update as any).name && jid) {
        saveContactName(jid, (update as any).name, 'phone');
        const resolved = resolveJid(jid);
        if (resolved !== jid) saveContactName(resolved, (update as any).name, 'phone');
      } else if (update.verifiedName && jid) {
        saveContactName(jid, update.verifiedName, 'verified');
        const resolved = resolveJid(jid);
        if (resolved !== jid) saveContactName(resolved, update.verifiedName, 'verified');
      } else if (update.notify && jid) {
        saveContactName(jid, update.notify, 'push');
        const resolved = resolveJid(jid);
        if (resolved !== jid) saveContactName(resolved, update.notify, 'push');
      }
    }
  });

  // Listen for phone number share events (direct LID → Phone mapping)
  sock.ev.on('chats.phoneNumberShare', (data: any) => {
    if (data.lid && data.jid) {
      registerLidMapping(data.lid, data.jid);
      log(`Phone number shared: ${data.lid} → ${data.jid}`);
    }
  });

  // Use ev.process to handle ALL events including buffered ones (history sync)
  sock.ev.process(async (events) => {
    if (events['messages.upsert']) {
      const { messages, type } = events['messages.upsert'];
      for (const msg of messages) {
        upsertMsg(msg);
        // Extract contact name from incoming messages (low priority - push)
        if (!msg.key.fromMe && msg.pushName && msg.key.remoteJid) {
          const rawJid = msg.key.remoteJid;
          saveContactName(rawJid, msg.pushName, 'push');
          // Also save under resolved JID
          const resolved = resolveJid(rawJid);
          if (resolved !== rawJid) {
            saveContactName(resolved, msg.pushName, 'push');
          }
        }
        // Auto-reply with Ted (only for real-time messages, not history sync)
        if (type === 'notify') {
          handleAutoReply(msg).catch(() => {});
        }
      }

    }

    if (events['messages.update']) {
      for (const { key, update } of events['messages.update']) {
        const rawJid = key.remoteJid;
        if (!rawJid) continue;
        // Check both raw and resolved JIDs
        const resolved = resolveJid(rawJid);
        const jid = messageStore[rawJid] ? rawJid : (messageStore[resolved] ? resolved : rawJid);
        if (!messageStore[jid]) continue;

        const idx = messageStore[jid].findIndex((m) => m.key.id === key.id);
        if (idx >= 0) {
          Object.assign(messageStore[jid][idx], update);
        }
      }
    }

    if (events['messaging-history.set']) {
      const { messages, syncType, chats, isLatest, progress } = events['messaging-history.set'];
      let added = 0;
      const jidCounts: Record<string, number> = {};

      // Extract LID mappings from chat metadata first (so messages can be resolved)
      if (chats) {
        for (const chat of chats) {
          const c = chat as any;
          if (c.lid && c.id) {
            // Chat metadata may include both LID and phone JID
            if (c.id.endsWith('@s.whatsapp.net') && c.lid.endsWith('@lid')) {
              registerLidMapping(c.lid, c.id);
            } else if (c.id.endsWith('@lid') && c.lid.endsWith('@s.whatsapp.net')) {
              registerLidMapping(c.id, c.lid);
            }
          }
        }
      }

      for (const msg of messages) {
        const rawJid = msg.key.remoteJid;
        if (!rawJid) continue;

        // Resolve LID to phone JID
        const jid = resolveJid(rawJid);
        jidCounts[jid] = (jidCounts[jid] || 0) + 1;

        // Extract contact name from history messages (low priority - push)
        // Now works for both @s.whatsapp.net AND @lid JIDs
        if (!msg.key.fromMe && msg.pushName && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'))) {
          saveContactName(jid, msg.pushName, 'push');
          if (jid !== rawJid) saveContactName(rawJid, msg.pushName, 'push');
        }

        if (!messageStore[jid]) {
          messageStore[jid] = [];
        }

        const existingIdx = messageStore[jid].findIndex(
          (m) => m.key.id === msg.key.id
        );
        if (existingIdx >= 0) {
          messageStore[jid][existingIdx] = msg;
        } else {
          messageStore[jid].push(msg);
          added++;
        }
      }

      // Extract names from chat metadata
      if (chats) {
        for (const chat of chats) {
          const chatJid = (chat as any).id;
          // chat.name is usually the phone-saved name
          const phoneName = (chat as any).name;
          const pushNotify = (chat as any).notify;
          const convTitle = (chat as any).conversationTitle;
          // Now handle both phone JIDs and LID JIDs
          if (chatJid && (chatJid.endsWith('@s.whatsapp.net') || chatJid.endsWith('@lid'))) {
            const resolved = resolveJid(chatJid);
            if (phoneName) {
              saveContactName(chatJid, phoneName, 'phone');
              if (resolved !== chatJid) saveContactName(resolved, phoneName, 'phone');
            } else if (convTitle) {
              saveContactName(chatJid, convTitle, 'chat');
              if (resolved !== chatJid) saveContactName(resolved, convTitle, 'chat');
            } else if (pushNotify) {
              saveContactName(chatJid, pushNotify, 'push');
              if (resolved !== chatJid) saveContactName(resolved, pushNotify, 'push');
            }
          }
        }
      }
      log(`History sync (type=${syncType}, progress=${progress}, isLatest=${isLatest}): ${messages.length} msgs, ${added} new, ${chats?.length || 0} chats`);
      for (const [jid, count] of Object.entries(jidCounts)) {
        if (jid.endsWith('@g.us')) {
          log(`  group ${jid}: ${count} messages`);
        }
      }
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      log('Scan this QR code with WhatsApp:');
      qrcode.generate(qr, { small: true }, (code: string) => {
        console.error(code);
      });
    }

    if (connection === 'close') {
      connectionState = 'disconnected';
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      log('Connection closed. Status:', statusCode, '| Reconnecting:', shouldReconnect);

      if (shouldReconnect) {
        connectionState = 'connecting';
        await connectWhatsApp();
      } else {
        log('Logged out. Delete auth_info/ and restart to re-authenticate.');
      }
    } else if (connection === 'open') {
      connectionState = 'connected';
      log('WhatsApp connected!');

      // Wait a bit before fetching group metadata to avoid rate limits
      await new Promise((r) => setTimeout(r, 5000));

      // Fetch all group metadata with retry
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          groupCache = await sock!.groupFetchAllParticipating();
          const groupCount = Object.keys(groupCache).filter((k) => k.endsWith('@g.us')).length;
          log(`Cached metadata for ${groupCount} groups`);
          break;
        } catch (err) {
          log(`Failed to fetch group metadata (attempt ${attempt}/${maxRetries}):`, err);
          if (attempt < maxRetries) {
            const delay = attempt * 10000;
            log(`Retrying in ${delay / 1000}s...`);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      // Bootstrap LID mappings after connection is stable
      setTimeout(async () => {
        try {
          const count = await bootstrapLidMappings();
          if (count > 0) log(`LID bootstrap complete: ${count} mappings`);
        } catch (err: any) {
          log(`LID bootstrap failed: ${err.message}`);
        }
      }, 10000);
    } else if (connection === 'connecting') {
      connectionState = 'connecting';
      log('Connecting to WhatsApp...');
    }
  });

  // Refresh group metadata when it changes
  sock.ev.on('groups.update', async (updates) => {
    for (const update of updates) {
      if (update.id && sock) {
        try {
          groupCache[update.id] = await sock.groupMetadata(update.id);
        } catch {}
      }
    }
  });

  return sock;
}
