// Test-only Postgres for the cloud suite. It starts the embedded Postgres binaries,
// recreates the parts of Supabase the migrations depend on (roles, the auth schema
// and auth.uid()), and applies the repository migrations in order. It is never
// pointed at a real Supabase project.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
export const migrationsDir = join(here, '..', '..', 'supabase', 'migrations');

function embeddedBinDir() {
  const repoRoot = join(here, '..', '..');
  return join(repoRoot, 'node_modules', '@embedded-postgres', `${process.platform}-${process.arch}`, 'native', 'bin');
}

// Postgres refuses to run as root. When the test process is root (containers,
// sandboxes), the server runs as a dedicated unprivileged user. On a developer
// machine the server simply runs as that developer.
const PG_USER = 'invitestudio_pgtest';
function serverUserPrefix(dataDir) {
  if (process.getuid?.() !== 0) return [];
  try { execFileSync('id', [PG_USER], { stdio: 'ignore' }); }
  catch { execFileSync('useradd', ['-r', '-M', '-s', '/bin/sh', PG_USER]); }
  return ['runuser', '-u', PG_USER, '--'];
}

const supabaseStubs = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid());
  -- Mirrors Supabase: the signed-in user id is carried in a request setting.
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function startDatabase({ port = 54329, dataDir }) {
  const bin = embeddedBinDir();
  const prefix = serverUserPrefix(dataDir);
  const run = (program, args) => execFileSync(
    prefix.length ? prefix[0] : program,
    prefix.length ? [...prefix.slice(1), program, ...args] : args,
    { stdio: 'pipe' }
  );

  // A run that was killed (SIGKILL) leaves its server running. Stop it first so the
  // next run can bind the same port.
  if (existsSync(join(dataDir, 'postmaster.pid'))) {
    try { run(join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop']); } catch { /* not running */ }
  }
  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    mkdirSync(dataDir, { recursive: true });
    if (prefix.length) execFileSync('chown', ['-R', PG_USER, dataDir]);
    run(join(bin, 'initdb'), ['-D', dataDir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale']);
  }
  run(join(bin, 'pg_ctl'), ['-D', dataDir, '-l', join(dataDir, 'server.log'), '-w',
    '-o', `-p ${port} -k ${dataDir} -c listen_addresses=127.0.0.1`, 'start']);

  const admin = new pg.Client({ connectionString: `postgres://postgres@127.0.0.1:${port}/postgres` });
  await admin.connect();
  // Every run starts from an empty database so migrations are verified from scratch.
  await admin.query('drop database if exists invitestudio with (force)');
  await admin.query('create database invitestudio');
  await admin.end();

  const url = `postgres://postgres@127.0.0.1:${port}/invitestudio`;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(supabaseStubs);
  for (const file of readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort()) {
    await client.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  // Supabase grants table privileges to anon and authenticated by default and relies on
  // RLS to restrict rows. Mirror that so the policies are what the tests exercise.
  await client.query(`
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant all on all tables in schema public to service_role;
    grant usage, select on all sequences in schema public to anon, authenticated, service_role;
  `);
  return {
    url,
    client,
    async stop() {
      await client.end();
      run(join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
    }
  };
}
