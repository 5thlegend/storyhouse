import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { getDb } from './db/index.js';
import { api } from './routes.js';
import { ensureSeed } from './seed/run.js';
import { getProvider } from './ai/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Initialize DB + schema.
  getDb();

  // Seed fictional "Margaret" data in demo mode if the vault is empty.
  if (config.demoMode) {
    await ensureSeed();
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', api);

  // Serve the built client in production (single-service deploy).
  const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.listen(config.port, () => {
    console.log(`\n  🏠 Storyhouse server listening on http://localhost:${config.port}`);
    console.log(`     AI provider: ${config.aiProvider} (${config.aiModel})`);
    console.log(`     Demo mode:   ${config.demoMode ? 'ON (fictional data)' : 'OFF'}`);
    console.log(`     Vault:       ${config.databasePath}\n`);
  });

  // Warm the models (non-blocking) so the first conversation turn is fast.
  getProvider()
    .then(({ provider, status }) => {
      if (status.openModelOnline && 'warmup' in provider) {
        console.log('  🔥 Warming models…');
        return (provider as any).warmup().then(() => console.log('  ✅ Models warm.'));
      }
    })
    .catch(() => {});
}

main().catch((err) => {
  console.error('Failed to start Storyhouse server:', err);
  process.exit(1);
});
