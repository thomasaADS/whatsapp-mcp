import { z } from 'zod';
import {
  addNote, getNotes, searchNotes, deleteNote,
  addTags, removeTags, getContactsByTag, getAllTags,
  setContactMetadata, getContactProfile, updateFollowUp, logInteraction,
  addReminder, getReminders, getDueReminders, completeReminder, cancelReminder,
  searchContacts, getCRMOverview,
} from '../crm.js';

// ==================== NOTES ====================

export const addNoteSchema = z.object({
  jid: z.string().optional().describe('Contact/group JID to attach note to. Omit for a global note.'),
  text: z.string().describe('The note text'),
  contact_name: z.string().optional().describe('Display name (for new contacts)'),
});

export async function addNoteHandler(params: z.infer<typeof addNoteSchema>) {
  const note = addNote(params.jid || null, params.text, params.contact_name);
  return { success: true, note, jid: params.jid || 'global' };
}

export const getNotesSchema = z.object({
  jid: z.string().optional().describe('Contact/group JID. Omit for global notes.'),
});

export async function getNotesHandler(params: z.infer<typeof getNotesSchema>) {
  const notes = getNotes(params.jid || null);
  return { jid: params.jid || 'global', count: notes.length, notes };
}

export const searchNotesSchema = z.object({
  query: z.string().describe('Search text to find in notes'),
});

export async function searchNotesHandler(params: z.infer<typeof searchNotesSchema>) {
  const results = searchNotes(params.query);
  return { query: params.query, count: results.length, results };
}

export const deleteNoteSchema = z.object({
  note_id: z.string().describe('The note ID to delete'),
});

export async function deleteNoteHandler(params: z.infer<typeof deleteNoteSchema>) {
  const deleted = deleteNote(params.note_id);
  return { success: deleted, note_id: params.note_id };
}

// ==================== TAGS ====================

export const addTagsSchema = z.object({
  jid: z.string().describe('Contact JID to tag'),
  tags: z.array(z.string()).describe('Tags to add (e.g. ["friend", "work"])'),
  contact_name: z.string().optional().describe('Display name (for new contacts)'),
});

export async function addTagsHandler(params: z.infer<typeof addTagsSchema>) {
  const tags = addTags(params.jid, params.tags, params.contact_name);
  return { success: true, jid: params.jid, tags };
}

export const removeTagsSchema = z.object({
  jid: z.string().describe('Contact JID'),
  tags: z.array(z.string()).describe('Tags to remove'),
});

export async function removeTagsHandler(params: z.infer<typeof removeTagsSchema>) {
  const tags = removeTags(params.jid, params.tags);
  return { success: true, jid: params.jid, tags };
}

export const getByTagSchema = z.object({
  tag: z.string().describe('Tag to search for'),
});

export async function getByTagHandler(params: z.infer<typeof getByTagSchema>) {
  const contacts = getContactsByTag(params.tag);
  return {
    tag: params.tag,
    count: contacts.length,
    contacts: contacts.map(c => ({
      jid: c.jid,
      name: c.name,
      tags: c.tags,
      notes_count: c.notes.length,
      last_interaction: c.last_interaction,
    })),
  };
}

export const listTagsSchema = z.object({});

export async function listTagsHandler() {
  return { tags: getAllTags() };
}

// ==================== CONTACT METADATA ====================

export const setMetadataSchema = z.object({
  jid: z.string().describe('Contact JID'),
  key: z.string().describe('Metadata key (e.g. "birthday", "company", "role", "email")'),
  value: z.string().describe('Metadata value'),
  contact_name: z.string().optional().describe('Display name (for new contacts)'),
});

export async function setMetadataHandler(params: z.infer<typeof setMetadataSchema>) {
  const metadata = setContactMetadata(params.jid, params.key, params.value, params.contact_name);
  return { success: true, jid: params.jid, metadata };
}

export const getProfileSchema = z.object({
  jid: z.string().describe('Contact JID'),
});

export async function getProfileHandler(params: z.infer<typeof getProfileSchema>) {
  const profile = getContactProfile(params.jid);
  if (!profile) return { error: 'Contact not found in CRM', jid: params.jid };
  return { ...profile, notes_count: profile.notes.length };
}

export const setFollowUpSchema = z.object({
  jid: z.string().describe('Contact JID'),
  date: z.string().describe('Follow-up date (ISO format, e.g. "2026-02-15")'),
  contact_name: z.string().optional().describe('Display name'),
});

export async function setFollowUpHandler(params: z.infer<typeof setFollowUpSchema>) {
  const contact = updateFollowUp(params.jid, params.date, params.contact_name);
  return { success: true, jid: params.jid, follow_up_date: contact.follow_up_date };
}

export const logInteractionSchema = z.object({
  jid: z.string().describe('Contact JID'),
  contact_name: z.string().optional().describe('Display name'),
});

export async function logInteractionHandler(params: z.infer<typeof logInteractionSchema>) {
  logInteraction(params.jid, params.contact_name);
  return { success: true, jid: params.jid, logged_at: new Date().toISOString() };
}

// ==================== REMINDERS ====================

export const addReminderSchema = z.object({
  text: z.string().describe('What to remember / reminder description'),
  due_at: z.string().describe('When the reminder is due (ISO date, e.g. "2026-02-10T09:00:00")'),
  target_jid: z.string().optional().describe('Optional: JID to send message to when due'),
  target_message: z.string().optional().describe('Optional: message to send when due'),
});

export async function addReminderHandler(params: z.infer<typeof addReminderSchema>) {
  const reminder = addReminder(params.text, params.due_at, params.target_jid, params.target_message);
  return { success: true, reminder };
}

export const listRemindersSchema = z.object({
  status: z.enum(['pending', 'done', 'cancelled']).optional().describe('Filter by status (default: all)'),
});

export async function listRemindersHandler(params: z.infer<typeof listRemindersSchema>) {
  const reminders = getReminders(params.status);
  return { count: reminders.length, reminders };
}

export const checkDueRemindersSchema = z.object({});

export async function checkDueRemindersHandler() {
  const due = getDueReminders();
  return { count: due.length, due_reminders: due };
}

export const completeReminderSchema = z.object({
  reminder_id: z.string().describe('Reminder ID to mark as done'),
});

export async function completeReminderHandler(params: z.infer<typeof completeReminderSchema>) {
  const reminder = completeReminder(params.reminder_id);
  if (!reminder) return { error: 'Reminder not found', reminder_id: params.reminder_id };
  return { success: true, reminder };
}

export const cancelReminderSchema = z.object({
  reminder_id: z.string().describe('Reminder ID to cancel'),
});

export async function cancelReminderHandler(params: z.infer<typeof cancelReminderSchema>) {
  const reminder = cancelReminder(params.reminder_id);
  if (!reminder) return { error: 'Reminder not found', reminder_id: params.reminder_id };
  return { success: true, reminder };
}

// ==================== SEARCH / OVERVIEW ====================

export const searchCRMSchema = z.object({
  query: z.string().describe('Search contacts by name, phone, tag, metadata, or notes'),
});

export async function searchCRMHandler(params: z.infer<typeof searchCRMSchema>) {
  const contacts = searchContacts(params.query);
  return {
    query: params.query,
    count: contacts.length,
    contacts: contacts.map(c => ({
      jid: c.jid,
      name: c.name,
      tags: c.tags,
      metadata: c.metadata,
      notes_count: c.notes.length,
      last_interaction: c.last_interaction,
      follow_up_date: c.follow_up_date,
    })),
  };
}

export const crmOverviewSchema = z.object({});

export async function crmOverviewHandler() {
  return getCRMOverview();
}
