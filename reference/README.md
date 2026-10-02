# reference/ — Python reference implementation (M1–M2)

Purpose: an independent, boring implementation of `docs/01_matrix_method.md` that (1) builds the pruned case bundle for the
web tool, (2) produces the expected results, (3) compares against the paper. Standard library + numpy only.

Planned files:

| File | Role |
|---|---|
| `snapshot.py` | load `data/snapshot/*.json(.gz)`, build `producers` index |
| `build_case_bundle.py` | foreground + provider choices → reachable processes → `web/data/case_bundle.json`; `--check` lists unresolved items |
| `lca_matrix.py` | `build_system`, `solve`, `lcia`, `contributions` |
| `run_case.py` | run SVE and Biopile, write `reference/out/*.csv|json`, `--write-expected` updates `tests/expected_results.json` |
| `validate_vs_paper.py` | ranking and share checks against `docs/04_case_study_sve_biopile.md` |

Run order: `python3 data/build_snapshot.py` → `python3 reference/build_case_bundle.py --check` → fix `case/provider_choices.json`
→ `python3 reference/build_case_bundle.py` → `python3 reference/run_case.py --write-expected` → `python3 reference/validate_vs_paper.py`.
