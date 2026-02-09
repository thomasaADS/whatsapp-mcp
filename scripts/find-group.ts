import makeWASocket, { fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ level: 'silent' });

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ version, auth: state, logger, generateHighQualityLinkPreview: false, syncFullHistory: false });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    if (update.connection === 'open') {
      console.error('Connected!');
      try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups).filter(g => g.id.endsWith('@g.us'));
        const search = process.argv[2]?.toLowerCase() || 'agentic';
        const matches = groupList.filter(g => g.subject.toLowerCase().includes(search));
        if (matches.length > 0) {
          for (const g of matches) {
            console.log(JSON.stringify({ name: g.subject, jid: g.id, participants: g.participants?.length }));
          }
        } else {
          console.log(`No groups matching "${search}". Total groups: ${groupList.length}`);
          console.log('All group names:');
          for (const g of groupList.sort((a, b) => a.subject.localeCompare(b.subject))) {
            console.log(`  - ${g.subject}`);
          }
        }
      } catch (e) {
        console.error('Error:', e);
      }
      process.exit(0);
    }
  });
}

main();
