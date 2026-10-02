#!/usr/bin/env python3
"""Run the SVE and Biopile systems from web/data/case_bundle.json and write results.

    uv run python reference/run_case.py                     # results to reference/out/
    uv run python reference/run_case.py --write-expected    # also refresh tests/expected_results.json
    uv run python reference/run_case.py --provider electricity=<process uuid>   # sensitivity run (repeatable)
"""
import csv
import hashlib
import json
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lca_matrix import LcaSystem  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "web" / "data" / "case_bundle.json"
OUT = ROOT / "reference" / "out"
EXPECTED = ROOT / "tests" / "expected_results.json"
TOL = 0.01


def write_csv(path, header, rows):
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def run_system(bundle, name, item_providers):
    sys_ = LcaSystem(bundle, name, item_providers=item_providers)
    h = sys_.solve()
    names, units = sys_.method_names(), sys_.method_units()
    by_stage = sys_.by_stage()
    by_proc = sys_.by_process()
    by_flow = sys_.by_flow()
    res = {
        "totals": {n: {"value": float(h[k]), "unit": units[k]} for k, n in enumerate(names)},
        "by_stage": {n: {sid: float(v[k]) for sid, v in by_stage.items()} for k, n in enumerate(names)},
        "identities": sys_.check_identities(),
        "n_processes_solved": len(sys_.cols),
        "n_elementary_rows": len(sys_.elem_rows),
        "cutoffs": sys_.cutoffs,
        "n_unlinked_outputs": len(sys_.unlinked_outputs),
        "provider_log": sys_.provider_log,
    }
    # CSVs
    write_csv(OUT / f"{name}_totals.csv", ["method", "value", "unit"], [(n, h[k], units[k]) for k, n in enumerate(names)])
    stages = list(by_stage)
    write_csv(OUT / f"{name}_by_stage.csv", ["method", "unit"] + stages,
              [[n, units[k]] + [by_stage[s][k] for s in stages] for k, n in enumerate(names)])
    write_csv(OUT / f"{name}_by_process.csv", ["column", "label", "kind", "scaling"] + names,
              [[c, sys_.col_label[c], sys_.col_kind[c], sys_.s[j]] + list(by_proc[:, j]) for j, c in enumerate(sys_.cols)])
    labels = sys_.elem_labels()
    rows = []
    for k, n in enumerate(names):
        order = np.argsort(-np.abs(by_flow[k]))[:15]
        for i in order:
            if by_flow[k, i] != 0:
                rows.append([n, labels[i], by_flow[k, i], units[k], sys_.g[i]])
    write_csv(OUT / f"{name}_by_flow_top.csv", ["method", "elementary flow", "contribution", "unit", "inventory g"], rows)
    ids, lab, Afg = sys_.foreground_matrix()
    write_csv(OUT / f"{name}_A_foreground.csv", ["row \\ col"] + lab, [[lab[i]] + list(Afg[i]) for i in range(len(lab))])
    # top processes for GWP, for the summary
    k = names.index("Climate change") if "Climate change" in names else 0
    top = np.argsort(-np.abs(by_proc[k]))[:10]
    res["top_processes_climate"] = [{"column": sys_.cols[j], "label": sys_.col_label[sys_.cols[j]], "value": float(by_proc[k, j])} for j in top]
    return res


def main():
    args = sys.argv[1:]
    item_providers = {}
    for i, a in enumerate(args):
        if a == "--provider":
            item, uuid = args[i + 1].split("=", 1)
            item_providers[item] = uuid
    bundle = json.loads(BUNDLE.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    summary = {"bundle_snapshot": bundle["meta"].get("snapshot"), "item_providers": item_providers, "systems": {}}
    for name in bundle["systems"]:
        r = run_system(bundle, name, item_providers)
        summary["systems"][name] = r
        gwp = r["totals"].get("Climate change", {})
        print(f"{name:8s} climate change = {gwp.get('value', float('nan')):,.1f} {gwp.get('unit')}  | columns={r['n_processes_solved']} "
              f"elem rows={r['n_elementary_rows']} cut-offs={len(r['cutoffs'])} identities={r['identities']}")
        print("   by stage (GWP):", {s: round(v) for s, v in r["by_stage"].get("Climate change", {}).items()})
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    if "--write-expected" in args:
        if item_providers:
            print("refusing to write expected results from a sensitivity run"); return 1
        sha = hashlib.sha256(BUNDLE.read_bytes()).hexdigest()
        exp = {"generated_by": "reference/run_case.py", "snapshot": bundle["meta"].get("snapshot"), "bundle_sha256": sha,
               "tolerance_rel": TOL,
               "systems": {n: {"totals": r["totals"], "by_stage": r["by_stage"],
                               "cutoffs": [c for c in r["cutoffs"] if c.get("item")],
                               "n_processes_solved": r["n_processes_solved"]} for n, r in summary["systems"].items()},
               "identities": ["sum_process_equals_total", "sum_stage_equals_total"]}
        EXPECTED.write_text(json.dumps(exp, ensure_ascii=False, indent=1))
        print(f"wrote {EXPECTED.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
