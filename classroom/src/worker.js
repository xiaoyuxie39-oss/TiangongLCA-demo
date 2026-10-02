import { catalog } from './catalog.js';

const phases = new Set(['open', 'locked', 'revealed', 'closed']);
const nextPhases = { open: ['locked'], locked: ['open', 'revealed'], revealed: ['open', 'closed'], closed: [] };
const gacOptions = new Set(['missing-upstream', 'missing-factor', 'truly-zero', 'unsure']);
const cutoffOptions = new Set(['diesel_machinery', 'microorganism', 'other', 'unsure']);
const providerIds = new Set(catalog.providers.map(p => p.uuid));
class InputError extends Error {}
const now = () => new Date().toISOString();
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
const fail = (status, message) => json({ error: message }, status);
const one = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const all = (db, sql, ...args) => db.prepare(sql).bind(...args).all().then(result => result.results);
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
const cleanCode = value => String(value || '').trim().toUpperCase();
const cleanLabel = value => String(value || '').trim().replace(/\s+/g, ' ');
const cookieValue = (request, key) => (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${key}=`))?.slice(key.length + 1);
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function digest(value) {
  return encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
async function signature(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return encode(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function isAdmin(request, env) {
  if (!env.ADMIN_SIGNING_SECRET || env.ADMIN_SIGNING_SECRET.length < 32) return false;
  const [expiry, sig] = (cookieValue(request, 'classroom_admin') || '').split('.');
  if (!expiry || !sig || !/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false;
  return equal(sig, await signature(env.ADMIN_SIGNING_SECRET, expiry));
}
function adminCookie(value, request, maxAge = 43200) {
  const secure = new URL(request.url).hostname === 'localhost' ? '' : '; Secure';
  return `classroom_admin=${value}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}${secure}`;
}
function randomDigits(length) {
  let result = '';
  while (result.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte < 250) result += String(byte % 10);
      if (result.length === length) break;
    }
  }
  return result;
}
function newToken() { return encode(crypto.getRandomValues(new Uint8Array(32))); }
async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new InputError('Send JSON data.');
  if (Number(request.headers.get('content-length') || 0) > 8192) throw new InputError('The submission is too large.');
  const value = await request.json();
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new InputError('Invalid submission format.');
  return value;
}
function checkOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
function numeric(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100000; }
export function validateResponse(value) {
  for (const key of ['baseline_sve_t', 'baseline_biopile_t', 'changed_sve_t', 'changed_biopile_t']) {
    if (!numeric(value[key])) throw new InputError(`${key} must be a positive value in t CO₂-eq.`);
  }
  if (!providerIds.has(value.provider_uuid)) throw new InputError('Choose an electricity provider from the list.');
  if (!gacOptions.has(value.gac_reason)) throw new InputError('Choose a GAC explanation.');
  if (!cutoffOptions.has(value.cutoff_choice)) throw new InputError('Choose a cut-off priority.');
  const explanation = String(value.explanation || '').trim();
  if (explanation.length > 500) throw new InputError('The explanation must be 500 characters or fewer.');
  return { ...value, explanation };
}
const quantile = (sorted, p) => {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p, lower = Math.floor(index), upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};
function distribution(values) {
  if (!values.length) return { n: 0, min: null, q1: null, median: null, q3: null, max: null, bins: [] };
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0], max = sorted.at(-1);
  const count = min === max ? 1 : Math.min(8, Math.max(3, Math.ceil(Math.sqrt(values.length))));
  const width = count === 1 ? 1 : (max - min) / count;
  const bins = Array.from({ length: count }, (_, i) => ({ from: min + i * width, to: count === 1 ? max : min + (i + 1) * width, n: 0 }));
  for (const value of values) bins[Math.min(count - 1, Math.floor((value - min) / width))].n++;
  return { n: values.length, min, q1: quantile(sorted, .25), median: quantile(sorted, .5), q3: quantile(sorted, .75), max, bins };
}
export function aggregate(rows) {
  const votes = { gac: {}, cutoff: {} };
  for (const row of rows) {
    votes.gac[row.gac_reason] = (votes.gac[row.gac_reason] || 0) + 1;
    votes.cutoff[row.cutoff_choice] = (votes.cutoff[row.cutoff_choice] || 0) + 1;
  }
  const byProvider = catalog.providers.map(provider => {
    const members = rows.filter(row => row.provider_uuid === provider.uuid);
    return { ...provider, n: members.length,
      median_changed_sve_t: members.length >= 3 ? distribution(members.map(row => row.changed_sve_t)).median : null,
      median_delta_sve_t: members.length >= 3 ? distribution(members.map(row => row.changed_sve_t - row.baseline_sve_t)).median : null };
  }).filter(item => item.n);
  return {
    n: rows.length,
    baseline_sve: distribution(rows.map(row => row.baseline_sve_t)),
    baseline_biopile: distribution(rows.map(row => row.baseline_biopile_t)),
    ratio: distribution(rows.map(row => row.baseline_sve_t / row.baseline_biopile_t)),
    by_provider: byProvider,
    votes,
    paper: { sve_t: 360, biopile_t: 52.1, ratio: 6.9 },
  };
}
async function session(db, code) { return one(db, 'SELECT * FROM sessions WHERE code = ?', cleanCode(code)); }
async function progress(db, item) {
  const row = await one(db, 'SELECT COUNT(*) AS n FROM responses WHERE session_id = ?', item.id);
  return { code: item.code, title: item.title, phase: item.phase, submitted: row.n, updated_at: item.updated_at };
}
async function groupFor(request, db, sessionId) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer /i, '');
  if (!/^[\w-]{40,50}$/.test(token)) return null;
  return one(db, 'SELECT id, label FROM groups WHERE session_id = ? AND token_hash = ?', sessionId, await digest(token));
}
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function api(request, env, url) {
  const db = env.DB, path = url.pathname.split('/').filter(Boolean), method = request.method;
  if (!db) return fail(503, 'The database is not configured.');
  if (!['GET', 'HEAD'].includes(method) && !checkOrigin(request)) return fail(403, 'Invalid request origin.');
  if (path[1] === 'catalog' && method === 'GET') return json(catalog);
  if (path[1] === 'health' && method === 'GET') return json({ ok: true });

  if (path[1] === 'admin') {
    if (path[2] === 'login' && method === 'POST') {
      if (!/^\d{8}$/.test(env.ADMIN_PIN || '') || !env.ADMIN_SIGNING_SECRET || env.ADMIN_SIGNING_SECRET.length < 32) return fail(503, 'The facilitator PIN is not configured.');
      const input = await body(request);
      if (!equal(String(input.key || ''), env.ADMIN_PIN)) return fail(401, 'Invalid facilitator PIN.');
      const expiry = String(Date.now() + 43200000);
      return json({ ok: true }, 200, { 'set-cookie': adminCookie(`${expiry}.${await signature(env.ADMIN_SIGNING_SECRET, expiry)}`, request) });
    }
    if (!(await isAdmin(request, env))) return fail(401, 'Sign in to the facilitator console first.');
    if (path[2] === 'me' && method === 'GET') return json({ ok: true });
    if (path[2] === 'logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': adminCookie('', request, 0) });
    if (path[2] === 'sessions' && path.length === 3 && method === 'GET') {
      return json(await all(db, 'SELECT code, title, phase, created_at, updated_at FROM sessions ORDER BY created_at DESC LIMIT 1'));
    }
    if (path[2] === 'sessions' && path.length === 3 && method === 'POST') {
      const existing = await one(db, 'SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1');
      if (existing) return json(await progress(db, existing));
      const timestamp = now();
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomDigits(6);
        try {
          await run(db, 'INSERT OR IGNORE INTO sessions(id, code, title, expected_groups, phase, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 'main', code, 'SVE vs Biopile Classroom', 0, 'open', timestamp, timestamp);
          const item = await one(db, 'SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1');
          if (item) return json(await progress(db, item), item.code === code ? 201 : 200);
        } catch (error) { if (!/UNIQUE/i.test(String(error))) throw error; }
      }
      return fail(503, 'Could not generate a session code. Try again.');
    }
    if (path[2] === 'sessions' && path[3]) {
      const item = await session(db, path[3]);
      if (!item) return fail(404, 'Session not found.');
      if (path.length === 4 && method === 'GET') return json(await progress(db, item));
      if (path[4] === 'phase' && method === 'PUT') {
        const input = await body(request);
        if (!phases.has(input.phase)) return fail(400, 'Invalid session phase.');
        if (!nextPhases[item.phase].includes(input.phase)) return fail(409, 'This phase change is not allowed.');
        const timestamp = now();
        await run(db, 'UPDATE sessions SET phase = ?, updated_at = ? WHERE id = ?', input.phase, timestamp, item.id);
        return json(await progress(db, { ...item, phase: input.phase, updated_at: timestamp }));
      }
      if (path[4] === 'entries' && method === 'GET') {
        return json(await all(db, 'SELECT g.label, r.* FROM responses r JOIN groups g ON g.id = r.group_id WHERE r.session_id = ? ORDER BY r.updated_at DESC', item.id));
      }
      if (path[4] === 'export' && method === 'GET') {
        const rows = await all(db, 'SELECT g.label, r.* FROM responses r JOIN groups g ON g.id = r.group_id WHERE r.session_id = ? ORDER BY g.label_key', item.id);
        const columns = ['label', 'baseline_sve_t', 'baseline_biopile_t', 'provider_uuid', 'changed_sve_t', 'changed_biopile_t', 'gac_reason', 'cutoff_choice', 'explanation', 'snapshot', 'method_uuid', 'electricity_flow_uuid', 'revision', 'updated_at'];
        const csv = [columns.join(','), ...rows.map(row => columns.map(key => csvCell(row[key])).join(','))].join('\r\n');
        return new Response(`\uFEFF${csv}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="classroom-${item.code}.csv"`, 'cache-control': 'no-store' } });
      }
    }
    return fail(404, 'Endpoint not found.');
  }

  if (path[1] === 'session' && path[2]) {
    const item = await session(db, path[2]);
    if (!item) return fail(404, 'Invalid session code.');
    if (path.length === 3 && method === 'GET') return json(await progress(db, item));
    if (path[3] === 'join' && method === 'POST') {
      if (item.phase !== 'open') return fail(409, 'This session is no longer accepting groups.');
      const input = await body(request), label = cleanLabel(input.label), labelKey = label.toLocaleLowerCase();
      if (label.length < 1 || label.length > 40 || /[<>]/.test(label)) return fail(400, 'Group name must be 1–40 characters and cannot contain angle brackets.');
      const existing = await one(db, 'SELECT id, recovery_pin_hash FROM groups WHERE session_id = ? AND label_key = ?', item.id, labelKey);
      if (existing) {
        const pin = String(input.recovery_code || '');
        if (!/^\d{8}$/.test(pin)) return fail(409, 'This group name is taken. Enter its eight-digit recovery PIN.');
        if (!existing.recovery_pin_hash || !equal(existing.recovery_pin_hash, await signature(env.ADMIN_SIGNING_SECRET, `recovery:${existing.id}:${pin}`))) return fail(401, 'Incorrect recovery PIN.');
        const token = newToken();
        await run(db, 'UPDATE groups SET token_hash = ? WHERE id = ?', await digest(token), existing.id);
        return json({ code: item.code, group_id: existing.id, label, token, recovery_pin: pin, restored: true });
      }
      const token = newToken(), pin = randomDigits(8), id = crypto.randomUUID();
      try {
        await run(db, 'INSERT INTO groups(id, session_id, label, label_key, token_hash, recovery_pin_hash, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, item.id, label, labelKey, await digest(token), await signature(env.ADMIN_SIGNING_SECRET, `recovery:${id}:${pin}`), now());
      } catch (error) { if (/UNIQUE/i.test(String(error))) return fail(409, 'This group name is taken. Enter its recovery code.'); throw error; }
      return json({ code: item.code, group_id: id, label, token, recovery_pin: pin, restored: false }, 201);
    }
    if (path[3] === 'me' && method === 'GET') {
      const group = await groupFor(request, db, item.id);
      if (!group) return fail(401, 'Join again or enter your recovery code.');
      return json({ group, session: await progress(db, item), response: await one(db, 'SELECT * FROM responses WHERE group_id = ?', group.id) });
    }
    if (path[3] === 'response' && method === 'PUT') {
      if (item.phase !== 'open') return fail(409, 'This session is locked; answers cannot be edited.');
      const group = await groupFor(request, db, item.id);
      if (!group) return fail(401, 'Join again or enter your recovery code.');
      const input = validateResponse(await body(request));
      const timestamp = now();
      await run(db, `INSERT INTO responses(group_id, session_id, baseline_sve_t, baseline_biopile_t, provider_uuid, changed_sve_t, changed_biopile_t, gac_reason, cutoff_choice, explanation, snapshot, method_uuid, electricity_flow_uuid, revision, submitted_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(group_id) DO UPDATE SET baseline_sve_t=excluded.baseline_sve_t, baseline_biopile_t=excluded.baseline_biopile_t, provider_uuid=excluded.provider_uuid, changed_sve_t=excluded.changed_sve_t, changed_biopile_t=excluded.changed_biopile_t, gac_reason=excluded.gac_reason, cutoff_choice=excluded.cutoff_choice, explanation=excluded.explanation, revision=responses.revision+1, updated_at=excluded.updated_at`,
        group.id, item.id, input.baseline_sve_t, input.baseline_biopile_t, input.provider_uuid, input.changed_sve_t, input.changed_biopile_t, input.gac_reason, input.cutoff_choice, input.explanation, catalog.snapshot, catalog.method_uuid, catalog.flow_uuid, timestamp, timestamp);
      const saved = await one(db, 'SELECT revision, updated_at FROM responses WHERE group_id = ?', group.id);
      await run(db, 'UPDATE sessions SET updated_at = ? WHERE id = ?', timestamp, item.id);
      return json({ saved: true, ...saved });
    }
    if (path[3] === 'results' && method === 'GET') {
      if (item.phase !== 'revealed' && item.phase !== 'closed') return fail(403, 'The facilitator has not revealed the results.');
      const rows = await all(db, 'SELECT baseline_sve_t, baseline_biopile_t, provider_uuid, changed_sve_t, changed_biopile_t, gac_reason, cutoff_choice FROM responses WHERE session_id = ?', item.id);
      return json({ session: await progress(db, item), results: aggregate(rows), catalog });
    }
  }
  return fail(404, 'Endpoint not found.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await api(request, env, url); }
    catch (error) {
      if (error instanceof SyntaxError) return fail(400, 'Invalid JSON.');
      if (error instanceof InputError) return fail(400, error.message);
      console.error(error);
      return fail(500, 'The server cannot process this request right now.');
    }
  },
};
