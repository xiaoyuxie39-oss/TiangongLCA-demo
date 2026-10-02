#!/usr/bin/env python3
"""Build a frozen snapshot of TianGong open LCA data from the public ILCD node.

Source: https://lcdn.tiangong.earth/resource  (no login required, JSON)
Outputs (data/snapshot/):
  processes.json     all unit processes with exchanges (compact form)
  flows.json         all flows: name, type, category, reference property, unit
  lcia_methods.json  the 25 EF-based LCIA methods with characterisation factors
  meta.json          crawl date, counts, node URL

Run:  python3 data/build_snapshot.py            (full crawl, ~5-10 min)
      python3 data/build_snapshot.py --limit 50 (smoke test)
"""
import concurrent.futures as cf
import gzip
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://lcdn.tiangong.earth/resource"
OUT = pathlib.Path(__file__).resolve().parent / "snapshot"
WORKERS = 6
LIMIT = None
if "--limit" in sys.argv:
    LIMIT = int(sys.argv[sys.argv.index("--limit") + 1])


def get(path, retries=5, **q):
    q.setdefault("format", "json")
    url = f"{BASE}/{path}?{urllib.parse.urlencode(q)}"
    for i in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={"Accept": "application/json", "User-Agent": "TiangongLCA-demo snapshot builder"},
            )
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if i == retries - 1:
                raise
            time.sleep(2.0 * (i + 1))


def lang(v, code="en"):
    """Pick one language value from an ILCD multilingual list."""
    if isinstance(v, list):
        for item in v:
            if isinstance(item, dict) and item.get("lang") == code and item.get("value"):
                return item["value"]
        for item in v:
            if isinstance(item, dict) and item.get("value"):
                return item["value"]
        return None
    if isinstance(v, dict):
        return v.get("value")
    return v


def as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def page_all(path, page_size=500, **q):
    start, items = 0, []
    while True:
        d = get(path, startIndex=start, pageSize=page_size, **q)
        data = d.get("data", [])
        items += data
        total = d.get("totalCount", 0)
        print(f"  {path}: {len(items)}/{total}", flush=True)
        if not data or len(items) >= total:
            break
        start += len(data)
        if LIMIT and len(items) >= LIMIT:
            break
    return items[:LIMIT] if LIMIT else items


def compact_process(entry):
    uuid = entry["uuid"]
    p = get(f"processes/{uuid}")
    pi = p["processInformation"]
    dsi = pi["dataSetInformation"]
    mv = p.get("modellingAndValidation", {})
    name = dsi.get("name", {})
    classes = []
    for c in as_list(dsi.get("classificationInformation", {}).get("classification")):
        classes.append(" / ".join(lang([x]) or "" for x in as_list(c.get("class"))))
    sources = []
    for r in as_list(mv.get("dataSourcesTreatmentAndRepresentativeness", {}).get("referenceToDataSource")):
        sources.append({"uuid": r.get("refObjectId"), "name": lang(r.get("shortDescription"))})
    ref_ids = set(as_list(pi.get("quantitativeReference", {}).get("referenceToReferenceFlow")))
    exchanges = []
    ref_flow = None
    for e in as_list(p.get("exchanges", {}).get("exchange")):
        f = e.get("referenceToFlowDataSet", {})
        rec = {
            "dir": "in" if e.get("exchangeDirection") == "Input" else "out",
            "flow": f.get("refObjectId"),
            "name": lang(f.get("shortDescription")),
            "amount": e.get("resultingAmount", e.get("meanAmount")),
        }
        c = lang(e.get("generalComment"))
        if c:
            rec["comment"] = c[:200]
        if e.get("dataSetInternalID") in ref_ids:
            rec["ref"] = True
            ref_flow = rec["flow"]
        exchanges.append(rec)
    geo = pi.get("geography", {}).get("locationOfOperationSupplyOrProduction", {})
    return {
        "uuid": dsi.get("UUID", uuid),
        "version": p.get("version"),
        "name": lang(name.get("baseName")),
        "name_zh": lang(name.get("baseName"), "zh"),
        "treatment": lang(name.get("treatmentStandardsRoutes")),
        "mix_location": lang(name.get("mixAndLocationTypes")),
        "geo": geo.get("location") if isinstance(geo, dict) else geo,
        "year": pi.get("time", {}).get("referenceYear") or entry.get("refYear"),
        "type": mv.get("LCIMethodAndAllocation", {}).get("typeOfDataSet") or entry.get("type"),
        "classification": classes,
        "comment": (lang(dsi.get("generalComment")) or "")[:400],
        "sources": sources,
        "ref_flow": ref_flow,
        "exchanges": exchanges,
    }


def compact_method(uuid):
    m = get(f"lciamethods/{uuid}")
    info = m["LCIAMethodInformation"]["dataSetInformation"]
    qr = m["LCIAMethodInformation"].get("quantitativeReference", {}).get("referenceQuantity", {})
    factors = []
    for f in as_list(m.get("characterisationFactors", {}).get("factor")):
        fl = f.get("referenceToFlowDataSet", {})
        factors.append([fl.get("refObjectId"), "in" if f.get("exchangeDirection") == "Input" else "out", f.get("meanValue")])
    return {
        "uuid": info.get("UUID", uuid),
        "version": m.get("version"),
        "name": lang(info.get("name")),
        "methodology": as_list(info.get("methodology")),
        "impact_category": as_list(info.get("impactCategory")),
        "indicator": info.get("impactIndicator"),
        "unit": lang(qr.get("shortDescription")),
        "factors": factors,
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    print("== listing processes", flush=True)
    plist = page_all("processes")
    print("== listing flows", flush=True)
    flist = page_all("flows", page_size=1000)
    print("== listing LCIA methods", flush=True)
    mlist = page_all("lciamethods", page_size=100)

    flows = {}
    for f in flist:
        flows[f["uuid"]] = {
            "name": f.get("name"),
            "type": f.get("type"),
            "category": f.get("classific"),
            "prop": f.get("refProp"),
            "unit": f.get("refPropUnit"),
        }
    (OUT / "flows.json").write_text(json.dumps(flows, ensure_ascii=False))
    print(f"  wrote flows.json ({len(flows)})", flush=True)

    print("== fetching LCIA methods", flush=True)
    methods = []
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        for m in ex.map(lambda x: compact_method(x["uuid"]), mlist):
            methods.append(m)
            print(f"  {m['name']}: {len(m['factors'])} factors", flush=True)
    (OUT / "lcia_methods.json").write_text(json.dumps(methods, ensure_ascii=False))

    print("== fetching processes", flush=True)
    processes, failed = [], []
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        futs = {ex.submit(compact_process, x): x["uuid"] for x in plist}
        for i, fut in enumerate(cf.as_completed(futs), 1):
            try:
                processes.append(fut.result())
            except Exception as e:  # noqa: BLE001
                failed.append({"uuid": futs[fut], "error": str(e)})
            if i % 200 == 0:
                print(f"  {i}/{len(plist)} ({time.time()-t0:.0f}s)", flush=True)
    processes.sort(key=lambda p: p["uuid"])
    (OUT / "processes.json").write_text(json.dumps(processes, ensure_ascii=False))

    meta = {
        "source": BASE,
        "crawled_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "counts": {"processes": len(processes), "flows": len(flows), "lcia_methods": len(methods)},
        "failed_processes": failed,
        "license": "TianGong open data, MIT (https://github.com/tiangong-lca/data)",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    for name in ("processes.json", "flows.json", "lcia_methods.json"):
        raw = (OUT / name).read_bytes()
        with gzip.open(OUT / f"{name}.gz", "wb", compresslevel=9) as gz:
            gz.write(raw)
        print(f"  {name}: {len(raw)/1e6:.1f} MB -> {(OUT / (name + '.gz')).stat().st_size/1e6:.1f} MB gz", flush=True)
    print(f"== done in {time.time()-t0:.0f}s; failed={len(failed)}", flush=True)


if __name__ == "__main__":
    main()
