"""Toy-system test for lca_matrix (docs/01_matrix_method.md). Run: uv run python reference/test_lca_matrix.py"""
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lca_matrix import LcaSystem  # noqa: E402

ELEC, AC, CO2, COAL, COAL_FLOW = "flow-elec", "flow-ac", "flow-co2", "proc-coal", "flow-coal"
TOY = {
    "flows": {ELEC: {"name": "Electricity", "type": "Product flow", "unit": "MJ"},
              AC: {"name": "activated carbon", "type": "Product flow", "unit": "kg"},
              CO2: {"name": "carbon dioxide (fossil)", "type": "Elementary flow", "unit": "kg"},
              COAL_FLOW: {"name": "coal", "type": "Product flow", "unit": "kg"},
              "flow-waste": {"name": "waste", "type": "Waste flow", "unit": "kg"}},
    "processes": {
        "proc-grid": {"uuid": "proc-grid", "name": "grid mix", "geo": "CN", "year": "2019", "ref_flow": ELEC,
                      "exchanges": [{"dir": "out", "flow": ELEC, "amount": 3.6, "ref": True},
                                    {"dir": "out", "flow": CO2, "amount": 0.2},
                                    {"dir": "in", "flow": COAL_FLOW, "amount": 0.1}]},
        "proc-ac": {"uuid": "proc-ac", "name": "AC production", "geo": "CN", "year": "2020", "ref_flow": AC,
                    "exchanges": [{"dir": "out", "flow": AC, "amount": 1000, "ref": True},
                                  {"dir": "out", "flow": CO2, "amount": 10000},
                                  {"dir": "in", "flow": ELEC, "amount": 1000},
                                  {"dir": "out", "flow": "flow-waste", "amount": 5}]},
        COAL: {"uuid": COAL, "name": "coal mining", "geo": "CN", "year": "2018", "ref_flow": COAL_FLOW,
               "exchanges": [{"dir": "out", "flow": COAL_FLOW, "amount": 1, "ref": True},
                             {"dir": "out", "flow": CO2, "amount": 0.05},
                             {"dir": "in", "flow": "flow-unlinked", "amount": 2}]},
    },
    "producers": {ELEC: ["proc-grid"], AC: ["proc-ac"], COAL_FLOW: [COAL]},
    "methods": [{"uuid": "m-gwp", "name": "Climate change", "unit": "kg CO2 eq", "factors": [[CO2, "out", 1.0]]},
                {"uuid": "m-zero", "name": "Nothing", "unit": "-", "factors": []}],
    "background_overrides": {},
    "systems": {"Toy": {"title": "Toy SVE", "stages": [
        {"id": "operation", "name": "Operation", "inputs": [{"item": "electricity", "flow": ELEC, "amount": 535492.8, "provider": "proc-grid"}]},
        {"id": "gac", "name": "GAC", "inputs": [{"item": "activated_carbon", "flow": AC, "amount": 18000, "provider": "proc-ac"},
                                                 {"item": "microorganism", "cutoff": True, "amount_printed": 1, "unit_printed": "L", "why": "none"}]},
    ]}},
}
TOY["flows"]["flow-unlinked"] = {"name": "mystery input", "type": "Product flow", "unit": "kg"}


def main():
    sys_ = LcaSystem(TOY, "Toy")
    h = sys_.solve()
    s = {c: sys_.s[i] for i, c in enumerate(sys_.cols)}
    assert abs(s["stage:operation"] - 1) < 1e-12 and abs(s["stage:gac"] - 1) < 1e-12
    # AC production consumes 1000 MJ per 1000 kg -> extra 18 * 1000 / 3.6 = 5000 grid runs
    assert abs(s["proc-grid"] - (148748 + 5000)) < 1e-6, s["proc-grid"]
    assert abs(s["proc-ac"] - 18) < 1e-12
    assert abs(s[COAL] - 0.1 * 153748) < 1e-6
    expected_gwp = 0.2 * 153748 + 10000 * 18 + 0.05 * 0.1 * 153748
    assert abs(h[0] - expected_gwp) < 1e-6, (h[0], expected_gwp)
    assert h[1] == 0
    ident = sys_.check_identities()
    assert all(ident.values()), ident
    st = sys_.by_stage()
    assert abs(st["operation"][0] - (0.2 * 148748 + 0.05 * 0.1 * 148748)) < 1e-6
    assert abs(st["gac"][0] - (10000 * 18 + 0.2 * 5000 + 0.05 * 0.1 * 5000)) < 1e-6
    assert len(sys_.cutoffs) == 2 and {c["item"] for c in sys_.cutoffs} == {"microorganism", None}
    assert len(sys_.unlinked_outputs) == 1 and sys_.unlinked_outputs[0]["type"] == "Waste flow"
    ids, labels, Afg = sys_.foreground_matrix()
    assert Afg.shape[0] == len(ids) == 5  # system + 2 stages + 2 direct providers
    bp = sys_.by_process()
    assert np.allclose(bp.sum(axis=1), h)
    print("toy system OK:", {k: round(v, 3) for k, v in s.items()}, "GWP =", round(h[0], 2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
