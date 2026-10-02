#!/usr/bin/env python3
"""Assemble case/provider_choices.json and docs/05_provider_mapping_decisions.md from the mapping workflow output.

Input : case/mapping/provider_mapping_raw.json  (20 items; each = {item, map, verify} from one mapper agent and one
        adversarial verifier agent working on the frozen snapshot, 2026-10-02)
Output: case/provider_choices.json (concise, machine-read) and docs/05_provider_mapping_decisions.md (full reasoning)
Rules : the verifier's `corrected` entry wins when it differs; add-ons for combustion are added here with sources.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "reference"))
from snapshot import Snapshot  # noqa: E402

CO2_FOSSIL = "08a91e70-3ddc-11dd-923d-0050c2490048"  # carbon dioxide (fossil), emissions to air, unspecified; GWP100 = 1
ADDONS = {
    "diesel_machinery": [{
        "type": "emission", "flow": CO2_FOSSIL, "dir": "out", "per_printed_unit": 2.68, "unit_note": "kg CO2 per litre of diesel burned",
        "note": "Combustion CO2 of diesel burned on site: 74,100 kg CO2/TJ x 43.0 MJ/kg x 0.84 kg/L = 2.68 kg/L. Upstream diesel production stays a cut-off; NOx, PM, CH4 and N2O of the engines are not added.",
        "source": "IPCC 2006 Guidelines, Vol. 2, Table 1.4 (gas/diesel oil default emission factor); EN 590 density 0.82-0.845 kg/L",
    }],
    "welding_gas": [{
        "type": "emission", "flow": CO2_FOSSIL, "dir": "out", "per_printed_unit": 0.0115 * 88.0 / 26.0, "unit_note": "kg CO2 per metre of gas weld",
        "note": "Combustion CO2 of the acetylene consumed per metre of weld (0.0115 kg C2H2/m x 3.385 kg CO2/kg C2H2, stoichiometric C2H2 + 2.5 O2 -> 2 CO2 + H2O). Acetylene production is linked through the provider; oxygen and steel filler are not modelled.",
        "source": "stoichiometry; acetylene demand per metre taken from the mapping decision (see docs/05, welding_gas)",
    }],
}
LIMIT_WHY, LIMIT_NOTES = 900, 1200


def main():
    s = Snapshot()
    raw = json.loads((ROOT / "case/mapping/provider_mapping_raw.json").read_text())
    old = json.loads((ROOT / "case/provider_choices.json").read_text())
    choices = {"_comment": "One entry per foreground item. Assembled by case/mapping/assemble.py from the mapping workflow (2026-10-02); full reasoning in docs/05_provider_mapping_decisions.md. Add-ons are documented direct emissions per printed unit.",
               "_background_overrides": old.get("_background_overrides", {})}
    doc = ["# Provider mapping decisions (foreground item → TianGong)", "",
           "Produced on 2026-10-02 by a two-stage agent workflow on the frozen snapshot: one *mapper* per item searched the",
           "snapshot (`reference/snapshot.py`) and proposed flow, provider, conversion and alternatives; one *adversarial verifier*",
           "per item re-ran every check and tried to refute the proposal. `case/provider_choices.json` holds the concise result;",
           "this file keeps the reasoning, the issues found and the data-quality notes, which are teaching material in their own right.", "",
           "| Item | Flow (unit) | Default provider | Conversion | Confidence | Verifier |", "|---|---|---|---|---|---|"]
    details = []
    for r in sorted(raw, key=lambda x: x["item"]):
        item, m, v = r["item"], r["map"], r["verify"]
        c = v.get("corrected") or {}
        use_corr = (not v["accepted"]) and bool(c.get("default_provider") or c.get("flow"))
        flow = (c.get("flow") if use_corr and c.get("flow") else m["flow"]) or None
        prov = (c.get("default_provider") if use_corr and c.get("default_provider") else m["default_provider"]) or None
        prov_name = (c.get("default_provider_name") if use_corr and c.get("default_provider_name") else m["default_provider_name"]) or None
        alts = c.get("alternatives") if (use_corr and c.get("alternatives")) else m["alternatives"]
        factor = c.get("convert_factor") if (use_corr and isinstance(c.get("convert_factor"), (int, float)) and c.get("convert_factor")) else m["convert"]["factor"]
        cutoff = bool(m["cutoff"])
        f = s.flows.get(flow) if flow else None
        p = s.by_uuid.get(prov) if prov else None
        entry = {
            "flow": flow, "flow_name": (f or {}).get("name"), "flow_unit": (f or {}).get("unit"),
            "convert": {"from": m["convert"]["from"], "factor": factor, "note": m["convert"]["note"][:400], "source": m["convert"].get("source", "")[:300]},
            "default_provider": prov, "default_provider_name": (p or {}).get("name") or prov_name,
            "alternatives": [a for a in (alts or []) if a in s.by_uuid and s.by_uuid[a].get("ref_flow") == flow],
            "confidence": m["confidence"],
            "verified": bool(v["accepted"]),
            "why": (m["why"][:LIMIT_WHY] + (" …" if len(m["why"]) > LIMIT_WHY else "")) + " | VERIFIER: " + v["verdict"][:500],
            "data_quality_notes": m["data_quality_notes"][:LIMIT_NOTES] + (" …" if len(m["data_quality_notes"]) > LIMIT_NOTES else ""),
        }
        if cutoff:
            entry.update({"cutoff": True, "flow": None, "flow_name": None, "flow_unit": None, "default_provider": None, "default_provider_name": None, "alternatives": []})
        if item in ADDONS:
            entry["addons"] = ADDONS[item]
        choices[item] = entry
        doc.append(f"| {item} | {entry['flow_name'] or '—'} ({entry['flow_unit'] or '—'}) | {(entry['default_provider_name'] or ('cut-off' if cutoff else '—'))[:60]} | {m['convert']['from']} × {factor:g} | {m['confidence']} | {'accepted' if v['accepted'] else 'corrected'} |")
        d = [f"## {item}", "",
             f"**Used as:** {next((x for x in [r.get('usage')] if x), '')}" if r.get("usage") else "",
             f"**Flow:** `{flow}` {entry['flow_name']} [{entry['flow_unit']}]" if flow else "**Flow:** cut-off (no usable producer in TianGong)",
             f"**Provider:** `{prov}` {entry['default_provider_name']}" if prov else "",
             f"**Conversion:** {m['convert']['from']} × {factor:g} — {m['convert']['note']}  \n*Source:* {m['convert'].get('source', '')}",
             f"**Alternatives:** {', '.join('`' + a[:8] + '`' for a in entry['alternatives']) or 'none'}",
             f"**Add-ons:** " + "; ".join(f"{a['type']} {a['per_printed_unit']:.4g} {a['unit_note']} ({a['source']})" for a in entry.get("addons", [])) if entry.get("addons") else "",
             f"**Confidence:** {m['confidence']}  ·  **Verifier:** {'accepted' if v['accepted'] else 'rejected, corrected'}",
             "", "### Mapper's reasoning", "", m["why"], "", "### Verifier's verdict", "", v["verdict"], "",
             "### Issues raised by the verifier", ""] + [f"- {i}" for i in v["issues"]] + ["",
             "### Data-quality notes", "", m["data_quality_notes"], ""]
        if v.get("upstream_cutoffs"):
            d += ["### Upstream cut-offs one level down", ""] + [f"- {u}" for u in v["upstream_cutoffs"]] + [""]
        if m.get("candidates_considered"):
            d += ["### Candidates considered", ""] + [f"- `{c_['uuid'][:8]}` {c_['name']} — {c_['verdict']}" for c_ in m["candidates_considered"]] + [""]
        details += [x for x in d if x is not None]
    (ROOT / "case/provider_choices.json").write_text(json.dumps(choices, ensure_ascii=False, indent=1))
    (ROOT / "docs/05_provider_mapping_decisions.md").write_text("\n".join(doc + [""] + details) + "\n")
    print("wrote case/provider_choices.json and docs/05_provider_mapping_decisions.md")
    for k, e in choices.items():
        if k.startswith("_"):
            continue
        print(f"  {k:20s} {'CUTOFF' if e.get('cutoff') else (e['default_provider'] or '')[:8]:8s} {str(e['flow_unit'] or ''):4s} x{e['convert']['factor']:<10g} conf={e['confidence']:6s} alts={len(e['alternatives'])} addons={len(e.get('addons', []))}")


if __name__ == "__main__":
    main()
