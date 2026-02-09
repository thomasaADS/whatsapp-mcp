#!/usr/bin/env node
/**
 * CLI tool to send images/media via WhatsApp.
 *
 * Usage:
 *   npx tsx src/cli-send-media.ts image <jid> <url-or-path> [caption]
 *   npx tsx src/cli-send-media.ts video <jid> <url-or-path> [caption]
 *   npx tsx src/cli-send-media.ts audio <jid> <url-or-path> [--ptt]
 *   npx tsx src/cli-send-media.ts document <jid> <url-or-path> [filename] [mimetype]
 *   npx tsx src/cli-send-media.ts sticker <jid> <url-or-path>
 *
 * Examples:
 *   npx tsx src/cli-send-media.ts image 972545871450-1634296197@g.us https://example.com/pic.jpg "Check this out!"
 *   npx tsx src/cli-send-media.ts image 972548841488@s.whatsapp.net ./photo.jpg
 *   npx tsx src/cli-send-media.ts video 972545871450-1634296197@g.us ./video.mp4 "Funny video"
 */

import { connectWhatsApp, getSocket, getConnectionState } from './whatsapp.js';
import { readFileSync } from 'node:fs';

const log = (...args: unknown[]) => console.log('[send-media]', ...args);

function loadMedia(source: string): { url: string } | Buffer {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return { url: source };
  }
  log('Loading file:', source);
  return readFileSync(source);
}

function buildContent(
  type: string,
  media: { url: string } | Buffer,
  caption?: string,
  filename?: string,
  mimetype?: string,
  ptt?: boolean,
): Record<string, unknown> {
  switch (type) {
    case 'image':
      return { image: media, caption };
    case 'video':
      return { video: media, caption };
    case 'audio':
      return { audio: media, ptt: ptt || false };
    case 'document':
      return {
        document: media,
        mimetype: mimetype || 'application/octet-stream',
        fileName: filename || 'file',
        caption,
      };
    case 'sticker':
      return { sticker: media };
    default:
      throw new Error(`Unknown media type: ${type}`);
  }
}

async function waitForConnection(maxWaitMs: number = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (getConnectionState() === 'connected' && getSocket()) {
      return true;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
Usage: npx tsx src/cli-send-media.ts <type> <jid> <url-or-path> [options]

Types: image, video, audio, document, sticker

Arguments:
  type          Media type (image/video/audio/document/sticker)
  jid           WhatsApp JID (group@g.us or phone@s.whatsapp.net)
  url-or-path   URL or local file path

Options (vary by type):
  image/video:    [caption]
  audio:          [--ptt] (send as voice note)
  document:       [filename] [mimetype]
  sticker:        (no options)

Examples:
  npx tsx src/cli-send-media.ts image 972545871450-1634296197@g.us https://example.com/pic.jpg "Nice!"
  npx tsx src/cli-send-media.ts document 972548841488@s.whatsapp.net ./report.pdf report.pdf application/pdf
`);
    process.exit(1);
  }

  const [type, jid, source, ...rest] = args;
  const validTypes = ['image', 'video', 'audio', 'document', 'sticker'];

  if (!validTypes.includes(type)) {
    console.error(`Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  log('Connecting to WhatsApp...');
  await connectWhatsApp();

  log('Waiting for connection...');
  const connected = await waitForConnection();

  if (!connected) {
    console.error('Failed to connect to WhatsApp within 30 seconds');
    process.exit(1);
  }

  const sock = getSocket();
  if (!sock) {
    console.error('No socket available');
    process.exit(1);
  }

  log(`Sending ${type} to ${jid}...`);

  try {
    const media = loadMedia(source);

    let caption: string | undefined;
    let filename: string | undefined;
    let mimetype: string | undefined;
    let ptt = false;

    if (type === 'image' || type === 'video') {
      caption = rest[0];
    } else if (type === 'audio') {
      ptt = rest.includes('--ptt');
    } else if (type === 'document') {
      filename = rest[0];
      mimetype = rest[1];
    }

    const content = buildContent(type, media, caption, filename, mimetype, ptt);
    const result = await sock.sendMessage(jid, content as any);

    log('Success! Message ID:', result?.key?.id);
    console.log(JSON.stringify({
      success: true,
      message_id: result?.key?.id || null,
      jid,
      type,
    }, null, 2));
  } catch (err) {
    console.error('Failed to send:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
