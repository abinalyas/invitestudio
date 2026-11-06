import { isLaunchTemplate } from './templates.js';

const encoder = new TextEncoder();

export class ApiError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR', fields = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function requestId() {
  return crypto.randomUUID();
}

function corsHeaders(request, env) {
  const configuredOrigin = env.ALLOWED_ORIGIN?.trim();
  const origin = configuredOrigin || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-edit-token',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

export function noContent(request, env) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request, env), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

export function optionsResponse(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export function json(request, env, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json; charset=utf-8',
      // Responses can carry edit access or private draft data: never cache them,
      // never sniff them, and never leak the page URL in a Referer header.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...extraHeaders
    }
  });
}

export function success(request, env, data, status = 200) {
  return json(request, env, data, status);
}

export function fail(request, env, error) {
  const isExpected = error instanceof ApiError;
  const status = isExpected ? error.status : 500;
  const body = {
    error: {
      code: isExpected ? error.code : 'INTERNAL_ERROR',
      message: isExpected ? error.message : 'Something went wrong. Please try again.',
      requestId: requestId()
    }
  };
  if (isExpected && error.fields) body.error.fields = error.fields;
  if (!isExpected) console.error('InviteStudio API failure', error);
  return json(request, env, body, status);
}

export function requireSupabase(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ApiError('Backend is not configured.', 503, 'BACKEND_NOT_CONFIGURED');
  }
  return {
    url: env.SUPABASE_URL.replace(/\/$/, ''),
    key: env.SUPABASE_SERVICE_ROLE_KEY
  };
}

export async function db(env, path, options = {}) {
  const supabase = requireSupabase(env);
  const response = await fetch(`${supabase.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabase.key,
      Authorization: `Bearer ${supabase.key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    console.error('InviteStudio database request failed', response.status);
    const error = new ApiError('Database operation failed.', 502, 'DATABASE_ERROR');
    // PostgREST error code (for example 23505, unique violation). Used to map known conflicts.
    error.databaseCode = data && typeof data === 'object' ? data.code : undefined;
    throw error;
  }
  return data;
}

// Calls a Supabase RPC with the service key, as db() does. On failure it keeps PostgREST's SQLSTATE (databaseCode)
// and message (databaseMessage) so the caller can map a known database refusal to an API response.
export async function rpc(env, name, args) {
  const supabase = requireSupabase(env);
  const response = await fetch(`${supabase.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: supabase.key,
      Authorization: `Bearer ${supabase.key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    console.error('InviteStudio database RPC failed', name, response.status);
    const error = new ApiError('Database operation failed.', 502, 'DATABASE_ERROR');
    error.databaseCode = data && typeof data === 'object' ? data.code : undefined;
    error.databaseMessage = data && typeof data === 'object' ? String(data.message || '') : '';
    throw error;
  }
  return data;
}

// Maps a publish_wedding_slug refusal to the API response. The database is the authority for slugs; the
// messages are the RPC's own refusal names, and 23505 is the transition trigger's ownership refusal.
// Anything else is returned unchanged (a 502 DATABASE_ERROR from rpc()).
export const SLUG_CHANGE_LIMIT = 10;

export function publishErrorFrom(error) {
  if (!(error instanceof ApiError) || error.code !== 'DATABASE_ERROR') return error;
  const message = error.databaseMessage || '';
  if (message.includes('VALIDATION_ERROR')) {
    return new ApiError('Choose a URL slug using lowercase letters, numbers and hyphens.', 422, 'VALIDATION_ERROR', {
      slug: 'Invalid slug format.'
    });
  }
  if (message.includes('PUBLISH_CONFLICT')) {
    return new ApiError('That slug may already be in use or the draft changed. Reload and try again.', 409, 'PUBLISH_CONFLICT');
  }
  if (message.includes('SLUG_CONFLICT') || error.databaseCode === '23505') {
    return new ApiError('That public URL is already in use.', 409, 'SLUG_CONFLICT', { slug: 'Choose another slug.' });
  }
  if (message.includes('SLUG_CHANGE_CONFIRMATION_REQUIRED')) {
    return new ApiError('Changing a live web address stops the old link working. Confirm the change to continue.', 409, 'SLUG_CHANGE_CONFIRMATION_REQUIRED', {
      slug: 'Confirm that the old address will stop working.'
    });
  }
  if (message.includes('SLUG_CHANGE_LIMIT_REACHED')) {
    return new ApiError(`This website has used all ${SLUG_CHANGE_LIMIT} web address changes.`, 422, 'SLUG_CHANGE_LIMIT_REACHED', {
      slug: 'The web address cannot be changed again.'
    });
  }
  return error;
}

export async function readJson(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 1024 * 1024) {
    throw new ApiError('Request body is too large.', 413, 'PAYLOAD_TOO_LARGE');
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('object expected');
    }
    return body;
  } catch {
    throw new ApiError('Request body must be valid JSON.', 400, 'INVALID_JSON');
  }
}

function stringField(input, key, max, fields) {
  if (input[key] === undefined) return undefined;
  if (typeof input[key] !== 'string' || input[key].length > max) {
    fields[key] = `Must be text of at most ${max} characters.`;
    return undefined;
  }
  return input[key].trim();
}

// Upper bounds for JSON fields, in bytes of their JSON text. A field over its limit is
// refused with 422 (not a generic 413), so the client can explain what to change.
const JSON_FIELD_LIMITS = Object.freeze({
  theme: 8 * 1024,
  preferences: 16 * 1024,
  culturalPreferences: 8 * 1024,
  content: 256 * 1024,
  sections: 32 * 1024,
  introSettings: 16 * 1024,
  animationSettings: 8 * 1024
});

// Media is not stored in invitation JSON. Any data: URL is refused, wherever it is nested.
function containsDataUrl(value) {
  if (typeof value === 'string') return /^data:/i.test(value.trim());
  if (Array.isArray(value)) return value.some(containsDataUrl);
  if (value && typeof value === 'object') return Object.values(value).some(containsDataUrl);
  return false;
}

function jsonField(input, key, fields) {
  if (input[key] === undefined) return undefined;
  if (typeof input[key] !== 'object' || input[key] === null) {
    fields[key] = 'Must be a JSON object or array.';
    return undefined;
  }
  if (containsDataUrl(input[key])) {
    fields[key] = 'Images and audio cannot be saved in an invitation yet. Remove them and try again.';
    return undefined;
  }
  const size = new TextEncoder().encode(JSON.stringify(input[key])).length;
  const limit = JSON_FIELD_LIMITS[key];
  if (limit && size > limit) {
    fields[key] = `This section is too large to save (${Math.ceil(size / 1024)} KB; the limit is ${Math.floor(limit / 1024)} KB).`;
    return undefined;
  }
  return input[key];
}

const allowedFields = new Set([
  'name', 'category', 'templateId', 'title', 'date', 'eventDate', 'location',
  'message', 'story', 'hosts', 'locale', 'theme', 'preferences',
  'culturalPreferences', 'content', 'sections', 'introSettings',
  'animationSettings', 'functions', 'gallery'
]);

function validDate(value) {
  return value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function validTime(value) {
  return value === '' || (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value));
}

function validateFunctions(value, fields) {
  if (!Array.isArray(value) || value.length > 50) {
    fields.functions = 'Use an array with no more than 50 events.';
    return [];
  }
  return value.map((event, index) => {
    const prefix = `functions[${index}]`;
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      fields[prefix] = 'Each event must be an object.';
      return null;
    }
    const text = (key, max, required = false) => {
      if ((event[key] === undefined || event[key] === null) && !required) return '';
      if (typeof event[key] !== 'string' || event[key].length > max || (required && !event[key].trim())) {
        fields[`${prefix}.${key}`] = `Must be text${required ? ' and is required' : ''} of at most ${max} characters.`;
        return '';
      }
      return event[key].trim();
    };
    const date = event.date || '';
    const time = event.time || '';
    const endTime = event.endTime || '';
    if (!validDate(date)) fields[`${prefix}.date`] = 'Must use YYYY-MM-DD format.';
    if (!validTime(time)) fields[`${prefix}.time`] = 'Must use HH:MM format.';
    if (!validTime(endTime)) fields[`${prefix}.endTime`] = 'Must use HH:MM format.';
    if (time && endTime && endTime < time) fields[`${prefix}.endTime`] = 'Must be after the start time.';
    if (event.directionsUrl && !/^https?:\/\//i.test(event.directionsUrl)) {
      fields[`${prefix}.directionsUrl`] = 'Must be an http(s) URL.';
    }
    return {
      id: typeof event.id === 'string' && event.id.length <= 80 ? event.id : undefined,
      title: text('title', 180, true),
      date: validDate(date) ? date : '',
      time: validTime(time) ? time : '',
      endTime: validTime(endTime) ? endTime : '',
      venue: text('venue', 500),
      description: text('description', 4000),
      dressCode: text('dressCode', 180),
      directionsUrl: text('directionsUrl', 2000),
      parking: text('parking', 4000),
      accommodation: text('accommodation', 4000),
      accessibility: text('accessibility', 4000),
      visible: event.visible !== false
    };
  }).filter(Boolean);
}

function validateGallery(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fields.gallery = 'Gallery settings must be an object.';
    return {};
  }
  const photos = Array.isArray(value.photos) ? value.photos : [];
  if (photos.length > 4) fields.gallery = 'A gallery can contain no more than 4 photos.';
  return {
    preference: typeof value.preference === 'string' ? value.preference.slice(0, 40) : '',
    photos: photos.slice(0, 4).map((photo, index) => {
      if (!photo || typeof photo !== 'object') {
        fields[`gallery.photos[${index}]`] = 'Photo metadata must be an object.';
        return null;
      }
      return {
        alt: typeof photo.alt === 'string' ? photo.alt.trim().slice(0, 500) : '',
        storagePath: typeof photo.storagePath === 'string' ? photo.storagePath.slice(0, 500) : null,
        width: Number.isInteger(photo.width) && photo.width > 0 ? photo.width : null,
        height: Number.isInteger(photo.height) && photo.height > 0 ? photo.height : null
      };
    }).filter(Boolean)
  };
}

export function validateWeddingInput(input, { create = false } = {}) {
  const fields = {};
  const unknown = Object.keys(input).filter(key => key !== 'version' && !allowedFields.has(key));
  if (unknown.length) fields._ = `Unsupported field(s): ${unknown.join(', ')}.`;

  const output = {};
  const mappings = [
    ['name', 'name', 180],
    ['category', 'category', 120],
    ['templateId', 'template_id', 120],
    ['title', 'title', 180],
    ['location', 'location', 500],
    ['message', 'message', 4000],
    ['story', 'story', 10000],
    ['hosts', 'hosts', 1000],
    ['locale', 'locale', 80]
  ];
  for (const [source, target, max] of mappings) {
    const value = stringField(input, source, max, fields);
    if (value !== undefined) output[target] = value;
  }

  // Only explicitly registered designs can be chosen. Unknown or unlisted IDs are refused,
  // never drawn with a fallback design.
  if (output.template_id !== undefined && !isLaunchTemplate(output.template_id)) {
    fields.templateId = 'Choose an available design.';
  }

  for (const key of ['name', 'title', 'templateId']) {
    const value = input[key];
    if (typeof value === 'string' && !value.trim()) {
      fields[key] = 'Cannot be empty.';
    }
  }

  const date = input.date ?? input.eventDate;
  if (date !== undefined) {
    if (date === null || date === '') {
      output.event_date = null;
    } else if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      fields.date = 'Must use YYYY-MM-DD format.';
    } else {
      output.event_date = date;
    }
  }

  for (const [source, target] of [
    ['theme', 'theme'],
    ['preferences', 'preferences'],
    ['culturalPreferences', 'cultural_preferences'],
    ['content', 'content'],
    ['sections', 'sections'],
    ['introSettings', 'intro_settings'],
    ['animationSettings', 'animation_settings']
  ]) {
    const value = jsonField(input, source, fields);
    if (value !== undefined) output[target] = value;
  }

  const content = output.content && typeof output.content === 'object' && !Array.isArray(output.content)
    ? { ...output.content }
    : {};
  if (input.functions !== undefined) content.functions = validateFunctions(input.functions, fields);
  if (input.gallery !== undefined) content.gallery = validateGallery(input.gallery, fields);
  if (input.functions !== undefined || input.gallery !== undefined) output.content = content;

  if (create) {
    if (!output.template_id) fields.templateId = 'A template is required.';
    if (!output.title) fields.title = 'A title is required.';
  }
  if (Object.keys(fields).length) {
    throw new ApiError('Please correct the highlighted fields.', 422, 'VALIDATION_ERROR', fields);
  }
  return output;
}

export function editTokenFromRequest(request) {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer || request.headers.get('X-Edit-Token');
  if (!token || token.length < 32 || token.length > 256) {
    throw new ApiError('An edit token is required.', 401, 'EDIT_TOKEN_REQUIRED');
  }
  return token;
}

function validateEditTokenValue(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) {
    throw new ApiError('An edit token is required.', 401, 'EDIT_TOKEN_REQUIRED');
  }
  return token;
}

export function randomEditToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashEditToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function requireEditToken(env, token, weddingId = undefined) {
  validateEditTokenValue(token);
  const tokenHash = await hashEditToken(token);
  const query = new URLSearchParams({
    select: 'id,wedding_id,purpose,expires_at,revoked_at',
    token_hash: `eq.${tokenHash}`,
    purpose: 'eq.edit',
    revoked_at: 'is.null',
    limit: '1'
  });
  if (weddingId) query.set('wedding_id', `eq.${weddingId}`);
  const rows = await db(env, `edit_tokens?${query}`);
  const record = rows?.[0];
  if (!record || new Date(record.expires_at).getTime() <= Date.now()) {
    throw new ApiError('This edit token is invalid or expired.', 403, 'EDIT_TOKEN_INVALID');
  }
  await db(env, `edit_tokens?id=eq.${record.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_used_at: new Date().toISOString() })
  });
  return record;
}

export async function requireEditAccess(request, env, weddingId) {
  const record = await requireEditToken(env, editTokenFromRequest(request), weddingId);
  if (String(record.wedding_id).toLowerCase() !== String(weddingId).toLowerCase()) {
    throw new ApiError('This edit token is invalid or expired.', 403, 'EDIT_TOKEN_INVALID');
  }
  return record;
}

// Edit links last 90 days from issue. Changing this changes every new link.
export const EDIT_TOKEN_LIFETIME_DAYS = 90;
const EDIT_TOKEN_LIFETIME_MS = EDIT_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

export async function issueEditToken(env, weddingId, metadata = {}) {
  const editToken = randomEditToken();
  const tokenHash = await hashEditToken(editToken);
  const expiresAt = new Date(Date.now() + EDIT_TOKEN_LIFETIME_MS).toISOString();
  await db(env, 'edit_tokens', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      wedding_id: weddingId,
      token_hash: tokenHash,
      token_hint: `${editToken.slice(0, 6)}…`,
      purpose: 'edit',
      expires_at: expiresAt,
      metadata
    })
  });
  return { editToken, editTokenExpiresAt: expiresAt, tokenHash };
}

export async function revokeEditTokens(env, weddingId, keepHash = '') {
  const query = new URLSearchParams({
    select: 'id,token_hash',
    wedding_id: `eq.${weddingId}`,
    purpose: 'eq.edit',
    revoked_at: 'is.null'
  });
  if (keepHash) query.set('token_hash', `not.eq.${keepHash}`);
  const rows = await db(env, `edit_tokens?${query}`);
  await Promise.all((rows || []).map(row => db(env, `edit_tokens?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ revoked_at: new Date().toISOString() })
  })));
  return rows?.length || 0;
}

export async function getWedding(env, id) {
  const query = new URLSearchParams({ select: '*', id: `eq.${id}`, limit: '1' });
  const rows = await db(env, `weddings?${query}`);
  if (!rows?.[0]) throw new ApiError('Wedding draft not found.', 404, 'NOT_FOUND');
  return rows[0];
}

// content.functions is the single event source (see docs/PHASE_0_INTEGRATION_PLAN.md).
// The wedding_events table is retained but intentionally not read or written.
export async function getWeddingChildren(env, id) {
  const photos = await db(env, `wedding_photos?${new URLSearchParams({
    select: 'id,storage_path,alt,width,height,sort_order,metadata',
    wedding_id: `eq.${id}`,
    order: 'sort_order.asc,created_at.asc'
  })}`);
  return { photos: photos || [] };
}

const PUBLIC_FUNCTION_FIELDS = [
  'id', 'title', 'date', 'time', 'endTime', 'venue', 'description', 'dressCode',
  'directionsUrl', 'parking', 'accommodation', 'accessibility'
];

// Allowlist: hidden events and any unexpected keys are dropped; nothing private
// (owner, tokens, storage paths, drafts) can reach a public response.
function publicFunctions(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(item => item && typeof item === 'object' && item.visible !== false)
    .map(item => Object.fromEntries(
      PUBLIC_FUNCTION_FIELDS.filter(key => item[key] !== undefined).map(key => [key, item[key]])
    ));
}

function publicSection(section) {
  const visible = section.visible !== false;
  const out = {
    id: typeof section.id === 'string' ? section.id.slice(0, 80) : '',
    title: typeof section.title === 'string' ? section.title.slice(0, 180) : undefined,
    visible
  };
  if (visible && typeof section.content === 'string') out.content = section.content.slice(0, 10000);
  return out;
}

function publicGallery(gallery) {
  const photos = Array.isArray(gallery?.photos) ? gallery.photos : [];
  return {
    preference: typeof gallery?.preference === 'string' ? gallery.preference : '',
    photos: photos.map(photo => ({
      alt: typeof photo?.alt === 'string' ? photo.alt : '',
      width: Number.isInteger(photo?.width) ? photo.width : null,
      height: Number.isInteger(photo?.height) ? photo.height : null
    }))
  };
}

// Paths and words that a public invitation must never take, so that /s/, /api/ and
// future app routes cannot be shadowed by a couple's slug. Mirrored in the browser
// for early feedback; the server list is authoritative.
export const RESERVED_SLUGS = Object.freeze(new Set([
  'api', 'admin', 'edit', 's', 'w', 'assets', 'static', 'public', 'login',
  'signup', 'dashboard', 'templates', 'pricing', 'privacy', 'terms',
  'support', 'help', 'www', 'mail', 'root', 'null', 'undefined'
]));

export function publicWeddingProjection(wedding) {
  const intro = wedding.intro_settings && typeof wedding.intro_settings === 'object'
    ? wedding.intro_settings
    : {};
  const animation = wedding.animation_settings && typeof wedding.animation_settings === 'object'
    ? wedding.animation_settings
    : {};
  const content = wedding.content && typeof wedding.content === 'object' ? wedding.content : {};
  // Every section is returned with its visibility, so hidden sections stay hidden
  // when the public page falls back to defaults. Hidden content is removed.
  const sections = Array.isArray(wedding.sections)
    ? wedding.sections.filter(section => section && typeof section === 'object').map(publicSection)
    : [];
  return {
    slug: wedding.slug,
    template_id: wedding.template_id,
    name: wedding.name,
    category: wedding.category,
    title: wedding.title,
    event_date: wedding.event_date,
    location: wedding.location,
    message: wedding.message,
    story: wedding.story,
    hosts: wedding.hosts,
    locale: wedding.locale,
    theme: wedding.theme,
    content: {
      functions: publicFunctions(content.functions),
      gallery: publicGallery(content.gallery)
    },
    sections,
    intro_settings: {
      enabled: intro.enabled,
      style: intro.style,
      transition: intro.transition,
      duration: intro.duration,
      short: intro.short,
      showDate: intro.showDate
    },
    animation_settings: {
      enabled: animation.enabled,
      effect: animation.effect,
      speed: animation.speed
    },
    published_at: wedding.published_at
  };
}

// Optional client-generated key that makes draft creation safe to retry. The raw
// key is never stored; only its SHA-256 hash is kept in the creation token's
// metadata (see docs/PHASE_0_INTEGRATION_PLAN.md, D7).
export const CREATE_REPLAY_WINDOW_MS = 1000 * 60 * 60 * 24;

export function idempotencyKeyFromRequest(request) {
  const key = request.headers.get('Idempotency-Key');
  if (key === null) return null;
  if (!/^[A-Za-z0-9-]{16,128}$/.test(key)) {
    throw new ApiError('Invalid Idempotency-Key header.', 400, 'INVALID_IDEMPOTENCY_KEY');
  }
  return key;
}

// Looks up a previous creation made with the same key. The filter is built by hand
// because URLSearchParams would percent-encode the JSON path operator.
export async function findCreateReplay(env, keyHash) {
  const rows = await db(env, `edit_tokens?select=wedding_id,created_at&metadata->>createRequestHash=eq.${keyHash}&order=created_at.desc&limit=1`);
  return rows?.[0] || null;
}

export function assertUuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError('Invalid wedding ID.', 400, 'INVALID_ID');
  }
}

// ---- Public web addresses (slugs) -----------------------------------------------------

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// One limit for every address: the editor, the server and the availability checks.
export const SLUG_MAX_LENGTH = 60;

export function normaliseSlug(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Returns a user-facing reason, or null when the format is acceptable.
export function slugFormatProblem(slug) {
  if (!slug) return 'Choose a web address for your invitation.';
  if (slug.length > SLUG_MAX_LENGTH) return `Keep the web address to ${SLUG_MAX_LENGTH} characters or fewer.`;
  if (!SLUG_PATTERN.test(slug)) return 'Use lowercase letters, numbers and single hyphens only.';
  if (RESERVED_SLUGS.has(slug)) return 'That web address is reserved. Choose another.';
  return null;
}

// True when another wedding is LIVE on the slug. The draft being edited is excluded.
export async function slugLiveElsewhere(env, weddingId, slug) {
  const query = new URLSearchParams({ select: 'id', slug: `eq.${slug}`, limit: '1' });
  if (weddingId) query.set('id', `neq.${weddingId}`);
  const rows = await db(env, `weddings?${query}`);
  return Boolean(rows?.length);
}

// True when the slug is reserved to another wedding, or to nobody (a deleted wedding's address).
// A reservation owned by this wedding is its own history and is not taken.
export async function slugReservedElsewhere(env, weddingId, slug) {
  const query = new URLSearchParams({ select: 'wedding_id', slug: `eq.${slug}`, limit: '1' });
  const rows = await db(env, `slug_reservations?${query}`);
  const row = rows?.[0];
  if (!row) return false;
  return row.wedding_id !== (weddingId || null);
}

export async function slugTaken(env, weddingId, slug) {
  return (await slugLiveElsewhere(env, weddingId, slug)) || (await slugReservedElsewhere(env, weddingId, slug));
}

// Availability for the couple's typed address, plus up to three free alternatives.
export async function slugAvailability(env, weddingId, slug) {
  const problem = slugFormatProblem(slug);
  if (problem) return { slug, available: false, reason: 'invalid', retired: false, message: problem, suggestions: [] };
  const live = await slugLiveElsewhere(env, weddingId, slug);
  const reserved = !live && (await slugReservedElsewhere(env, weddingId, slug));
  if (!live && !reserved) {
    return { slug, available: true, reason: null, retired: false, message: 'This web address is available.', suggestions: [] };
  }
  const suggestions = [];
  for (let n = 2; n <= 8 && suggestions.length < 3; n += 1) {
    const candidate = `${slug}-${n}`.slice(0, SLUG_MAX_LENGTH);
    if (candidate.length <= SLUG_MAX_LENGTH && !slugFormatProblem(candidate) && !(await slugTaken(env, weddingId, candidate))) {
      suggestions.push(candidate);
    }
  }
  if (live) {
    return { slug, available: false, reason: 'taken', retired: false, message: 'That web address is already in use.', suggestions };
  }
  return {
    slug, available: false, reason: 'retired', retired: true,
    message: 'This web address was used by another website and cannot be reused.', suggestions
  };
}
