// Guest replies: validation, limits, privacy and the endpoints, against an in-memory stand-in for the database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashEditToken, publicWeddingProjection, rsvpAccepting, rsvpSettings } from '../../functions/_shared/api.js';
import { totalsFor, validateReply } from '../../functions/_shared/rsvp.js';
import { onRequest as submit } from '../../functions/api/public-weddings/[slug]/rsvp/index.js';
import { onRequest as byToken } from '../../functions/api/public-weddings/[slug]/rsvp/[token].js';
import { onRequest as list } from '../../functions/api/weddings/[id]/rsvps/index.js';
import { onRequest as remove } from '../../functions/api/weddings/[id]/rsvps/[rsvpId].js';

const WEDDING_ID = '11111111-1111-4111-8111-111111111111';
const EDIT = 'e'.repeat(43);
const events = [{ id: 'e1', title: 'Ceremony' }, { id: 'e2', title: 'Reception' }];

function makeWedding(preferences = {}) {
  return { id: WEDDING_ID, slug: 'asha-ravi', status: 'published', visibility: 'public', preferences, content: { functions: [
    { id: 'e1', title: 'Ceremony', visible: true }, { id: 'e2', title: 'Reception', visible: true }, { id: 'e3', title: 'Hidden', visible: false }] } };
}

async function world(preferences) {
  const state = { wedding: makeWedding(preferences), rsvps: [], counters: new Map(), editHash: await hashEditToken(EDIT), nextId: 1 };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), path = u.pathname.replace('/rest/v1/', ''), q = u.searchParams, method = init.method || 'GET';
    const ok = data => new Response(JSON.stringify(data), { status: 200 });
    if (path === 'rpc/rsvp_rate_hit') {
      const { p_bucket } = JSON.parse(init.body);
      state.counters.set(p_bucket, (state.counters.get(p_bucket) || 0) + 1);
      return ok(state.counters.get(p_bucket));
    }
    if (path === 'weddings') return ok(q.get('slug') && q.get('slug') !== 'eq.asha-ravi' ? [] : [state.wedding]);
    if (path === 'edit_tokens') return method === 'PATCH' ? ok(null) : ok(q.get('token_hash') === `eq.${state.editHash}` ? [{ id: 't1', wedding_id: WEDDING_ID, expires_at: '2999-01-01T00:00:00Z' }] : []);
    if (path === 'wedding_rsvps') {
      const eq = key => (q.get(key) || '').replace(/^eq\./, '');
      if (method === 'POST') {
        const row = { id: `00000000-0000-4000-8000-${String(state.nextId++).padStart(12, '0')}`, created_at: 'now', updated_at: 'now', ...JSON.parse(init.body) };
        state.rsvps.push(row); return ok([row]);
      }
      let rows = state.rsvps.filter(r => (!eq('wedding_id') || r.wedding_id === eq('wedding_id')) && (!eq('change_token_hash') || r.change_token_hash === eq('change_token_hash')) && (!eq('id') || r.id === eq('id')));
      if (method === 'PATCH') { rows.forEach(r => Object.assign(r, JSON.parse(init.body))); return ok(rows); }
      if (method === 'DELETE') { state.rsvps = state.rsvps.filter(r => !rows.includes(r)); return ok(rows); }
      return ok(rows);
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  state.restore = () => { globalThis.fetch = realFetch; };
  return state;
}

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k' };
const call = (handler, method, params, body, headers = {}) => handler({
  env, params, request: new Request('https://x.test/api', { method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
});
const parse = async res => ({ status: res.status, body: await res.json() });
const good = { name: 'Meera', attending: true, party: 3, events: { e1: true, e2: false }, needs: 'Vegetarian', message: 'See you!' };

test('settings: defaults, limits and when replies are accepted', () => {
  assert.deepEqual({ ...rsvpSettings(undefined), contact: null }, { mode: 'count', maxParty: 10, replyBy: '', open: true, contact: null });
  assert.equal(rsvpSettings({ rsvpMaxParty: 99 }).maxParty, 20);
  assert.equal(rsvpSettings({ rsvpMaxParty: 0 }).maxParty, 1);
  assert.equal(rsvpSettings({ rsvpReplyBy: 'soon' }).replyBy, '');
  assert.equal(rsvpAccepting(rsvpSettings({})), true);
  assert.equal(rsvpAccepting(rsvpSettings({ rsvpOpen: false })), false);
  assert.equal(rsvpAccepting(rsvpSettings({ rsvp: 'contact' })), false);
  assert.equal(rsvpAccepting(rsvpSettings({ rsvp: 'none' })), false);
  assert.equal(rsvpAccepting(rsvpSettings({ rsvpReplyBy: '2027-01-10' }), '2027-01-10'), true);
  assert.equal(rsvpAccepting(rsvpSettings({ rsvpReplyBy: '2027-01-10' }), '2027-01-11'), false);
});

test('public projection shows how replies work, never any reply, and the number only when it is useful', () => {
  const wedding = prefs => publicWeddingProjection({ ...makeWedding(prefs), title: 't', sections: [] }).rsvp;
  const withNumber = { rsvpContact: { type: 'phone', value: '+91 98765 43210' } };
  assert.deepEqual(wedding({ ...withNumber }), { mode: 'count', open: true, maxParty: 10, replyBy: '', contact: null });
  assert.equal(wedding({ ...withNumber, rsvpOpen: false }).contact.type, 'phone');
  assert.equal(wedding({ ...withNumber, rsvp: 'contact' }).contact.type, 'phone');
  assert.equal(wedding({ ...withNumber, rsvp: 'none' }).contact, null);
});

test('validation: required fields, limits, events, plain text', () => {
  const ctx = { settings: rsvpSettings({}), events };
  assert.deepEqual(validateReply(good, ctx).value, { guest_name: 'Meera', attending: true, party_size: 3, event_replies: { e1: true, e2: false }, needs: 'Vegetarian', message: 'See you!' });
  const bad = body => validateReply(body, ctx).fields || {};
  assert.ok(bad({ ...good, name: '  ' }).name);
  assert.ok(bad({ ...good, name: 'x'.repeat(161) }).name);
  assert.ok(bad({ ...good, attending: 'yes' }).attending);
  assert.ok(bad({ ...good, party: 0 }).party);
  assert.ok(bad({ ...good, party: 11 }).party);
  assert.ok(bad({ ...good, party: 2.5 }).party);
  assert.ok(bad({ ...good, needs: 'x'.repeat(501) }).needs);
  assert.ok(bad({ ...good, message: 'x'.repeat(2001) }).message);
  assert.ok(bad({ ...good, events: { nope: true } }).events);
  assert.ok(bad({ ...good, events: { e1: false, e2: false } }).events);
  const no = validateReply({ name: 'Meera', attending: false, events: { e1: true } }, ctx).value;
  assert.equal(no.party_size, 0);
  assert.deepEqual(no.event_replies, { e1: false });
  assert.equal(validateReply({ ...good, name: 'A\u0000B\nC' }, ctx).value.guest_name, 'A B C');
  assert.equal(validateReply({ ...good, party: 7, events: { e1: true } }, { settings: rsvpSettings({ rsvp: 'rsvp' }), events }).value.party_size, 1);
});

test('totals count replies, people and each event', () => {
  const rows = [
    { attending: true, party_size: 3, event_replies: { e1: true, e2: false } },
    { attending: true, party_size: 2, event_replies: { e1: true, e2: true } },
    { attending: false, party_size: 0, event_replies: { e1: false } }
  ];
  const t = totalsFor(rows, events);
  assert.deepEqual([t.replies, t.attending, t.notAttending, t.headcount], [3, 2, 1, 5]);
  assert.deepEqual([t.byEvent.e1.headcount, t.byEvent.e2.headcount], [5, 2]);
});

test('a guest replies, sees the reply again with the private link, and can change it', async () => {
  const w = await world({});
  try {
    const created = await parse(await call(submit, 'POST', { slug: 'asha-ravi' }, good));
    assert.equal(created.status, 201);
    assert.match(created.body.changeToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(created.body.reply.party, 3);
    assert.equal(JSON.stringify(created.body).includes('change_token_hash'), false);
    assert.equal(w.rsvps.length, 1);
    assert.notEqual(w.rsvps[0].change_token_hash, created.body.changeToken, 'only a hash is stored');
    const token = created.body.changeToken;
    const read = await parse(await call(byToken, 'GET', { slug: 'asha-ravi', token }));
    assert.equal(read.body.reply.name, 'Meera');
    const put = await parse(await call(byToken, 'PUT', { slug: 'asha-ravi', token }, { ...good, attending: false }));
    assert.equal(put.status, 200);
    assert.equal(put.body.reply.attending, false);
    assert.equal(w.rsvps.length, 1, 'changing does not add a second reply');
    assert.equal((await call(byToken, 'GET', { slug: 'asha-ravi', token: 'z'.repeat(43) })).status, 404);
    assert.equal((await call(byToken, 'GET', { slug: 'asha-ravi', token: 'short' })).status, 404);
  } finally { w.restore(); }
});

test('invalid replies are refused with field messages; unknown or private invitations are not found', async () => {
  const w = await world({});
  try {
    const res = await parse(await call(submit, 'POST', { slug: 'asha-ravi' }, { ...good, party: 99 }));
    assert.equal(res.status, 422);
    assert.ok(res.body.error.fields.party);
    assert.equal(w.rsvps.length, 0);
    assert.equal((await call(submit, 'POST', { slug: 'someone-else' }, good)).status, 404);
    assert.equal((await call(submit, 'GET', { slug: 'asha-ravi' })).status, 405);
  } finally { w.restore(); }
});

test('closed, contact-only and past-deadline invitations take no replies', async () => {
  for (const prefs of [{ rsvpOpen: false }, { rsvp: 'contact' }, { rsvp: 'none' }, { rsvpReplyBy: '2020-01-01' }]) {
    const w = await world(prefs);
    try {
      const res = await parse(await call(submit, 'POST', { slug: 'asha-ravi' }, good));
      assert.equal(res.status, 403, JSON.stringify(prefs));
      assert.equal(res.body.error.code, 'RSVP_CLOSED');
      assert.equal(w.rsvps.length, 0);
    } finally { w.restore(); }
  }
});

test('a guest cannot change a reply once replies are closed, but can still read it', async () => {
  const w = await world({});
  try {
    const { body } = await parse(await call(submit, 'POST', { slug: 'asha-ravi' }, good));
    w.wedding.preferences = { rsvpOpen: false };
    assert.equal((await call(byToken, 'PUT', { slug: 'asha-ravi', token: body.changeToken }, good)).status, 403);
    const read = await parse(await call(byToken, 'GET', { slug: 'asha-ravi', token: body.changeToken }));
    assert.equal(read.body.closed, true);
  } finally { w.restore(); }
});

test('a filled spam-trap field stores nothing', async () => {
  const w = await world({});
  try {
    const res = await call(submit, 'POST', { slug: 'asha-ravi' }, { ...good, website: 'http://spam.example' });
    assert.equal(res.status, 201);
    assert.equal(w.rsvps.length, 0);
  } finally { w.restore(); }
});

test('rate limit: the sixth reply from one source in an hour is refused', async () => {
  const w = await world({});
  try {
    for (let i = 0; i < 5; i += 1) assert.equal((await call(submit, 'POST', { slug: 'asha-ravi' }, good)).status, 201);
    const sixth = await parse(await call(submit, 'POST', { slug: 'asha-ravi' }, good));
    assert.equal(sixth.status, 429);
    assert.equal(sixth.body.error.code, 'RATE_LIMITED');
    assert.equal(w.rsvps.length, 5);
    assert.equal((await call(submit, 'POST', { slug: 'asha-ravi' }, good, { 'CF-Connecting-IP': '198.51.100.7' })).status, 201, 'another source is unaffected');
    for (const bucket of w.counters.keys()) assert.equal(bucket.includes('203.0.113'), false, 'no IP address is stored');
  } finally { w.restore(); }
});

test('the couple sees replies and totals only with the edit token, and can delete one', async () => {
  const w = await world({});
  try {
    await call(submit, 'POST', { slug: 'asha-ravi' }, good);
    await call(submit, 'POST', { slug: 'asha-ravi' }, { ...good, name: 'Kiran', attending: false });
    assert.equal((await call(list, 'GET', { id: WEDDING_ID })).status, 401);
    assert.equal((await call(list, 'GET', { id: WEDDING_ID }, undefined, { Authorization: `Bearer ${'f'.repeat(43)}` })).status, 403);
    const auth = { Authorization: `Bearer ${EDIT}` };
    const seen = await parse(await call(list, 'GET', { id: WEDDING_ID }, undefined, auth));
    assert.equal(seen.body.replies.length, 2);
    assert.deepEqual([seen.body.totals.attending, seen.body.totals.notAttending, seen.body.totals.headcount], [1, 1, 3]);
    assert.equal(JSON.stringify(seen.body).includes('change_token_hash'), false);
    const id = seen.body.replies[0].id;
    assert.equal((await call(remove, 'DELETE', { id: WEDDING_ID, rsvpId: id })).status, 401);
    assert.equal((await call(remove, 'DELETE', { id: WEDDING_ID, rsvpId: id }, undefined, auth)).status, 200);
    assert.equal(w.rsvps.length, 1);
    assert.equal((await call(remove, 'DELETE', { id: WEDDING_ID, rsvpId: id }, undefined, auth)).status, 404);
  } finally { w.restore(); }
});
