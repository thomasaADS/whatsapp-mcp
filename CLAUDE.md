# WhatsApp MCP Server

## Project
MCP server connecting to WhatsApp via Baileys, providing tools for reading group messages, stats, and sending messages. Used as an MCP tool by Claude Code.

## Tech Stack
- TypeScript, Node.js (ESM)
- Baileys (WhatsApp Web API)
- MCP SDK (`@modelcontextprotocol/sdk`)
- Zod for schema validation

## Structure
- `src/whatsapp.ts` - WhatsApp connection, message store, history sync
- `src/mcp-server.ts` - MCP tool registrations
- `src/store.ts` - Message querying, stats computation
- `src/tools/` - Individual tool implementations (groups, messages, stats, send)
- `store/message-store.json` - Persisted message store (JSON, flushed every 30s)
- `auth_info/` - WhatsApp auth state (do not commit)

## Dev
- `npm run dev` - Run with tsx
- `npm run build` - Compile with tsc
- Messages from history sync have string timestamps (not numbers) - both must be handled
