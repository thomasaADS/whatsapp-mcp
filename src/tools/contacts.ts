import { z } from 'zod';
import { getMessageStore, getContactNames } from '../whatsapp.js';
import { getMessageTimestamp } from '../store.js';
import { getContactProfile } from '../crm.js';

export const listContactsSchema = z.object({
  search: z.string().optional().describe('Optional search filter for phone number or contact name'),
});

export function listContacts(params: z.infer<typeof listContactsSchema>) {
  const store = getMessageStore();
  const search = params.search?.toLowerCase();

  const contacts: Array<{
    jid: string;
    phone: string;
    name: string | null;
    crm_name: string | null;
    message_count_in_store: number;
    last_message_time: string | null;
  }> = [];

  for (const [jid, messages] of Object.entries(store)) {
    if (!jid.endsWith('@s.whatsapp.net')) continue;
    if (!messages || messages.length === 0) continue;

    const phone = jid.replace('@s.whatsapp.net', '');

    // Extract push name from the most recent inbound message
    let pushName: string | null = null;
    let lastTs = 0;

    for (const msg of messages) {
      const ts = getMessageTimestamp(msg);
      if (ts > lastTs) lastTs = ts;
      if (!msg.key.fromMe && msg.pushName) {
        pushName = msg.pushName;
      }
    }

    // Also check the contact names cache (from WhatsApp contacts sync)
    const contactNamesCache = getContactNames();
    const cachedName = contactNamesCache[jid]?.name || null;

    // Check CRM for a saved name
    const crmProfile = getContactProfile(jid);
    const crmName = crmProfile?.name || null;
    const displayName = crmName || pushName || cachedName || phone;

    // Apply search filter
    if (search) {
      const matchesPhone = phone.includes(search);
      const matchesName = displayName.toLowerCase().includes(search);
      if (!matchesPhone && !matchesName) continue;
    }

    contacts.push({
      jid,
      phone,
      name: crmName || pushName || cachedName,
      crm_name: crmName,
      message_count_in_store: messages.length,
      last_message_time: lastTs > 0 ? new Date(lastTs).toISOString() : null,
    });
  }

  // Sort by most recent message first
  contacts.sort((a, b) => {
    const aTime = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
    const bTime = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
    return bTime - aTime;
  });

  return {
    count: contacts.length,
    contacts,
  };
}
