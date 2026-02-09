# whatsapp-mcp

An MCP (Model Context Protocol) server that connects Claude to WhatsApp. Read messages, search conversations, get group stats, and send messages — all through Claude Code or any MCP client.

Built on [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web API) and the [MCP SDK](https://modelcontextprotocol.io).

## Features

- **Read group messages** with flexible time ranges (24h, 7d, 2w, or ISO dates)
- **Full-text search** across all messages, optionally filtered by group
- **Group stats** — activity breakdown, top contributors, hourly/daily patterns, media counts
- **Per-member stats** — message counts, media usage, active hours
- **Send messages** to any WhatsApp group
- **History sync** — request older messages from WhatsApp servers
- **Persistent store** — messages are saved to disk and survive restarts

## Quick Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Pair WhatsApp (first time only)

```bash
npm run dev
```

A QR code will appear in your terminal. Scan it with WhatsApp on your phone (Settings > Linked Devices > Link a Device). Auth state is saved in `auth_info/`, so you only need to do this once. You can stop the process after pairing.

### 3. Configure MCP

Add to your Claude Code MCP config (`.mcp.json` in your project or `~/.claude.json`):

```json
{
  "mcpServers": {
    "whatsapp": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/path/to/whatsapp-mcp/src/index.ts"]
    }
  }
}
```

Claude Code will start the server automatically when it needs WhatsApp tools — you don't need to run it separately.

## Available Tools

| Tool | Description |
|------|-------------|
| `connection_status` | Check WhatsApp connection state, store size, group count |
| `list_groups` | List all groups with name, JID, participant count, message count |
| `get_group_info` | Group details: members, admins, description, creation date |
| `fetch_messages` | Get messages from a group with time range filtering |
| `search_messages` | Full-text search across messages, optionally scoped to a group |
| `get_group_stats` | Activity stats: message counts, top contributors, hourly/daily patterns |
| `get_member_stats` | Per-member breakdown: messages, media, active hours |
| `request_history` | Request older messages from WhatsApp servers (async) |
| `send_message` | Send a text message to a group |

## Architecture

```
src/
├── index.ts          # Entry point — starts WhatsApp + MCP server
├── whatsapp.ts       # Baileys connection, message store, history sync
├── mcp-server.ts     # MCP tool registrations
├── store.ts          # Message querying and stats computation
└── tools/
    ├── groups.ts     # list_groups, get_group_info
    ├── messages.ts   # fetch_messages, search_messages
    ├── stats.ts      # get_group_stats, get_member_stats
    └── send.ts       # send_message
```

Messages are stored in-memory and flushed to `store/message-store.json` every 30 seconds. History sync messages from WhatsApp are automatically ingested on connection.

## Scripts

- **`scripts/cron-summary.sh`** — Daily summary cron job. Uses Claude CLI to fetch and summarize all active group conversations.
- **`scripts/find-group.ts`** — Utility to look up a group JID by name.

## Skills

The `.claude/skills/` directory contains reusable Claude Code skills:

- **`summarize-group`** — Fetches messages and stats for a group, then produces a concise summary of activity. Usage: `/summarize-group [group name] [time range]`

## Development

```bash
npm run dev      # Run with tsx (hot reload)
npm run build    # Compile TypeScript
npm run start    # Run compiled output
```

## License

MIT
