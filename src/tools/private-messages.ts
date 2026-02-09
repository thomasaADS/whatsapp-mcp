import { z } from 'zod';
import { getMessagesForGroup } from '../store.js';
import { getSocket, getConnectionState } from '../whatsapp.js';
import { normalizePhoneToJid } from '../utils/jid.js';

// Fetch private messages
export const fetchPrivateMessagesSchema = z.object({
  phone: z.string().describe('Phone number or JID (e.g., 972548841488, +972548841488, or 972548841488@s.whatsapp.net)'),
  since: z.string().default('24h').describe('Time range: relative (24h, 7d, 2w) or ISO date'),
  limit: z.number().default(200).describe('Maximum number of messages to return'),
});

export function fetchPrivateMessages(params: z.infer<typeof fetchPrivateMessagesSchema>) {
  const jid = normalizePhoneToJid(params.phone);
  const messages = getMessagesForGroup(jid, params.since, params.limit);

  return {
    jid,
    phone: jid.replace('@s.whatsapp.net', ''),
    since: params.since,
    count: messages.length,
    messages,
  };
}

// Send private message
export const sendPrivateMessageSchema = z.object({
  phone: z.string().describe('Phone number or JID (e.g., 972548841488, +972548841488, or 972548841488@s.whatsapp.net)'),
  text: z.string().describe('The text message to send'),
});

export async function sendPrivateMessage(params: z.infer<typeof sendPrivateMessageSchema>) {
  const sock = getSocket();
  const state = getConnectionState();

  if (!sock || state !== 'connected') {
    return { error: 'WhatsApp is not connected', state };
  }

  const jid = normalizePhoneToJid(params.phone);

  try {
    const result = await sock.sendMessage(jid, { text: params.text });
    return {
      success: true,
      message_id: result?.key.id || null,
      jid,
      phone: jid.replace('@s.whatsapp.net', ''),
    };
  } catch (err) {
    return {
      error: `Failed to send message: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
