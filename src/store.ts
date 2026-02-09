import { type WAMessage, getMessageStore, getGroupCache } from './whatsapp.js';

export function parseRelativeTime(input: string): number {
  const now = Date.now();

  // ISO date string
  if (input.includes('-') || input.includes('T')) {
    const parsed = new Date(input).getTime();
    if (!isNaN(parsed)) return parsed;
  }

  // Relative time: 24h, 7d, 2w, 1m
  const match = input.match(/^(\d+)([hdwm])$/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers: Record<string, number> = {
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
      m: 30 * 24 * 60 * 60 * 1000,
    };
    return now - value * multipliers[unit];
  }

  // Default: 24 hours ago
  return now - 24 * 60 * 60 * 1000;
}

export function getMessageTimestamp(msg: WAMessage): number {
  const ts = msg.messageTimestamp;
  if (typeof ts === 'number') return ts * 1000;
  if (typeof ts === 'string') return parseInt(ts) * 1000;
  if (typeof ts === 'object' && ts !== null && 'low' in ts) {
    return (ts as { low: number }).low * 1000;
  }
  return 0;
}

function getMessageContent(msg: WAMessage): string | null {
  const m = msg.message;
  if (!m) return null;

  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;

  return null;
}

function getMessageType(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return 'unknown';

  if (m.conversation || m.extendedTextMessage) return 'text';
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  if (m.documentMessage) return 'document';
  if (m.stickerMessage) return 'sticker';
  if (m.contactMessage || m.contactsArrayMessage) return 'contact';
  if (m.locationMessage || m.liveLocationMessage) return 'location';
  if (m.reactionMessage) return 'reaction';
  if (m.pollCreationMessage || m.pollCreationMessageV3) return 'poll';

  return 'other';
}

function getSenderJid(msg: WAMessage): string {
  return msg.key.participant || msg.key.remoteJid || 'unknown';
}

function getSenderName(msg: WAMessage): string {
  return msg.pushName || getSenderJid(msg).split('@')[0];
}

export interface QuotedInfo {
  id: string;
  sender_jid: string;
  content: string | null;
  type: string;
}

export interface FormattedMessage {
  id: string;
  sender_jid: string;
  sender_name: string;
  from_me: boolean;
  content: string | null;
  type: string;
  timestamp: string;
  timestamp_epoch: number;
  quoted?: QuotedInfo;
}

function getQuotedInfo(msg: WAMessage): QuotedInfo | undefined {
  const m = msg.message;
  if (!m) return undefined;

  // contextInfo contains the quoted message
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.stickerMessage?.contextInfo;

  if (!ctx?.quotedMessage || !ctx.stanzaId) return undefined;

  const qm = ctx.quotedMessage;
  let content: string | null = null;
  let type = 'unknown';

  if (qm.conversation) { content = qm.conversation; type = 'text'; }
  else if (qm.extendedTextMessage?.text) { content = qm.extendedTextMessage.text; type = 'text'; }
  else if (qm.imageMessage) { content = qm.imageMessage.caption || null; type = 'image'; }
  else if (qm.videoMessage) { content = qm.videoMessage.caption || null; type = 'video'; }
  else if (qm.audioMessage) { type = 'audio'; }
  else if (qm.documentMessage) { content = qm.documentMessage.caption || null; type = 'document'; }
  else if (qm.stickerMessage) { type = 'sticker'; }

  return {
    id: ctx.stanzaId,
    sender_jid: ctx.participant || 'unknown',
    content,
    type,
  };
}

function formatMessage(msg: WAMessage): FormattedMessage {
  const ts = getMessageTimestamp(msg);
  const result: FormattedMessage = {
    id: msg.key.id || '',
    sender_jid: getSenderJid(msg),
    sender_name: getSenderName(msg),
    from_me: msg.key.fromMe === true,
    content: getMessageContent(msg),
    type: getMessageType(msg),
    timestamp: new Date(ts).toISOString(),
    timestamp_epoch: ts,
  };
  const quoted = getQuotedInfo(msg);
  if (quoted) result.quoted = quoted;
  return result;
}

export function getRawMessage(jid: string, messageId: string): WAMessage | null {
  const store = getMessageStore();
  const messages = store[jid];
  if (!messages) return null;
  return messages.find((m) => m.key.id === messageId) || null;
}

export function getMessagesForGroup(
  jid: string,
  since: string = '24h',
  limit: number = 200
): FormattedMessage[] {
  const store = getMessageStore();
  const sinceTs = parseRelativeTime(since);
  const messages = store[jid];

  if (!messages) return [];

  const result: FormattedMessage[] = [];

  for (const msg of messages) {
    const ts = getMessageTimestamp(msg);
    if (ts >= sinceTs && msg.message) {
      result.push(formatMessage(msg));
    }
  }

  result.sort((a, b) => a.timestamp_epoch - b.timestamp_epoch);
  // Take the LAST N messages (most recent), not the first N (oldest)
  const sliced = result.length > limit ? result.slice(-limit) : result;
  return sliced;
}

export function searchMessages(
  query: string,
  groupJid?: string,
  since?: string,
  limit: number = 50
): (FormattedMessage & { group_jid: string })[] {
  const store = getMessageStore();
  const sinceTs = since ? parseRelativeTime(since) : 0;
  const queryLower = query.toLowerCase();
  const results: (FormattedMessage & { group_jid: string })[] = [];

  const jids = groupJid ? [groupJid] : Object.keys(store);

  for (const jid of jids) {
    const messages = store[jid];
    if (!messages) continue;

    for (const msg of messages) {
      if (results.length >= limit) break;

      const ts = getMessageTimestamp(msg);
      if (ts < sinceTs) continue;

      const content = getMessageContent(msg);
      if (content && content.toLowerCase().includes(queryLower)) {
        results.push({ ...formatMessage(msg), group_jid: jid });
      }
    }
    if (results.length >= limit) break;
  }

  results.sort((a, b) => b.timestamp_epoch - a.timestamp_epoch);
  return results.slice(0, limit);
}

export interface GroupStats {
  group_jid: string;
  group_name: string;
  period_since: string;
  total_messages: number;
  unique_senders: number;
  top_contributors: { sender_name: string; sender_jid: string; count: number }[];
  message_types: Record<string, number>;
  hourly_activity: Record<number, number>;
  daily_activity: Record<string, number>;
}

export function computeGroupStats(jid: string, since: string = '7d'): GroupStats {
  const sinceTs = parseRelativeTime(since);
  const store = getMessageStore();
  const groupCache = getGroupCache();
  const messages = store[jid];
  const groupName = groupCache[jid]?.subject || jid;

  const senderCounts: Record<string, { name: string; count: number }> = {};
  const typeCounts: Record<string, number> = {};
  const hourly: Record<number, number> = {};
  const daily: Record<string, number> = {};
  let total = 0;

  if (messages) {
    for (const msg of messages) {
      const ts = getMessageTimestamp(msg);
      if (ts < sinceTs || !msg.message) continue;

      total++;

      const senderJid = getSenderJid(msg);
      const senderName = getSenderName(msg);
      if (!senderCounts[senderJid]) {
        senderCounts[senderJid] = { name: senderName, count: 0 };
      }
      senderCounts[senderJid].count++;

      const type = getMessageType(msg);
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      const date = new Date(ts);
      const hour = date.getHours();
      hourly[hour] = (hourly[hour] || 0) + 1;

      const dayKey = date.toISOString().slice(0, 10);
      daily[dayKey] = (daily[dayKey] || 0) + 1;
    }
  }

  const topContributors = Object.entries(senderCounts)
    .map(([jid, data]) => ({ sender_jid: jid, sender_name: data.name, count: data.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    group_jid: jid,
    group_name: groupName,
    period_since: new Date(sinceTs).toISOString(),
    total_messages: total,
    unique_senders: Object.keys(senderCounts).length,
    top_contributors: topContributors,
    message_types: typeCounts,
    hourly_activity: hourly,
    daily_activity: daily,
  };
}

export interface MemberStats {
  member_jid: string;
  member_name: string;
  message_count: number;
  media_count: number;
  text_count: number;
  active_hours: number[];
  first_message: string | null;
  last_message: string | null;
}

export function computeMemberStats(
  groupJid: string,
  memberJid?: string,
  since: string = '7d'
): MemberStats[] {
  const sinceTs = parseRelativeTime(since);
  const store = getMessageStore();
  const messages = store[groupJid];

  const memberData: Record<string, {
    name: string;
    messages: number;
    media: number;
    text: number;
    hours: Set<number>;
    firstTs: number;
    lastTs: number;
  }> = {};

  if (messages) {
    for (const msg of messages) {
      const ts = getMessageTimestamp(msg);
      if (ts < sinceTs || !msg.message) continue;

      const senderJid = getSenderJid(msg);
      if (memberJid && senderJid !== memberJid) continue;

      const senderName = getSenderName(msg);

      if (!memberData[senderJid]) {
        memberData[senderJid] = {
          name: senderName,
          messages: 0,
          media: 0,
          text: 0,
          hours: new Set(),
          firstTs: ts,
          lastTs: ts,
        };
      }

      const data = memberData[senderJid];
      data.messages++;

      const type = getMessageType(msg);
      if (type === 'text') data.text++;
      if (['image', 'video', 'audio', 'document', 'sticker'].includes(type)) data.media++;

      data.hours.add(new Date(ts).getHours());
      if (ts < data.firstTs) data.firstTs = ts;
      if (ts > data.lastTs) data.lastTs = ts;
    }
  }

  return Object.entries(memberData)
    .map(([jid, data]) => ({
      member_jid: jid,
      member_name: data.name,
      message_count: data.messages,
      media_count: data.media,
      text_count: data.text,
      active_hours: Array.from(data.hours).sort((a, b) => a - b),
      first_message: data.firstTs ? new Date(data.firstTs).toISOString() : null,
      last_message: data.lastTs ? new Date(data.lastTs).toISOString() : null,
    }))
    .sort((a, b) => b.message_count - a.message_count);
}
