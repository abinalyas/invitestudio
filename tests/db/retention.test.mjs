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
  assert.deepEqual([s.draft_idle_days, s.draft_warn_days], [30, 7], 'drafts: removed after 30 days without a change, warned 7 days before');
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

test('published with no event date: 4 months after the last change', async () => {
  const published = await add({ status: 'published', published: '2027-01-01', updated: '2027-01-20' });
  assert.equal(await endsOn(published), '2027-05-20');
});

test('a draft that was never published ends 30 days after its last change, with or without an event date', async () => {
  const noDate = await add({ updated: '2027-01-10' });
  assert.equal(await endsOn(noDate), '2027-02-09');
  const dated = await add({ date: '2027-06-15', updated: '2027-01-10' });
  assert.equal(await endsOn(dated), '2027-02-09', 'an event date does not keep an unpublished draft alive');
  const kept = await add({ updated: '2027-01-10', keepUntil: '2028-01-01' });
  assert.equal(await endsOn(kept), '2028-01-01', 'keep_until still wins');
});

test('a change moves a draft\'s end date out; a date the couple was shown is never brought forward', async () => {
  const id = await add({ updated: '2027-01-10' });
  assert.equal((await shown(id, '2027-01-12')).endsOn, '2027-02-09');
  const touch = day => client.query(`alter table weddings disable trigger weddings_set_updated_at`)
    .then(() => client.query(`update weddings set updated_at = $2 where id = $1`, [id, `${day}T10:00:00Z`]))
    .then(() => client.query(`alter table weddings enable trigger weddings_set_updated_at`));
  await touch('2027-01-25');
  assert.equal(await endsOn(id), '2027-02-24', 'edited later, so it ends later');
  assert.equal((await shown(id, '2027-01-26')).endsOn, '2027-02-24', 'and that is the date the couple is now shown');
  await touch('2027-01-10');
  assert.equal(await endsOn(id), '2027-02-24', 'the later date was shown, so it is not brought forward');
});

test('publishing a draft switches it to the published rule', async () => {
  const id = await add({ date: '2027-06-15', updated: '2027-01-10' });
  assert.equal((await shown(id, '2027-01-12')).draft, true);
  await client.query(`update weddings set status = 'published', visibility = 'public', published_at = '2027-02-01T10:00:00Z' where id = $1`, [id]);
  const r = await shown(id, '2027-02-02');
  assert.deepEqual([r.draft, r.endsOn, r.source], [false, '2027-08-15', 'event']);
});

test('the draft numbers are settings: changing the idle days changes new drafts', async () => {
  await client.query('update retention_settings set draft_idle_days = 10');
  try {
    assert.equal(await endsOn(await add({ updated: '2027-01-10' })), '2027-01-20');
  } finally { await client.query('update retention_settings set draft_idle_days = 30'); }
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
  const none = await add({ date: '2027-06-15', updated: '2027-03-01' });                              // a draft: ends 2027-03-31
  const before = (await client.query('select id, version, status, updated_at from weddings order by id')).rows;

  const result = async (today, limit = 200) => (await client.query('select retention_preview($1::date, $2) as r', [today, limit])).rows[0].r;
  const early = await result('2027-03-20');
  assert.equal(early.totals.websites, 5);
  assert.deepEqual([early.totals.noClock, early.totals.hidden, early.totals.deleteDue], [0, 2, 0], 'two ended on 15 March, inside the grace period');
  assert.equal(early.totals.keep, 3, 'the two websites still running, and the draft still inside its 30 days');
  assert.equal(early.totals.wouldHide, 1, 'only the one still public would be closed');
  assert.equal(early.totals.wouldDelete, 0);

  const late = await result('2027-04-05');
  assert.equal(late.totals.deleteDue, 2, 'grace over (15 March + 14 days)');
  assert.equal(late.totals.wouldDelete, 2);
  assert.equal(late.due.length, 3, 'the two ended websites and the draft that ended on 31 March');
  assert.deepEqual(Object.keys(late.due[0]).sort(), ['deleteOn', 'draft', 'endsOn', 'id', 'stage', 'wouldDelete', 'wouldHide']);
  assert.equal(JSON.stringify(late).includes('Test'), false, 'no titles or names');
  assert.equal((await result('2027-04-05', 1)).due.length, 1, 'the list is limited, the totals are not');
  assert.equal((await result('2027-04-05', 1)).totals.deleteDue, 2);

  const draftsWarn = await result('2027-03-26');
  assert.deepEqual(draftsWarn.totals.drafts, { total: 1, endingWithinWarning: 1, inGrace: 0, wouldDelete: 0 }, 'the draft is inside its 7-day warning');
  assert.deepEqual(late.totals.drafts, { total: 1, endingWithinWarning: 0, inGrace: 1, wouldDelete: 0 }, 'ended 31 March: inside the 14-day grace');
  assert.deepEqual((await result('2027-04-20')).totals.drafts, { total: 1, endingWithinWarning: 0, inGrace: 0, wouldDelete: 1 });

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

// ---- Step 2: what couples are shown --------------------------------------------------------------------------------
const shown = async (id, today = '2027-01-01') => (await client.query('select wedding_retention_shown($1, $2::date) as r', [id, today])).rows[0].r;

test('the editor is told when the website ends, how long is left, and why', async () => {
  const normal = await add({ date: '2027-06-15', status: 'published', published: '2027-04-01' });      // ends 2027-08-15 (event rule)
  const r = await shown(normal, '2027-08-05');
  assert.deepEqual([r.endsOn, r.deleteOn, r.stage, r.daysLeft, r.source, r.endsBeforeEvent, r.closed], ['2027-08-15', '2027-08-29', 'keep', 10, 'event', false, false]);
  assert.deepEqual([r.graceDays, r.warnDays, r.hasClock], [14, 14, true]);
  assert.equal((await shown(normal, '2027-08-20')).stage, 'hidden', 'inside the 14-day grace period');
  assert.equal((await shown(normal, '2027-08-20')).daysLeft, -5);
  assert.equal((await shown(normal, '2027-09-05')).stage, 'delete_due');

  const early = await add({ date: '2027-06-15', status: 'published', published: '2026-08-15' });       // the cap closes it before the event
  const e = await shown(early);
  assert.deepEqual([e.endsOn, e.source, e.endsBeforeEvent, e.lastEventDate], ['2027-04-15', 'cap', true, '2027-06-15']);

  const noDate = await add({ updated: '2027-01-10' });
  assert.deepEqual([(await shown(noDate)).source, (await shown(noDate)).endsOn], ['draft_idle', '2027-02-09']);
  assert.equal((await shown(noDate)).estimatedEndsOn, '2027-05-01', 'published today, with no event date, it would stay online 4 months');

  const extended = await add({ date: '2027-06-15', status: 'published', published: '2027-04-01', keepUntil: '2029-01-01' });
  assert.deepEqual([(await shown(extended)).source, (await shown(extended)).endsOn], ['keep_until', '2029-01-01']);

  const draft = await add({ date: '2027-06-15', updated: '2027-01-10' });
  const d = await shown(draft);
  assert.deepEqual([d.hasClock, d.endsOn, d.stage, d.daysLeft, d.draft, d.warnDays, d.endsBeforeEvent], [true, '2027-02-09', 'keep', 39, true, 7, false], 'a draft has its own 30-day clock and 7-day warning');
  assert.deepEqual([d.estimatedEndsOn, d.estimateBeforeEvent], ['2027-08-15', false], 'an estimate for the publish screen: 2 months after the event');
  const farAhead = await shown(await add({ date: '2027-12-15', updated: '2027-01-10' }), '2027-01-01');
  assert.deepEqual([farAhead.estimatedEndsOn, farAhead.estimateBeforeEvent], ['2027-09-01', true], 'published today it would close before an event this far away');
  assert.equal((await shown(normal, '2027-08-05')).estimatedEndsOn, null, 'a published website has no estimate');
  assert.equal(await shown('00000000-0000-4000-8000-000000000000'), null, 'an unknown website gives nothing');
});

test('a date a couple has been shown can never move earlier, but can move later', async () => {
  const id = await add({ date: '2027-06-15', status: 'published', published: '2027-04-01' });
  assert.equal((await shown(id)).endsOn, '2027-08-15');
  await client.query(`update templates set retention_months = 1 where id = 'eternal'`);        // the rule is shortened
  try {
    assert.equal(await endsOn(id), '2027-08-15', 'the shortened rule does not bring this one forward');
    const fresh = await add({ date: '2027-06-15', status: 'published', published: '2027-04-01' });
    assert.equal(await endsOn(fresh), '2027-07-15', 'a website nobody has been told about follows the new rule');
    await client.query(`update templates set retention_months = 4 where id = 'eternal'`);      // the rule is lengthened
    assert.equal(await endsOn(id), '2027-10-15', 'a longer rule applies');
    assert.equal((await shown(id)).endsOn, '2027-10-15');
    await client.query(`update templates set retention_months = 1 where id = 'eternal'`);
    assert.equal(await endsOn(id), '2027-10-15', 'and the longer date is protected from then on');
  } finally {
    await client.query(`update templates set retention_months = 2 where id = 'eternal'`);
  }
});

test('showing the date records it without touching the website row (its version must not change)', async () => {
  const id = await add({ date: '2027-06-15', status: 'published', published: '2027-04-01' });
  const before = (await client.query('select version, updated_at, retention_floor from weddings where id = $1', [id])).rows[0];
  await shown(id); await shown(id);
  const after = (await client.query('select version, updated_at, retention_floor from weddings where id = $1', [id])).rows[0];
  assert.deepEqual(after, before);
  assert.equal((await client.query('select count(*)::int as n from retention_shown where wedding_id = $1', [id])).rows[0].n, 1);
  await client.query('delete from weddings where id = $1', [id]);
  assert.equal((await client.query('select count(*)::int as n from retention_shown where wedding_id = $1', [id])).rows[0].n, 0, 'removed with the website');
});

test('a closed website says so; the public key cannot ask what a couple is shown', async () => {
  const id = await add({ date: '2027-06-15', status: 'published', published: '2027-04-01' });
  await client.query('update weddings set retention_hidden_at = now() where id = $1', [id]);
  assert.equal((await shown(id)).closed, true);
  await client.query('begin');
  try {
    await client.query('set local role anon');
    await assert.rejects(client.query('select wedding_retention_shown($1)', [id]), /permission denied/);
  } finally { await client.query('rollback'); }
  await client.query('begin');
  try {
    await client.query('set local role anon');
    const rows = await client.query('select * from retention_shown').catch(() => ({ rows: [] }));
    assert.equal(rows.rows.length, 0);
  } finally { await client.query('rollback'); }
});

// ---- Deleting idle drafts -------------------------------------------------------------------------------------------
// A draft last changed on 2027-01-10 ends 2027-02-09; with the 14-day grace it may be deleted from 2027-02-23.
const OLD = '2027-01-10', DUE = '2027-03-01', DUE_FROM = '2027-02-23';
const exists = async id => (await client.query('select 1 from weddings where id = $1', [id])).rowCount === 1;
const del = async (id, today = DUE) => (await client.query('select retention_delete_draft($1, $2::date) as r', [id, today])).rows[0].r;
const plan = async (today = DUE) => (await client.query('select retention_draft_plan($1::date) as r', [today])).rows[0].r;
const switchDeletion = on => client.query('update retention_settings set draft_deletion_enabled = $1', [on]);

test('draft deletion starts switched off, and while it is off nothing is deleted or planned as enabled', async () => {
  await client.query('delete from weddings');
  assert.equal((await client.query('select draft_deletion_enabled as e from retention_settings')).rows[0].e, false);
  const id = await add({ updated: OLD });
  const p = await plan();
  assert.deepEqual([p.enabled, p.eligible, p.ids], [false, 1, [id]], 'it can say what is due');
  assert.equal(await del(id), false);
  assert.equal(await exists(id), true, 'switched off: the draft stays');
  assert.equal((await client.query('select count(*)::int as n from retention_log')).rows[0].n, 0);
});

test('switched on, a draft past its end date and grace period is deleted, with what hangs off it, and logged by id only', async () => {
  await client.query('delete from weddings');
  await switchDeletion(true);
  try {
    const id = await add({ updated: OLD });
    await shown(id, '2027-01-12');                                   // records the date shown (retention_shown row)
    await client.query(`insert into edit_tokens (wedding_id, token_hash, expires_at) values ($1, $2, now() + interval '1 day')`, [id, 'h'.repeat(64)]).catch(() => null);
    assert.equal(await del(id, '2027-02-22'), false, 'the day before the grace period ends it stays');
    assert.equal(await del(id, DUE_FROM), true, 'on the first day it may go');
    assert.equal(await exists(id), false);
    assert.equal((await client.query('select count(*)::int as n from retention_shown where wedding_id = $1', [id])).rows[0].n, 0, 'removed with it');
    const log = (await client.query('select * from retention_log where wedding_id = $1', [id])).rows;
    assert.equal(log.length, 1);
    assert.deepEqual([log[0].action, log[0].rule, iso(log[0].last_change), iso(log[0].ended_on), log[0].grace_days], ['delete_draft', 'draft_idle', OLD, '2027-02-09', 14]);
    assert.equal(JSON.stringify(log).includes('Test'), false, 'no title or name in the record');
    assert.equal(await del(id), false, 'a second call finds nothing to delete');
  } finally { await switchDeletion(false); }
});

test('what must never be deleted, even when switched on and long past due', async () => {
  await client.query('delete from weddings');
  await switchDeletion(true);
  try {
    const keep = [];
    keep.push(['published now', await add({ status: 'published', published: '2026-12-01', updated: OLD })]);
    const everPublished = await add({ updated: OLD, status: 'unpublished', published: '2026-12-01' });
    keep.push(['was published once, now unpublished', everPublished]);
    keep.push(['keep_until set', await add({ updated: OLD, keepUntil: '2030-01-01' })]);
    const paid = await add({ updated: OLD });
    await client.query(`insert into payments (wedding_id, provider, status, amount_minor) values ($1, 'test', 'paid', 100)`, [paid]);
    keep.push(['a paid payment', paid]);
    const refunded = await add({ updated: OLD });
    await client.query(`insert into payments (wedding_id, provider, status, amount_minor) values ($1, 'test', 'refunded', 100)`, [refunded]);
    keep.push(['a refunded payment', refunded]);
    const unlocked = await add({ updated: OLD });
    await client.query(`update weddings set publish_unlocked_at = now() where id = $1`, [unlocked]);
    keep.push(['publishing unlocked', unlocked]);
    const promo = await add({ updated: OLD });
    await client.query(`insert into promo_codes (code, note) values ('PROMO-TEST-0001', 'test')`);
    await client.query(`insert into promo_redemptions (code, wedding_id) values ('PROMO-TEST-0001', $1)`, [promo]);
    keep.push(['a promo code used', promo]);
    const closed = await add({ updated: OLD });
    await client.query(`update weddings set retention_hidden_at = now() where id = $1`, [closed]);
    keep.push(['closed by the cleanup', closed]);
    keep.push(['edited recently (ends 2027-03-22)', await (async () => { const id = await add({ updated: '2027-02-20' }); return id; })()]);

    const p = await plan();
    assert.deepEqual([p.eligible, p.ids], [0, []], 'none of them is even planned');
    for (const [why, id] of keep) {
      assert.equal(await del(id), false, why);
      assert.equal(await exists(id), true, `${why}: still there`);
    }
    // A pending or failed payment (an abandoned checkout) does not protect a draft.
    const abandoned = await add({ updated: OLD });
    await client.query(`insert into payments (wedding_id, provider, status, amount_minor) values ($1, 'test', 'pending', 100), ($1, 'test2', 'failed', 100)`, [abandoned]);
    assert.equal(await del(abandoned), true, 'an abandoned checkout does not keep a draft alive');
  } finally { await switchDeletion(false); }
});

test('a save that lands before the delete keeps the draft: it is checked again with the row locked', async () => {
  await client.query('delete from weddings');
  await switchDeletion(true);
  try {
    const id = await add({ updated: OLD });
    assert.equal((await plan()).eligible, 1, 'it was due when the run planned');
    await client.query(`alter table weddings disable trigger weddings_set_updated_at`);
    await client.query(`update weddings set updated_at = '2027-02-28T10:00:00Z' where id = $1`, [id]);   // the couple saved after the plan
    await client.query(`alter table weddings enable trigger weddings_set_updated_at`);
    assert.equal(await del(id), false);
    assert.equal(await exists(id), true);
  } finally { await switchDeletion(false); }
});

test('the plan lists the oldest first, at most one batch, and says how many are due in all', async () => {
  await client.query('delete from weddings');
  await client.query('update retention_settings set batch_limit = 2');
  try {
    const newest = await add({ updated: '2027-01-12' });
    const oldest = await add({ updated: '2027-01-02' });
    const middle = await add({ updated: '2027-01-08' });
    const p = await plan();
    assert.equal(p.eligible, 3);
    assert.deepEqual(p.ids, [oldest, middle], 'two of three, oldest first');
    assert.deepEqual([p.batchLimit, p.brakeLimit], [2, 10]);
    void newest;
  } finally { await client.query('update retention_settings set batch_limit = 20'); }
});

test('the public key cannot run, plan or read the log of draft deletion', async () => {
  const asRole = async (role, sql) => {
    await client.query('begin');
    try { await client.query(`set local role ${role}`); const res = await client.query(sql); await client.query('commit'); return res; }
    catch (error) { await client.query('rollback'); throw error; }
  };
  const id = '00000000-0000-4000-8000-000000000000';
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(asRole(role, `select retention_delete_draft('${id}')`), /permission denied/);
    await assert.rejects(asRole(role, `select retention_draft_plan()`), /permission denied/);
  }
  await client.query(`insert into retention_log (wedding_id, action) values ($1, 'delete_draft')`, [id]);
  for (const role of ['anon', 'authenticated']) {
    const rows = await asRole(role, `select * from retention_log`).catch(() => ({ rows: [] }));
    assert.equal(rows.rows.length, 0, `${role} sees no log rows (row-level security, no policy)`);
  }
  assert.ok((await asRole('service_role', `select retention_draft_plan() as r`)).rows[0].r);
  await client.query('delete from retention_log');
});
