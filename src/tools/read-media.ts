import { z } from 'zod';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getRawMessage, getMessageTimestamp } from '../store.js';

export const downloadMediaSchema = z.object({
  jid: z.string().describe('The chat JID (group@g.us or phone@s.whatsapp.net)'),
  message_id: z.string().describe('The message ID containing the media'),
});

export async function downloadMedia(params: z.infer<typeof downloadMediaSchema>) {
  const msg = getRawMessage(params.jid, params.message_id);

  if (!msg) {
    return { error: `Message ${params.message_id} not found in ${params.jid}` };
  }

  const m = msg.message;
  if (!m) {
    return { error: 'Message has no content' };
  }

  // Determine media type and mimetype
  let mediaType: string | null = null;
  let mimetype: string | null = null;
  let caption: string | null = null;

  if (m.imageMessage) {
    mediaType = 'image';
    mimetype = m.imageMessage.mimetype || 'image/jpeg';
    caption = m.imageMessage.caption || null;
  } else if (m.videoMessage) {
    mediaType = 'video';
    mimetype = m.videoMessage.mimetype || 'video/mp4';
    caption = m.videoMessage.caption || null;
  } else if (m.stickerMessage) {
    mediaType = 'sticker';
    mimetype = m.stickerMessage.mimetype || 'image/webp';
  } else if (m.audioMessage) {
    mediaType = 'audio';
    mimetype = m.audioMessage.mimetype || 'audio/ogg';
  } else if (m.documentMessage) {
    mediaType = 'document';
    mimetype = m.documentMessage.mimetype || 'application/octet-stream';
    caption = m.documentMessage.caption || null;
  } else {
    return { error: 'Message does not contain downloadable media' };
  }

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
    const base64 = buffer.toString('base64');
    const ts = getMessageTimestamp(msg);

    return {
      success: true,
      media_type: mediaType,
      mimetype,
      caption,
      size_bytes: buffer.length,
      base64,
      sender_name: msg.pushName || 'unknown',
      sender_jid: msg.key.participant || msg.key.remoteJid || 'unknown',
      timestamp: new Date(ts).toISOString(),
    };
  } catch (err) {
    return {
      error: `Failed to download media: ${err instanceof Error ? err.message : String(err)}`,
      hint: 'Media URLs may have expired. The message might be too old to download.',
    };
  }
}
