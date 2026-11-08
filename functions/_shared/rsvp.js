// Guest replies (RSVP). See docs/RSVP_PLAN.md. Everything here is plain text: nothing a guest types is ever
// treated as markup, and replies are only ever returned to the couple (edit token) or to the guest who made them
// (private change link).
import {
  ApiError,
  db,
  hashEditToken,
  randomEditToken,
  rpc,
  rsvpAccepting,
  rsvpSettings
} from './api.js';

export const RSVP_TOTAL_CAP = 1000;
export const RATE_PER_SOURCE_PER_HOUR = 5;
export const RATE_PER_WEDDING_PER_HOUR = 300;
export const RATE_CHANGES_PER_SOURCE_PER_HOUR = 30;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function assertChangeToken(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw new ApiError('Reply not found.', 404, 'NOT_FOUND');
  return token;
}

// Plain text only: control characters are removed (line breaks are kept in longer text), and surrounding space trimmed.
function cleanText(value, max, { multiline = false } = {}) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') return null;
  const stripped = value.replace(multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, ' ').trim();
  return stripped.length > max ? null : stripped;
}

// Checks a guest's submission against the wedding's settings and events. Returns { value } or { fields }.
export function validateReply(input, { settings, events }) {
  const fields = {};
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const name = cleanText(body.name, 160);
  if (!name) fields.name = 'Please enter your name (up to 160 characters).';
  if (typeof body.attending !== 'boolean') fields.attending = 'Please say whether you will attend.';
  const needs = cleanText(body.needs, 500, { multiline: true });
  if (needs === null) fields.needs = 'Keep this to 500 characters or fewer.';
  const message = cleanText(body.message, 2000, { multiline: true });
  if (message === null) fields.message = 'Keep this to 2000 characters or fewer.';

  const known = new Set(events.map(event => event.id));
  let eventReplies = {};
  if (body.events !== undefined && body.events !== null) {
    if (typeof body.events !== 'object' || Array.isArray(body.events)) fields.events = 'Choose the events you will attend.';
    else {
      for (const [id, answer] of Object.entries(body.events)) {
        if (!known.has(id) || typeof answer !== 'boolean') { fields.events = 'Choose the events you will attend.'; break; }
        eventReplies[id] = answer;
      }
    }
  }
  if (body.attending === true && events.length > 1 && !Object.values(eventReplies).some(Boolean) && !fields.events) {
    fields.events = 'Choose at least one event you will attend.';
  }

  let party = 0;
  if (body.attending === true) {
    if (settings.mode === 'rsvp') party = 1;
    else if (!Number.isInteger(body.party) || body.party < 1 || body.party > settings.maxParty) {
      fields.party = `Enter how many people are coming, from 1 to ${settings.maxParty}.`;
    } else party = body.party;
  } else {
    eventReplies = Object.fromEntries(Object.keys(eventReplies).map(id => [id, false]));
  }
  if (Object.keys(fields).length) return { fields };
  return { value: { guest_name: name, attending: body.attending, party_size: party, event_replies: eventReplies, needs, message } };
}

// What a guest sees of their own reply, and what the couple sees in the list. Never the token hash.
export function publicReply(row) {
  return {
    name: row.guest_name,
    attending: row.attending,
    party: row.party_size,
    events: row.event_replies || {},
    needs: row.needs || '',
    message: row.message || ''
  };
}

export function coupleReply(row) {
  return { id: row.id, ...publicReply(row), createdAt: row.created_at, updatedAt: row.updated_at };
}

export function totalsFor(rows, events) {
  const totals = { replies: rows.length, attending: 0, notAttending: 0, headcount: 0, byEvent: {} };
  for (const event of events) totals.byEvent[event.id] = { title: event.title, replies: 0, headcount: 0 };
  for (const row of rows) {
    if (row.attending) { totals.attending += 1; totals.headcount += row.party_size; } else totals.notAttending += 1;
    for (const [id, yes] of Object.entries(row.event_replies || {})) {
      if (yes && totals.byEvent[id]) { totals.byEvent[id].replies += 1; totals.byEvent[id].headcount += row.attending ? row.party_size : 0; }
    }
  }
  return totals;
}

// The events guests can answer for: visible events that have an id. A single event needs no per-event question.
export function replyEvents(content) {
  const list = content && typeof content === 'object' && Array.isArray(content.functions) ? content.functions : [];
  return list
    .filter(item => item && typeof item === 'object' && item.visible !== false && typeof item.id === 'string' && item.id && typeof item.title === 'string')
    .map(item => ({ id: item.id, title: item.title }));
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Counts one attempt against a per-source and a per-invitation limit. Only hashes are stored; no IP address.
export async function enforceRateLimit(request, env, weddingId, { kind, perSource, perWedding }) {
  const hour = new Date().toISOString().slice(0, 13);
  const source = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const salt = env.RSVP_RATE_SALT || 'invitestudio-rsvp';
  const bySource = await sha256Hex(`${salt}|${kind}|${weddingId}|${source}|${hour}`);
  const hits = await rpc(env, 'rsvp_rate_hit', { p_bucket: `s:${bySource}`, p_window_seconds: 3600 });
  if (hits > perSource) throw new ApiError('Too many replies from this device. Please try again later.', 429, 'RATE_LIMITED');
  if (perWedding) {
    const hitsForWedding = await rpc(env, 'rsvp_rate_hit', { p_bucket: `w:${kind}:${weddingId}:${hour}`, p_window_seconds: 3600 });
    if (hitsForWedding > perWedding) throw new ApiError('This invitation is receiving many replies right now. Please try again later.', 429, 'RATE_LIMITED');
  }
}

export async function loadPublishedWedding(env, slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) throw new ApiError('Invitation not found.', 404, 'NOT_FOUND');
  const rows = await db(env, `weddings?${new URLSearchParams({
    select: 'id,slug,preferences,content',
    slug: `eq.${slug}`, status: 'eq.published', visibility: 'eq.public', limit: '1'
  })}`);
  const wedding = rows?.[0];
  if (!wedding) throw new ApiError('Invitation not found.', 404, 'NOT_FOUND');
  return { wedding, settings: rsvpSettings(wedding.preferences), events: replyEvents(wedding.content) };
}

export function assertAccepting(settings) {
  if (!rsvpAccepting(settings)) throw new ApiError('Replies are closed for this invitation.', 403, 'RSVP_CLOSED');
}

export async function createReply(env, wedding, value) {
  const existing = await db(env, `wedding_rsvps?${new URLSearchParams({ select: 'id', wedding_id: `eq.${wedding.id}`, limit: String(RSVP_TOTAL_CAP) })}`);
  if ((existing || []).length >= RSVP_TOTAL_CAP) throw new ApiError('This invitation cannot take more replies.', 403, 'RSVP_FULL');
  const token = randomEditToken();
  const rows = await db(env, 'wedding_rsvps', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...value, wedding_id: wedding.id, change_token_hash: await hashEditToken(token) })
  });
  return { row: rows?.[0], token };
}

export async function findReplyByToken(env, weddingId, token) {
  const rows = await db(env, `wedding_rsvps?${new URLSearchParams({
    select: '*', wedding_id: `eq.${weddingId}`, change_token_hash: `eq.${await hashEditToken(token)}`, limit: '1'
  })}`);
  if (!rows?.[0]) throw new ApiError('Reply not found.', 404, 'NOT_FOUND');
  return rows[0];
}

export async function updateReply(env, row, value) {
  const rows = await db(env, `wedding_rsvps?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...value, updated_at: new Date().toISOString() })
  });
  return rows?.[0];
}
