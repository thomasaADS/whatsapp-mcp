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
import {
  sendReactionSchema,
  sendReaction,
  replyMessageSchema,
  replyMessage,
  markReadSchema,
  markRead,
  forwardMessageSchema,
  forwardMessage,
  sendPollSchema,
  sendPoll,
  sendLocationSchema,
  sendLocation,
  sendContactSchema,
  sendContact,
  getProfilePicSchema,
  getProfilePic,
  deleteMessageSchema,
  deleteMessage,
  starMessageSchema,
  starMessage,
} from './tools/interactions.js';
import {
  addNoteSchema, addNoteHandler,
  getNotesSchema, getNotesHandler,
  searchNotesSchema, searchNotesHandler,
  deleteNoteSchema, deleteNoteHandler,
  addTagsSchema, addTagsHandler,
  removeTagsSchema, removeTagsHandler,
  getByTagSchema, getByTagHandler,
  listTagsSchema, listTagsHandler,
  setMetadataSchema, setMetadataHandler,
  getProfileSchema, getProfileHandler,
  setFollowUpSchema, setFollowUpHandler,
  logInteractionSchema, logInteractionHandler,
  addReminderSchema, addReminderHandler,
  listRemindersSchema, listRemindersHandler,
  checkDueRemindersSchema, checkDueRemindersHandler,
  completeReminderSchema, completeReminderHandler,
  cancelReminderSchema, cancelReminderHandler,
  searchCRMSchema, searchCRMHandler,
  crmOverviewSchema, crmOverviewHandler,
} from './tools/crm-tools.js';

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

  // ==================== INTERACTION TOOLS ====================

  // React to message
  server.tool(
    'send_reaction',
    'React to a WhatsApp message with an emoji (😂, ❤️, 👍, etc). Send empty string to remove reaction.',
    sendReactionSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await sendReaction(params), null, 2) }],
    })
  );

  // Reply / Quote message
  server.tool(
    'reply_message',
    'Reply to a specific WhatsApp message (quote). The reply will appear as a quoted reply in the chat.',
    replyMessageSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await replyMessage(params), null, 2) }],
    })
  );

  // Mark as read
  server.tool(
    'mark_read',
    'Mark a WhatsApp chat or specific message as read (blue ticks).',
    markReadSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await markRead(params), null, 2) }],
    })
  );

  // Forward message
  server.tool(
    'forward_message',
    'Forward a message from one chat to another (group or private).',
    forwardMessageSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await forwardMessage(params), null, 2) }],
    })
  );

  // Send poll
  server.tool(
    'send_poll',
    'Create and send a poll in a WhatsApp chat. Supports 2-12 options, single or multi-select.',
    sendPollSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await sendPoll(params), null, 2) }],
    })
  );

  // Send location
  server.tool(
    'send_location',
    'Send a location pin to a WhatsApp chat with coordinates, name, and address.',
    sendLocationSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await sendLocation(params), null, 2) }],
    })
  );

  // Send contact card
  server.tool(
    'send_contact',
    'Send a contact card (vCard) to a WhatsApp chat with name and phone number.',
    sendContactSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await sendContact(params), null, 2) }],
    })
  );

  // Get profile picture
  server.tool(
    'get_profile_pic',
    'Get the profile picture URL of a WhatsApp contact or group.',
    getProfilePicSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await getProfilePic(params), null, 2) }],
    })
  );

  // Delete message
  server.tool(
    'delete_message',
    'Delete a message from a WhatsApp chat. Can delete for me only or for everyone (own recent messages only).',
    deleteMessageSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await deleteMessage(params), null, 2) }],
    })
  );

  // Star message
  server.tool(
    'star_message',
    'Star or unstar a WhatsApp message for quick access later.',
    starMessageSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await starMessage(params), null, 2) }],
    })
  );

  // ==================== CRM TOOLS ====================

  // Notes
  server.tool(
    'crm_add_note',
    'Save a note about a contact or a global note. Use for remembering things like "אופיר חייב לי 50 שקל" or meeting notes.',
    addNoteSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await addNoteHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_get_notes',
    'Get all notes for a contact or global notes.',
    getNotesSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await getNotesHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_search_notes',
    'Search through all notes (contact and global) by text.',
    searchNotesSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await searchNotesHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_delete_note',
    'Delete a note by its ID.',
    deleteNoteSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await deleteNoteHandler(params), null, 2) }],
    })
  );

  // Tags
  server.tool(
    'crm_add_tags',
    'Add tags to a contact for categorization (e.g. "friend", "work", "lead", "family", "vip").',
    addTagsSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await addTagsHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_remove_tags',
    'Remove tags from a contact.',
    removeTagsSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await removeTagsHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_get_by_tag',
    'Get all contacts with a specific tag (e.g. all "work" contacts).',
    getByTagSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await getByTagHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_list_tags',
    'List all tags and how many contacts each tag has.',
    listTagsSchema.shape,
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await listTagsHandler(), null, 2) }],
    })
  );

  // Contact metadata
  server.tool(
    'crm_set_metadata',
    'Set metadata on a contact (birthday, company, role, email, or any custom field).',
    setMetadataSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await setMetadataHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_get_profile',
    'Get full CRM profile of a contact: tags, notes, metadata, follow-up date, last interaction.',
    getProfileSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await getProfileHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_set_follow_up',
    'Set a follow-up date for a contact (e.g. "call back next week").',
    setFollowUpSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await setFollowUpHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_log_interaction',
    'Log that you interacted with a contact (updates last_interaction timestamp).',
    logInteractionSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await logInteractionHandler(params), null, 2) }],
    })
  );

  // Reminders
  server.tool(
    'crm_add_reminder',
    'Create a reminder for a future date. Optionally specify a WhatsApp message to send when due.',
    addReminderSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await addReminderHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_list_reminders',
    'List all reminders, optionally filtered by status (pending/done/cancelled).',
    listRemindersSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await listRemindersHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_check_due',
    'Check for reminders that are due now (past their due date and still pending).',
    checkDueRemindersSchema.shape,
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await checkDueRemindersHandler(), null, 2) }],
    })
  );

  server.tool(
    'crm_complete_reminder',
    'Mark a reminder as done.',
    completeReminderSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await completeReminderHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_cancel_reminder',
    'Cancel a reminder.',
    cancelReminderSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await cancelReminderHandler(params), null, 2) }],
    })
  );

  // Search & Overview
  server.tool(
    'crm_search',
    'Search CRM contacts by name, phone, tag, metadata value, or note content.',
    searchCRMSchema.shape,
    async (params) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await searchCRMHandler(params), null, 2) }],
    })
  );

  server.tool(
    'crm_overview',
    'Get a full CRM dashboard: total contacts, notes, reminders, tags, recent interactions, upcoming follow-ups.',
    crmOverviewSchema.shape,
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(await crmOverviewHandler(), null, 2) }],
    })
  );

  return server;
}
