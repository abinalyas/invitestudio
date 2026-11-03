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
  'animationSettings'
]);

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
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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

export async function requireEditAccess(request, env, weddingId) {
  const token = editTokenFromRequest(request);
  const tokenHash = await hashEditToken(token);
  const query = new URLSearchParams({
    select: 'id,wedding_id,purpose,expires_at,revoked_at',
    token_hash: `eq.${tokenHash}`,
    wedding_id: `eq.${weddingId}`,
    purpose: 'eq.edit',
    revoked_at: 'is.null',
    limit: '1'
  });
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
