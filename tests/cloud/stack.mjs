// Starts the cloud test stack and keeps it running until terminated:
//   1. embedded Postgres with all repository migrations applied (fresh database),
//   2. the PostgREST-compatible REST shim in front of it,
//   3. wrangler pages dev serving the static site and the Pages Functions.
// Used by playwright.cloud.config.js. Test-only: never points at a real project.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDatabase } from './database.mjs';
import { startRestShim } from './rest-shim.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PG_PORT = 54329;
const SHIM_PORT = 54321;
const SITE_PORT = 8788;
const DATA_DIR = '/var/tmp/invitestudio-pgtest';

const db = await startDatabase({ port: PG_PORT, dataDir: DATA_DIR });
const shim = await startRestShim({ url: db.url, port: SHIM_PORT });
const site = spawn(process.execPath, [
  join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
  'pages', 'dev', '.',
  '--ip', '127.0.0.1',
  '--port', String(SITE_PORT),
  '--binding', `SUPABASE_URL=http://127.0.0.1:${SHIM_PORT}`,
  '--binding', 'SUPABASE_SERVICE_ROLE_KEY=test-only-service-role-key',
  '--binding', `ALLOWED_ORIGIN=http://127.0.0.1:${SITE_PORT}`
], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }
});

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  site.kill('SIGTERM');
  await shim.close().catch(() => {});
  await db.stop().catch(() => {});
  process.exit(code);
}
site.on('exit', code => shutdown(code ?? 1));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
