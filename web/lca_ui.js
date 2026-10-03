/*
 * HTML builders for the student view of the TianGong teaching tool. No DOM: every
 * function returns a string, so web/test.mjs can render each panel in Node and check
 * that no uuid or audit code reaches the screen. The audit view (index.html?audit=1 on a
 * local copy only) passes `audit: true` and gets the identifiers, resolution rules and
 * data warnings back. Works as a classic browser script (globalThis.LcaUi) and as CommonJS.
 */
(function (root, factory) {
  const core = root.LcaCore || (typeof require === "function" ? require("./lca_core.js") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LcaUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  const TIANGONG = "https://lcdn.tiangong.earth/datasetdetail/process.xhtml?uuid=";
  const SUB_INDICATOR = /^Climate change-|_(in)?organics$/;
  const STAGE = "stage:";
  const factorCache = new WeakMap();

  // The audit view is for the instructor's local copy (file://, localhost); on the public site ?audit=1 does nothing.
  function auditAllowed(href) {
    let url;
    try { url = new URL(href); } catch { return false; }
    const asked = /^(1|true|yes)?$/.test(url.searchParams.get("audit") ?? "no");
    const local = url.protocol === "file:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || url.hostname.endsWith(".localhost");
    return asked && local;
  }

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  function fmt(value) {
    if (value === null || value === undefined) return "—";
    const v = Number(value);
    if (!Number.isFinite(v)) return "—";
    if (v === 0) return "0";
    return Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3
      ? v.toExponential(4)
      : v.toLocaleString("en", { maximumSignificantDigits: 6 });
  }

  function pct(part, total) {
    if (!total) return "";
    const share = (part / total) * 100;
    if (!Number.isFinite(share)) return "";
    return share !== 0 && Math.abs(share) < 0.5 ? "<1 %" : `${Math.round(share)} %`;
  }

  // TianGong names mix ";", "|" and double spaces as separators.
  const tidy = (name) => String(name || "").split(/\s*[;|]\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean).join(" · ");

  const processName = (bundle, uuid) => tidy(bundle.processes[uuid]?.name) || "Unnamed dataset";
  const where = (process) => [process?.geo, process?.year].filter(Boolean).join(" · ");
  const uid = (v, id) => (v.audit && id ? `<span class="uuid">${esc(id)}</span>` : "");
  const unitOf = (method) => String(method.unit || "").trim();

  function itemLabel(bundle, item) {
    return bundle.provider_choices?.[item]?.label
      || String(item || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }

  function methodIndex(system, name) {
    const index = system.methods.findIndex((method) => method.name === name);
    return index < 0 ? 0 : index;
  }

  function stageName(system, stageId) {
    return system.foreground.stages.find((stage) => stage.id === stageId)?.name || stageId;
  }

  function flowKind(flow, dir) {
    const category = String(flow?.category || "");
    const to = category.match(/Emissions to (air|water|soil)/i);
    if (to) return `emission to ${to[1].toLowerCase()}`;
    if (category.startsWith("Emissions")) return "emission";
    if (category.startsWith("Resources")) return "resource from nature";
    if (category.startsWith("Land use")) return "land use";
    return dir === "in" ? "input" : "output";
  }

  function factorOf(method, flow, dir) {
    if (!factorCache.has(method)) {
      factorCache.set(method, new Map(method.factors.filter((factor) => factor.length === 3)
        .map((factor) => [`${factor[0]}\u0000${factor[1]}`, Number(factor[2])])));
    }
    return factorCache.get(method).get(`${flow}\u0000${dir}`) || 0;
  }

  function topIndexes(values, n) {
    return Array.from(values, (value, index) => ({ value, index }))
      .filter((x) => x.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, n)
      .map((x) => x.index);
  }

  function table(headers, rows, cls = "") {
    if (!rows.length) return `<p class="empty">Nothing to list.</p>`;
    return `<div class="scroll"><table class="${cls}"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  function detail(title, n, content, open = false) {
    return `<details${open ? " open" : ""}><summary>${esc(title)} (${n})</summary>${content}</details>`;
  }

  function bars(items, total) {
    const max = Math.max(...items.map((x) => Math.abs(x.value)), 1e-300);
    return `<div class="bars">${items.map((x) => `<div class="bar-row"><span>${esc(x.label)}</span><div class="track"><div class="bar ${x.value < 0 ? "negative" : ""}" style="width:${Math.max(0.5, (Math.abs(x.value) / max) * 100)}%"></div></div><span class="bar-value">${fmt(x.value)}${total ? ` <small>${pct(x.value, total)}</small>` : ""}</span></div>`).join("")}</div>`;
  }

  function datasetButton(v, uuid, text) {
    return `<button type="button" class="link" data-open="${esc(uuid)}">${esc(text ?? processName(v.bundle, uuid))}</button>${uid(v, uuid)}`;
  }

  // ---- provider choices shared by the two systems ----

  function providersFor(bundle, choices, name, item) {
    const found = [];
    for (const stage of bundle.systems[name].stages) {
      for (const input of stage.inputs) {
        if (input.item !== item || input.cutoff) continue;
        const provider = choices[name]?.[`${name}/${stage.id}/${input.item}`] || input.provider;
        if (!found.includes(provider)) found.push(provider);
      }
    }
    return found;
  }

  // Items both systems buy, where they use different datasets.
  function mismatches(bundle, choices) {
    const names = Object.keys(bundle.systems);
    if (names.length !== 2) return [];
    const items = new Set();
    for (const stage of bundle.systems[names[0]].stages) {
      for (const input of stage.inputs) if (!input.cutoff) items.add(input.item);
    }
    const result = [];
    for (const item of items) {
      const a = providersFor(bundle, choices, names[0], item);
      const b = providersFor(bundle, choices, names[1], item);
      if (b.length && [...a].sort().join() !== [...b].sort().join()) result.push({ item, [names[0]]: a, [names[1]]: b });
    }
    return result;
  }

  // Copy the dataset one system uses for an item into every stage of the other system.
  function syncChoices(bundle, choices, item, from) {
    const to = Object.keys(bundle.systems).find((name) => name !== from);
    const provider = providersFor(bundle, choices, from, item)[0];
    const next = { ...choices, [to]: { ...(choices[to] || {}) } };
    for (const stage of bundle.systems[to].stages) {
      for (const input of stage.inputs) {
        if (input.item === item && !input.cutoff) next[to][`${to}/${stage.id}/${input.item}`] = provider;
      }
    }
    return next;
  }

  // The part of two dataset names that tells them apart ("China" vs "Qinghai").
  function distinctNames(bundle, a, b) {
    const x = processName(bundle, a).split(" · "), y = processName(bundle, b).split(" · ");
    let k = 0;
    while (k < x.length - 1 && k < y.length - 1 && x[k] === y[k]) k += 1;
    return [x.slice(k).join(" · "), y.slice(k).join(" · ")];
  }

  function mismatchHtml(v, compact = false) {
    const list = mismatches(v.bundle, v.choices);
    if (!list.length) return "";
    const [a, b] = Object.keys(v.bundle.systems);
    if (compact) {
      return `<p class="mismatch compact">${esc(a)} and ${esc(b)} use different datasets for ${esc(list.map((m) => itemLabel(v.bundle, m.item)).join(", "))}: compare them only after using the same one in both (see section 2).</p>`;
    }
    const items = list.map((m) => {
      const [nameA, nameB] = distinctNames(v.bundle, m[a][0], m[b][0]);
      return `<li><strong>${esc(itemLabel(v.bundle, m.item))}:</strong> ${esc(a)} uses ${esc(nameA)}, ${esc(b)} uses ${esc(nameB)}. <span class="sync"><button type="button" data-sync="${esc(m.item)}" data-from="${esc(a)}">Use ${esc(nameA)} in ${esc(b)} too</button> <button type="button" data-sync="${esc(m.item)}" data-from="${esc(b)}">Use ${esc(nameB)} in ${esc(a)} too</button></span></li>`;
    }).join("");
    return `<div class="mismatch" role="status"><p><strong>The two systems use different datasets.</strong> A fair comparison needs the same background data on both sides.</p><ul>${items}</ul></div>`;
  }

  // ---- panel 1: foreground ----

  function addonLines(v, input) {
    return (input.addons || []).map((addon) => {
      const amount = Number(addon.per_printed_unit) * Number(input.amount_printed);
      if (addon.type === "input") {
        const flow = v.bundle.flows[addon.flow] || {};
        return `<span class="addon">Extra input: ${fmt(amount)} ${esc(flow.unit || "")} ${esc(flow.name || "")} from ${datasetButton(v, addon.provider)}</span>`;
      }
      const flow = v.bundle.flows[addon.flow] || {};
      return `<span class="addon">Added directly: ${fmt(addon.per_printed_unit)} ${esc(addon.unit_note || "per printed unit")} × ${fmt(input.amount_printed)} ${esc(input.unit_printed)} = <strong>${fmt(amount)} ${esc(flow.unit || "")} ${esc(flow.name || "")}</strong>${uid(v, addon.flow)}</span>`;
    }).join("");
  }

  function commonPrefixLength(names) {
    if (names.length < 2) return 0;
    const split = names.map((name) => name.split(" · "));
    let k = 0;
    while (split.every((parts) => parts.length > k + 1 && parts[k] === split[0][k])) k += 1;
    return k;
  }

  function providerSelect(v, key, input) {
    const { bundle } = v;
    const label = itemLabel(bundle, input.item);
    const chosen = v.choices[v.active]?.[key] || input.provider;
    const candidates = (bundle.producers[input.flow] || []).filter((uuid) => bundle.processes[uuid]);
    const names = candidates.map((uuid) => processName(bundle, uuid));
    const k = commonPrefixLength(names);
    const text = (uuid) => {
      const parts = processName(bundle, uuid).split(" · ");
      return [parts.slice(k).join(" · "), where(bundle.processes[uuid])].filter(Boolean).join(" · ")
        + (uuid === input.provider ? " (default)" : "");
    };
    const order = candidates.slice().sort((a, b) => (b === input.provider) - (a === input.provider) || text(a).localeCompare(text(b)));
    const prefix = k ? names[0].split(" · ").slice(0, k).join(" · ") : "";
    const options = order.map((uuid) => `<option value="${esc(uuid)}"${uuid === chosen ? " selected" : ""}>${esc(text(uuid))}</option>`).join("");
    const count = candidates.length > 1 ? `${candidates.length} options in TianGong` : "the only dataset in TianGong";
    return `${prefix ? `<small class="prefix">${esc(prefix)} ·</small>` : ""}<select class="provider" data-key="${esc(key)}" aria-label="Provider for ${esc(label)}">${options}</select><span class="row-actions">${datasetButton(v, chosen, "Open dataset")}<small>${count}</small></span>`;
  }

  function foregroundHtml(v) {
    const { bundle, active } = v;
    const fg = bundle.systems[active];
    const rows = [];
    for (const stage of fg.stages) {
      stage.inputs.forEach((input, index) => {
        const key = `${active}/${stage.id}/${input.item}`;
        const head = index === 0
          ? `<th scope="rowgroup" rowspan="${stage.inputs.length}">${esc(stage.name)}${stage.note ? `<small>${esc(stage.note)}</small>` : ""}${uid(v, stage.id)}</th>`
          : "";
        const label = `${esc(itemLabel(bundle, input.item))}${input.note ? `<small>${esc(input.note)}</small>` : ""}${uid(v, input.flow)}`;
        const printed = `${fmt(input.amount_printed)} ${esc(input.unit_printed || "")}`;
        let converted = "—";
        let provider;
        if (input.cutoff) {
          const full = v.audit ? `<details><summary>Full mapping note</summary><small>${esc(input.why)}</small></details>` : "";
          provider = `<span class="badge">Cut-off</span> ${esc(input.why_short || bundle.provider_choices?.[input.item]?.why_short || "No usable dataset in TianGong.")}${full}${addonLines(v, input)}`;
        } else {
          const factor = Number(input.convert_factor ?? 1);
          converted = `${fmt(input.amount)} ${esc(input.unit || "")}${factor !== 1 ? `<small>× ${fmt(factor)} ${esc(input.unit || "")}/${esc(input.unit_printed || "")}</small>` : ""}`;
          provider = providerSelect(v, key, input) + addonLines(v, input);
        }
        rows.push(`<tr>${head}<td>${label}</td><td class="number">${printed}</td><td class="number">${converted}</td><td class="provider-cell">${provider}</td></tr>`);
      });
    }
    return `<p class="muted">${esc(fg.title)} · ${esc(fg.functional_unit.description)}.</p><p class="hint">Provider choices in this table apply to <strong>${esc(active)}</strong> only. Click <em>Open dataset</em> to see what a TianGong dataset contains.</p>${table(["Stage", "Input", "Amount in the paper", "Amount in TianGong units", "Provider (TianGong dataset)"], rows, "foreground")}`;
  }

  // ---- panel 2: results ----

  function resultsHtml(v) {
    const names = Object.keys(v.runs);
    const first = v.runs[names[0]].system;
    const k = methodIndex(first, v.method);
    const method = first.methods[k];
    const cc = methodIndex(first, "Climate change");
    const headline = names.map((name) => {
      const run = v.runs[name];
      return `<div class="metric"><span>${esc(name)} · total climate change</span><strong>${fmt(run.result.impacts[cc])}</strong><small>${esc(unitOf(run.system.methods[cc]))}</small></div>`;
    }).join("");
    const chart = `<h3>${esc(method.name)} — both systems <small>(${esc(unitOf(method))})</small></h3>${bars(names.map((name) => ({ label: name, value: v.runs[name].result.impacts[k] })))}`;
    const row = (m, i) => `<tr${m.name === v.method ? ' class="current"' : ""}><td>${esc(m.name)}${uid(v, m.uuid)}</td>${names.map((name) => `<td class="number">${fmt(v.runs[name].result.impacts[i])}</td>`).join("")}<td>${esc(unitOf(m))}</td></tr>`;
    const main = [], sub = [];
    first.methods.forEach((m, i) => (SUB_INDICATOR.test(m.name) ? sub : main).push(row(m, i)));
    const heads = ["Impact category", ...names, "Unit"];
    return `<div class="metrics">${headline}</div><div class="chart">${chart}</div>${table(heads, main, "results")}<details><summary>Sub-indicators (${sub.length})</summary>${table(heads, sub, "results")}</details>`;
  }

  // ---- panel 3: contributions ----

  function contributionsHtml(v) {
    const run = v.runs[v.active], sys = run.system;
    const k = methodIndex(sys, v.method), method = sys.methods[k], unit = unitOf(method);
    const total = run.result.impacts[k];
    const stages = sys.foreground.stages.map((stage) => ({ label: stage.name, value: run.contribution.byStage[stage.id][k] }));
    const sum = stages.reduce((a, x) => a + x.value, 0);
    const adds = Math.abs(sum - total) <= 1e-6 * Math.max(1, Math.abs(total));
    const check = adds
      ? `The stages add up to the total, ${fmt(total)} ${esc(unit)}.`
      : `The stages add up to ${fmt(sum)} ${esc(unit)}, not to the total ${fmt(total)}: check the model.`;
    const stageHtml = `<h3>By foreground stage <small>(${esc(unit)})</small></h3>${bars(stages, total)}<p class="muted">${check}</p>`;

    const columnName = (id) => {
      const kind = sys.colKind[id];
      if (kind === "process") return `${datasetButton(v, id)}<small>${esc(where(v.bundle.processes[id]))}</small>`;
      return `${esc(sys.colLabel[id])}<small>${kind === "stage" ? "emissions booked directly on this stage (add-ons)" : "the system itself"}</small>${uid(v, id)}`;
    };
    const procs = topIndexes(run.contribution.byProcess[k], 10).map((j) => {
      const value = run.contribution.byProcess[k][j];
      return `<tr><td>${columnName(sys.cols[j])}</td><td class="number">${fmt(value)}</td><td class="number">${pct(value, total)}</td></tr>`;
    });
    const flows = topIndexes(run.contribution.byFlow[k], 10).map((i) => {
      const key = sys.elemKeys[i], flow = v.bundle.flows[key.flow] || {}, value = run.contribution.byFlow[k][i];
      const parts = core.flowByProcess(sys, run.scaling, k, i);
      const emitters = topIndexes(parts, 5).map((j) => `<li>${columnName(sys.cols[j])}<span class="number">${fmt(parts[j])} · ${pct(parts[j], value)} of this flow</span></li>`).join("");
      return `<tr><td><details class="drill"><summary>${esc(flow.name || "Unnamed flow")} <small>${esc(flowKind(flow, key.dir))}</small></summary><p class="muted">Emitted by:</p><ol class="emitters">${emitters}</ol></details>${uid(v, key.flow)}</td><td class="number">${fmt(value)}</td><td class="number">${pct(value, total)}</td></tr>`;
    });
    if (!procs.length) return `${stageHtml}<p class="empty">Nothing in this model contributes to ${esc(method.name)}.</p>`;
    return `${stageHtml}<div class="grid2"><div><h3>Top 10 processes</h3>${table(["Process (TianGong dataset)", unit, "Share"], procs)}</div><div><h3>Top 10 elementary flows</h3><p class="hint">Click a flow to see which processes emit it.</p>${table(["Elementary flow", unit, "Share"], flows)}</div></div>`;
  }

  // ---- panel 4: cut-offs and provider choices ----

  function ruleText(rule) {
    const geo = String(rule || "").match(/^geo-match-(\d+)/);
    if (geo) return `closest location (${geo[1]} shared level${geo[1] === "1" ? "" : "s"}), then the more general, then the latest`;
    if (rule === "override") return "pinned in the case files";
    if (rule === "unique") return "the only dataset";
    return "";
  }

  // Student view: background cut-offs as one sentence, with the foreground provider that loses the largest share of
  // its product inputs as the example. The full list stays in the audit view and in each dataset card.
  function backgroundNote(v, sys, groups, count) {
    if (!count) return "";
    const { bundle } = v;
    const direct = new Set(sys.providerLog.filter((entry) => String(entry.consumer).startsWith(STAGE)).map((entry) => entry.provider));
    let example = null;
    for (const [consumer, cuts] of groups) {
      const p = bundle.processes[consumer];
      if (!direct.has(consumer) || !p) continue;
      const inputs = new Set(p.exchanges.filter((e) => e.dir === "in" && e.flow !== p.ref_flow
        && String(bundle.flows[e.flow]?.type || "").startsWith("Product")).map((e) => e.flow));
      const cut = new Set(cuts.map((entry) => entry.flow)).size;
      if (inputs.size && (!example || cut / inputs.size > example.cut / example.of)) example = { consumer, cut, of: inputs.size };
    }
    const instance = example
      ? ` For example, ${example.cut} of the ${example.of} product inputs of ${datasetButton(v, example.consumer)} have no producer.`
      : "";
    return `<p class="hint">Another ${count} inputs, listed inside ${groups.size} background datasets, have no producer in TianGong either and also count as zero.${instance} Open a dataset card to see which inputs are cut off.</p>`;
  }

  function qualityHtml(v) {
    const { bundle } = v, run = v.runs[v.active], sys = run.system;
    const foregroundCuts = sys.cutoffs.filter((cut) => cut.item);
    const backgroundCuts = sys.cutoffs.filter((cut) => !cut.item);

    const cutRows = foregroundCuts.map((cut) => {
      const full = v.audit ? `<details><summary>Full mapping note</summary><small>${esc(cut.why)}</small></details>` : "";
      return `<tr><td>${esc(stageName(sys, String(cut.where).split("/")[1]))}</td><td>${esc(itemLabel(bundle, cut.item))}</td><td class="number">${fmt(cut.amount)} ${esc(cut.unit || "")}</td><td>${esc(bundle.provider_choices?.[cut.item]?.why_short || "")}${full}</td></tr>`;
    });
    const groups = new Map();
    for (const cut of backgroundCuts) {
      if (!groups.has(cut.where)) groups.set(cut.where, []);
      groups.get(cut.where).push(cut);
    }
    const background = [...groups.entries()]
      .sort((a, b) => processName(bundle, a[0]).localeCompare(processName(bundle, b[0])))
      .map(([consumer, cuts]) => {
        const ref = (bundle.processes[consumer]?.exchanges || []).find((e) => e.ref);
        const refFlow = bundle.flows[ref?.flow] || {};
        const per = ref ? ` per ${fmt(ref.amount)} ${esc(refFlow.unit || "")} of ${esc(refFlow.name || ref.name || "output")}` : "";
        return `<li>${datasetButton(v, consumer)}<ul>${cuts.map((cut) => `<li>${esc(cut.name || bundle.flows[cut.flow]?.name || "Unnamed input")}: ${fmt(cut.amount)} ${esc(cut.unit || "")}${per}${uid(v, cut.flow)}</li>`).join("")}</ul></li>`;
      }).join("");
    const cutList = `<h3>In the foreground stages (${foregroundCuts.length})</h3>${table(["Stage", "Input", "Amount", "Why"], cutRows)}`
      + (v.audit
        ? `<details><summary>Inside background datasets (${backgroundCuts.length} inputs in ${groups.size} datasets)</summary><p class="hint">Inputs that a background dataset lists but no TianGong dataset produces. Amounts are per the dataset's own reference output.</p><ul class="cutoff-groups">${background}</ul></details>`
        : backgroundNote(v, sys, groups, backgroundCuts.length));

    const chosen = sys.providerLog.filter((entry) => String(entry.consumer).startsWith(STAGE));
    const chosenRows = chosen.map((entry) => `<tr><td>${esc(itemLabel(bundle, entry.item))}</td><td>${esc(stageName(sys, entry.consumer.slice(STAGE.length)))}</td><td>${datasetButton(v, entry.provider)}<small>${esc(where(bundle.processes[entry.provider]))}</small></td><td class="number">${entry.n_candidates}</td><td>${esc(bundle.provider_choices?.[entry.item]?.why_short || "")}${v.audit ? `<small class="uuid">${esc(entry.rule)}</small>` : ""}</td></tr>`);
    const automatic = sys.providerLog.filter((entry) => !String(entry.consumer).startsWith(STAGE) && Number(entry.n_candidates || 0) > 1);
    const automaticRows = automatic.map((entry) => `<tr><td>${esc(bundle.flows[entry.flow]?.name || "Product")}${uid(v, entry.flow)}</td><td>${datasetButton(v, entry.consumer)}</td><td>${datasetButton(v, entry.provider)}<small>${esc(where(bundle.processes[entry.provider]))}</small></td><td class="number">${entry.n_candidates}</td><td>${esc(ruleText(entry.rule))}${v.audit ? `<small class="uuid">${esc(entry.rule)}</small>` : ""}</td></tr>`);
    const chosenTable = table(["Input", "Stage", "Provider used", "Options", "Why this one"], chosenRows);
    const providerLog = v.audit
      ? `<h3>Foreground inputs (${chosen.length})</h3>${chosenTable}<details><summary>Chosen automatically inside background datasets (${automatic.length})</summary>${table(["Product", "Needed by", "Provider chosen", "Options", "Rule"], automaticRows)}</details>`
      : `<p class="hint">The dataset each input is linked to, how many TianGong offers, and why this one.</p>${chosenTable}`;

    const addonRows = sys.addonLog.map((addon) => {
      const flow = bundle.flows[addon.flow] || {};
      return `<tr><td>${esc(stageName(sys, addon.stage))}</td><td>${esc(itemLabel(bundle, addon.item))}</td><td class="number">${fmt(addon.amount)} ${esc(flow.unit || "")} ${esc(flow.name || "")}${uid(v, addon.flow)}</td><td>${esc(addon.note || "")}${addon.source ? `<small>${esc(addon.source)}</small>` : ""}</td></tr>`;
    });

    let audit = "";
    if (v.audit) {
      const unc = core.uncharacterisedFlows(sys, run.result.inventory).map((x) => `<tr><td>${esc(x.name)} [${esc(x.dir)}]<span class="uuid">${esc(x.flow)}</span></td><td class="number">${fmt(x.amount)} ${esc(x.unit || "")}</td></tr>`);
      const warnings = sys.warnings.map((x) => `<tr><td>${esc(processName(bundle, x.process))}<span class="uuid">${esc(x.process)}</span></td><td>${esc(x.kind)}</td><td>${esc(x.n || x.flows?.join(", ") || "")}</td></tr>`);
      audit = detail("Audit · linked but uncharacterised elementary flows", unc.length, table(["Flow", "Inventory amount"], unc))
        + detail("Audit · reachable-process data warnings", warnings.length, table(["Process", "Warning", "Detail"], warnings));
    }

    return `<p class="notice">These are the modelling decisions behind the numbers. A <strong>cut-off</strong> is an input with no dataset in TianGong: it counts as zero, so it stays listed here. Click a dataset name to open it.</p>`
      + detail("Cut-off list", foregroundCuts.length + backgroundCuts.length, cutList, true)
      + detail("Provider log", chosen.length + (v.audit ? automatic.length : 0), providerLog)
      + detail("Direct emissions added by hand (add-ons)", addonRows.length, table(["Stage", "Input", "Amount", "How it is calculated"], addonRows))
      + audit;
  }

  // ---- panel 5: the matrix ----

  function matrixHtml(v) {
    const run = v.runs[v.active], sys = run.system, view = core.foregroundMatrix(sys);
    const n = sys.A.length;
    const nonzero = sys.A.reduce((count, row) => count + row.reduce((a, x) => a + (x !== 0), 0), 0);
    const kinds = view.ids.map((id) => sys.colKind[id]);
    const label = (id) => (sys.colKind[id] === "process" ? processName(v.bundle, id) : sys.colLabel[id]);
    const unit = (id) => (sys.colKind[id] === "process" ? v.bundle.flows[v.bundle.processes[id]?.ref_flow]?.unit || "" : "");
    const groups = [["system", "System"], ["stage", "Foreground stages"], ["process", "Direct providers"]]
      .map(([kind, title]) => [title, kinds.filter((x) => x === kind).length]).filter(([, count]) => count);
    const groupRow = `<tr><th></th>${groups.map(([title, count]) => `<th class="group" colspan="${count}">${title}</th>`).join("")}</tr>`;
    const short = (text) => (text.length > 44 ? `${text.slice(0, 42).trimEnd()}…` : text);
    const headRow = `<tr><th>row ↓ / column →</th>${view.ids.map((id) => `<th title="${esc(label(id))}">${esc(short(label(id)))}${uid(v, id)}</th>`).join("")}</tr>`;
    const body = view.matrix.map((row, i) => {
      const id = view.ids[i];
      return `<tr><th scope="row">${esc(label(id))}${unit(id) ? ` <small>(${esc(unit(id))})</small>` : ""}${uid(v, id)}</th>${Array.from(row, (x) => `<td class="number">${x === 0 ? "·" : fmt(x)}</td>`).join("")}</tr>`;
    }).join("");
    const size = v.audit
      ? `${n} × ${n}, with ${nonzero.toLocaleString("en")} nonzero cells (${((nonzero / n / n) * 100).toFixed(2)} % density)`
      : `${n} × ${n}`;
    return `<p class="muted">The full A solved is ${size}. This table keeps the system, the stages and the providers they buy from directly. Row i is the reference product of column i: the diagonal holds what a column produces, negative cells what it consumes.</p><div class="scroll"><table class="matrix"><thead>${groupRow}${headRow}</thead><tbody>${body}</tbody></table></div>`;
  }

  // ---- dataset card ----

  // Where a dataset comes from, in words a student can read. Census entries are cited in Chinese with handbook page
  // numbers; the audit view keeps that original citation.
  function sourceLines(v, p) {
    const cited = (p.sources || []).map((source) => `${esc(source.name)}${uid(v, source.uuid)}`);
    const census = /NESPS2/.test(p.name) || (p.sources || []).some((source) => /污染源普查/.test(source.name || ""));
    if (census) {
      const line = "China's Second National Pollution Source Census (NESPS2): a handbook of emission coefficients per unit of product.";
      return v.audit ? [line, ...cited] : [line];
    }
    if (/CEEIO/.test(p.name)) {
      return ["Chinese environmentally extended input-output table (CEEIO), 2018: a whole economic sector, measured in euros.", ...cited];
    }
    return cited;
  }

  function datasetHtml(v, uuid) {
    const { bundle } = v, p = bundle.processes[uuid];
    if (!p) return `<p class="error">This dataset is not in the case bundle.</p>`;
    const run = v.runs[v.active], sys = run.system;
    const inModel = Object.prototype.hasOwnProperty.call(sys.colIndex, uuid);
    const k = methodIndex(sys, v.method), method = sys.methods[k], unit = unitOf(method);
    const refFlow = bundle.flows[p.ref_flow] || {};

    const links = new Map(), cut = new Set();
    for (const entry of sys.providerLog) if (entry.consumer === uuid && entry.provider !== uuid) links.set(entry.flow, entry.provider);
    for (const entry of sys.cutoffs) if (entry.where === uuid) cut.add(entry.flow);

    const roles = [];
    const asForeground = sys.providerLog.filter((entry) => entry.provider === uuid && String(entry.consumer).startsWith(STAGE));
    for (const entry of asForeground) {
      roles.push(`Provider of <strong>${esc(itemLabel(bundle, entry.item))}</strong> for the stage ${esc(stageName(sys, entry.consumer.slice(STAGE.length)))} in ${esc(v.active)}.`);
    }
    const users = [...new Set(sys.providerLog.filter((entry) => entry.provider === uuid && entry.consumer !== uuid && !String(entry.consumer).startsWith(STAGE)).map((entry) => entry.consumer))];
    if (users.length) {
      roles.push(`Supplies ${users.length} other dataset${users.length > 1 ? "s" : ""} in the model: ${users.slice(0, 4).map((user) => datasetButton(v, user)).join(", ")}${users.length > 4 ? ` and ${users.length - 4} more` : ""}.`);
    }
    if (!inModel) roles.push(`Not used in the current ${esc(v.active)} model: it is an alternative you can pick in the stage table.`);

    let impact = "";
    if (inModel) {
      const per = core.unitImpacts(sys, uuid)[k];
      let printed = "";
      for (const stage of sys.foreground.stages) {
        for (const input of stage.inputs) {
          const chosen = v.choices[v.active]?.[`${v.active}/${stage.id}/${input.item}`] || input.provider;
          if (!printed && !input.cutoff && chosen === uuid && Number(input.convert_factor) !== 1) {
            printed = ` = ${fmt(per * Number(input.convert_factor))} ${esc(unit)} per ${esc(input.unit_printed)}`;
          }
        }
      }
      impact = `<p class="impact"><strong>${esc(method.name)}:</strong> ${fmt(per)} ${esc(unit)} per 1 ${esc(refFlow.unit || "")} of ${esc(refFlow.name || "its product")}${printed}, counting everything upstream that this model links.</p>`;
    }

    let why = "";
    const item = asForeground[0]?.item;
    if (item && bundle.provider_choices?.[item]?.why_short) {
      why = `<p><strong>Why this dataset:</strong> ${esc(bundle.provider_choices[item].why_short)} <small>${(bundle.producers[p.ref_flow] || []).length} dataset(s) in TianGong produce this flow.</small></p>`;
    }

    const rows = { in: [], out: [] };
    const seen = new Map();
    const exchanges = p.exchanges.slice().sort((a, b) => Boolean(b.ref) - Boolean(a.ref));
    for (const e of exchanges) {
      const flow = bundle.flows[e.flow] || {}, type = flow.type || "";
      seen.set(`${e.flow}${e.dir}`, (seen.get(`${e.flow}${e.dir}`) || 0) + 1);
      let status;
      if (e.ref) status = "<strong>reference product</strong>";
      else if (type.startsWith("Elementary")) {
        const factor = factorOf(method, e.flow, e.dir);
        status = `${esc(flowKind(flow, e.dir))}${factor ? ` · ${esc(method.name)} factor ${fmt(factor)} ${esc(unit)} per ${esc(flow.unit || "unit")}` : ""}`;
      } else if (e.dir === "in" && type.startsWith("Product")) {
        if (e.flow === p.ref_flow) status = "its own product, netted against the output";
        else if (links.has(e.flow)) status = `from ${datasetButton(v, links.get(e.flow))}`;
        else if (cut.has(e.flow)) status = `<span class="badge">Cut-off</span> no dataset in TianGong produces it`;
        else status = inModel ? "not linked" : "linked only when this dataset is used";
      } else status = e.dir === "out" ? "by-product or waste: not linked" : "not a product flow: not linked";
      rows[e.dir === "in" ? "in" : "out"].push(`<tr><td>${esc(e.name || flow.name || "Unnamed flow")}${uid(v, e.flow)}</td><td class="number">${fmt(e.amount)} ${esc(flow.unit || "")}</td><td>${status}</td></tr>`);
    }
    const repeated = [...seen.values()].some((count) => count > 1);
    const inputs = rows.in.length ? table(["Flow", "Amount", "In this model"], rows.in) : `<p class="empty">No inputs listed in this dataset.</p>`;
    const outputs = table(["Flow", "Amount", "In this model"], rows.out);
    const sources = sourceLines(v, p).map((line) => `<li>${line}</li>`).join("");

    return `<p class="eyebrow">TianGong dataset</p><h2 id="dataset-title">${esc(processName(bundle, uuid))}</h2>`
      + (v.audit && p.name_zh ? `<p class="zh" lang="zh">${esc(tidy(p.name_zh))}</p>` : "")
      + `<p class="chips">${[p.geo, p.year, v.audit ? p.type : null].filter(Boolean).map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</p>`
      + (v.audit && p.classification?.length ? `<p class="muted">${esc(p.classification.join(" / "))}</p>` : "")
      + uid(v, uuid)
      + (roles.length ? `<ul class="roles">${roles.map((role) => `<li>${role}</li>`).join("")}</ul>` : "")
      + impact + why
      + `<h3>Inputs, per ${fmt(p.exchanges.find((e) => e.ref)?.amount)} ${esc(refFlow.unit || "")} of ${esc(refFlow.name || "product")}</h3>${inputs}`
      + `<h3>Outputs</h3>${outputs}`
      + (repeated ? `<p class="muted">Some flows appear in several rows; the model adds them up.</p>` : "")
      + (sources ? `<h3>Source</h3><ul class="sources">${sources}</ul>` : "")
      + `<p><a href="${TIANGONG}${encodeURIComponent(uuid)}" target="_blank" rel="noopener">Open this dataset on the TianGong node</a> <small>(needs internet)</small></p>`;
  }

  // The CSV export: both systems side by side; the method uuids only in the audit view.
  function csvRows(v) {
    const names = Object.keys(v.runs), methods = v.runs[names[0]].system.methods;
    return [
      ["method", ...(v.audit ? ["method_uuid"] : []), "unit", ...names],
      ...methods.map((m, i) => [m.name, ...(v.audit ? [m.uuid] : []), unitOf(m), ...names.map((name) => v.runs[name].result.impacts[i])]),
    ];
  }

  return {
    auditAllowed,
    csvRows,
    esc,
    fmt,
    tidy,
    itemLabel,
    mismatches,
    syncChoices,
    mismatchHtml,
    foregroundHtml,
    resultsHtml,
    contributionsHtml,
    qualityHtml,
    matrixHtml,
    datasetHtml,
  };
});
