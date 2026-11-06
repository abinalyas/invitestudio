// Test-only PostgREST-compatible HTTP shim for /rest/v1. It implements the query
// subset the Pages Functions use (eq, neq, is.null, not.eq, ->> JSON filters,
// order, limit, select lists, and Prefer: return=representation|minimal) against a
// real Postgres. It runs with service-role privileges, as the functions do.
// Production uses real PostgREST via Supabase; this is only a stand-in for tests.
import http from 'node:http';
import pg from 'pg';

const IDENT = /^[a-z_][a-z0-9_]*$/;
// The JSON key is restricted to plain word characters because it is inlined as a literal.
const JSON_PATH = /^([a-z_][a-z0-9_]*)->>([A-Za-z_][A-Za-z0-9_]*)$/;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
}

function ident(name) {
  if (!IDENT.test(name)) throw new HttpError(400, 'PGRST100', `invalid identifier ${name}`);
  return `"${name}"`;
}

function columnRef(key) {
  const path = key.match(JSON_PATH);
  if (path) return `(${ident(path[1])}->>'${path[2]}')`;
  return ident(key);
}

function buildWhere(searchParams, values) {
  const clauses = [];
  for (const [key, raw] of searchParams.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    const column = columnRef(key);
    const dot = raw.indexOf('.');
    if (dot < 0) throw new HttpError(400, 'PGRST100', `filter ${key} needs an operator`);
    let op = raw.slice(0, dot);
    let value = raw.slice(dot + 1);
    let negate = false;
    if (op === 'not') {
      negate = true;
      const next = value.indexOf('.');
      op = value.slice(0, next);
      value = value.slice(next + 1);
    }
    if (op === 'is') {
      if (value !== 'null') throw new HttpError(400, 'PGRST100', 'only is.null is supported');
      clauses.push(`${column} is ${negate ? 'not ' : ''}null`);
      continue;
    }
    if (op !== 'eq' && op !== 'neq') throw new HttpError(400, 'PGRST100', `operator ${op} is not supported`);
    const equal = (op === 'eq') !== negate;
    values.push(value);
    clauses.push(`${column} ${equal ? '=' : '<>'} $${values.length}`);
  }
  return clauses.length ? `where ${clauses.join(' and ')}` : '';
}

function buildOrder(order) {
  if (!order) return '';
  const parts = order.split(',').map(part => {
    const [col, dir = 'asc'] = part.split('.');
    if (!['asc', 'desc'].includes(dir)) throw new HttpError(400, 'PGRST100', 'bad order direction');
    return `${ident(col)} ${dir}`;
  });
  return `order by ${parts.join(', ')}`;
}

function buildSelect(select) {
  if (!select || select === '*') return '*';
  return select.split(',').map(col => ident(col.trim())).join(', ');
}

// Objects and arrays are sent as JSON text so they are not turned into Postgres arrays.
function coerce(value) {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
}

function pgError(error) {
  if (error instanceof HttpError) return error;
  if (error.code === '23505' || error.code === '23503') return new HttpError(409, error.code, error.message);
  if (error.code && /^(22|23|42)/.test(error.code)) return new HttpError(400, error.code, error.message);
  return new HttpError(500, error.code || 'XX000', error.message);
}

// PostgREST-style RPC: POST /rest/v1/rpc/<name> with a JSON object of named arguments. Raised refusals (P0001)
// become 400 and unique violations 409, as PostgREST reports them.
function rpcError(error) {
  if (error.code === '23505') return new HttpError(409, error.code, error.message);
  if (error.code && /^(P0001|22|23|42)/.test(error.code)) return new HttpError(400, error.code, error.message);
  return new HttpError(500, error.code || 'XX000', error.message);
}

export async function startRestShim({ url, port }) {
  const pool = new pg.Pool({ connectionString: url, max: 5 });

  async function handleRpc(req, res, name) {
    if (req.method !== 'POST') throw new HttpError(405, 'PGRST000', 'rpc requires POST');
    const fn = ident(name);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    const args = text ? JSON.parse(text) : {};
    const names = Object.keys(args);
    if (!names.every(key => IDENT.test(key))) throw new HttpError(400, 'PGRST100', 'invalid argument name');
    const values = names.map(key => coerce(args[key]));
    const call = names.map((key, index) => `${key} := $${index + 1}`).join(', ');
    const sql = `select coalesce(json_agg(t), '[]'::json) as data from (select * from public.${fn}(${call})) t`;
    let result;
    try {
      result = await pool.query(sql, values);
    } catch (error) {
      throw rpcError(error);
    }
    return sendJson(res, 200, result.rows[0]?.data ?? []);
  }

  async function handle(req, res) {
    const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    const rpcMatch = reqUrl.pathname.match(/^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/);
    if (rpcMatch) return handleRpc(req, res, rpcMatch[1]);
    const match = reqUrl.pathname.match(/^\/rest\/v1\/([a-z_][a-z0-9_]*)$/);
    if (!match) throw new HttpError(404, 'PGRST125', 'unknown resource');
    const table = ident(match[1]);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const representation = String(req.headers.prefer || '').includes('return=representation');
    const values = [];

    let sql;
    if (req.method === 'GET') {
      const where = buildWhere(reqUrl.searchParams, values);
      const limit = reqUrl.searchParams.get('limit');
      const limitSql = limit ? `limit ${Number(limit) | 0}` : '';
      sql = `select coalesce(json_agg(t), '[]'::json) as data from (select ${buildSelect(reqUrl.searchParams.get('select'))} from ${table} ${where} ${buildOrder(reqUrl.searchParams.get('order'))} ${limitSql}) t`;
    } else if (req.method === 'POST') {
      const body = rawBody ? JSON.parse(rawBody) : {};
      const rows = Array.isArray(body) ? body : [body];
      const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
      const columnSql = columns.map(ident).join(', ');
      const tuples = rows.map(row => `(${columns.map(col => {
        values.push(coerce(row[col] ?? null));
        return `$${values.length}`;
      }).join(', ')})`);
      sql = `with r as (insert into ${table} (${columnSql}) values ${tuples.join(', ')} returning *) select coalesce(json_agg(r), '[]'::json) as data from r`;
    } else if (req.method === 'PATCH' || req.method === 'DELETE') {
      const where = buildWhere(reqUrl.searchParams, values);
      if (!where) throw new HttpError(400, 'PGRST102', 'mutations require a filter');
      if (req.method === 'PATCH') {
        const body = rawBody ? JSON.parse(rawBody) : {};
        const columns = Object.keys(body);
        if (!columns.length) throw new HttpError(400, 'PGRST102', 'empty patch');
        const sets = columns.map(col => {
          values.push(coerce(body[col]));
          return `${ident(col)} = $${values.length}`;
        });
        sql = `with r as (update ${table} set ${sets.join(', ')} ${where} returning *) select coalesce(json_agg(r), '[]'::json) as data from r`;
      } else {
        sql = `with r as (delete from ${table} ${where} returning *) select coalesce(json_agg(r), '[]'::json) as data from r`;
      }
    } else {
      throw new HttpError(405, 'PGRST000', 'method not allowed');
    }

    let result;
    try {
      result = await pool.query(sql, values);
    } catch (error) {
      throw pgError(error);
    }
    const data = result.rows[0]?.data ?? [];
    if (req.method === 'GET') return sendJson(res, 200, data);
    const status = req.method === 'POST' ? 201 : 200;
    if (representation) return sendJson(res, status, data);
    res.writeHead(status === 200 ? 204 : 201);
    res.end();
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => {
      const e = pgError(error);
      if (!res.headersSent) sendJson(res, e.status, { code: e.code, message: e.message });
    });
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return {
    server,
    async close() {
      await new Promise(resolve => server.close(resolve));
      await pool.end();
    }
  };
}
