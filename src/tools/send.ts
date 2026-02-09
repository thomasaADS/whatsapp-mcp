import { z } from 'zod';
import { getSocket, getConnectionState } from '../whatsapp.js';

export const sendMessageSchema = z.object({
  group_jid: z.string().describe('The group JID to send to'),
  text: z.string().describe('The text message to send'),
});

export async function sendMessage(params: z.infer<typeof sendMessageSchema>) {
  const sock = getSocket();
  const state = getConnectionState();

  if (!sock || state !== 'connected') {
    return { error: 'WhatsApp is not connected', state };
  }

  try {
    const result = await sock.sendMessage(params.group_jid, { text: params.text });
    return {
      success: true,
      message_id: result?.key.id || null,
      group_jid: params.group_jid,
    };
  } catch (err) {
    return {
      error: `Failed to send message: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
