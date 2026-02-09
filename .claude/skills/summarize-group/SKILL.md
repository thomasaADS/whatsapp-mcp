---
name: summarize-group
description: Summarize WhatsApp group conversations. Fetches messages and produces a concise summary of activity.
argument-hint: [group name or JID] [time range]
---

Summarize the WhatsApp group conversation for: $ARGUMENTS

## Process

1. Find the group using `list_groups` if a name was given
2. Fetch messages using `fetch_messages` with the appropriate time range (default: 24h)
3. Get `get_group_stats` for contributor data
4. Identify conversation threads and key topics
5. Write a concise summary

## Summary Format

- Open with a brief intro identifying the group and time range
- List key topics discussed as short bullets
- Mention key contributors by name
- Note interesting links that were shared
- Include action items or decisions made
- Keep it concise and scannable
