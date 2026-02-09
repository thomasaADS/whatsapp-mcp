import { z } from 'zod';
import { getSocket, getConnectionState } from '../whatsapp.js';
import { getRawMessage } from '../store.js';
import { normalizePhoneToJid } from '../utils/jid.js';

// ==================== REACT TO MESSAGE ====================

export const sendReactionSchema = z.object({
  jid: z.string().describe('Chat JID (group@g.us or phone@s.whatsapp.net)'),
  message_id: z.string().describe('The message ID to react to'),
  emoji: z.string().describe('Emoji to react with (e.g. 😂, ❤️, 👍). Empty string to remove reaction.'),
});

export async function sendReaction(params: z.infer<typeof sendReactionSchema>) {
  const sock = getSocket();
  const state = getConnectionState();
  if (!sock || state !== 'connected') return { error: 'WhatsApp is not connected', state };

  const msg = getRawMessage(params.jid, params.message_id);
  if (!msg) return { error: `Message ${params.message_id} not found in ${params.jid}` };

  try {
    await sock.sendMessage(params.jid, {
      react: { text: params.emoji, key: msg.key },
    });
    return { success: true, jid: params.jid, message_id: params.message_id, emoji: params.emoji };
  } catch (err) {
    return { error: `Failed to react: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ==================== REPLY / QUOTE MESSAGE ====================

export const replyMessageSchema = z.object({
  jid: z.string().describe('Chat JID (group@g.us or phone@s.whatsapp.net)'),
  message_id: z.string().describe('The message ID to reply/quote'),
  text: z.string().describe('Reply text'),
});

export async function replyMessage(params: z.infer<typeof replyMessageSchema>) {
  const sock = getSocket();
  const state = getConnectionState();
  if (!sock || state !== 'connected') return { error: 'WhatsApp is not connected', state };

  const quotedMsg = getRawMessage(params.jid, params.message_id);
  if (!quotedMsg) return { error: `Message ${params.message_id} not found in ${params.jid}` };

  try {
    const result = await sock.sendMessage(params.jid, { text: params.text }, { quoted: quotedMsg });
    return {
      success: true,
      message_id: result?.key.id || null,
      jid: params.jid,
      quoted_message_id: params.message_id,
    };
  } catch (err) {
    return { error: `Failed to reply: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ==================== MARK AS READ ====================

export const markReadSchema = z.object({
  jid: z.string().describe('Chat JID to mark as read'),
  message_id: z.string().optional().describe('Optional: specific message ID. If omitted, marks entire chat as read.'),
});

export async function markRead(params: z.infer<typeof markReadSchema>) {
  const sock = getSocket();
  const state = getConnectionState();
  if (!sock || state !== 'connected') return { error: 'WhatsApp is not connected', state };

  try {
    if (params.message_id) {
      const msg = getRawMessage(params.jid, params.message_id);
      if (msg) {
        await sock.readMessages([msg.key]);
      }
    } else {
      await sock.readMessages([{ remoteJid: params.jid, id: undefined as any }]);
    }
    return { success: true, jid: params.jid };
  } catch (err) {
    return { error: `Failed to mark as read: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ==================== FORWARD MESSAGE ====================

export const forwardMessageSchema = z.object({
  source_jid: z.string().describe('Source chat JID where the message is'),
  message_id: z.string().describe('Message ID to forward'),
  target_jid: z.string().describe('Target chat JID to forward to'),
});

export async function forwardMessage(params: z.infer<typeof forwardMessageSchema>) {
  const sock = getSocket();
  const state = getConnectionState();
  if (!sock || state !== 'connected') return { error: 'WhatsApp is not connected', state };

  const msg = getRawMessage(params.source_jid, params.message_id);
  if (!msg || !msg.message) return { error: `Message ${params.message_id} not found` };

  try {
    const result = await sock.sendMessage(params.target_jid, { forward: msg } as any);
    return {
      success: true,
      message_id: result?.key.id || null,
      source_jid: params.source_jid,
      target_jid: params.target_jid,
      forwarded_message_id: params.message_id,
    };
  } catch (err) {
    return { error: `Failed to forward: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ==================== SEND POLL ====================

export const sendPollSchema = z.object({
  jid: z.string().describe('Chat JID to send poll to'),
  question: z.string().describe('The poll question'),
  options: z.array(z.string()).min(2).max(12).describe('Poll options (2-12 choices)'),
  multi_select: z.boolean().default(false).describe('Allow selecting multiple options'),
});

export async function sendPoll(params: z.infer<typeof sendPollSchema>) {
  const sock = getSocket();
  const state = getConnectionState();
  if (!sock || state !== 'connected') return { error: 'WhatsApp is not connected', state };

  try {
    const result = await sock.sendMessage(params.jid, {
      poll: {
        name: params.question,
        values: params.options,
        selectableCount: params.multi_select ? 0 : 1,
      },
    } as any);
    return {
      success: true,
      message_id: result?.key.id || null,
      jid: params.jid,
      question: params.question,
      options: params.options,
    };
  } catch (err) {
    return { error: `Failed to send poll: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ==================== SEND LOCATION ====================

export const sendLocationSchema = z.object({
  jid: z.string().describe('Chat JID to send location to'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
  name: z.string().optional().describe('Location name (e.g. "Dizengoff Center")'),
  address: z.string().optional().describe('Address text'),
});

export async function sendLocation(params: z.infer<typeof sendLocationSchema>) {
  const sock = getSocket();
  const state = getConnectionState();
  if (!sock || state !== 'connected') return { error: 'WhatsApp is not connected', state };

  try {
    const result = await sock.sendMessage(params.jid, {
      location: {
        degreesLatitude: params.latitude,
        degreesLongitude: params.longitude,
        name: params.name,
        address: params.address,
      },
    } as any);
    return {
      success: true,
      message_id: result?.key.id || null,
      jid: params.jid,
    };
  } catch (err) {
    return { error: `Failed to send location: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ==================== SEND CONTACT CARD ====================

export const sendContactSchema = z.object({
  jid: z.string().describe('Chat JID to send contact to'),
  contact_name: z.string().describe('Display name for the contact'),
  contact_phone: z.string().describe('Phone number of the contact'),
});

export async function sendContact(params: z.infer<typeof sendContactSchema>) {
  const sock = getSocket();
  const state = getConnectionState();
  if (!sock || state !== 'connected') return { error: 'WhatsApp is not connected', state };

  const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${params.contact_name}\nTEL;type=CELL;type=VOICE;waid=${params.contact_phone.replace(/[^0-9]/g, '')}:${params.contact_phone}\nEND:VCARD`;

  try {
    const result = await sock.sendMessage(params.jid, {
      contacts: {
        displayName: params.contact_name,
        contacts: [{ vcard }],
      },
    });
    return {
      success: true,
      message_id: result?.key.id || null,
      jid: params.jid,
      contact_name: params.contact_name,
    };
  } catch (err) {
    return { error: `Failed to send contact: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ==================== GET PROFILE PICTURE ====================

export const getProfilePicSchema = z.object({
  jid: z.string().describe('JID of contact or group (phone@s.whatsapp.net or group@g.us)'),
});

export async function getProfilePic(params: z.infer<typeof getProfilePicSchema>) {
  const sock = getSocket();
  const state = getConnectionState();
  if (!sock || state !== 'connected') return { error: 'WhatsApp is not connected', state };

  try {
    const url = await sock.profilePictureUrl(params.jid, 'image');
    return { success: true, jid: params.jid, profile_picture_url: url };
  } catch (err) {
    return {
      success: true,
      jid: params.jid,
      profile_picture_url: null,
      note: 'No profile picture set or privacy settings prevent access',
    };
  }
}

// ==================== DELETE MESSAGE (for me) ====================

export const deleteMessageSchema = z.object({
  jid: z.string().describe('Chat JID'),
  message_id: z.string().describe('Message ID to delete'),
  for_everyone: z.boolean().default(false).describe('Delete for everyone (only works for your own recent messages)'),
});

export async function deleteMessage(params: z.infer<typeof deleteMessageSchema>) {
  const sock = getSocket();
  const state = getConnectionState();
  if (!sock || state !== 'connected') return { error: 'WhatsApp is not connected', state };

  const msg = getRawMessage(params.jid, params.message_id);
  if (!msg) return { error: `Message ${params.message_id} not found` };

  try {
    if (params.for_everyone) {
      await sock.sendMessage(params.jid, { delete: msg.key });
    } else {
      await sock.chatModify(
        { clear: { messages: [{ id: params.message_id, fromMe: msg.key.fromMe || false, timestamp: Number(msg.messageTimestamp) || 0 }] } } as any,
        params.jid
      );
    }
    return { success: true, jid: params.jid, message_id: params.message_id, for_everyone: params.for_everyone };
  } catch (err) {
    return { error: `Failed to delete: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ==================== PIN/STAR MESSAGE ====================

export const starMessageSchema = z.object({
  jid: z.string().describe('Chat JID'),
  message_id: z.string().describe('Message ID to star/unstar'),
  star: z.boolean().default(true).describe('true to star, false to unstar'),
});

export async function starMessage(params: z.infer<typeof starMessageSchema>) {
  const sock = getSocket();
  const state = getConnectionState();
  if (!sock || state !== 'connected') return { error: 'WhatsApp is not connected', state };

  const msg = getRawMessage(params.jid, params.message_id);
  if (!msg) return { error: `Message ${params.message_id} not found` };

  try {
    await sock.chatModify({
      star: {
        messages: [{ id: params.message_id, fromMe: msg.key.fromMe || false }],
        star: params.star,
      },
    }, params.jid);
    return { success: true, jid: params.jid, message_id: params.message_id, starred: params.star };
  } catch (err) {
    return { error: `Failed to star: ${err instanceof Error ? err.message : String(err)}` };
  }
}
