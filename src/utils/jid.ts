/**
 * Phone number normalization and JID utilities
 */

/**
 * Normalize a phone number or JID input to a canonical @s.whatsapp.net JID.
 * Accepts:
 *   - "972548841488@s.whatsapp.net" (already a JID, returned as-is)
 *   - "+972548841488" (strips the +, appends suffix)
 *   - "972548841488" (appends suffix)
 *   - "054-884-1488" (strips non-digits)
 */
export function normalizePhoneToJid(input: string): string {
  if (input.endsWith('@s.whatsapp.net')) {
    return input;
  }

  // Strip everything that is not a digit
  const digits = input.replace(/\D/g, '');

  if (!digits || digits.length < 7) {
    throw new Error(
      `Invalid phone number: "${input}". Provide a full international number like 972548841488 or a JID like 972548841488@s.whatsapp.net`
    );
  }

  return `${digits}@s.whatsapp.net`;
}

/**
 * Check if a JID is a personal (non-group) JID.
 */
export function isPersonalJid(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net');
}

/**
 * Check if a JID is a group JID.
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}
