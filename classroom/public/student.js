const $ = id => document.getElementById(id);
const queryCode = new URL(location.href).searchParams.get('code')?.trim().toUpperCase() || '';
const phaseNames = { open: 'Collecting', locked: 'Locked', revealed: 'Revealed', closed: 'Closed' };
let activeCode = '', token = '', recoveryPin = '';
const setStatus = (id, text, error = false) => { $(id).textContent = text; $(id).classList.toggle('error', error); };
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function fillForm(response) {
  if (!response) return;
  for (const [key, value] of Object.entries(response)) {
    const field = document.querySelector(`[name="${key}"]`);
    if (field && value !== null) field.value = value;
  }
  setStatus('save-status', `Saved revision ${response.revision} · ${new Date(response.updated_at).toLocaleString('en')}`);
}
function renderSession(data, group) {
  $('join-card').classList.add('hidden'); $('answer-card').classList.remove('hidden');
  $('group-label').textContent = group.label;
  $('session-code').textContent = activeCode;
  $('recovery-display').textContent = recoveryPin || 'Unavailable on this device';
  $('results-link').href = `/board.html?code=${encodeURIComponent(activeCode)}`;
  applyPhase(data.phase);
}
function applyPhase(phase) {
  $('phase-pill').textContent = phaseNames[phase];
  $('phase-pill').className = `pill ${phase}`;
  for (const field of $('answer-form').elements) field.disabled = phase !== 'open';
  if (phase !== 'open') setStatus('save-status', 'This session is locked. Answers cannot be edited.');
}
async function restore(code) {
  activeCode = code; token = localStorage.getItem(`classroom-token-${code}`) || '';
  recoveryPin = localStorage.getItem(`classroom-pin-${code}`) || '';
  if (!token) return;
  try {
    const data = await api(`/session/${encodeURIComponent(code)}/me`);
    renderSession(data.session, data.group); fillForm(data.response);
  } catch { token = ''; localStorage.removeItem(`classroom-token-${code}`); }
}
async function init() {
  $('code').value = queryCode;
  try {
    const catalog = await api('/catalog');
    for (const provider of catalog.providers) {
      const option = document.createElement('option'); option.value = provider.uuid;
      option.textContent = `${provider.name.replace('Electricity production ; Electricity mix ; ', '')} · ${provider.geo} · ${provider.year}`;
      $('provider').appendChild(option);
    }
  } catch (error) { setStatus('join-status', error.message, true); }
  if (queryCode) await restore(queryCode);
}
async function joinSession(code, label, recoveryCode = '') {
  const requestedCode = String(code).trim();
  const previous = { activeCode, token, recoveryPin };
  try {
    if (!/^\d{6}$/.test(requestedCode)) throw new Error('Enter a six-digit classroom code.');
    const joined = await api(`/session/${encodeURIComponent(requestedCode)}/join`, { method: 'POST', body: JSON.stringify({ label, recovery_code: recoveryCode }) });
    activeCode = requestedCode;
    token = joined.token; recoveryPin = joined.recovery_pin;
    localStorage.setItem(`classroom-token-${activeCode}`, token);
    localStorage.setItem(`classroom-pin-${activeCode}`, recoveryPin);
    const data = await api(`/session/${encodeURIComponent(activeCode)}/me`);
    $('answer-form').reset();
    setStatus('save-status', '');
    renderSession(data.session, data.group); fillForm(data.response);
    return { classroom_code: activeCode, group_name: data.group.label, recovery_pin: recoveryPin, restored: joined.restored };
  } catch (error) {
    ({ activeCode, token, recoveryPin } = previous);
    setStatus('join-status', error.message, true);
    throw error;
  }
}
$('join-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try { await joinSession(values.code, values.label, values.recovery_code); }
  catch { /* Error is shown beside the join button. */ }
});
const tonneFields = ['baseline_sve_t', 'baseline_biopile_t', 'changed_sve_t', 'changed_biopile_t'];
// The calculator shows kg; every total in this exercise is well under 1,000 t (the server refuses more).
const kgMessage = 'A value above 1,000 looks like kg CO₂-eq. This form takes tonnes: divide the calculator\'s number by 1,000 (92,849 kg = 92.8 t).';
const looksLikeKg = values => tonneFields.some(key => Number(values[key]) > 1000);
async function saveValues(values) {
  if (!activeCode || !token) throw new Error('Join a session first.');
  for (const key of tonneFields) values[key] = Number(values[key]);
  if (looksLikeKg(values)) throw new Error(kgMessage);
  const ratio = values.baseline_sve_t / values.baseline_biopile_t;
  if (!Number.isFinite(ratio)) throw new Error('Check the SVE and Biopile values.');
  $('save-button').disabled = true; setStatus('save-status', 'Saving…');
  try {
    const result = await api(`/session/${encodeURIComponent(activeCode)}/response`, { method: 'PUT', body: JSON.stringify(values) });
    setStatus('save-status', `Server saved revision ${result.revision} · Baseline SVE/Biopile = ${ratio.toFixed(2)}×`);
    return { saved: true, revision: result.revision, session_code: activeCode };
  } catch (error) { setStatus('save-status', error.message, true); throw error; }
  finally { $('save-button').disabled = false; }
}
$('answer-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { await saveValues(Object.fromEntries(new FormData(event.currentTarget))); }
  catch (error) { setStatus('save-status', error.message, true); }
});
$('answer-form').addEventListener('input', event => {
  if (!tonneFields.includes(event.target.name)) return;
  if (looksLikeKg(Object.fromEntries(new FormData($('answer-form'))))) setStatus('save-status', kgMessage, true);
  else if ($('save-status').textContent === kgMessage) setStatus('save-status', '');
});
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  void Promise.resolve(modelContext.registerTool({
    name: 'join_lca_classroom_session', title: 'Join LCA classroom session',
    description: 'Join the classroom using its six-digit code and a group name. The eight-digit recovery PIN appears on the page.',
    inputSchema: { type: 'object', properties: { code: { type: 'string' }, group_name: { type: 'string' }, recovery_code: { type: 'string' } }, required: ['code', 'group_name'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: input => joinSession(input.code, input.group_name, input.recovery_code || ''),
  })).catch(() => {});
  void Promise.resolve(modelContext.registerTool({
    name: 'save_lca_group_answers', title: 'Save LCA group answers',
    description: 'Save the joined group’s paired SVE and Biopile climate results, electricity provider choice, and interpretation in the current open session.',
    inputSchema: { type: 'object', properties: {
      baseline_sve_t: { type: 'number' }, baseline_biopile_t: { type: 'number' }, provider_uuid: { type: 'string' },
      changed_sve_t: { type: 'number' }, changed_biopile_t: { type: 'number' }, gac_reason: { type: 'string' },
      cutoff_choice: { type: 'string' }, explanation: { type: 'string' },
    }, required: ['baseline_sve_t', 'baseline_biopile_t', 'provider_uuid', 'changed_sve_t', 'changed_biopile_t', 'gac_reason', 'cutoff_choice'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: input => {
      for (const [name, value] of Object.entries(input)) {
        const field = document.querySelector(`[name="${name}"]`);
        if (field) field.value = value;
      }
      return saveValues({ ...input, explanation: input.explanation || '' });
    },
  })).catch(() => {});
}
init();
setInterval(async () => {
  if (!activeCode || $('answer-card').classList.contains('hidden')) return;
  try { const session = await api(`/session/${encodeURIComponent(activeCode)}`); applyPhase(session.phase); }
  catch { /* keep the current form visible until the next refresh */ }
}, 10000);
