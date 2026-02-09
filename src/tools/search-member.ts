import { z } from 'zod';
import { getGroupCache, getMessageStore } from '../whatsapp.js';
import { normalizePhoneToJid } from '../utils/jid.js';

export const searchMemberInGroupsSchema = z.object({
  phone: z.string().optional().describe('Phone number or JID to search for (e.g., 972548841488 or 972548841488@s.whatsapp.net)'),
  name: z.string().optional().describe('Contact name to search for (searches pushName in message store)'),
});

export function searchMemberInGroups(params: z.infer<typeof searchMemberInGroupsSchema>) {
  if (!params.phone && !params.name) {
    return { error: 'Provide either a phone number or a name to search for' };
  }

  const groupCache = getGroupCache();
  const store = getMessageStore();

  // If searching by name, first find matching JIDs from the message store
  let targetJids: string[] = [];

  if (params.phone) {
    targetJids = [normalizePhoneToJid(params.phone)];
  }

  if (params.name) {
    const searchName = params.name.toLowerCase();
    const matchedJids = new Set<string>();

    // Search through all messages to find JIDs with matching pushName
    for (const [jid, messages] of Object.entries(store)) {
      if (!messages) continue;
      for (const msg of messages) {
        if (msg.pushName && msg.pushName.toLowerCase().includes(searchName)) {
          // Get the sender JID (in groups it's participant, in DMs it's remoteJid)
          const senderJid = msg.key.participant || msg.key.remoteJid;
          if (senderJid && senderJid.endsWith('@s.whatsapp.net')) {
            matchedJids.add(senderJid);
          }
        }
      }
    }

    // Also check the DM conversation JIDs (where the contact's name appears)
    for (const [jid, messages] of Object.entries(store)) {
      if (!jid.endsWith('@s.whatsapp.net') || !messages) continue;
      for (const msg of messages) {
        if (!msg.key.fromMe && msg.pushName && msg.pushName.toLowerCase().includes(searchName)) {
          matchedJids.add(jid);
          break;
        }
      }
    }

    if (matchedJids.size === 0) {
      return {
        search_name: params.name,
        contacts_found: 0,
        contacts: [],
        groups_found: 0,
        groups: [],
      };
    }

    targetJids = [...new Set([...targetJids, ...matchedJids])];
  }

  // Build a map of JID -> pushName for display
  const jidNames: Record<string, string> = {};
  for (const [jid, messages] of Object.entries(store)) {
    if (!messages) continue;
    for (const msg of messages) {
      if (msg.pushName) {
        const senderJid = msg.key.participant || msg.key.remoteJid;
        if (senderJid && targetJids.includes(senderJid)) {
          jidNames[senderJid] = msg.pushName;
        }
      }
    }
  }

  // For each target JID, find which groups they're in
  const allGroups: Array<{
    group_jid: string;
    group_name: string;
    member_jid: string;
    member_name: string;
    is_admin: boolean;
    participant_count: number;
    message_count_in_store: number;
  }> = [];

  for (const jid of targetJids) {
    for (const [groupJid, metadata] of Object.entries(groupCache)) {
      if (!groupJid.endsWith('@g.us')) continue;

      const participant = metadata.participants?.find((p) => p.id === jid);
      if (participant) {
        const messages = store[groupJid];
        allGroups.push({
          group_jid: groupJid,
          group_name: metadata.subject,
          member_jid: jid,
          member_name: jidNames[jid] || jid.replace('@s.whatsapp.net', ''),
          is_admin: participant.admin === 'admin' || participant.admin === 'superadmin',
          participant_count: metadata.participants?.length || 0,
          message_count_in_store: messages ? messages.length : 0,
        });
      }
    }
  }

  allGroups.sort((a, b) => a.group_name.localeCompare(b.group_name));

  // Build contacts found list
  const contacts = targetJids.map((jid) => ({
    jid,
    phone: jid.replace('@s.whatsapp.net', ''),
    name: jidNames[jid] || null,
  }));

  return {
    search_phone: params.phone || null,
    search_name: params.name || null,
    contacts_found: contacts.length,
    contacts,
    groups_found: allGroups.length,
    groups: allGroups,
  };
}
