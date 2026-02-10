# Ted - WhatsApp Command Center

A full-featured WhatsApp management platform with an MCP server, premium web dashboard, CRM, AI assistant, and multi-agent support. Built for power users who manage multiple WhatsApp accounts and need professional-grade tools.

Built on [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web API), [MCP SDK](https://modelcontextprotocol.io), and the Anthropic Claude API.

## What's Inside

### MCP Server
Connect Claude Code (or any MCP client) directly to WhatsApp. Read messages, search conversations, get group stats, manage contacts, and send messages through natural language.

### Web Dashboard (Port 3777)
A premium dark-themed command center with three-panel layout:
- **Sidebar** - Groups, contacts, and CRM contacts with avatar initials, search, and quick navigation
- **Center** - Message feed with WhatsApp-style bubbles, composer with quick replies, and AI mode toggle
- **Right Panel** - Full CRM editor, AI image generation, quick replies manager, and agent management

### CRM System
Built-in contact relationship manager with:
- Contact naming and renaming
- Tags, notes, and metadata per contact
- Follow-up scheduling with reminders
- Overdue reminder tracking
- Full CRUD through dashboard or MCP tools

### Ted AI Assistant
Toggle between sending messages as yourself or as "Ted" - an AI assistant powered by Claude. Ted reads conversation context and responds intelligently. Includes AI image generation via DALL-E.

### Multi-Agent Support
Connect multiple WhatsApp accounts simultaneously:
- Add agents with QR code pairing through the dashboard
- Switch between active agents on the fly
- Each agent gets its own auth state and connection
- Agent status monitoring (connected/disconnected/pending QR)

### Quick Replies
Save and manage message templates. Type `/` in the composer to trigger a popup with your saved replies. Keyboard navigation with arrow keys, Enter/Tab to select, Escape to close.

## Quick Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Pair WhatsApp (first time only)

```bash
npm run dev
```

A QR code will appear in your terminal. Scan it with WhatsApp on your phone (Settings > Linked Devices > Link a Device). Auth state is saved in `auth_info/`, so you only need to do this once.

### 4. Configure MCP

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

The MCP server starts automatically and also launches the web dashboard on port 3777.

### 5. Open Dashboard

Navigate to [http://localhost:3777](http://localhost:3777) to access the command center.

## MCP Tools

| Tool | Description |
|------|-------------|
| `connection_status` | Check WhatsApp connection state, store size, group count |
| `list_groups` | List all groups with name, JID, participant count, message count |
| `get_group_info` | Group details: members, admins, description, creation date |
| `fetch_messages` | Get messages from a group with time range filtering |
| `fetch_private_messages` | Get messages from a private/direct conversation |
| `search_messages` | Full-text search across messages, optionally scoped to a group |
| `get_group_stats` | Activity stats: message counts, top contributors, hourly/daily patterns |
| `get_member_stats` | Per-member breakdown: messages, media, active hours |
| `request_history` | Request older messages from WhatsApp servers (async) |
| `send_message` | Send a text message to a group |
| `send_private_message` | Send a text message to a private contact |
| `list_contacts` | List all personal/direct conversations with names and message counts |
| `search_member_in_groups` | Find which groups a specific contact belongs to |

## Dashboard API Endpoints

The dashboard server exposes REST endpoints for the web UI:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Connection status and stats |
| `/api/groups` | GET | List all groups |
| `/api/contacts` | GET | List all contacts |
| `/api/messages/:jid` | GET | Get messages for a group/contact |
| `/api/send` | POST | Send a message |
| `/api/crm/:jid` | GET | Get CRM profile for a contact |
| `/api/crm/:jid` | POST | Update CRM profile |
| `/api/rename-contact` | POST | Rename a contact (CRM + cache) |
| `/api/crm/:jid/notes` | POST | Add a note |
| `/api/crm/:jid/notes/:id` | DELETE | Delete a note |
| `/api/crm/:jid/tags` | POST | Add a tag |
| `/api/crm/:jid/tags/:tag` | DELETE | Remove a tag |
| `/api/crm/:jid/metadata` | POST | Set metadata key/value |
| `/api/crm/:jid/reminders` | POST | Add a reminder |
| `/api/crm/:jid/reminders/:id/complete` | POST | Complete a reminder |
| `/api/crm/:jid/reminders/:id/cancel` | POST | Cancel a reminder |
| `/api/crm/:jid/followup` | POST | Set follow-up date |
| `/api/quick-replies` | GET | List quick replies |
| `/api/quick-replies` | POST | Create a quick reply |
| `/api/quick-replies/:id` | DELETE | Delete a quick reply |
| `/api/agents` | GET | List all agents |
| `/api/agents/create` | POST | Create a new agent connection |
| `/api/agents/:id/qr` | GET | Get QR code for agent pairing |
| `/api/agents/:id/activate` | POST | Switch active agent |
| `/api/agents/:id` | DELETE | Remove an agent |
| `/api/ted` | POST | Send message via Ted AI |
| `/api/generate-image` | POST | Generate image via AI |

## Architecture

```
src/
├── index.ts              # Entry point - starts WhatsApp + MCP + Dashboard
├── whatsapp.ts           # Baileys connection, message store, multi-agent, history sync
├── mcp-server.ts         # MCP tool registrations
├── store.ts              # Message querying and stats computation
├── crm.ts                # CRM data management (contacts, notes, tags, reminders)
├── dashboard-server.ts   # HTTP server for web dashboard (port 3777)
└── tools/
    ├── groups.ts         # list_groups, get_group_info
    ├── messages.ts       # fetch_messages, search_messages
    ├── stats.ts          # get_group_stats, get_member_stats
    ├── contacts.ts       # list_contacts, search_member_in_groups
    └── send.ts           # send_message, send_private_message

dashboard/
├── index.html            # Dashboard HTML - three-panel layout
├── app.js                # Dashboard client-side JavaScript
├── styles.css            # Premium dark theme CSS
└── ted-logo.png          # Ted logo asset

store/                    # Persisted data (gitignored)
├── message-store.json    # All WhatsApp messages
├── crm-data.json         # CRM contacts, notes, tags, reminders
├── contact-names.json    # Contact name cache
├── quick-replies.json    # Saved quick reply templates
└── agents.json           # Multi-agent configuration
```

## Design

The dashboard features a premium dark theme:
- **Font**: Inter (Google Fonts)
- **Colors**: Zinc palette with Amber accent
- **Layout**: Three-panel responsive design
- **Icons**: Inline SVG (no emoji on buttons)
- **Avatars**: Deterministic colored initials

## Scripts

- **`scripts/cron-summary.sh`** - Daily summary cron job. Uses Claude CLI to summarize all active group conversations.
- **`scripts/find-group.ts`** - Utility to look up a group JID by name.

## Development

```bash
npm run dev      # Run with tsx (hot reload)
npm run build    # Compile TypeScript
npm run start    # Run compiled output
```

## License

MIT
