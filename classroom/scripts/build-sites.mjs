import { readFile, mkdir, rm, copyFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const assets = ['index.html', 'board.html', 'facilitator.html', 'student.js', 'board.js', 'facilitator.js', 'styles.css', 'favicon.svg'];
const contents = Object.fromEntries(await Promise.all(assets.map(async name => [`/${name}`, await readFile(join(root, 'public', name), 'utf8')])));
const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml' };
const wrapper = `import application from './worker.js';
const assets = ${JSON.stringify(contents)};
const mime = ${JSON.stringify(mime)};
function staticFetch(request) {
  const url = new URL(request.url);
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  const data = assets[path];
  if (data === undefined) return new Response('Not found', { status: 404 });
  const extension = path.split('.').pop();
  return new Response(request.method === 'HEAD' ? null : data, {
    headers: { 'content-type': mime[extension] || 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' },
  });
}
export default {
  fetch(request, env, ctx) {
    return application.fetch(request, { ...env, ASSETS: { fetch: staticFetch } }, ctx);
  },
};
`;
await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'server'), { recursive: true });
await mkdir(join(dist, '.openai'), { recursive: true });
await writeFile(join(dist, 'server', 'index.js'), wrapper);
await copyFile(join(root, 'src', 'worker.js'), join(dist, 'server', 'worker.js'));
await copyFile(join(root, 'src', 'catalog.js'), join(dist, 'server', 'catalog.js'));
await copyFile(join(root, '.openai', 'hosting.json'), join(dist, '.openai', 'hosting.json'));
console.log('Built ChatGPT Sites Worker.');
