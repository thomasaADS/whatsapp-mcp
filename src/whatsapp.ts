import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
  type GroupMetadata,
  type proto,
} from '@whiskeysockets/baileys';
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
  return sock;
}

export function getGroupCache(): Record<string, GroupMetadata> {
  return groupCache;
}

export function getConnectionState() {
  return connectionState;
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

  // Use ev.process to handle ALL events including buffered ones (history sync)
  sock.ev.process(async (events) => {
    if (events['messages.upsert']) {
      const { messages, type } = events['messages.upsert'];
      for (const msg of messages) {
        upsertMsg(msg);
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
