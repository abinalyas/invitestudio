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

export function optionsResponse(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export function json(request, env, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json; charset=utf-8',
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
    throw new ApiError('Database operation failed.', 502, 'DATABASE_ERROR');
  }
  return data;
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

export function validateEmailAddress(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError('Enter a valid email address.', 422, 'VALIDATION_ERROR', {
      email: 'Enter a valid email address.'
    });
  }
  return email;
}

export function maskEmailAddress(email) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'your email address';
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function publicOrigin(request, env) {
  const configured = env.INVITESTUDIO_PUBLIC_ORIGIN?.trim() || env.ALLOWED_ORIGIN?.trim();
  if (configured && configured !== '*') return configured.replace(/\/$/, '');
  return new URL(request.url).origin;
}

function emailHtmlEscape(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

export async function sendPrivateEditEmail(request, env, { to, title, token }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new ApiError('Email delivery is not configured yet.', 503, 'EMAIL_NOT_CONFIGURED');
  }
  const link = `${publicOrigin(request, env)}/edit/${encodeURIComponent(token)}`;
  const safeTitle = emailHtmlEscape(title || 'your invitation');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject: 'Your private InviteStudio editing link',
      text: `Open your private InviteStudio editing link for ${title || 'your invitation'}:\n\n${link}\n\nKeep this link private. It works until it expires or is revoked.`,
      html: `<p>Here is your private InviteStudio editing link for <strong>${safeTitle}</strong>:</p><p><a href="${link}">Continue editing your invitation</a></p><p>This link works until it expires or is revoked. Keep it private.</p>`
    })
  });
  if (!response.ok) {
    throw new ApiError('The email could not be sent. Your draft is still safe.', 502, 'EMAIL_DELIVERY_FAILED');
  }
  return link;
}

function stringField(input, key, max, fields) {
  if (input[key] === undefined) return undefined;
  if (typeof input[key] !== 'string' || input[key].length > max) {
    fields[key] = `Must be text of at most ${max} characters.`;
    return undefined;
  }
  return input[key].trim();
}

function jsonField(input, key, fields) {
  if (input[key] === undefined) return undefined;
  if (typeof input[key] !== 'object' || input[key] === null) {
    fields[key] = 'Must be a JSON object or array.';
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
  return requireEditToken(env, editTokenFromRequest(request), weddingId);
}

export async function issueEditToken(env, weddingId) {
  const editToken = randomEditToken();
  const tokenHash = await hashEditToken(editToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();
  await db(env, 'edit_tokens', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      wedding_id: weddingId,
      token_hash: tokenHash,
      token_hint: `${editToken.slice(0, 6)}…`,
      purpose: 'edit',
      expires_at: expiresAt
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

export async function revokeEditTokenHash(env, tokenHash) {
  await db(env, `edit_tokens?token_hash=eq.${tokenHash}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ revoked_at: new Date().toISOString() })
  });
}

export async function getWedding(env, id) {
  const query = new URLSearchParams({ select: '*', id: `eq.${id}`, limit: '1' });
  const rows = await db(env, `weddings?${query}`);
  if (!rows?.[0]) throw new ApiError('Wedding draft not found.', 404, 'NOT_FOUND');
  return rows[0];
}

export async function getWeddingChildren(env, id) {
  const [events, photos] = await Promise.all([
    db(env, `wedding_events?${new URLSearchParams({
      select: 'id,title,event_date,start_time,end_time,venue,description,dress_code,directions_url,parking,accommodation,accessibility,visible,sort_order,metadata',
      wedding_id: `eq.${id}`,
      order: 'sort_order.asc,event_date.asc,start_time.asc'
    })}`),
    db(env, `wedding_photos?${new URLSearchParams({
      select: 'id,storage_path,alt,width,height,sort_order,metadata',
      wedding_id: `eq.${id}`,
      order: 'sort_order.asc,created_at.asc'
    })}`)
  ]);
  return { events: events || [], photos: photos || [] };
}

export function publicWeddingProjection(wedding) {
  const intro = wedding.intro_settings && typeof wedding.intro_settings === 'object'
    ? wedding.intro_settings
    : {};
  const animation = wedding.animation_settings && typeof wedding.animation_settings === 'object'
    ? wedding.animation_settings
    : {};
  return {
    id: wedding.id,
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
    content: wedding.content,
    sections: wedding.sections,
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

export function assertUuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError('Invalid wedding ID.', 400, 'INVALID_ID');
  }
}
