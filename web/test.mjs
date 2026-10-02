#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const core = require("./lca_core.js");
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

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll checks passed.");
}
