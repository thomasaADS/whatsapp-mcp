import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getConnectionState, getMessageStore, getGroupCache, getStoreCount, requestMessageHistory } from './whatsapp.js';
import {
  listGroupsSchema,
  listGroups,
  getGroupInfoSchema,
  getGroupInfo,
} from './tools/groups.js';
import {
  fetchMessagesSchema,
  fetchMessages,
  searchMessagesSchema,
  searchMessages,
} from './tools/messages.js';
import {
  getGroupStatsSchema,
  getGroupStats,
  getMemberStatsSchema,
  getMemberStats,
} from './tools/stats.js';
import {
  sendMessageSchema,
  sendMessage,
} from './tools/send.js';
import {
  listContactsSchema,
  listContacts,
} from './tools/contacts.js';
import {
  fetchPrivateMessagesSchema,
  fetchPrivateMessages,
  sendPrivateMessageSchema,
  sendPrivateMessage,
} from './tools/private-messages.js';
import {
  searchMemberInGroupsSchema,
  searchMemberInGroups,
} from './tools/search-member.js';
import {
  sendImageSchema,
  sendImage,
  sendImagePrivateSchema,
  sendImagePrivate,
  sendMediaSchema,
  sendMedia,
  sendMediaPrivateSchema,
  sendMediaPrivate,
} from './tools/send-media.js';
import {
  downloadMediaSchema,
  downloadMedia,
} from './tools/read-media.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'whatsapp-mcp',
    version: '1.0.0',
  });

  // Connection status
  server.tool(
    'connection_status',
    'Returns WhatsApp connection status, store size, and group count',
    {},
    async () => {
      const state = getConnectionState();
      const store = getMessageStore();
      const groupCache = getGroupCache();

      const messageJids = Object.keys(store);
      let totalMessages = 0;
      for (const jid of messageJids) {
        totalMessages += (store[jid] || []).length;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              status: state,
              groups_cached: Object.keys(groupCache).filter((k) => k.endsWith('@g.us')).length,
              conversations_in_store: messageJids.length,
              group_chats_in_store: messageJids.filter((jid) => jid.endsWith('@g.us')).length,
              personal_chats_in_store: messageJids.filter((jid) => jid.endsWith('@s.whatsapp.net')).length,
              total_messages_in_store: totalMessages,
            }, null, 2),
          },
        ],
      };
    }
  );

  // Groups
  server.tool(
    'list_groups',
    'List all WhatsApp groups with name, JID, participant count, and message count',
    listGroupsSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(listGroups(params), null, 2) }],
    })
  );

  server.tool(
    'get_group_info',
    'Get detailed info for a group: members, admins, description, creation date',
    getGroupInfoSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(getGroupInfo(params), null, 2) }],
    })
  );

  // Messages
  server.tool(
    'fetch_messages',
    'Get messages from a group. Supports relative time (24h, 7d, 2w) or ISO dates',
    fetchMessagesSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(fetchMessages(params), null, 2) }],
    })
  );

  server.tool(
    'search_messages',
    'Full-text search across messages. Optionally filter by group and time range',
    searchMessagesSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(searchMessages(params), null, 2) }],
    })
  );

  // Stats
  server.tool(
    'get_group_stats',
    'Message counts, top contributors, hourly/daily activity, media breakdown for a group',
    getGroupStatsSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(getGroupStats(params), null, 2) }],
    })
  );

  server.tool(
    'get_member_stats',
    'Per-member stats: message count, media count, active hours',
    getMemberStatsSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(getMemberStats(params), null, 2) }],
    })
  );

  // Request history
  server.tool(
    'request_history',
    'Request older messages for a group from WhatsApp servers. Needs at least one message already in store as anchor. Results arrive asynchronously via history sync.',
    {
      group_jid: z.string().describe('The group JID (e.g., 123456789@g.us)'),
      count: z.number().default(500).describe('Number of messages to request (default 500)'),
    },
    async (params) => {
      try {
        const before = (getMessageStore()[params.group_jid] || []).length;
        const requestId = await requestMessageHistory(params.group_jid, params.count);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'requested',
              request_id: requestId,
              messages_before_request: before,
              note: 'Messages will arrive asynchronously. Check fetch_messages again in a few seconds.',
            }, null, 2),
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }, null, 2) }],
        };
      }
    }
  );

  // Send
  server.tool(
    'send_message',
    'Send a text message to a WhatsApp group',
    sendMessageSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await sendMessage(params), null, 2) }],
    })
  );

  // Contacts / Private Messages
  server.tool(
    'list_contacts',
    'List all personal/direct WhatsApp conversations with phone number, name, and message count',
    listContactsSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(listContacts(params), null, 2) }],
    })
  );

  server.tool(
    'fetch_private_messages',
    'Get messages from a personal/direct WhatsApp conversation. Takes phone number or JID.',
    fetchPrivateMessagesSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(fetchPrivateMessages(params), null, 2) }],
    })
  );

  server.tool(
    'send_private_message',
    'Send a text message to a personal WhatsApp contact. Takes phone number or JID.',
    sendPrivateMessageSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await sendPrivateMessage(params), null, 2) }],
    })
  );

  server.tool(
    'search_member_in_groups',
    'Search which WhatsApp groups a specific contact appears in. Search by phone number, name, or both.',
    searchMemberInGroupsSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(searchMemberInGroups(params), null, 2) }],
    })
  );

  // Send Image
  server.tool(
    'send_image',
    'Send an image to a WhatsApp group. Provide either a URL or local file path.',
    sendImageSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await sendImage(params), null, 2) }],
    })
  );

  server.tool(
    'send_image_private',
    'Send an image to a personal WhatsApp contact. Provide either a URL or local file path.',
    sendImagePrivateSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await sendImagePrivate(params), null, 2) }],
    })
  );

  // Send Media (video, audio, document, sticker)
  server.tool(
    'send_media',
    'Send media (video, audio, document, sticker) to a WhatsApp group. Provide either a URL or local file path.',
    sendMediaSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await sendMedia(params), null, 2) }],
    })
  );

  server.tool(
    'send_media_private',
    'Send media (video, audio, document, sticker) to a personal WhatsApp contact. Provide either a URL or local file path.',
    sendMediaPrivateSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await sendMediaPrivate(params), null, 2) }],
    })
  );

  // Download / Read Media
  server.tool(
    'download_media',
    'Download and read media (image, video, sticker, audio, document) from a WhatsApp message. Returns base64 data that Claude can view. Use fetch_messages first to find the message_id of an image message.',
    downloadMediaSchema.shape,
    async (params) => {
      const result = await downloadMedia(params);
      if ('error' in result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      }
      // Return image directly so Claude can see it
      const contents: any[] = [];
      if (result.mimetype?.startsWith('image/')) {
        contents.push({
          type: 'image' as const,
          data: result.base64,
          mimeType: result.mimetype,
        });
      }
      // Always include text metadata
      const { base64, ...meta } = result;
      contents.push({
        type: 'text' as const,
        text: JSON.stringify({ ...meta, base64_length: result.base64.length }, null, 2),
      });
      return { content: contents };
    }
  );

  return server;
}
