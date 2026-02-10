import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
  type GroupMetadata,
  type proto,
} from '@whiskeysockets/baileys';
// USyncQuery etc. available but WhatsApp doesn't expose saved contact names via web protocol
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';


export type WAMessage = proto.IWebMessageInfo;

const logger = pino({ level: 'silent' });
const log = (...args: unknown[]) => console.error('[whatsapp]', ...args);

const AUTH_DIR = './auth_info';
const STORE_FILE = './store/message-store.json';
const STORE_FLUSH_INTERVAL = 30_000;

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
      const jid = key.remoteJid;
      if (!jid || !messageStore[jid]) return undefined;
      const msg = messageStore[jid].find((m) => m.key.id === key.id);
      return msg?.message || undefined;
    },
  });

  sock.ev.on('creds.update', saveCreds);

  // Helper to upsert a message into the store
  function upsertMsg(msg: WAMessage) {
    const jid = msg.key.remoteJid;
    if (!jid) return;

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
    let phoneSaved = 0, pushSaved = 0;
    for (const contact of contacts) {
      const jid = contact.id;
      // Priority: phone-saved name > verified business name > pushName (notify)
      if (contact.name && jid) {
        saveContactName(jid, contact.name, 'phone');
        phoneSaved++;
      } else if (contact.verifiedName && jid) {
        saveContactName(jid, contact.verifiedName, 'verified');
      } else if (contact.notify && jid) {
        saveContactName(jid, contact.notify, 'push');
        pushSaved++;
      }
    }
    log(`Contacts synced: ${contacts.length} total, ${phoneSaved} phone-saved names, ${pushSaved} push names`);
  });

  sock.ev.on('contacts.update', (updates) => {
    for (const update of updates) {
      const jid = update.id;
      // Same priority for updates
      if ((update as any).name && jid) {
        saveContactName(jid, (update as any).name, 'phone');
      } else if (update.verifiedName && jid) {
        saveContactName(jid, update.verifiedName, 'verified');
      } else if (update.notify && jid) {
        saveContactName(jid, update.notify, 'push');
      }
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
          saveContactName(msg.key.remoteJid, msg.pushName, 'push');
        }
      }

    }

    if (events['messages.update']) {
      for (const { key, update } of events['messages.update']) {
        const jid = key.remoteJid;
        if (!jid || !messageStore[jid]) continue;

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
      for (const msg of messages) {
        const jid = msg.key.remoteJid;
        if (!jid) continue;

        jidCounts[jid] = (jidCounts[jid] || 0) + 1;

        // Extract contact name from history messages (low priority - push)
        if (!msg.key.fromMe && msg.pushName && jid.endsWith('@s.whatsapp.net')) {
          saveContactName(jid, msg.pushName, 'push');
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
          if (chatJid && chatJid.endsWith('@s.whatsapp.net')) {
            if (phoneName) {
              saveContactName(chatJid, phoneName, 'phone');
            } else if (convTitle) {
              saveContactName(chatJid, convTitle, 'chat');
            } else if (pushNotify) {
              saveContactName(chatJid, pushNotify, 'push');
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
