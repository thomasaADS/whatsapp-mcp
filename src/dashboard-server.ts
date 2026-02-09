#!/usr/bin/env node
/**
 * CRM Dashboard - Web server for viewing Ted's CRM data
 * Run: npx tsx src/dashboard-server.ts
 * Open: http://localhost:3777
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = join(__dirname, '..', 'dashboard');
const CRM_FILE = join(__dirname, '..', 'store', 'crm-data.json');
const MESSAGE_STORE_FILE = join(__dirname, '..', 'store', 'message-store.json');

const PORT = 3777;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function getCRMData(): any {
  try {
    if (existsSync(CRM_FILE)) {
      return JSON.parse(readFileSync(CRM_FILE, 'utf-8'));
    }
  } catch {}
  return { contacts: {}, reminders: [], global_notes: [] };
}

function getActivityLog(): any[] {
  const crm = getCRMData();
  const log: any[] = [];

  // Collect all notes with timestamps
  for (const [jid, contact] of Object.entries(crm.contacts) as any) {
    for (const note of contact.notes || []) {
      log.push({
        type: 'note',
        jid,
        contact_name: contact.name || jid.split('@')[0],
        text: note.text,
        timestamp: note.created_at,
      });
    }

    // Log interactions
    if (contact.last_interaction) {
      log.push({
        type: 'interaction',
        jid,
        contact_name: contact.name || jid.split('@')[0],
        text: `אינטראקציה עם ${contact.name || jid.split('@')[0]}`,
        timestamp: contact.last_interaction,
      });
    }

    // Tags added
    if (contact.tags?.length > 0) {
      log.push({
        type: 'tags',
        jid,
        contact_name: contact.name || jid.split('@')[0],
        text: `תגיות: ${contact.tags.join(', ')}`,
        timestamp: contact.updated_at || contact.created_at,
      });
    }
  }

  // Reminders
  for (const reminder of crm.reminders || []) {
    log.push({
      type: 'reminder',
      text: reminder.text,
      status: reminder.status,
      due_at: reminder.due_at,
      timestamp: reminder.created_at,
    });
  }

  // Global notes
  for (const note of crm.global_notes || []) {
    log.push({
      type: 'global_note',
      text: note.text,
      timestamp: note.created_at,
    });
  }

  // Sort by timestamp descending (newest first)
  log.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return log;
}

function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || '/';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // API endpoints
  if (url === '/api/crm') {
    const data = getCRMData();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data, null, 2));
    return;
  }

  if (url === '/api/activity') {
    const log = getActivityLog();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(log, null, 2));
    return;
  }

  if (url === '/api/stats') {
    const crm = getCRMData();
    const contacts = Object.values(crm.contacts) as any[];
    const now = new Date().toISOString();

    const stats = {
      total_contacts: contacts.length,
      total_notes: contacts.reduce((sum: number, c: any) => sum + (c.notes?.length || 0), 0) + (crm.global_notes?.length || 0),
      total_reminders: crm.reminders?.length || 0,
      pending_reminders: (crm.reminders || []).filter((r: any) => r.status === 'pending').length,
      due_reminders: (crm.reminders || []).filter((r: any) => r.status === 'pending' && r.due_at <= now).length,
      tags: (() => {
        const tagCounts: Record<string, number> = {};
        for (const c of contacts) {
          for (const tag of c.tags || []) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }
        return Object.entries(tagCounts).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
      })(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(stats, null, 2));
    return;
  }

  // Static files
  let filePath = url === '/' ? '/index.html' : url;
  const fullPath = join(DASHBOARD_DIR, filePath);

  if (!existsSync(fullPath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(fullPath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = readFileSync(fullPath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end('Server error');
  }
}

const server = createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`\n🚀 Ted CRM Dashboard running at: http://localhost:${PORT}\n`);
});
