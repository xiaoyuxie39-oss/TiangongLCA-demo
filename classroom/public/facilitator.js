const $ = id => document.getElementById(id);
const phaseNames = { open: 'Collecting', locked: 'Locked', revealed: 'Revealed', closed: 'Closed' };
let active = '';
const node = (tag, text) => { const item = document.createElement(tag); item.textContent = text; return item; };
async function api(path, method = 'GET', value) {
  const response = await fetch(`/api/admin${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: value ? { 'content-type': 'application/json' } : {}, body: value ? JSON.stringify(value) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed.'); return data;
}
function status(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
function renderEntries(rows) {
  const tbody = $('entries'); tbody.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const value of [row.label, row.baseline_sve_t, row.baseline_biopile_t, row.provider_name || row.provider_uuid, row.changed_sve_t, row.changed_biopile_t, row.gac_reason, row.cutoff_choice, row.explanation, row.revision]) tr.append(node('td', String(value ?? '')));
    tbody.append(tr);
  }
  if (!rows.length) { const tr = document.createElement('tr'); tr.append(node('td', 'No submissions yet')); tbody.append(tr); }
}
async function showSession() {
  if (!active) return;
  const [item, entries] = await Promise.all([api(`/sessions/${active}`), api(`/sessions/${active}/entries`)]);
  $('session-card').classList.remove('hidden'); $('entries-card').classList.remove('hidden');
  $('session-title').textContent = item.title; $('session-code').textContent = item.code;
  $('phase').textContent = phaseNames[item.phase]; $('phase').className = `pill ${item.phase}`;
  $('tiles').replaceChildren();
  for (const [label, value] of [['Groups submitted', item.submitted]]) { const tile = document.createElement('div'); tile.className = 'tile'; tile.append(node('strong', String(value)), node('span', label)); $('tiles').append(tile); }
  $('student-link').href = `/?code=${encodeURIComponent(active)}`;
  $('board-link').href = `/board.html?code=${encodeURIComponent(active)}`;
  $('export-link').href = `/api/admin/sessions/${active}/export`;
  const actions = $('phase-actions'); actions.replaceChildren();
  const allowed = item.phase === 'open' ? [['locked', 'Lock answers']] : item.phase === 'locked' ? [['revealed', 'Reveal distribution'], ['open', 'Reopen']] : item.phase === 'revealed' ? [['open', 'Hide results and reopen']] : [];
  for (const [next, label] of allowed) {
    const button = node('button', label); button.className = next === 'revealed' ? '' : 'secondary';
    button.addEventListener('click', async () => {
      if ((next === 'open' && item.phase === 'revealed') && !confirm('Reopening will hide public results and allow edits. Continue?')) return;
      button.disabled = true;
      try { await api(`/sessions/${active}/phase`, 'PUT', { phase: next }); status('phase-status', `Phase changed to “${phaseNames[next]}”`); await showSession(); }
      catch (error) { status('phase-status', error.message, true); button.disabled = false; }
    }); actions.append(button);
  }
  renderEntries(entries);
}
async function init() {
  try {
    await api('/me');
    const room = await api('/sessions', 'POST');
    active = room.code;
    $('login-card').classList.add('hidden'); $('admin-area').classList.remove('hidden');
    await showSession();
  } catch {
    $('login-card').classList.remove('hidden'); $('admin-area').classList.add('hidden');
  }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try { await api('/login', 'POST', { key: new FormData(form).get('key') }); form.reset(); await init(); }
  catch (error) { status('login-status', error.message, true); }
});
$('logout').addEventListener('click', async () => { await api('/logout', 'POST'); active = ''; init(); });
$('copy-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(new URL($('student-link').href, location.origin).href); status('phase-status', 'Student link copied.'); } catch { status('phase-status', 'Could not copy automatically. Copy the student link manually.', true); } });
init(); setInterval(async () => { if (active && !$('admin-area').classList.contains('hidden')) { try { await showSession(); } catch (error) { status('phase-status', error.message, true); } } }, 5000);
