#!/usr/bin/env python3
"""Load the frozen TianGong snapshot (data/snapshot/) and answer lookups.

Library:
    from snapshot import Snapshot
    s = Snapshot()                 # loads *.json or *.json.gz
    s.flows[uuid], s.by_uuid[uuid], s.producers[flow_uuid] -> [process uuids]
    s.search_flows("activated carbon", ftype="Product flow")
    s.search_processes("electricity mix")

CLI (for humans and agents):
    python3 reference/snapshot.py stats
    python3 reference/snapshot.py flows "activated carbon" [--type product|elementary|waste]
    python3 reference/snapshot.py processes "electricity mix"
    python3 reference/snapshot.py producers <flow uuid>
    python3 reference/snapshot.py consumers <flow uuid>
    python3 reference/snapshot.py show <process uuid>
    python3 reference/snapshot.py flow <flow uuid>
Standard library only.
"""
import gzip
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SNAP = ROOT / "data" / "snapshot"


def _load(name):
    p = SNAP / name
    if p.exists():
        return json.loads(p.read_text())
    gz = SNAP / (name + ".gz")
    if gz.exists():
        with gzip.open(gz, "rt") as f:
            return json.load(f)
    raise FileNotFoundError(f"{p} (or .gz) not found; run python3 data/build_snapshot.py")


class Snapshot:
    def __init__(self):
        self.processes = _load("processes.json")
        self.flows = _load("flows.json")
        self.methods = _load("lcia_methods.json")
        meta = SNAP / "meta.json"
        self.meta = json.loads(meta.read_text()) if meta.exists() else {}
        self.by_uuid = {p["uuid"]: p for p in self.processes}
        self.producers = {}
        self.consumers = {}
        for p in self.processes:
            if p.get("ref_flow"):
                self.producers.setdefault(p["ref_flow"], []).append(p["uuid"])
            for e in p["exchanges"]:
                if e["dir"] == "in":
                    self.consumers.setdefault(e["flow"], []).append(p["uuid"])

    # ---- lookups -----------------------------------------------------
    def flow_unit(self, flow_uuid):
        return (self.flows.get(flow_uuid) or {}).get("unit")

    def flow_type(self, flow_uuid):
        return (self.flows.get(flow_uuid) or {}).get("type")

    def search_flows(self, text, ftype=None, limit=50):
        t = text.lower()
        out = []
        for u, f in self.flows.items():
            if t in (f.get("name") or "").lower():
                if ftype and ftype.lower() not in (f.get("type") or "").lower():
                    continue
                out.append((u, f))
        out.sort(key=lambda x: (-len(self.producers.get(x[0], [])), x[1].get("name") or ""))
        return out[:limit]

    def search_processes(self, text, limit=50):
        t = text.lower()
        out = [p for p in self.processes if t in (p.get("name") or "").lower() or t in (p.get("name_zh") or "").lower()]
        return out[:limit]

    def describe_exchange(self, e):
        f = self.flows.get(e["flow"]) or {}
        return {
            "dir": e["dir"],
            "amount": e["amount"],
            "unit": f.get("unit"),
            "type": f.get("type"),
            "name": e.get("name") or f.get("name"),
            "flow": e["flow"],
            "ref": bool(e.get("ref")),
            "n_producers": len(self.producers.get(e["flow"], [])),
        }


def _fmt_process(s, p):
    return f"{p['uuid']}  {p.get('name')}  | geo={p.get('geo')} year={p.get('year')} ref_flow={p.get('ref_flow')}"


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd, args = argv[1], argv[2:]
    s = Snapshot()
    if cmd == "stats":
        n_el = sum(1 for f in s.flows.values() if (f.get("type") or "").startswith("Elementary"))
        print(json.dumps({"processes": len(s.processes), "flows": len(s.flows), "elementary_flows": n_el,
                          "product_flows_with_producer": len(s.producers), "lcia_methods": len(s.methods),
                          "meta": s.meta}, indent=2, ensure_ascii=False))
    elif cmd == "flows":
        ftype = None
        if "--type" in args:
            ftype = args[args.index("--type") + 1]
            args = [a for a in args if a not in ("--type", ftype)]
        for u, f in s.search_flows(" ".join(args), ftype):
            print(f"{u}  [{f.get('type')}] {f.get('name')}  unit={f.get('unit')}  producers={len(s.producers.get(u, []))}  consumers={len(s.consumers.get(u, []))}  cat={f.get('category')}")
    elif cmd == "processes":
        for p in s.search_processes(" ".join(args)):
            print(_fmt_process(s, p))
    elif cmd in ("producers", "consumers"):
        idx = s.producers if cmd == "producers" else s.consumers
        for u in idx.get(args[0], []):
            print(_fmt_process(s, s.by_uuid[u]))
        if not idx.get(args[0]):
            print(f"(no {cmd} for flow {args[0]})")
    elif cmd == "show":
        p = s.by_uuid.get(args[0])
        if not p:
            print("unknown process uuid"); return 1
        print(_fmt_process(s, p))
        print(f"  type={p.get('type')} class={p.get('classification')}")
        print(f"  sources={[x.get('name') for x in p.get('sources', [])]}")
        print(f"  comment={p.get('comment')!r}")
        for e in p["exchanges"]:
            d = s.describe_exchange(e)
            flag = "REF" if d["ref"] else "   "
            print(f"  {flag} {d['dir']:3s} {d['amount']!s:>14} {str(d['unit']):>6} [{d['type']}] {d['name']}  ({d['flow']}) producers={d['n_producers']}")
    elif cmd == "flow":
        f = s.flows.get(args[0])
        print(json.dumps({"uuid": args[0], **(f or {}), "producers": s.producers.get(args[0], []),
                          "n_consumers": len(s.consumers.get(args[0], []))}, indent=2, ensure_ascii=False))
    else:
        print(f"unknown command {cmd}"); print(__doc__); return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
