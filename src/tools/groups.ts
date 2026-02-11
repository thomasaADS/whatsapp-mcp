import { z } from 'zod';
import { getGroupCache, getMessageStore } from '../whatsapp.js';
import { getMessageTimestamp } from '../store.js';

export const listGroupsSchema = z.object({
  search: z.string().optional().describe('Optional search filter for group names'),
});

export function listGroups(params: z.infer<typeof listGroupsSchema>) {
  const groupCache = getGroupCache();
  const store = getMessageStore();
  const search = params.search?.toLowerCase();

  const groups = Object.values(groupCache)
    .filter((g) => g.id.endsWith('@g.us'))
    .filter((g) => !search || g.subject.toLowerCase().includes(search))
    .map((g) => {
      const messages = store[g.id];
      const msgCount = messages ? messages.length : 0;

      // Find latest message timestamp
      let lastTs = 0;
      if (messages) {
        for (const msg of messages) {
          const ts = getMessageTimestamp(msg);
          if (ts > lastTs) lastTs = ts;
        }
      }

      return {
        jid: g.id,
        name: g.subject,
        participant_count: g.participants?.length || 0,
        message_count_in_store: msgCount,
        last_message_time: lastTs > 0 ? new Date(lastTs).toISOString() : null,
        creation: g.creation ? new Date(g.creation * 1000).toISOString() : null,
      };
    })
    .sort((a, b) => {
      const aTime = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
      const bTime = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
      return bTime - aTime;
    });

  return {
    count: groups.length,
    groups,
  };
}

export const getGroupInfoSchema = z.object({
  group_jid: z.string().describe('The group JID (e.g., 123456789@g.us)'),
});

export function getGroupInfo(params: z.infer<typeof getGroupInfoSchema>) {
  const groupCache = getGroupCache();
  const group = groupCache[params.group_jid];

  if (!group) {
    return { error: `Group not found: ${params.group_jid}` };
  }

  const admins = group.participants
    ?.filter((p) => p.admin)
    .map((p) => ({ jid: p.id, admin: p.admin })) || [];

  const members = group.participants
    ?.map((p) => ({ jid: p.id, admin: p.admin || null })) || [];

  return {
    jid: group.id,
    name: group.subject,
    description: group.desc || null,
    owner: group.owner || null,
    creation: group.creation ? new Date(group.creation * 1000).toISOString() : null,
    participant_count: members.length,
    admin_count: admins.length,
    admins,
    members,
  };
}
