#!/usr/bin/env python3
"""Build web/data/case_bundle.json from the foreground files, provider choices and the snapshot.

    python3 reference/build_case_bundle.py --check   # validate case/provider_choices.json against the snapshot, no output file
    python3 reference/build_case_bundle.py           # write web/data/case_bundle.json

Provider resolution (AGENTS.md): explicit choice > unique producer > same geo as consumer > latest year > smallest uuid.
Unresolvable product inputs are cut-offs (logged, never fatal). Standard library only.
"""
import hashlib
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from snapshot import Snapshot  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
CASE = ROOT / "case"
OUT = ROOT / "web" / "data" / "case_bundle.json"
SYSTEMS = {"SVE": "foreground_sve.json", "Biopile": "foreground_biopile.json"}


def load_json(p):
    return json.loads(pathlib.Path(p).read_text())


def year_of(p):
    try:
        return int(str(p.get("year") or 0)[:4])
    except ValueError:
        return 0


def resolve(s, flow, consumer_geo, overrides, log, consumer_uuid=None):
    """Return provider uuid or None (cut-off). Appends an entry to log."""
    if flow in overrides:
        log.append({"flow": flow, "consumer": consumer_uuid, "provider": overrides[flow], "rule": "override"})
        return overrides[flow]
    cands = [s.by_uuid[u] for u in s.producers.get(flow, []) if u != consumer_uuid]
    if not cands:
        return None
    if len(cands) == 1:
        log.append({"flow": flow, "consumer": consumer_uuid, "provider": cands[0]["uuid"], "rule": "unique"})
        return cands[0]["uuid"]
    geo = (consumer_geo or "").split("-")[-1]  # "SH-CN" -> "CN"
    same = [p for p in cands if (p.get("geo") or "").split("-")[-1] == geo] or cands
    same.sort(key=lambda p: (-year_of(p), p["uuid"]))
    rule = "same-geo+latest" if same is not cands else "latest"
    log.append({"flow": flow, "consumer": consumer_uuid, "provider": same[0]["uuid"], "rule": rule, "n_candidates": len(cands)})
    return same[0]["uuid"]


def check(s, choices, systems):
    problems, rows = [], []
    used_units = {}
    for name, fg in systems.items():
        for st in fg["stages"]:
            for inp in st["inputs"]:
                used_units.setdefault(inp["item"], set()).add(inp["unit"])
    for item, units in used_units.items():
        c = choices.get(item)
        if not c:
            problems.append(f"{item}: no entry in provider_choices.json"); continue
        if c.get("cutoff"):
            rows.append((item, "CUT-OFF", c.get("why", "")[:70])); continue
        if c.get("todo") or not c.get("flow"):
            problems.append(f"{item}: todo / no flow"); continue
        f = s.flows.get(c["flow"])
        if not f:
            problems.append(f"{item}: flow {c['flow']} not in snapshot"); continue
        if not (f.get("type") or "").startswith("Product"):
            problems.append(f"{item}: flow {c['flow']} is {f.get('type')}, not a product flow")
        conv = c.get("convert") or {}
        if units != {conv.get("from")}:
            problems.append(f"{item}: foreground units {sorted(units)} but convert.from={conv.get('from')!r}")
        if c.get("flow_unit") and c["flow_unit"] != f.get("unit"):
            problems.append(f"{item}: flow_unit says {c['flow_unit']} but snapshot says {f.get('unit')}")
        prov = c.get("default_provider")
        if not prov:
            problems.append(f"{item}: no default_provider"); continue
        p = s.by_uuid.get(prov)
        if not p:
            problems.append(f"{item}: provider {prov} not in snapshot"); continue
        if p.get("ref_flow") != c["flow"]:
            problems.append(f"{item}: provider {prov} ref_flow {p.get('ref_flow')} != {c['flow']}")
        if any(e["dir"] == "in" and e["flow"] == c["flow"] for e in p["exchanges"]):
            problems.append(f"{item}: provider {prov} consumes its own reference flow (chain fragment?)")
        for a in c.get("alternatives", []) or []:
            ap = s.by_uuid.get(a)
            if not ap:
                problems.append(f"{item}: alternative {a} not in snapshot")
            elif ap.get("ref_flow") != c["flow"]:
                problems.append(f"{item}: alternative {a} ref_flow mismatch")
        rows.append((item, "ok", f"{p.get('name')[:60]} [{p.get('geo')} {p.get('year')}] unit={f.get('unit')}"))
    print(f"{'item':20s} {'status':8s} detail")
    for r in sorted(rows):
        print(f"{r[0]:20s} {r[1]:8s} {r[2]}")
    for pr in problems:
        print("PROBLEM:", pr)
    return problems


def build(s, choices, systems):
    overrides = {k: v for k, v in (choices.get("_background_overrides") or {}).items()}
    log, cutoffs = [], []
    bundle_procs, bundle_flows = {}, set()
    todo = []

    def include(uuid, via_stage=None):
        if uuid in bundle_procs:
            return
        p = s.by_uuid[uuid]
        bundle_procs[uuid] = p
        bundle_flows.update(e["flow"] for e in p["exchanges"])
        todo.append(uuid)

    resolved_systems = {}
    for name, fg in systems.items():
        rs = {"system": fg["system"], "title": fg["title"], "functional_unit": fg["functional_unit"],
              "duration_years": fg.get("duration_years"), "source": fg["source"], "stages": []}
        for st in fg["stages"]:
            stage = {"id": st["id"], "name": st["name"], "note": st.get("note"), "inputs": []}
            for inp in st["inputs"]:
                c = choices[inp["item"]]
                rec = {"item": inp["item"], "amount_printed": inp["amount"], "unit_printed": inp["unit"], "note": inp.get("note")}
                if c.get("cutoff"):
                    rec.update({"cutoff": True, "why": c.get("why")})
                    cutoffs.append({"system": name, "stage": st["id"], **rec})
                else:
                    factor = (c.get("convert") or {}).get("factor", 1)
                    rec.update({"flow": c["flow"], "amount": inp["amount"] * factor, "unit": s.flow_unit(c["flow"]),
                                "convert_factor": factor, "convert_note": (c.get("convert") or {}).get("note"),
                                "provider": c["default_provider"]})
                    include(c["default_provider"])
                    for a in c.get("alternatives", []) or []:
                        include(a)
                    # every producer of a foreground flow goes into the bundle so the dropdown is complete
                    for u in s.producers.get(c["flow"], []):
                        include(u)
                stage["inputs"].append(rec)
            rs["stages"].append(stage)
        resolved_systems[name] = rs

    while todo:
        u = todo.pop()
        p = s.by_uuid[u]
        for e in p["exchanges"]:
            if e["dir"] != "in" or not (s.flow_type(e["flow"]) or "").startswith("Product"):
                continue
            prov = resolve(s, e["flow"], p.get("geo"), overrides, log, consumer_uuid=u)
            if prov is None:
                cutoffs.append({"system": "background", "consumer": u, "flow": e["flow"], "name": e.get("name"), "amount": e["amount"], "unit": s.flow_unit(e["flow"])})
            else:
                include(prov)

    flows = {u: s.flows[u] for u in bundle_flows if u in s.flows}
    methods = []
    for m in s.methods:
        fac = [f for f in m["factors"] if f[0] in flows]
        methods.append({k: m[k] for k in ("uuid", "name", "unit", "methodology", "impact_category", "indicator")} | {"factors": fac})
    producers = {f: [u for u in s.producers.get(f, []) if u in bundle_procs] for f in flows}
    producers = {f: v for f, v in producers.items() if v}
    bundle = {
        "meta": {"generated_by": "reference/build_case_bundle.py", "snapshot": s.meta.get("crawled_at"),
                 "counts": {"processes": len(bundle_procs), "flows": len(flows), "methods": len(methods),
                            "resolution_log": len(log), "cutoffs": len(cutoffs)}},
        "systems": resolved_systems,
        "provider_choices": {k: {"flow": v.get("flow"), "default_provider": v.get("default_provider"),
                                 "alternatives": v.get("alternatives", []), "cutoff": bool(v.get("cutoff")), "why": v.get("why")}
                             for k, v in choices.items() if not k.startswith("_")},
        "background_overrides": overrides,
        "processes": {u: {k: p.get(k) for k in ("uuid", "name", "name_zh", "geo", "year", "type", "classification", "ref_flow", "exchanges", "sources")}
                      for u, p in bundle_procs.items()},
        "flows": flows,
        "methods": methods,
        "producers": producers,
        "resolution_log": log,
        "cutoffs": cutoffs,
    }
    return bundle


def main():
    s = Snapshot()
    choices = load_json(CASE / "provider_choices.json")
    systems = {k: load_json(CASE / v) for k, v in SYSTEMS.items()}
    problems = check(s, choices, systems)
    if "--check" in sys.argv:
        print(f"\n{len(problems)} problem(s)")
        return 1 if problems else 0
    if problems:
        print(f"\nrefusing to build: {len(problems)} problem(s)")
        return 1
    bundle = build(s, choices, systems)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(text)
    sha = hashlib.sha256(text.encode()).hexdigest()
    print(f"\nwrote {OUT.relative_to(ROOT)}  {len(text)/1e6:.2f} MB  sha256={sha[:16]}…")
    print(json.dumps(bundle["meta"]["counts"]))
    bg = [c for c in bundle["cutoffs"] if c["system"] == "background"]
    print(f"foreground cut-offs: {len(bundle['cutoffs']) - len(bg)}; background cut-offs: {len(bg)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
