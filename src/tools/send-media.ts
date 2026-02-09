import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { getSocket, getConnectionState } from '../whatsapp.js';
import { normalizePhoneToJid } from '../utils/jid.js';

// Helper: load media from URL or file path
function loadMedia(url?: string, file_path?: string): { url: string } | Buffer {
  if (url) {
    return { url };
  }
  if (file_path) {
    return readFileSync(file_path);
  }
  throw new Error('Either url or file_path must be provided');
}

// ==================== SEND IMAGE ====================

export const sendImageSchema = z.object({
  group_jid: z.string().describe('The group JID to send to'),
  url: z.string().optional().describe('URL of the image to send'),
  file_path: z.string().optional().describe('Local file path of the image'),
  caption: z.string().optional().describe('Optional caption for the image'),
});

export async function sendImage(params: z.infer<typeof sendImageSchema>) {
  const sock = getSocket();
  const state = getConnectionState();

  if (!sock || state !== 'connected') {
    return { error: 'WhatsApp is not connected', state };
  }

  try {
    const media = loadMedia(params.url, params.file_path);
    const result = await sock.sendMessage(params.group_jid, {
      image: media,
      caption: params.caption,
    } as any);
    return {
      success: true,
      message_id: result?.key.id || null,
      group_jid: params.group_jid,
    };
  } catch (err) {
    return {
      error: `Failed to send image: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ==================== SEND IMAGE PRIVATE ====================

export const sendImagePrivateSchema = z.object({
  phone: z.string().describe('Phone number or JID (e.g., 972548841488, +972548841488, or 972548841488@s.whatsapp.net)'),
  url: z.string().optional().describe('URL of the image to send'),
  file_path: z.string().optional().describe('Local file path of the image'),
  caption: z.string().optional().describe('Optional caption for the image'),
});

export async function sendImagePrivate(params: z.infer<typeof sendImagePrivateSchema>) {
  const sock = getSocket();
  const state = getConnectionState();

  if (!sock || state !== 'connected') {
    return { error: 'WhatsApp is not connected', state };
  }

  const jid = normalizePhoneToJid(params.phone);

  try {
    const media = loadMedia(params.url, params.file_path);
    const result = await sock.sendMessage(jid, {
      image: media,
      caption: params.caption,
    } as any);
    return {
      success: true,
      message_id: result?.key.id || null,
      jid,
      phone: jid.replace('@s.whatsapp.net', ''),
    };
  } catch (err) {
    return {
      error: `Failed to send image: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ==================== SEND MEDIA (generic) ====================

export const sendMediaSchema = z.object({
  group_jid: z.string().describe('The group JID to send to'),
  media_type: z.enum(['video', 'audio', 'document', 'sticker']).describe('Type of media to send'),
  url: z.string().optional().describe('URL of the media to send'),
  file_path: z.string().optional().describe('Local file path of the media'),
  caption: z.string().optional().describe('Optional caption (for video/document)'),
  filename: z.string().optional().describe('Filename for document type'),
  mimetype: z.string().optional().describe('MIME type for document (e.g., application/pdf)'),
  ptt: z.boolean().optional().default(false).describe('Send audio as voice note (push-to-talk)'),
});

function buildMediaContent(
  media: { url: string } | Buffer,
  media_type: string,
  caption?: string,
  filename?: string,
  mimetype?: string,
  ptt?: boolean,
): any {
  switch (media_type) {
    case 'video':
      return { video: media, caption };
    case 'audio':
      return { audio: media, ptt: ptt || false };
    case 'document':
      return {
        document: media,
        mimetype: mimetype || 'application/octet-stream',
        fileName: filename || 'file',
        caption,
      };
    case 'sticker':
      return { sticker: media };
    default:
      throw new Error(`Unknown media type: ${media_type}`);
  }
}

export async function sendMedia(params: z.infer<typeof sendMediaSchema>) {
  const sock = getSocket();
  const state = getConnectionState();

  if (!sock || state !== 'connected') {
    return { error: 'WhatsApp is not connected', state };
  }

  try {
    const media = loadMedia(params.url, params.file_path);
    const content = buildMediaContent(media, params.media_type, params.caption, params.filename, params.mimetype, params.ptt);
    const result = await sock.sendMessage(params.group_jid, content);
    return {
      success: true,
      message_id: result?.key.id || null,
      group_jid: params.group_jid,
      media_type: params.media_type,
    };
  } catch (err) {
    return {
      error: `Failed to send ${params.media_type}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ==================== SEND MEDIA PRIVATE ====================

export const sendMediaPrivateSchema = z.object({
  phone: z.string().describe('Phone number or JID (e.g., 972548841488, +972548841488, or 972548841488@s.whatsapp.net)'),
  media_type: z.enum(['video', 'audio', 'document', 'sticker']).describe('Type of media to send'),
  url: z.string().optional().describe('URL of the media to send'),
  file_path: z.string().optional().describe('Local file path of the media'),
  caption: z.string().optional().describe('Optional caption (for video/document)'),
  filename: z.string().optional().describe('Filename for document type'),
  mimetype: z.string().optional().describe('MIME type for document (e.g., application/pdf)'),
  ptt: z.boolean().optional().default(false).describe('Send audio as voice note (push-to-talk)'),
});

export async function sendMediaPrivate(params: z.infer<typeof sendMediaPrivateSchema>) {
  const sock = getSocket();
  const state = getConnectionState();

  if (!sock || state !== 'connected') {
    return { error: 'WhatsApp is not connected', state };
  }

  const jid = normalizePhoneToJid(params.phone);

  try {
    const media = loadMedia(params.url, params.file_path);
    const content = buildMediaContent(media, params.media_type, params.caption, params.filename, params.mimetype, params.ptt);
    const result = await sock.sendMessage(jid, content);
    return {
      success: true,
      message_id: result?.key.id || null,
      jid,
      phone: jid.replace('@s.whatsapp.net', ''),
      media_type: params.media_type,
    };
  } catch (err) {
    return {
      error: `Failed to send ${params.media_type}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
