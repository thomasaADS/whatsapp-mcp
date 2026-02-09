import { z } from 'zod';
import { getMessagesForGroup, searchMessages as searchMessagesHelper } from '../store.js';

export const fetchMessagesSchema = z.object({
  group_jid: z.string().describe('The group JID (e.g., 123456789@g.us)'),
  since: z.string().default('24h').describe('Time range: relative (24h, 7d, 2w) or ISO date'),
  limit: z.number().default(200).describe('Maximum number of messages to return'),
});

export function fetchMessages(params: z.infer<typeof fetchMessagesSchema>) {
  const messages = getMessagesForGroup(params.group_jid, params.since, params.limit);

  return {
    group_jid: params.group_jid,
    since: params.since,
    count: messages.length,
    messages,
  };
}

export const searchMessagesSchema = z.object({
  query: z.string().describe('Text to search for in messages'),
  group_jid: z.string().optional().describe('Optional: limit search to a specific group'),
  since: z.string().optional().describe('Optional time range filter'),
  limit: z.number().default(50).describe('Maximum number of results'),
});

export function searchMessages(params: z.infer<typeof searchMessagesSchema>) {
  const results = searchMessagesHelper(
    params.query,
    params.group_jid,
    params.since,
    params.limit
  );

  return {
    query: params.query,
    count: results.length,
    results,
  };
}
