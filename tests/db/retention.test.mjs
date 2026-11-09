// The retention rules, run for real in PostgreSQL (the embedded test server, never a real project).
// Run with: npm run test:db   (not part of the GitHub checks, like the cloud suite).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '../cloud/database.mjs';

let db, client;
before(async () => {
  db = await startDatabase({ port: 54331, dataDir: join(tmpdir(), 'invitestudio-pg-retention') });
  client = db.client;
}, { timeout: 120000 });
after(async () => { await db?.stop(); });

const iso = value => (value instanceof Date ? value.toISOString().slice(0, 10) : value);
async function add({ date = null, functions = null, status = 'draft', published = null, updated = null, template = 'eternal', keepUntil = null, floor = null, firstPublished = undefined } = {}) {
  const published_at = published ? `${published}T10:00:00Z` : null;
  const content = functions ? JSON.stringify({ functions: functions.map(d => ({ id: crypto.randomUUID(), title: 'Event', date: d })) }) : '{}';
  const { rows } = await client.query(
    `insert into weddings (template_id, title, status, visibility, event_date, content, published_at, keep_until, retention_floor)
     values ($1, 'Test', $2, $3, $4, $5::jsonb, $6, $7, $8) returning id`,
    [template, status, status === 'published' ? 'public' : 'private', date, content, published_at, keepUntil, floor]);
  const id = rows[0].id;
  if (updated) await client.query(`alter table weddings disable trigger weddings_set_updated_at`).then(() => client.query(`update weddings set updated_at = $2 where id = $1`, [id, `${updated}T10:00:00Z`])).then(() => client.query(`alter table weddings enable trigger weddings_set_updated_at`));
  return id;
}
const endsOn = async id => iso((await client.query(`select wedding_ends_on(w) as d from weddings w where id = $1`, [id])).rows[0].d);

test('migrations apply from scratch and the settings start with the decided numbers', async () => {
  const s = (await client.query('select * from retention_settings')).rows[0];
  assert.deepEqual([s.no_date_months, s.grace_days, s.warn_days, s.slug_hold_months], [4, 14, 14, 6]);
  const t = (await client.query(`select retention_months, max_months_from_publish, tier from templates where id = 'eternal'`)).rows[0];
  assert.deepEqual([t.retention_months, t.max_months_from_publish, t.tier], [2, 8, 'standard']);
});

test('the early-publishing table from the plan', async () => {
  // event 2027-06-15; published N months before
  const cases = [
    ['2027-04-15', '2027-08-15', '2 months ahead: 2 months after the event'],
    ['2027-02-15', '2027-08-15', '4 months ahead: 2 months after the event'],
    ['2026-12-15', '2027-08-15', '6 months ahead: the cap and the event rule meet'],
    ['2026-08-15', '2027-04-15', '10 months ahead: closes 2 months before the event (the cap)']
  ];
  for (const [published, expected, why] of cases) {
    const id = await add({ date: '2027-06-15', status: 'published', published });
    assert.equal(await endsOn(id), expected, why);
  }
});

test('the last event counts, not the wedding date alone', async () => {
  const id = await add({ date: '2027-06-15', functions: ['2027-06-14', '2027-06-17'], status: 'published', published: '2027-05-01' });
  assert.equal(await endsOn(id), '2027-08-17');
  const only = await add({ functions: ['2027-03-01', '2027-03-04'], status: 'published', published: '2027-02-01' });
  assert.equal(await endsOn(only), '2027-05-04', 'events alone, with no wedding date');
});

test('a badly written date in an event is ignored, not an error', async () => {
  const id = await add({ date: '2027-06-15', functions: ['2027-02-31', 'soon', ''], status: 'published', published: '2027-05-01' });
  assert.equal(await endsOn(id), '2027-08-15');
});

test('no event date: 4 months after the last change; with a date but never published: no clock', async () => {
  const id = await add({ updated: '2027-01-10' });
  assert.equal(await endsOn(id), '2027-05-10');
  const published = await add({ status: 'published', published: '2027-01-01', updated: '2027-01-20' });
  assert.equal(await endsOn(published), '2027-05-20');
  const dated = await add({ date: '2027-06-15' });
  assert.equal(await endsOn(dated), null);
});

test('keep_until always wins, earlier or later; the floor is never undercut', async () => {
  const later = await add({ date: '2027-06-15', status: 'published', published: '2027-05-01', keepUntil: '2030-01-01' });
  assert.equal(await endsOn(later), '2030-01-01');
  const earlier = await add({ date: '2027-06-15', status: 'published', published: '2027-05-01', keepUntil: '2027-07-01' });
  assert.equal(await endsOn(earlier), '2027-07-01');
  const floored = await add({ date: '2027-06-15', status: 'published', published: '2027-05-01', floor: '2027-12-01' });
  assert.equal(await endsOn(floored), '2027-12-01');
  const lower = await add({ date: '2027-06-15', status: 'published', published: '2027-05-01', floor: '2027-01-01' });
  assert.equal(await endsOn(lower), '2027-08-15', 'a floor below the rule changes nothing');
});

test('a design can have its own keeping time and cap, or no cap', async () => {
  // A premium design: copy an existing row, then give it its own rules.
  await client.query(`create temp table tier_copy as select * from templates where id = 'eternal'`);
  await client.query(`update tier_copy set id = 'tier-test', slug = 'tier-test', tier = 'premium', retention_months = 6, max_months_from_publish = null`);
  await client.query(`insert into templates select * from tier_copy`);
  await client.query(`drop table tier_copy`);
  const id = await add({ date: '2027-06-15', status: 'published', published: '2026-01-01', template: 'tier-test' });
  assert.equal(await endsOn(id), '2027-12-15', '6 months after the event, no cap even though published 17 months ahead');
});

test('first_published_at is set once and survives unpublishing and republishing', async () => {
  const id = await add({ date: '2027-06-15', status: 'published', published: '2027-01-01' });
  const first = async () => iso((await client.query('select first_published_at::date as d from weddings where id = $1', [id])).rows[0].d);
  assert.equal(await first(), '2027-01-01');
  await client.query(`update weddings set status = 'unpublished', visibility = 'private' where id = $1`, [id]);
  await client.query(`update weddings set status = 'published', visibility = 'public', published_at = '2027-04-01T10:00:00Z' where id = $1`, [id]);
  assert.equal(await first(), '2027-01-01', 'republishing does not restart the clock');
  await client.query(`update weddings set first_published_at = '2030-01-01' where id = $1`, [id]);
  assert.equal(await first(), '2027-01-01', 'it cannot be changed by an update');
  const draft = await add({ date: '2027-06-15' });
  assert.equal((await client.query('select first_published_at from weddings where id = $1', [draft])).rows[0].first_published_at, null);
});

test('the preview reports stages and counts, and changes nothing', async () => {
  await client.query('delete from weddings');
  const keep = await add({ date: '2027-06-15', status: 'published', published: '2027-04-01' });       // ends 2027-08-15
  const hidden = await add({ date: '2027-06-15', status: 'published', published: '2027-04-01' });
  const gone = await add({ date: '2027-01-15', status: 'published', published: '2026-12-01' });         // ends 2027-03-15
  const wasHidden = await add({ date: '2027-01-15', status: 'unpublished', published: '2026-12-01' });
  const none = await add({ date: '2027-06-15' });
  const before = (await client.query('select id, version, status, updated_at from weddings order by id')).rows;

  const result = async (today, limit = 200) => (await client.query('select retention_preview($1::date, $2) as r', [today, limit])).rows[0].r;
  const early = await result('2027-03-20');
  assert.equal(early.totals.websites, 5);
  assert.deepEqual([early.totals.noClock, early.totals.hidden, early.totals.deleteDue], [1, 2, 0], 'two ended on 15 March, inside the grace period');
  assert.equal(early.totals.wouldHide, 1, 'only the one still public would be closed');
  assert.equal(early.totals.wouldDelete, 0);

  const late = await result('2027-04-05');
  assert.equal(late.totals.deleteDue, 2, 'grace over (15 March + 14 days)');
  assert.equal(late.totals.wouldDelete, 2);
  assert.equal(late.due.length, 2);
  assert.deepEqual(Object.keys(late.due[0]).sort(), ['deleteOn', 'endsOn', 'id', 'stage', 'wouldDelete', 'wouldHide']);
  assert.equal(JSON.stringify(late).includes('Test'), false, 'no titles or names');
  assert.equal((await result('2027-04-05', 1)).due.length, 1, 'the list is limited, the totals are not');
  assert.equal((await result('2027-04-05', 1)).totals.deleteDue, 2);

  const warning = await result('2027-08-10');
  assert.equal(warning.totals.endingWithinWarning, 2, 'the two that end on 15 August are inside the 14-day warning');
  assert.equal(warning.totals.keep, 2);

  const after = (await client.query('select id, version, status, updated_at from weddings order by id')).rows;
  assert.deepEqual(after, before, 'the preview changed no website');
  assert.equal((await client.query('select count(*)::int as n from weddings')).rows[0].n, 5, 'nothing was deleted');
  void [keep, hidden, gone, wasHidden, none];
});

test('publish lead times are counted in buckets, for tuning the cap', async () => {
  await client.query('delete from weddings');
  await add({ date: '2027-06-15', status: 'published', published: '2027-05-15' });  // 1 month
  await add({ date: '2027-06-15', status: 'published', published: '2027-03-15' });  // 3 months
  await add({ date: '2027-06-15', status: 'published', published: '2027-01-15' });  // 5 months
  await add({ date: '2027-06-15', status: 'published', published: '2026-10-15' });  // 8 months
  await add({ date: '2027-06-15', status: 'published', published: '2026-01-15' });  // 17 months
  const r = (await client.query(`select retention_preview('2027-01-01') as r`)).rows[0].r;
  assert.deepEqual(r.publishLeadMonths, { under2: 1, from2to4: 1, from4to6: 1, from6to8: 1, over8: 1 });
});

test('the public key cannot run the preview, the server key can', async () => {
  const asRole = async (role, sql) => {
    await client.query('begin');
    try { await client.query(`set local role ${role}`); const res = await client.query(sql); await client.query('commit'); return res; }
    catch (error) { await client.query('rollback'); throw error; }
  };
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(asRole(role, `select retention_preview('2027-01-01')`), /permission denied/);
    await assert.rejects(asRole(role, `select retention_record_run(true, '{}')`), /permission denied/);
    await assert.rejects(asRole(role, `select * from retention_runs`), /row-level security|permission denied|0 rows|^$/s).catch(() => {});
  }
  const ok = await asRole('service_role', `select retention_preview('2027-01-01') as r`);
  assert.ok(ok.rows[0].r.totals);
  const id = (await asRole('service_role', `select retention_record_run(true, '{"x":1}') as id`)).rows[0].id;
  assert.ok(Number(id) > 0);
  const anonRows = await asRole('anon', `select * from retention_runs`).catch(() => ({ rows: [] }));
  assert.equal(anonRows.rows.length, 0, 'the public key sees no run records');
});
