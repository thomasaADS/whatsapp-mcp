import { z } from 'zod';
import { computeGroupStats, computeMemberStats } from '../store.js';

export const getGroupStatsSchema = z.object({
  group_jid: z.string().describe('The group JID'),
  since: z.string().default('7d').describe('Time range for stats (default: 7d)'),
});

export function getGroupStats(params: z.infer<typeof getGroupStatsSchema>) {
  return computeGroupStats(params.group_jid, params.since);
}

export const getMemberStatsSchema = z.object({
  group_jid: z.string().describe('The group JID'),
  member_jid: z.string().optional().describe('Optional: specific member JID'),
  since: z.string().default('7d').describe('Time range for stats (default: 7d)'),
});

export function getMemberStats(params: z.infer<typeof getMemberStatsSchema>) {
  const stats = computeMemberStats(params.group_jid, params.member_jid, params.since);
  return {
    group_jid: params.group_jid,
    since: params.since,
    member_count: stats.length,
    members: stats,
  };
}
