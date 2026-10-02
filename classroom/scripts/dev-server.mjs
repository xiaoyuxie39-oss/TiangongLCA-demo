import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes, randomInt } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const localRoot = resolve(root, '.local');
mkdirSync(localRoot, { recursive: true });
const pinPath = resolve(localRoot, 'admin-pin.txt');
const signingPath = resolve(localRoot, 'admin-signing-secret.txt');
if (!existsSync(pinPath)) writeFileSync(pinPath, String(randomInt(100000000)).padStart(8, '0'), { mode: 0o600 });
if (!existsSync(signingPath)) writeFileSync(signingPath, randomBytes(32).toString('hex'), { mode: 0o600 });
const adminPin = readFileSync(pinPath, 'utf8').trim();
const signingSecret = readFileSync(signingPath, 'utf8').trim();
const sqlite = new DatabaseSync(resolve(localRoot, 'classroom.sqlite'));
sqlite.exec(readFileSync(resolve(root, 'schema.sql'), 'utf8'));
if (!sqlite.prepare("PRAGMA table_info(groups)").all().some(column => column.name === 'recovery_pin_hash')) sqlite.exec('ALTER TABLE groups ADD COLUMN recovery_pin_hash TEXT');
const DB = { prepare(sql) { return { bind(...args) {
  const statement = sqlite.prepare(sql);
  return { first: async () => statement.get(...args) ?? null, all: async () => ({ results: statement.all(...args) }), run: async () => statement.run(...args) };
} }; } };
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const ASSETS = { async fetch(request) {
  const pathname = new URL(request.url).pathname;
  const path = resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!path.startsWith(publicRoot + sep) || !existsSync(path)) return new Response('Not found', { status: 404 });
  const ext = path.slice(path.lastIndexOf('.'));
  return new Response(readFileSync(path), { headers: { 'content-type': types[ext] || 'application/octet-stream' } });
} };
const port = Number(process.env.CLASSROOM_PORT || 8787);
const host = process.env.CLASSROOM_HOST || '127.0.0.1';
createServer(async (incoming, outgoing) => {
  try {
    const method = incoming.method || 'GET';
    const request = new Request(`http://localhost:${port}${incoming.url}`, {
      method,
      headers: incoming.headers,
      ...(!['GET', 'HEAD'].includes(method) ? { body: incoming, duplex: 'half' } : {}),
    });
    const response = await worker.fetch(request, { DB, ASSETS, ADMIN_PIN: adminPin, ADMIN_SIGNING_SECRET: signingSecret });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { console.error(error); outgoing.writeHead(500); outgoing.end('Internal server error'); }
}).listen(port, host, () => {
  console.log(`Classroom preview: http://localhost:${port}`);
  console.log(`Teacher PIN stored in ${pinPath}`);
});
