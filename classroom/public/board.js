const $ = id => document.getElementById(id);
const phaseNames = { open: 'Collecting', locked: 'Locked', revealed: 'Revealed', closed: 'Closed' };
const gacNames = { 'missing-upstream': 'Missing upstream inputs', 'missing-factor': 'Missing factors', 'truly-zero': 'Truly zero impact', unsure: 'Unsure' };
const cutoffNames = { diesel_machinery: 'Machinery diesel', microorganism: 'Microbial inoculum', other: 'Other', unsure: 'Unsure' };
const fmt = value => Number(value).toLocaleString('en', { maximumFractionDigits: 2 });
let code = new URL(location.href).searchParams.get('code')?.trim().toUpperCase() || '';
function node(tag, cls, text) { const item = document.createElement(tag); if (cls) item.className = cls; if (text !== undefined) item.textContent = text; return item; }
async function get(path) { const response = await fetch(`/api${path}`, { cache: 'no-store' }); const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Could not load results.'); return value; }
function tile(label, value) { const item = node('div', 'tile'); item.append(node('strong', '', value), node('span', '', label)); return item; }
function row(label, amount, max, style = '') {
  const item = node('div', 'barrow'), name = node('span', '', label), track = node('div', 'track'), bar = node('div', `bar ${style}`), count = node('span', 'num', fmt(amount));
  bar.style.width = `${amount > 0 && max ? Math.max(2, amount / max * 100) : 0}%`; track.append(bar); item.append(name, track, count); return item;
}
function distribution(title, data, reference, unit, style) {
  const box = node('div', 'chartbox'); box.append(node('h3', '', `${title} (n=${data.n})`));
  if (!data.n) { box.append(node('p', 'muted', 'No answers yet')); return box; }
  box.append(node('p', '', `Median ${fmt(data.median)} ${unit} · IQR ${fmt(data.q1)}–${fmt(data.q3)}`));
  const max = Math.max(...data.bins.map(bin => bin.n));
  for (const bin of data.bins) {
    const label = data.bins.length === 1 ? fmt(bin.from) : `${fmt(bin.from)}–${fmt(bin.to)}`;
    box.append(row(label, bin.n, max, style));
  }
  box.append(node('p', 'muted', `Paper reference: ${fmt(reference)} ${unit}; range ${fmt(data.min)}–${fmt(data.max)}`));
  return box;
}
function votes(title, values, labels) {
  const box = node('div', 'chartbox'); box.append(node('h3', '', title));
  const max = Math.max(1, ...Object.values(values));
  for (const [key, label] of Object.entries(labels)) box.append(row(label, values[key] || 0, max, 'vote'));
  return box;
}
function renderProgress(data) {
  $('progress-card').classList.remove('hidden'); $('room-title').textContent = data.title;
  $('shown-code').textContent = data.code; $('phase').textContent = phaseNames[data.phase]; $('phase').className = `pill ${data.phase}`;
  $('progress-tiles').replaceChildren(tile('Groups submitted', String(data.submitted)));
  $('updated').textContent = `Session last updated: ${new Date(data.updated_at).toLocaleString('en')} · Board checks for new results every 5 seconds`;
}
function renderResults(data) {
  const result = data.results, grids = $('distributions'); grids.replaceChildren(
    distribution('SVE baseline', result.baseline_sve, result.paper.sve_t, 't CO₂-eq', 'sve'),
    distribution('Biopile baseline', result.baseline_biopile, result.paper.biopile_t, 't CO₂-eq', 'bio'),
    distribution('Paired SVE / Biopile', result.ratio, result.paper.ratio, '×', ''),
  );
  const interpretation = $('interpretation'); interpretation.replaceChildren();
  const providers = node('div', 'chartbox'); providers.append(node('h3', '', 'SVE change by electricity provider'));
  if (!result.by_provider.length) providers.append(node('p', 'muted', 'No answers yet'));
  const disclosed = result.by_provider.filter(item => item.median_delta_sve_t !== null);
  const max = Math.max(1, ...disclosed.map(item => Math.abs(item.median_delta_sve_t)));
  for (const item of result.by_provider) {
    const label = item.name.replace('Electricity production ; Electricity mix ; ', '');
    if (item.median_delta_sve_t === null) providers.append(node('p', 'muted', `${label}: n=${item.n}; fewer than 3 groups, so the median is hidden`));
    else {
      providers.append(row(`${label} · n=${item.n}`, Math.abs(item.median_delta_sve_t), max, 'sve'));
      providers.append(node('p', 'muted', `Median change ${item.median_delta_sve_t >= 0 ? '+' : ''}${fmt(item.median_delta_sve_t)} t · Process ${item.uuid}`));
    }
  }
  interpretation.append(providers, votes('Why is the GAC stage near zero?', result.votes.gac, gacNames), votes('Which cut-off should be checked first?', result.votes.cutoff, cutoffNames));
  $('provenance').textContent = `Revealed ${result.n} groups · Snapshot ${data.catalog.snapshot} · Method UUID ${data.catalog.method_uuid} · Electricity flow UUID ${data.catalog.flow_uuid}`;
  $('results-card').classList.remove('hidden');
}
async function refresh() {
  if (!code) return;
  try {
    const session = await get(`/session/${encodeURIComponent(code)}`); renderProgress(session);
    if (session.phase === 'revealed' || session.phase === 'closed') renderResults(await get(`/session/${encodeURIComponent(code)}/results`));
    else { $('results-card').classList.add('hidden'); $('distributions').replaceChildren(); $('interpretation').replaceChildren(); }
    $('status').textContent = `Connected · ${new Date().toLocaleTimeString('en')}`;
    $('status').classList.remove('error');
  } catch (error) { $('status').textContent = error.message; $('status').classList.add('error'); }
}
$('room-form').addEventListener('submit', event => { event.preventDefault(); code = $('room-code').value.trim().toUpperCase(); history.replaceState(null, '', `/board.html?code=${encodeURIComponent(code)}`); refresh(); });
$('room-code').value = code; refresh(); setInterval(refresh, 5000);
