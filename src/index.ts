import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { connectWhatsApp } from './whatsapp.js';
import { createMcpServer } from './mcp-server.js';
import { startDashboardServer } from './dashboard-server.js';

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

  // Start CRM Command Center dashboard on port 3777
  startDashboardServer(3777);
  log('Dashboard server started on http://localhost:3777');

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
