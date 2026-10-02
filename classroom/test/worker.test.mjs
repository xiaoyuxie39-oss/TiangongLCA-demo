import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import worker, { aggregate, validateResponse } from '../src/worker.js';
import { catalog } from '../src/catalog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(resolve(root, 'drizzle')).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(resolve(root, 'drizzle', file), 'utf8'));
  }
  return {
    prepare(sql) {
      return { bind(...args) {
        const statement = sqlite.prepare(sql);
        return {
          first: async () => statement.get(...args) ?? null,
          all: async () => ({ results: statement.all(...args) }),
          run: async () => statement.run(...args),
        };
      } };
    },
  };
}
const env = () => ({ DB: database(), ADMIN_PIN: '12345678', ADMIN_SIGNING_SECRET: 'local-test-signing-secret-with-at-least-32-characters' });
async function call(environment, path, method = 'GET', data, cookie = '', token = '') {
  const response = await worker.fetch(new Request(`http://localhost${path}`, {
    method,
    headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  }), environment);
  const value = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
  return { response, value };
}
const answer = { baseline_sve_t: 12.5, baseline_biopile_t: 4.2, provider_uuid: catalog.providers[1].uuid, changed_sve_t: 10.5, changed_biopile_t: 3.8, gac_reason: 'missing-upstream', cutoff_choice: 'diesel_machinery', explanation: 'Check upstream inputs' };

test('student submission, teacher reveal, recovery and aggregate privacy', async () => {
  const e = env();
  assert.equal((await call(e, '/api/admin/sessions')).response.status, 401);
  assert.equal((await call(e, '/api/admin/login', 'POST', { key: 'wrong' })).response.status, 401);
  const login = await call(e, '/api/admin/login', 'POST', { key: e.ADMIN_PIN });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const created = await call(e, '/api/admin/sessions', 'POST', undefined, cookie);
  assert.equal(created.response.status, 201);
  const code = created.value.code;
  assert.match(code, /^\d{6}$/);
  assert.equal((await call(e, '/api/admin/sessions', 'POST', undefined, cookie)).value.code, code);
  assert.equal((await call(e, '/api/admin/sessions', 'GET', undefined, cookie)).value.length, 1);
  assert.equal((await call(e, `/api/session/${code}/results`)).response.status, 403);
  const joined = await call(e, `/api/session/${code}/join`, 'POST', { label: '=Test group' });
  assert.equal(joined.response.status, 201);
  assert.match(joined.value.recovery_pin, /^\d{8}$/);
  const oldToken = joined.value.token;
  assert.equal((await call(e, `/api/session/${code}/join`, 'POST', { label: '=Test group' })).response.status, 409);
  const wrongPin = joined.value.recovery_pin === '00000000' ? '00000001' : '00000000';
  assert.equal((await call(e, `/api/session/${code}/join`, 'POST', { label: '=Test group', recovery_code: wrongPin })).response.status, 401);
  const restored = await call(e, `/api/session/${code}/join`, 'POST', { label: '=Test group', recovery_code: joined.value.recovery_pin });
  assert.equal(restored.value.restored, true);
  const token = restored.value.token;
  assert.notEqual(token, oldToken);
  assert.equal((await call(e, `/api/session/${code}/me`, 'GET', undefined, '', oldToken)).response.status, 401);
  assert.equal((await call(e, `/api/session/${code}/response`, 'PUT', { ...answer, provider_uuid: 'fake' }, '', token)).response.status, 400);
  const saved = await call(e, `/api/session/${code}/response`, 'PUT', answer, '', token);
  assert.equal(saved.response.status, 200);
  assert.equal(saved.value.revision, 1);
  const updated = await call(e, `/api/session/${code}/response`, 'PUT', { ...answer, changed_sve_t: 9.5 }, '', token);
  assert.equal(updated.value.revision, 2);
  assert.equal((await call(e, `/api/session/${code}`)).value.submitted, 1);
  const mine = await call(e, `/api/session/${code}/me`, 'GET', undefined, '', token);
  assert.equal(mine.value.response.changed_sve_t, 9.5);
  const locked = await call(e, `/api/admin/sessions/${code}/phase`, 'PUT', { phase: 'locked' }, cookie);
  assert.equal(locked.value.phase, 'locked');
  assert.equal((await call(e, `/api/admin/sessions/${code}/phase`, 'PUT', { phase: 'closed' }, cookie)).response.status, 409);
  assert.equal((await call(e, `/api/session/${code}/response`, 'PUT', answer, '', token)).response.status, 409);
  assert.equal((await call(e, `/api/session/${code}/results`)).response.status, 403);
  await call(e, `/api/admin/sessions/${code}/phase`, 'PUT', { phase: 'revealed' }, cookie);
  const results = await call(e, `/api/session/${code}/results`);
  assert.equal(results.value.results.n, 1);
  assert.equal(results.value.results.ratio.median, 12.5 / 4.2);
  assert.equal(results.value.results.by_provider[0].median_delta_sve_t, null);
  assert.equal(JSON.stringify(results.value).includes('Test group'), false);
  assert.equal(JSON.stringify(results.value).includes('Check upstream inputs'), false);
  const exportFile = await call(e, `/api/admin/sessions/${code}/export`, 'GET', undefined, cookie);
  assert.match(exportFile.value, /'=Test group/);
  assert.match(exportFile.value, /Check upstream inputs/);
});

test('server validation and aggregation keep paired ratios', () => {
  assert.throws(() => validateResponse({ ...answer, baseline_biopile_t: 0 }), /baseline_biopile_t/);
  const rows = [
    { ...answer, baseline_sve_t: 10, baseline_biopile_t: 2, changed_sve_t: 8 },
    { ...answer, baseline_sve_t: 20, baseline_biopile_t: 10, changed_sve_t: 18 },
    { ...answer, baseline_sve_t: 30, baseline_biopile_t: 10, changed_sve_t: 28 },
  ];
  const result = aggregate(rows);
  assert.equal(result.ratio.median, 3);
  assert.equal(result.by_provider[0].median_delta_sve_t, -2);
  assert.equal(result.votes.gac['missing-upstream'], 3);
});

test('the one classroom accepts more than 500 groups', async () => {
  const e = env();
  const login = await call(e, '/api/admin/login', 'POST', { key: e.ADMIN_PIN });
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const room = await call(e, '/api/admin/sessions', 'POST', undefined, cookie);
  for (let number = 1; number <= 501; number++) {
    const joined = await call(e, `/api/session/${room.value.code}/join`, 'POST', { label: `Group ${number}` });
    assert.equal(joined.response.status, 201, `Group ${number} should join`);
  }
});
