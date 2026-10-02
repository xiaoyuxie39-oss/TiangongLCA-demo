#!/usr/bin/env python3
"""Build web/data/case_bundle.json from the foreground files, provider choices and the snapshot.

    python3 reference/build_case_bundle.py --check   # validate case/provider_choices.json against the snapshot, no output file
    python3 reference/build_case_bundle.py           # write web/data/case_bundle.json

Provider resolution (AGENTS.md): explicit choice > unique producer > same geo as consumer > latest year > smallest uuid.
Unresolvable product inputs are cut-offs (logged, never fatal). Add-ons (documented direct emissions or extra inputs per
printed unit) are carried into the bundle. Standard library only.
"""
import collections
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


def geo_score(consumer_geo, provider_geo):
    """Number of trailing location tokens shared, e.g. ("ZZ-SD-CN", "SD-CN") -> 2, ("CN", "HUB-CN") -> 1, ("CN", "US") -> 0."""
    a = [t for t in (consumer_geo or "").upper().split("-") if t][::-1]
    b = [t for t in (provider_geo or "").upper().split("-") if t][::-1]
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


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
    # geography hierarchy: most shared trailing tokens; on ties the more general dataset (shorter geo), then latest year, then uuid
    best = max(geo_score(consumer_geo, p.get("geo")) for p in cands)
    pool = [p for p in cands if geo_score(consumer_geo, p.get("geo")) == best]
    pool.sort(key=lambda p: (len((p.get("geo") or "").split("-")), -year_of(p), p["uuid"]))
    rule = f"geo-match-{best}+general+latest"
    log.append({"flow": flow, "consumer": consumer_uuid, "provider": pool[0]["uuid"], "rule": rule, "n_candidates": len(cands)})
    return pool[0]["uuid"]


def check_addons(s, item, c, problems):
    for ad in c.get("addons") or []:
        if ad.get("type") not in ("emission", "input"):
            problems.append(f"{item}: addon type {ad.get('type')!r} unknown"); continue
        if ad.get("flow") not in s.flows:
            problems.append(f"{item}: addon flow {ad.get('flow')} not in snapshot"); continue
        if ad["type"] == "emission" and not (s.flows[ad["flow"]].get("type") or "").startswith("Elementary"):
            problems.append(f"{item}: addon emission flow {ad['flow']} is not elementary")
        if ad["type"] == "input":
            pv = s.by_uuid.get(ad.get("provider"))
            if not pv or pv.get("ref_flow") != ad["flow"]:
                problems.append(f"{item}: addon input provider {ad.get('provider')} missing or ref_flow mismatch")
        if not ad.get("source"):
            problems.append(f"{item}: addon without a source")
        if not isinstance(ad.get("per_printed_unit"), (int, float)):
            problems.append(f"{item}: addon per_printed_unit missing")


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
        check_addons(s, item, c, problems)
        if c.get("cutoff"):
            tag = f"+{len(c['addons'])} add-on " if c.get("addons") else ""
            rows.append((item, "CUT-OFF", tag + (c.get("why") or "")[:60])); continue
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
        own_in = sum(float(e["amount"] or 0) for e in p["exchanges"] if e["dir"] == "in" and e["flow"] == c["flow"])
        ref_out = sum(float(e["amount"] or 0) for e in p["exchanges"] if e.get("ref") and e["dir"] == "out")
        if own_in and own_in >= ref_out:
            problems.append(f"{item}: provider {prov} consumes its own reference flow ({own_in} >= {ref_out}; chain fragment)")
        elif own_in:
            print(f"note: {item}: provider {prov} consumes {own_in / ref_out:.1%} of its own output (IO sector); netted on the diagonal")
        for a in c.get("alternatives") or []:
            ap = s.by_uuid.get(a)
            if not ap:
                problems.append(f"{item}: alternative {a} not in snapshot")
            elif ap.get("ref_flow") != c["flow"]:
                problems.append(f"{item}: alternative {a} ref_flow mismatch")
        rows.append((item, "ok", f"{(p.get('name') or '')[:58]} [{p.get('geo')} {p.get('year')}] unit={f.get('unit')}"))
    print(f"{'item':20s} {'status':8s} detail")
    for r in sorted(rows):
        print(f"{r[0]:20s} {r[1]:8s} {r[2]}")
    for pr in problems:
        print("PROBLEM:", pr)
    return problems


def build(s, choices, systems):
    overrides = dict(choices.get("_background_overrides") or {})
    log, cutoffs = [], []
    bundle_procs, bundle_flows = {}, set()
    todo = []

    def include(uuid):
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
                if c.get("addons"):
                    rec["addons"] = c["addons"]
                    for ad in c["addons"]:
                        bundle_flows.add(ad["flow"])
                        if ad["type"] == "input":
                            include(ad["provider"])
                if c.get("cutoff"):
                    rec.update({"cutoff": True, "why": c.get("why")})
                    cutoffs.append({"system": name, "stage": st["id"], **rec})
                else:
                    factor = (c.get("convert") or {}).get("factor", 1)
                    rec.update({"flow": c["flow"], "amount": inp["amount"] * factor, "unit": s.flow_unit(c["flow"]),
                                "convert_factor": factor, "convert_note": (c.get("convert") or {}).get("note"),
                                "provider": c["default_provider"]})
                    include(c["default_provider"])
                    for a in c.get("alternatives") or []:
                        include(a)
                    for u in s.producers.get(c["flow"], []):   # every producer of a foreground flow: the dropdown must be complete
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

    flows = {u: (s.flows.get(u) or {"name": None, "type": None, "category": None, "prop": None, "unit": None}) for u in bundle_flows}
    methods = []
    for m in s.methods:
        fac = [f for f in m["factors"] if f[0] in flows]
        methods.append({k: m[k] for k in ("uuid", "name", "unit", "methodology", "impact_category", "indicator")} | {"factors": fac})
    warnings = []
    for u, p in bundle_procs.items():
        cnt = collections.Counter((e["flow"], e["dir"], float(e["amount"] or 0), bool(e.get("ref"))) for e in p["exchanges"])
        exact = sum(n - 1 for n in cnt.values() if n > 1)
        var = collections.Counter((k[0], k[1]) for k in cnt)
        variants = [k[0] for k, n in var.items() if n > 1]
        if exact or variants:
            warnings.append({"process": u, "exact_duplicate_rows": exact, "variant_rows": variants})
    producers = {f: [u for u in s.producers.get(f, []) if u in bundle_procs] for f in flows}
    producers = {f: v for f, v in producers.items() if v}
    n_unique = sum(1 for e in log if e["rule"] == "unique")
    log = [e for e in log if e["rule"] != "unique"]   # unique links are reproducible from `producers`; keep only real choices
    bundle = {
        "meta": {"generated_by": "reference/build_case_bundle.py", "snapshot": s.meta.get("crawled_at"),
                 "counts": {"processes": len(bundle_procs), "flows": len(flows), "methods": len(methods),
                            "resolution_log": len(log), "cutoffs": len(cutoffs), "warnings": len(warnings)}},
        "systems": resolved_systems,
        "provider_choices": {k: {"flow": v.get("flow"), "default_provider": v.get("default_provider"),
                                 "alternatives": v.get("alternatives") or [], "cutoff": bool(v.get("cutoff")),
                                 "confidence": v.get("confidence"), "why": v.get("why")}
                             for k, v in choices.items() if not k.startswith("_")},
        "background_overrides": overrides,
        "processes": {u: {k: p.get(k) for k in ("uuid", "name", "name_zh", "geo", "year", "type", "classification", "ref_flow", "exchanges", "sources")}
                      for u, p in bundle_procs.items()},
        "flows": flows,
        "methods": methods,
        "producers": producers,
        "resolution_log": log,
        "n_unique_links": n_unique,
        "cutoffs": cutoffs,
        "warnings": warnings,
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
    print(f"\nwrote {OUT.relative_to(ROOT)}  {len(text) / 1e6:.2f} MB  sha256={sha[:16]}…")
    print(json.dumps(bundle["meta"]["counts"]))
    bg = [c for c in bundle["cutoffs"] if c["system"] == "background"]
    print(f"foreground cut-offs: {len(bundle['cutoffs']) - len(bg)}; background cut-offs: {len(bg)}; processes with duplicate rows: {len(bundle['warnings'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
