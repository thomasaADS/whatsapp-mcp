/**
 * CRM Module - Personal CRM through WhatsApp
 *
 * Features:
 * - Notes per contact/group (free text, searchable)
 * - Tags for contacts (e.g. "friend", "work", "lead", "family")
 * - Reminders (scheduled actions)
 * - Contact metadata (birthday, company, role, custom fields)
 * - Interaction log (track last contact, follow-ups)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CRM_FILE = join(__dirname, '..', 'store', 'crm-data.json');

// ==================== TYPES ====================

export interface Note {
  id: string;
  text: string;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  text: string;
  due_at: string;        // ISO date string
  target_jid?: string;   // optional: send message to this JID when due
  target_message?: string; // optional: message to send
  status: 'pending' | 'done' | 'cancelled';
  created_at: string;
}

export interface ContactCRM {
  jid: string;
  name?: string;
  tags: string[];
  notes: Note[];
  metadata: Record<string, string>; // birthday, company, role, etc.
  last_interaction?: string;  // ISO date
  follow_up_date?: string;    // ISO date
  auto_reply?: 'on' | 'off'; // per-contact auto-reply override (undefined = use global setting)
  created_at: string;
  updated_at: string;
}

export interface CRMData {
  contacts: Record<string, ContactCRM>;
  reminders: Reminder[];
  global_notes: Note[]; // notes not tied to a contact
}

// ==================== PERSISTENCE ====================

let crmData: CRMData = {
  contacts: {},
  reminders: [],
  global_notes: [],
};

function loadCRM(): void {
  try {
    if (existsSync(CRM_FILE)) {
      const raw = readFileSync(CRM_FILE, 'utf-8');
      crmData = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[CRM] Failed to load:', err);
  }
}

function saveCRM(): void {
  try {
    writeFileSync(CRM_FILE, JSON.stringify(crmData, null, 2), 'utf-8');
  } catch (err) {
    console.error('[CRM] Failed to save:', err);
  }
}

// Load on startup
loadCRM();

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function ensureContact(jid: string, name?: string): ContactCRM {
  if (!crmData.contacts[jid]) {
    crmData.contacts[jid] = {
      jid,
      name,
      tags: [],
      notes: [],
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  if (name && !crmData.contacts[jid].name) {
    crmData.contacts[jid].name = name;
  }
  return crmData.contacts[jid];
}

// ==================== NOTES ====================

export function addNote(jid: string | null, text: string, contactName?: string): Note {
  const note: Note = {
    id: generateId(),
    text,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (jid) {
    const contact = ensureContact(jid, contactName);
    contact.notes.push(note);
    contact.updated_at = new Date().toISOString();
  } else {
    crmData.global_notes.push(note);
  }

  saveCRM();
  return note;
}

export function getNotes(jid: string | null): Note[] {
  if (jid) {
    return crmData.contacts[jid]?.notes || [];
  }
  return crmData.global_notes;
}

export function searchNotes(query: string): { jid: string | null; note: Note }[] {
  const queryLower = query.toLowerCase();
  const results: { jid: string | null; note: Note }[] = [];

  // Search global notes
  for (const note of crmData.global_notes) {
    if (note.text.toLowerCase().includes(queryLower)) {
      results.push({ jid: null, note });
    }
  }

  // Search contact notes
  for (const [jid, contact] of Object.entries(crmData.contacts)) {
    for (const note of contact.notes) {
      if (note.text.toLowerCase().includes(queryLower)) {
        results.push({ jid, note });
      }
    }
  }

  return results;
}

export function deleteNote(noteId: string): boolean {
  // Check global notes
  const globalIdx = crmData.global_notes.findIndex(n => n.id === noteId);
  if (globalIdx >= 0) {
    crmData.global_notes.splice(globalIdx, 1);
    saveCRM();
    return true;
  }

  // Check contact notes
  for (const contact of Object.values(crmData.contacts)) {
    const idx = contact.notes.findIndex(n => n.id === noteId);
    if (idx >= 0) {
      contact.notes.splice(idx, 1);
      contact.updated_at = new Date().toISOString();
      saveCRM();
      return true;
    }
  }

  return false;
}

// ==================== TAGS ====================

export function addTags(jid: string, tags: string[], contactName?: string): string[] {
  const contact = ensureContact(jid, contactName);
  for (const tag of tags) {
    const normalized = tag.toLowerCase().trim();
    if (!contact.tags.includes(normalized)) {
      contact.tags.push(normalized);
    }
  }
  contact.updated_at = new Date().toISOString();
  saveCRM();
  return contact.tags;
}

export function removeTags(jid: string, tags: string[]): string[] {
  const contact = crmData.contacts[jid];
  if (!contact) return [];
  contact.tags = contact.tags.filter(t => !tags.map(x => x.toLowerCase().trim()).includes(t));
  contact.updated_at = new Date().toISOString();
  saveCRM();
  return contact.tags;
}

export function getContactsByTag(tag: string): ContactCRM[] {
  const normalized = tag.toLowerCase().trim();
  return Object.values(crmData.contacts).filter(c => c.tags.includes(normalized));
}

export function getAllTags(): { tag: string; count: number }[] {
  const tagCounts: Record<string, number> = {};
  for (const contact of Object.values(crmData.contacts)) {
    for (const tag of contact.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// ==================== METADATA ====================

export function setContactMetadata(jid: string, key: string, value: string, contactName?: string): Record<string, string> {
  const contact = ensureContact(jid, contactName);
  contact.metadata[key] = value;
  contact.updated_at = new Date().toISOString();
  saveCRM();
  return contact.metadata;
}

export function getContactProfile(jid: string): ContactCRM | null {
  return crmData.contacts[jid] || null;
}

export function renameContact(jid: string, newName: string): ContactCRM {
  const contact = ensureContact(jid, newName);
  contact.name = newName;
  contact.updated_at = new Date().toISOString();
  saveCRM();
  return contact;
}

export function updateFollowUp(jid: string, date: string, contactName?: string): ContactCRM {
  const contact = ensureContact(jid, contactName);
  contact.follow_up_date = date;
  contact.updated_at = new Date().toISOString();
  saveCRM();
  return contact;
}

export function logInteraction(jid: string, contactName?: string): void {
  const contact = ensureContact(jid, contactName);
  contact.last_interaction = new Date().toISOString();
  contact.updated_at = new Date().toISOString();
  saveCRM();
}

// ==================== REMINDERS ====================

export function addReminder(text: string, dueAt: string, targetJid?: string, targetMessage?: string): Reminder {
  const reminder: Reminder = {
    id: generateId(),
    text,
    due_at: dueAt,
    target_jid: targetJid,
    target_message: targetMessage,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  crmData.reminders.push(reminder);
  saveCRM();
  return reminder;
}

export function getReminders(status?: 'pending' | 'done' | 'cancelled'): Reminder[] {
  if (status) {
    return crmData.reminders.filter(r => r.status === status);
  }
  return crmData.reminders;
}

export function getDueReminders(): Reminder[] {
  const now = new Date().toISOString();
  return crmData.reminders.filter(r => r.status === 'pending' && r.due_at <= now);
}

export function completeReminder(reminderId: string): Reminder | null {
  const reminder = crmData.reminders.find(r => r.id === reminderId);
  if (!reminder) return null;
  reminder.status = 'done';
  saveCRM();
  return reminder;
}

export function cancelReminder(reminderId: string): Reminder | null {
  const reminder = crmData.reminders.find(r => r.id === reminderId);
  if (!reminder) return null;
  reminder.status = 'cancelled';
  saveCRM();
  return reminder;
}

// ==================== AUTO-REPLY PER CONTACT ====================

export function setAutoReplyForContact(jid: string, mode: 'on' | 'off' | 'default', contactName?: string): ContactCRM {
  const contact = ensureContact(jid, contactName);
  if (mode === 'default') {
    delete contact.auto_reply;
  } else {
    contact.auto_reply = mode;
  }
  contact.updated_at = new Date().toISOString();
  saveCRM();
  return contact;
}

export function getAutoReplyForContact(jid: string): 'on' | 'off' | undefined {
  const contact = crmData.contacts[jid];
  return contact?.auto_reply;
}

// Get all contacts with auto-reply overrides
export function getAutoReplyOverrides(): { jid: string; name?: string; auto_reply: 'on' | 'off' }[] {
  return Object.values(crmData.contacts)
    .filter(c => c.auto_reply !== undefined)
    .map(c => ({ jid: c.jid, name: c.name, auto_reply: c.auto_reply! }));
}

// ==================== SEARCH / OVERVIEW ====================

export function searchContacts(query: string): ContactCRM[] {
  const queryLower = query.toLowerCase();
  return Object.values(crmData.contacts).filter(c => {
    if (c.name?.toLowerCase().includes(queryLower)) return true;
    if (c.jid.includes(queryLower)) return true;
    if (c.tags.some(t => t.includes(queryLower))) return true;
    if (Object.values(c.metadata).some(v => v.toLowerCase().includes(queryLower))) return true;
    if (c.notes.some(n => n.text.toLowerCase().includes(queryLower))) return true;
    return false;
  });
}

export function getCRMOverview(): {
  total_contacts: number;
  total_notes: number;
  total_reminders: number;
  pending_reminders: number;
  due_reminders: number;
  tags: { tag: string; count: number }[];
  recent_contacts: { jid: string; name?: string; last_interaction?: string }[];
  upcoming_follow_ups: { jid: string; name?: string; follow_up_date?: string }[];
} {
  const now = new Date().toISOString();
  const contacts = Object.values(crmData.contacts);

  return {
    total_contacts: contacts.length,
    total_notes: contacts.reduce((sum, c) => sum + c.notes.length, 0) + crmData.global_notes.length,
    total_reminders: crmData.reminders.length,
    pending_reminders: crmData.reminders.filter(r => r.status === 'pending').length,
    due_reminders: crmData.reminders.filter(r => r.status === 'pending' && r.due_at <= now).length,
    tags: getAllTags(),
    recent_contacts: contacts
      .filter(c => c.last_interaction)
      .sort((a, b) => (b.last_interaction || '').localeCompare(a.last_interaction || ''))
      .slice(0, 10)
      .map(c => ({ jid: c.jid, name: c.name, last_interaction: c.last_interaction })),
    upcoming_follow_ups: contacts
      .filter(c => c.follow_up_date && c.follow_up_date >= now)
      .sort((a, b) => (a.follow_up_date || '').localeCompare(b.follow_up_date || ''))
      .slice(0, 10)
      .map(c => ({ jid: c.jid, name: c.name, follow_up_date: c.follow_up_date })),
  };
}
