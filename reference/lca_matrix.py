"""Matrix-method LCA on a case bundle (web/data/case_bundle.json).

Conventions (docs/01_matrix_method.md, AGENTS.md):
  * one column per process; row i is "the reference product of column i", so A is square by construction;
  * foreground stages are synthetic columns (ref amount 1) consuming converted amounts of TianGong product flows;
    a synthetic system column consumes 1 of each stage; demand f = 1 unit of the system column;
  * A[i, j] = +ref amount on the diagonal, -amount for the product inputs of j linked to provider i;
  * B rows are (elementary flow, direction); Q is direction-aware;
  * provider resolution: explicit choice > unique producer > most specific geography match (trailing tokens of e.g. ZZ-SD-CN)
    > more general dataset on ties > latest year > smallest uuid; records with no net output of their reference flow are never providers;
  * product inputs without a provider are cut-offs (reported, not fatal);
  * per-stage contribution = impact of the demand vector restricted to that stage (exact by linearity);
  * characterisation factors: a factor row is [flow, dir, value] (generic) or [flow, dir, value, location] (regionalised);
    Q uses the generic row and ignores regionalised rows;
  * exact duplicate exchange rows (same flow, direction and amount) are collapsed to one (re-import duplicates);
    rows with the same flow but different amounts are summed and counted in `warnings`;
  * foreground add-ons: a stage input may carry `addons` — documented direct emissions (B entries on the stage column)
    or extra product inputs with a provider (A entries), both per printed unit of the input.
Requires numpy.
"""
from __future__ import annotations

import collections

import numpy as np

STAGE = "stage:"
SYSTEM = "system:"


def _year(p):
    try:
        return int(str(p.get("year") or 0)[:4])
    except ValueError:
        return 0


def _ftype(bundle, flow):
    return (bundle["flows"].get(flow) or {}).get("type") or ""


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


def resolve_provider(bundle, flow, consumer_geo, consumer_uuid, overrides, log):
    """Return provider uuid for a product flow, or None (cut-off). Appends to log."""
    if flow in overrides:
        log.append({"flow": flow, "consumer": consumer_uuid, "provider": overrides[flow], "rule": "override"})
        return overrides[flow]
    cands = [u for u in bundle["producers"].get(flow, []) if u != consumer_uuid]
    if not cands:
        return None
    if len(cands) == 1:
        log.append({"flow": flow, "consumer": consumer_uuid, "provider": cands[0], "rule": "unique"})
        return cands[0]
    procs = [bundle["processes"][u] for u in cands]
    best = max(geo_score(consumer_geo, p.get("geo")) for p in procs)
    pool = [p for p in procs if geo_score(consumer_geo, p.get("geo")) == best]
    pool.sort(key=lambda p: (len((p.get("geo") or "").split("-")), -_year(p), p["uuid"]))
    rule = f"geo-match-{best}+general+latest"
    log.append({"flow": flow, "consumer": consumer_uuid, "provider": pool[0]["uuid"], "rule": rule, "n_candidates": len(cands)})
    return pool[0]["uuid"]


class LcaSystem:
    """Build A, B, Q for one system of the bundle and solve it."""

    def __init__(self, bundle, system_name, item_providers=None, background_overrides=None):
        self.bundle = bundle
        self.name = system_name
        self.item_providers = item_providers or {}
        self.overrides = dict(bundle.get("background_overrides") or {})
        self.overrides.update(background_overrides or {})
        self.cols = []            # column ids in order
        self.col_index = {}
        self.col_kind = {}        # id -> 'system' | 'stage' | 'process'
        self.col_label = {}
        self.stage_of_col = {}    # stage column id -> stage id
        self.a_entries = {}       # (row_id, col_id) -> value (accumulated)
        self.b_entries = {}       # ((flow, dir), col_id) -> value
        self.elem_rows = {}       # (flow, dir) -> index
        self.cutoffs = []
        self.unlinked_outputs = []
        self.provider_log = []
        self.warnings = []
        self.addon_log = []
        self._build()

    @staticmethod
    def _dedupe(exchanges):
        """Collapse exact duplicates; return (rows, n_exact_dupes, flows_with_variant_rows)."""
        seen, rows, dupes, variants = set(), [], 0, collections.Counter()
        for e in exchanges:
            key = (e["flow"], e["dir"], float(e["amount"] or 0.0), bool(e.get("ref")))
            if key in seen:
                dupes += 1
                continue
            seen.add(key)
            rows.append(e)
            variants[(e["flow"], e["dir"])] += 1
        return rows, dupes, [k for k, n in variants.items() if n > 1]

    # ---- construction --------------------------------------------------
    def _col(self, cid, kind, label):
        if cid not in self.col_index:
            self.col_index[cid] = len(self.cols)
            self.cols.append(cid)
            self.col_kind[cid] = kind
            self.col_label[cid] = label
            return True
        return False

    def _a(self, row, col, val):
        self.a_entries[(row, col)] = self.a_entries.get((row, col), 0.0) + val

    def _b(self, flow, direction, col, val):
        key = (flow, direction)
        if key not in self.elem_rows:
            self.elem_rows[key] = len(self.elem_rows)
        self.b_entries[(key, col)] = self.b_entries.get((key, col), 0.0) + val

    def _build(self):
        fg = self.bundle["systems"][self.name]
        sys_id = SYSTEM + self.name
        self._col(sys_id, "system", fg.get("title", self.name))
        self._a(sys_id, sys_id, 1.0)
        queue = []
        for st in fg["stages"]:
            sid = STAGE + st["id"]
            self._col(sid, "stage", st["name"])
            self.stage_of_col[sid] = st["id"]
            self._a(sid, sid, 1.0)
            self._a(sid, sys_id, -1.0)
            for inp in st["inputs"]:
                if inp.get("cutoff"):
                    self.cutoffs.append({"where": f"{self.name}/{st['id']}", "item": inp["item"], "flow": None,
                                         "amount": inp["amount_printed"], "unit": inp["unit_printed"], "why": inp.get("why")})
                    continue
                prov = self.item_providers.get(inp["item"]) or inp["provider"]
                if prov not in self.bundle["processes"]:
                    raise KeyError(f"provider {prov} for item {inp['item']} is not in the bundle")
                self.provider_log.append({"flow": inp["flow"], "consumer": sid, "provider": prov, "rule": "foreground-choice", "item": inp["item"]})
                if self._col(prov, "process", self.bundle["processes"][prov]["name"]):
                    queue.append(prov)
                self._a(prov, sid, -float(inp["amount"]))
            for inp in st["inputs"]:
                for ad in inp.get("addons") or []:
                    qty = float(ad["per_printed_unit"]) * float(inp["amount_printed"])
                    if ad["type"] == "emission":
                        self._b(ad["flow"], ad.get("dir", "out"), sid, qty)
                    elif ad["type"] == "input":
                        prov = ad["provider"]
                        if prov not in self.bundle["processes"]:
                            raise KeyError(f"add-on provider {prov} for item {inp['item']} is not in the bundle")
                        if self._col(prov, "process", self.bundle["processes"][prov]["name"]):
                            queue.append(prov)
                        self._a(prov, sid, -qty)
                    self.addon_log.append({"stage": st["id"], "item": inp["item"], "type": ad["type"], "flow": ad["flow"], "amount": qty, "note": ad.get("note"), "source": ad.get("source")})
        while queue:
            u = queue.pop()
            p = self.bundle["processes"][u]
            rows, n_dupes, variants = self._dedupe(p["exchanges"])
            if n_dupes:
                self.warnings.append({"process": u, "kind": "exact_duplicate_rows", "n": n_dupes})
            if variants:
                self.warnings.append({"process": u, "kind": "variant_rows_summed", "flows": [v[0] for v in variants]})
            for e in rows:
                flow, amt, d = e["flow"], float(e["amount"] or 0.0), e["dir"]
                ft = _ftype(self.bundle, flow)
                if e.get("ref") and d == "out":
                    self._a(u, u, amt)
                elif ft.startswith("Elementary"):
                    self._b(flow, d, u, amt)
                elif d == "in" and ft.startswith("Product") and flow == p.get("ref_flow"):
                    self._a(u, u, -amt)   # own-product consumption (IO sectors): netted on the diagonal
                    self.provider_log.append({"flow": flow, "consumer": u, "provider": u, "rule": "self-netted"})
                elif d == "in" and ft.startswith("Product"):
                    prov = resolve_provider(self.bundle, flow, p.get("geo"), u, self.overrides, self.provider_log)
                    if prov is None:
                        self.cutoffs.append({"where": u, "item": None, "flow": flow, "name": e.get("name"), "amount": amt,
                                             "unit": (self.bundle["flows"].get(flow) or {}).get("unit")})
                        continue
                    if self._col(prov, "process", self.bundle["processes"][prov]["name"]):
                        queue.append(prov)
                    self._a(prov, u, -amt)
                else:
                    self.unlinked_outputs.append({"process": u, "flow": flow, "name": e.get("name"), "dir": d, "amount": amt, "type": ft})
        n = len(self.cols)
        self.A = np.zeros((n, n))
        for (r, c), v in self.a_entries.items():
            self.A[self.col_index[r], self.col_index[c]] += v
        m = len(self.elem_rows)
        self.B = np.zeros((m, n))
        for (key, c), v in self.b_entries.items():
            self.B[self.elem_rows[key], self.col_index[c]] += v
        self.methods = self.bundle["methods"]
        self.Q = np.zeros((len(self.methods), m))
        for k, meth in enumerate(self.methods):
            fac = {(f[0], f[1]): f[2] for f in meth["factors"] if len(f) == 3}  # generic rows only; regionalised rows carry a location
            for key, i in self.elem_rows.items():
                v = fac.get(key)
                if v:
                    self.Q[k, i] = v
        self.f = np.zeros(n)
        self.f[self.col_index[sys_id]] = 1.0
        diag = np.diag(self.A)
        zero = [self.cols[i] for i in np.where(diag == 0)[0]]
        if zero:
            names = [f"{z[:8]} {self.col_label.get(z, '')[:50]}" for z in zero[:5]]
            raise ValueError(f"{len(zero)} column(s) without a reference OUTPUT (A diagonal 0); the producers index must exclude input-referenced records: {names}")

    # ---- solving -------------------------------------------------------
    def solve(self):
        self.s = np.linalg.solve(self.A, self.f)
        self.g = self.B @ self.s
        self.h = self.Q @ self.g
        return self.h

    # ---- contribution analysis ----------------------------------------
    def by_process(self):
        """methods x columns; column sums equal h."""
        return self.Q @ (self.B * self.s[None, :])

    def by_stage(self):
        """dict stage id -> impact vector; exact decomposition by linearity."""
        out = {}
        for cid, sid in self.stage_of_col.items():
            f = np.zeros(len(self.cols))
            f[self.col_index[cid]] = 1.0
            s = np.linalg.solve(self.A, f)
            out[sid] = self.Q @ (self.B @ s)
        return out

    def by_flow(self):
        """methods x elementary rows."""
        return self.Q * self.g[None, :]

    def by_stage_and_process(self):
        """dict stage id -> (methods x columns) matrix, for stacked charts."""
        out = {}
        for cid, sid in self.stage_of_col.items():
            f = np.zeros(len(self.cols))
            f[self.col_index[cid]] = 1.0
            s = np.linalg.solve(self.A, f)
            out[sid] = self.Q @ (self.B * s[None, :])
        return out

    # ---- reporting helpers -------------------------------------------
    def method_names(self):
        return [m["name"] for m in self.methods]

    def method_units(self):
        return [m["unit"] for m in self.methods]

    def elem_labels(self):
        inv = {i: key for key, i in self.elem_rows.items()}
        labels = []
        for i in range(len(inv)):
            flow, d = inv[i]
            labels.append(f"{(self.bundle['flows'].get(flow) or {}).get('name')} [{d}]")
        return labels

    def uncharacterised_rows(self):
        """Elementary rows with no factor in any method (linked but invisible to LCIA)."""
        zero = np.where(~np.any(self.Q != 0, axis=0))[0]
        labels = self.elem_labels()
        return [{"row": int(i), "flow": labels[i], "g": float(self.g[i])} for i in zero if self.g[i] != 0]

    def check_identities(self, rtol=1e-9):
        hp = self.by_process().sum(axis=1)
        hs = sum(self.by_stage().values())
        scale = np.maximum(np.abs(self.h), 1e-300)
        ok_p = np.all(np.abs(hp - self.h) <= rtol * scale + 1e-12)
        ok_s = np.all(np.abs(hs - self.h) <= rtol * scale + 1e-12)
        return {"sum_process_equals_total": bool(ok_p), "sum_stage_equals_total": bool(ok_s)}

    def foreground_matrix(self):
        """A restricted to system + stage columns and their direct providers (for the 'Explain' panel)."""
        keep = [c for c in self.cols if self.col_kind[c] != "process"]
        direct = set()
        for (r, c), v in self.a_entries.items():
            if c in keep and r not in keep:
                direct.add(r)
        ids = keep + sorted(direct, key=lambda x: self.col_label[x])
        idx = [self.col_index[i] for i in ids]
        return ids, [self.col_label[i] for i in ids], self.A[np.ix_(idx, idx)]
