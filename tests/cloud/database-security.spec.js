// Row Level Security tests against the migrated database. They connect as the
// Supabase-style roles (anon, authenticated) and check what each may see or change.
// The stack in tests/cloud/stack.mjs runs Postgres on 127.0.0.1:54329.
const { test, expect } = require('@playwright/test');
const { Client } = require('pg');
const { randomUUID } = require('node:crypto');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';

async function asRole(client, role, userId, sql, params = []) {
  await client.query('begin');
  try {
    await client.query(`set local role ${role}`);
    if (userId) await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    const result = await client.query(sql, params);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

test.describe('row level security', () => {
  let admin;
  let ownerA;
  let ownerB;
  let weddingA;
  let weddingB;

  test.beforeAll(async () => {
    admin = new Client({ connectionString: DB_URL });
    await admin.connect();
    ownerA = randomUUID();
    ownerB = randomUUID();
    await admin.query('insert into auth.users (id) values ($1), ($2)', [ownerA, ownerB]);
    // Owned (authenticated) drafts, so ownership policies are exercised.
    const a = await admin.query(
      `insert into weddings (owner_id, ownership_mode, template_id, title) values ($1, 'authenticated', 'eternal', 'Owned by A') returning id`,
      [ownerA]
    );
    const b = await admin.query(
      `insert into weddings (owner_id, ownership_mode, template_id, title) values ($1, 'authenticated', 'eternal', 'Owned by B') returning id`,
      [ownerB]
    );
    weddingA = a.rows[0].id;
    weddingB = b.rows[0].id;
    // An anonymous draft that only edit tokens can reach.
    await admin.query(`insert into weddings (template_id, title) values ('eternal', 'Anonymous draft')`);
  });

  test.afterAll(async () => {
    await admin.end();
  });

  test('anonymous visitors cannot read weddings, edit tokens, photos, RSVPs or payments', async () => {
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    try {
      for (const table of ['weddings', 'edit_tokens', 'wedding_photos', 'rsvps', 'payments', 'wedding_events']) {
        const result = await asRole(client, 'anon', null, `select count(*)::int as n from ${table}`);
        expect(result.rows[0].n, `anon sees rows in ${table}`).toBe(0);
      }
    } finally {
      await client.end();
    }
  });

  test('anonymous visitors cannot write to any table they should not', async () => {
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    try {
      await expect(asRole(client, 'anon', null,
        `insert into weddings (template_id, title) values ('eternal', 'Injected')`)).rejects.toThrow();
      await expect(asRole(client, 'anon', null,
        `insert into rsvps (wedding_id, guest_name, attending) values ($1, 'Guest', true)`, [weddingA])).rejects.toThrow();
      await expect(asRole(client, 'anon', null,
        `insert into edit_tokens (wedding_id, token_hash, expires_at) values ($1, repeat('a', 64), now() + interval '1 day')`, [weddingA])).rejects.toThrow();
    } finally {
      await client.end();
    }
  });

  test('a signed-in owner sees only their own weddings', async () => {
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    try {
      const seen = await asRole(client, 'authenticated', ownerA, 'select id from weddings where owner_id is not null');
      expect(seen.rows.map(row => row.id)).toEqual([weddingA]);
      const other = await asRole(client, 'authenticated', ownerA, 'select id from weddings where id = $1', [weddingB]);
      expect(other.rowCount).toBe(0);
    } finally {
      await client.end();
    }
  });

  test('a signed-in owner cannot update another owner\'s wedding', async () => {
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    try {
      const result = await asRole(client, 'authenticated', ownerA,
        `update weddings set title = 'Hijacked' where id = $1`, [weddingB]);
      expect(result.rowCount).toBe(0);
      const check = await admin.query('select title from weddings where id = $1', [weddingB]);
      expect(check.rows[0].title).toBe('Owned by B');
    } finally {
      await client.end();
    }
  });

  test('templates are readable by anonymous visitors only while active', async () => {
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    try {
      const active = await asRole(client, 'anon', null, 'select count(*)::int as n from templates where is_active = true');
      expect(active.rows[0].n).toBeGreaterThan(0);
      await admin.query(`update templates set is_active = false where id = 'summit'`);
      const hidden = await asRole(client, 'anon', null, `select count(*)::int as n from templates where id = 'summit'`);
      expect(hidden.rows[0].n).toBe(0);
      await admin.query(`update templates set is_active = true where id = 'summit'`);
      await expect(asRole(client, 'anon', null,
        `update templates set name = 'Hacked' where id = 'eternal'`)).resolves.toMatchObject({ rowCount: 0 });
    } finally {
      await client.end();
    }
  });
});
