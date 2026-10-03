#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const core = require("./lca_core.js");
const ui = require("./lca_ui.js");
const here = path.dirname(fileURLToPath(import.meta.url));
const bundleText = await readFile(path.join(here, "data/case_bundle.json"), "utf8");
const bundle = JSON.parse(bundleText);
const expected = JSON.parse(await readFile(path.join(here, "../tests/expected_results.json"), "utf8"));
const tolerance = expected.tolerance_rel;
let failed = 0;

const bundleHash = createHash("sha256").update(bundleText).digest("hex");
if (bundleHash === expected.bundle_sha256) console.log(`PASS bundle sha256: ${bundleHash}`);
else {
  console.log(`FAIL bundle sha256: ${bundleHash} (expected ${expected.bundle_sha256})`);
  failed += 1;
}

function check(label, actual, wanted, relativeTolerance = tolerance) {
  // The absolute floor treats floating-point residue around mathematical zero
  // consistently (one expected stage value is 2.7e-19 rather than literal 0).
  const allowed = Math.max(1e-9, Math.abs(wanted) * relativeTolerance);
  const ok = Number.isFinite(actual) && Math.abs(actual - wanted) <= allowed;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual} (expected ${wanted})`);
  if (!ok) failed += 1;
}

for (const name of Object.keys(expected.systems)) {
  const system = core.buildSystem(bundle, { system: name });
  const scaling = core.solve(system, system.demand);
  const result = core.lcia(system, scaling);
  const contribution = core.contributions(system, scaling);
  const contract = expected.systems[name];

  try {
    assert.equal(system.cols.length, contract.n_processes_solved);
    console.log(`PASS ${name} process count: ${system.cols.length}`);
  } catch {
    console.log(`FAIL ${name} process count: ${system.cols.length} (expected ${contract.n_processes_solved})`);
    failed += 1;
  }

  const foregroundCutoffs = system.cutoffs.filter((cutoff) => cutoff.item);
  try {
    assert.deepEqual(foregroundCutoffs, contract.cutoffs);
    console.log(`PASS ${name} foreground cut-offs: ${foregroundCutoffs.length}`);
  } catch {
    console.log(`FAIL ${name} foreground cut-offs differ from expected results`);
    failed += 1;
  }

  const selfNetted = system.providerLog.filter((entry) => entry.rule === "self-netted");
  const invalidSelfCutoffs = system.cutoffs.filter((cutoff) => {
    const process = bundle.processes[cutoff.where];
    return process && cutoff.flow === process.ref_flow;
  });
  if (selfNetted.length > 0 && invalidSelfCutoffs.length === 0
      && selfNetted.every((entry) => entry.consumer === entry.provider)) {
    console.log(`PASS ${name} self-netted links: ${selfNetted.length}`);
  } else {
    console.log(`FAIL ${name} self-netted links: ${selfNetted.length}; own-product cut-offs: ${invalidSelfCutoffs.length}`);
    failed += 1;
  }

  system.methods.forEach((method, methodIndex) => {
    if (method.unit === contract.totals[method.name].unit) {
      console.log(`PASS ${name} unit / ${method.name}: ${method.unit}`);
    } else {
      console.log(`FAIL ${name} unit / ${method.name}: ${method.unit} (expected ${contract.totals[method.name].unit})`);
      failed += 1;
    }
    check(`${name} total / ${method.name}`, result.impacts[methodIndex], contract.totals[method.name].value);
    for (const [stageId, stageValues] of Object.entries(contribution.byStage)) {
      check(
        `${name} stage ${stageId} / ${method.name}`,
        stageValues[methodIndex],
        contract.by_stage[method.name][stageId],
      );
    }
    const processSum = contribution.byProcess[methodIndex].reduce((sum, value) => sum + value, 0);
    const stageSum = Object.values(contribution.byStage)
      .reduce((sum, values) => sum + values[methodIndex], 0);
    check(`${name} identity process / ${method.name}`, processSum, result.impacts[methodIndex], 1e-9);
    check(`${name} identity stage / ${method.name}`, stageSum, result.impacts[methodIndex], 1e-9);
  });
}

// ---- Student view (web/lca_ui.js): render every panel in Node, the way index.html does ----

function report(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failed += 1;
}

// Text a student can see: element content plus the attributes browsers show (tooltips, labels).
function visibleText(html) {
  const shown = [...html.matchAll(/\s(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((match) => match[1]);
  return `${html.replace(/<[^>]*>/g, " ")} ${shown.join(" ")}`;
}
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const AUDIT_CODES = [UUID, /\[[0-9a-f]{8}\]/i, /\bstage:/, /foreground-choice/, /geo-match-/, /self-netted/, /VERIFIER/, /exact_duplicate_rows|variant_rows_summed/];
const onScreen = (html) => AUDIT_CODES.filter((pattern) => pattern.test(visibleText(html))).map(String);

const names = Object.keys(bundle.systems);
const runs = {};
for (const name of names) {
  const system = core.buildSystem(bundle, { system: name });
  const scaling = core.solve(system);
  runs[name] = { system, scaling, result: core.lcia(system, scaling), contribution: core.contributions(system, scaling) };
}
const electricity = bundle.provider_choices.electricity;
const otherGrid = bundle.producers[electricity.flow].find((uuid) => uuid !== electricity.default_provider);
const oneSided = { SVE: { "SVE/operation/electricity": otherGrid }, Biopile: {} };

for (const name of names) {
  let html = "";
  for (const method of ["Climate change", "Acidification", "Ecotoxicity, freshwater"]) {
    const view = { bundle, runs, active: name, method, choices: oneSided, audit: false };
    html += [ui.mismatchHtml(view, true), ui.mismatchHtml(view), ui.foregroundHtml(view), ui.resultsHtml(view),
      ui.contributionsHtml(view), ui.qualityHtml(view), ui.matrixHtml(view)].join("\n");
  }
  const found = onScreen(html);
  report(`${name} student view shows no uuid or audit code`, found.length === 0, found.length ? found.join(", ") : `${html.length.toLocaleString("en")} characters, 5 panels × 3 categories`);

  const cutoffInputs = bundle.systems[name].stages.flatMap((stage) => stage.inputs).filter((input) => input.cutoff).length;
  const badges = (ui.foregroundHtml({ bundle, runs, active: name, method: "Climate change", choices: { SVE: {}, Biopile: {} }, audit: false })
    .match(/class="badge">Cut-off</g) || []).length;
  report(`${name} cut-off rows render`, badges === cutoffInputs, `${badges} of ${cutoffInputs}`);

  const audit = { bundle, runs, active: name, method: "Climate change", choices: oneSided, audit: true };
  const auditHtml = ui.foregroundHtml(audit) + ui.qualityHtml(audit) + ui.matrixHtml(audit);
  report(`${name} audit view (?audit=1) shows the uuids`, UUID.test(visibleText(auditHtml)));

  const student = { bundle, runs, active: name, method: "Climate change", choices: { SVE: {}, Biopile: {} }, audit: false };
  const leaks = [], metadata = [];
  for (const uuid of Object.keys(bundle.processes)) {
    const card = ui.datasetHtml(student, uuid), p = bundle.processes[uuid];
    if (onScreen(card).length) leaks.push(uuid);
    const chinese = p.name_zh && /[一-鿿]/.test(p.name_zh) && visibleText(card).includes(ui.tidy(p.name_zh));
    const classification = p.classification?.length && card.includes(ui.esc(p.classification.join(" / ")));
    if (chinese || classification || /污染源普查|Unit process, single operation/.test(card)) metadata.push(uuid);
  }
  report(`${name} dataset cards show no uuid or audit code`, leaks.length === 0, leaks.length ? leaks.slice(0, 3).join(", ") : `${Object.keys(bundle.processes).length} cards`);
  report(`${name} dataset cards leave out the Chinese name, classification path, dataset type and census page reference`, metadata.length === 0, metadata.length ? metadata.slice(0, 3).join(", ") : `${Object.keys(bundle.processes).length} cards`);

  const quality = ui.qualityHtml(student), matrix = ui.matrixHtml(student);
  const details = [/Chosen automatically/, /class="cutoff-groups"/, /nonzero cells/, /% density/].filter((pattern) => pattern.test(quality + matrix)).map(String);
  const summary = visibleText(quality).match(/Another (\d+) inputs, listed inside (\d+) background datasets/);
  report(`${name} student view summarises background cut-offs in one sentence and drops resolution rules and matrix statistics`,
    details.length === 0 && Boolean(summary), details.length ? details.join(", ") : `${summary?.[1]} inputs in ${summary?.[2]} datasets`);
}

const auditCases = [
  ["https://xiaoyuxie39-oss.github.io/TiangongLCA-demo/?audit=1", false],
  ["https://xiaoyuxie39-oss.github.io/TiangongLCA-demo/", false],
  ["http://localhost:8765/?audit=1", true],
  ["http://127.0.0.1:8000/index.html?audit", true],
  ["file:///Users/someone/TiangongLCA-demo/web/index.html?audit=1", true],
  ["http://localhost:8765/", false],
];
const wrongAudit = auditCases.filter(([href, wanted]) => ui.auditAllowed(href) !== wanted).map(([href]) => href);
report("audit view only on a local copy (?audit=1 does nothing on the public site)", wrongAudit.length === 0, wrongAudit.join(", ") || `${auditCases.length} addresses`);

const csvStudent = ui.csvRows({ bundle, runs, active: "SVE", method: "Climate change", choices: { SVE: {}, Biopile: {} }, audit: false });
const csvAudit = ui.csvRows({ bundle, runs, active: "SVE", method: "Climate change", choices: { SVE: {}, Biopile: {} }, audit: true });
report("CSV export: no uuid for students, method uuids in the audit view",
  !csvStudent.flat().some((cell) => UUID.test(String(cell))) && csvAudit[0].includes("method_uuid") && csvStudent.length === bundle.methods.length + 1,
  `${csvStudent.length - 1} categories × ${csvStudent[0].length - 2} systems`);

const defaults = { SVE: {}, Biopile: {} };
const before = ui.mismatches(bundle, defaults).length;
const during = ui.mismatches(bundle, oneSided).map((entry) => entry.item).join();
const after = ui.mismatches(bundle, ui.syncChoices(bundle, oneSided, "electricity", "SVE")).length;
report("grid mismatch banner: none by default, one after a one-sided change, none after syncing", before === 0 && during === "electricity" && after === 0, `${before} / ${during || "none"} / ${after}`);

// Flow drill-down: Σ_j Q[k,i] B[i,j] s_j = Q[k,i] g_i for every flow and method.
for (const name of names) {
  const { system, scaling, contribution } = runs[name];
  let worst = 0;
  system.methods.forEach((method, k) => {
    system.elemKeys.forEach((key, i) => {
      const sum = core.flowByProcess(system, scaling, k, i).reduce((a, x) => a + x, 0);
      worst = Math.max(worst, Math.abs(sum - contribution.byFlow[k][i]) / Math.max(1e-30, Math.abs(contribution.byFlow[k][i])));
    });
  });
  report(`${name} identity flow drill-down (Σ processes = flow total)`, worst <= 1e-9, `worst relative deviation ${worst.toExponential(2)}`);
}

// Unit impacts: a stage without add-ons is Σ amount × (impact of one unit of its provider).
// Deviations are measured against the category total: near-zero stage values carry solver residue.
for (const name of names) {
  const { system, contribution, result } = runs[name];
  const tested = [];
  let worst = 0;
  for (const stage of bundle.systems[name].stages) {
    if (stage.inputs.some((input) => input.addons?.length)) continue;
    const expectedStage = new Float64Array(system.methods.length);
    for (const input of stage.inputs.filter((x) => !x.cutoff)) {
      const unit = core.unitImpacts(system, input.provider);
      unit.forEach((value, k) => { expectedStage[k] += Number(input.amount) * value; });
    }
    expectedStage.forEach((value, k) => {
      const actual = contribution.byStage[stage.id][k];
      worst = Math.max(worst, Math.abs(value - actual) / Math.max(1e-30, Math.abs(result.impacts[k])));
    });
    tested.push(stage.id);
  }
  report(`${name} identity unit impacts (stage = Σ amount × unit impact of provider)`, worst <= 1e-9, `${tested.join(", ")}; worst deviation ${worst.toExponential(2)} of the category total`);
}

// The page must carry the same bundle for file:// use.
const page = await readFile(path.join(here, "index.html"), "utf8");
const inline = page.match(/<script id="case-bundle-inline" type="application\/json" data-encoding="gzip-base64">([^<]*)<\/script>/);
const inlineText = inline ? gunzipSync(Buffer.from(inline[1].trim(), "base64")).toString("utf8") : "";
report("index.html inline bundle matches data/case_bundle.json", inlineText === bundleText,
  inline ? createHash("sha256").update(inlineText).digest("hex").slice(0, 16) : "no inline bundle tag");

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll checks passed.");
}
