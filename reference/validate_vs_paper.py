#!/usr/bin/env python3
"""Compare reference/out/summary.json with what Jeong & Suh (2011) report (docs/04_case_study_sve_biopile.md).

Checks (qualitative; absolute numbers are not expected to match):
  1. SVE > Biopile for climate change, and in how many of the 25 EF categories.
  2. SVE: share of operation + GAC replacement in climate change (paper: 96 % of normalised total; electricity dominant).
  3. Biopile: share of operation (paper: 55.7 %) and GAC (12.4 %).
  4. Ratio SVE/Biopile CO2 (paper Table 5: 360 t / 52.1 t = 6.9).
Writes reference/out/validation.md.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
S = json.loads((ROOT / "reference" / "out" / "summary.json").read_text())["systems"]
PAPER = {"sve_op_gac_share": 0.96, "bio_op_share": 0.557, "bio_gac_share": 0.124, "co2_ratio": 360000 / 52100}


def share(sysname, method, stages):
    bs = S[sysname]["by_stage"][method]
    tot = S[sysname]["totals"][method]["value"]
    return sum(bs[s] for s in stages) / tot if tot else float("nan")


lines = ["# Validation against Jeong & Suh (2011)", ""]
gwp_s = S["SVE"]["totals"]["Climate change"]["value"]
gwp_b = S["Biopile"]["totals"]["Climate change"]["value"]
lines.append(f"| Check | This repo (EF 3.1, TianGong) | Paper (EDIP 2003, ecoinvent 2.1) |")
lines.append("|---|---|---|")
lines.append(f"| Climate change SVE / Biopile | {gwp_s:,.0f} / {gwp_b:,.0f} kg CO2-eq, ratio {gwp_s / gwp_b:.2f} | 360,000 / 52,100 kg CO2 (Table 5), ratio {PAPER['co2_ratio']:.2f} |")
n_higher = sum(1 for m in S["SVE"]["totals"] if S["SVE"]["totals"][m]["value"] > S["Biopile"]["totals"][m]["value"])
lines.append(f"| Categories where SVE > Biopile | {n_higher} of {len(S['SVE']['totals'])} | 9 of 9 |")
lines.append(f"| SVE: operation + GAC share (climate) | {share('SVE', 'Climate change', ['operation', 'gac']):.1%} | 96 % (all categories, normalised) |")
lines.append(f"| Biopile: operation share (climate) | {share('Biopile', 'Climate change', ['operation']):.1%} | 55.7 % |")
lines.append(f"| Biopile: GAC share (climate) | {share('Biopile', 'Climate change', ['gac']):.1%} | 12.4 % |")
top = S["SVE"].get("top_processes_climate", [])[:3]
lines.append(f"| SVE top climate contributors | {'; '.join(t['label'][:40] for t in top)} | electricity (operation), GAC |")
lines += ["", "## Categories where Biopile ≥ SVE", ""]
for m in S["SVE"]["totals"]:
    a, b = S["SVE"]["totals"][m]["value"], S["Biopile"]["totals"][m]["value"]
    if a <= b:
        lines.append(f"- {m}: SVE {a:.3g}, Biopile {b:.3g}")
lines += ["", "## Cut-offs", ""]
for n in S:
    for c in S[n]["cutoffs"]:
        if c.get("item"):
            lines.append(f"- {n}: {c['item']} {c['amount']} {c['unit']} ({c.get('why')})")
    bg = [c for c in S[n]["cutoffs"] if not c.get("item")]
    lines.append(f"- {n}: {len(bg)} background cut-offs (product inputs without a provider)")
text = "\n".join(lines) + "\n"
(ROOT / "reference" / "out" / "validation.md").write_text(text)
print(text)
