import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { connectWhatsApp } from './whatsapp.js';
import { createMcpServer } from './mcp-server.js';

const log = (...args: unknown[]) => console.error('[main]', ...args);

async function main() {
  log('Starting WhatsApp MCP Server...');

  // Start WhatsApp connection (runs in background, handles reconnection)
  try {
    await connectWhatsApp();
    log('WhatsApp connection initiated');
  } catch (err) {
    log('Failed to initiate WhatsApp connection:', err);
    // Continue anyway — tools will report disconnected state
  }

  // Create and start MCP server over stdio
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
