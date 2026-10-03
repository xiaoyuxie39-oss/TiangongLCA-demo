# Build prompt — single-page LCA calculator on TianGong data

You are working in the repository `TiangongLCA-demo`. Read `AGENTS.md` first, then `docs/01_matrix_method.md`,
`docs/03_ilcd_json_cheatsheet.md` and `case/README.md`. Then build the tool described below. Work in small steps, run the
test after each step, and tell me what you did at the end.

## Goal

A **single-page web tool** (`web/index.html` + `web/lca_core.js`, vanilla JavaScript, no build step, no framework) that loads
`web/data/case_bundle.json` and lets a student:

1. Pick a system (**SVE** or **Biopile**) and see its foreground stages and inputs as a table. Some inputs are **cut-offs**
   (`cutoff: true`, with only `amount_printed`, `unit_printed`, `why` and sometimes `addons`; no `flow`, `amount`, `unit` or
   `provider`): render them with the printed amount, a "cut-off" badge and the add-on if any, and no provider dropdown.
   Every place the UI reads `input.flow`, `input.amount`, `input.unit` or `input.provider` must tolerate these rows.
2. For every foreground input that is a product flow, pick the **provider process** from a dropdown of all processes in the
   bundle whose `ref_flow` matches (default = the one named in the bundle's provider choices). Changing a provider recomputes everything.
3. See the result for all 25 impact categories in a table (value, unit), plus a **bar chart** for one selected category.
4. See **contribution analysis** for the selected category: by foreground stage (stacked bar or table), by process (top 10),
   by elementary flow (top 10). Column sums must equal the total.
5. See the **cut-off list** (product inputs with no provider, with amounts), the **provider log** (every choice made among several
   candidates), the **add-ons** applied, the **uncharacterised flows** (linked but no factor in any method) and the **data warnings**.
6. Compare SVE vs Biopile side by side for the selected category.
7. Export the results table as CSV.
8. An "Explain" panel that prints the technology matrix **A** restricted to the foreground stages and their direct providers
   (this is small; it fits on screen) and the size of the full A that was solved.

## Constraints

- `web/lca_core.js` contains **pure functions only** (no DOM): `buildSystem(bundle, choices)`, `solve(system, demand)`, `lcia(system, scaling)`,
  `contributions(...)`. It must run both in the browser (`<script>`) and in Node (`node web/test.mjs`).
- Implement a dense linear solver yourself (Gaussian elimination with partial pivoting) — the system is at most a few hundred columns.
  No linear-algebra dependency.
- Optional: Chart.js from a CDN for charts, with a plain-table fallback if the CDN is unreachable.
- Follow the conventions in `AGENTS.md` exactly: sign of A, direction-aware Q built from the three-element (generic) factor rows only,
  provider resolution order, cut-off handling, exact-duplicate collapse, add-ons booked on the stage column, IO self-consumption
  netted on the diagonal, flows with `type: null` treated as unlinked.
- Must open from `file://` (so use `fetch` with a fallback to an inlined `<script type="application/json">` copy of the bundle if `fetch` fails on `file://`).
- Readable on a laptop and a phone. No login, no network calls other than the optional CDN.
- Written for students: show names, amounts, units and each item's `label` and `why_short`. Do not print uuids, resolution-rule
  codes or the long `why` notes on screen; keep them for an `?audit=1` view that only works on a local copy (see Acceptance
  in `AGENTS.md`).

## Acceptance

- `node web/test.mjs` loads the bundle, runs SVE and Biopile with the default providers and compares every value in
  `tests/expected_results.json` within its tolerance. It prints PASS/FAIL per check and exits non-zero on failure.
- Identity checks in the test: Σ_j H_process[k, j] = h_k and Σ_stage H_stage = h_k for every method k, to 1e-9 relative.
- The page shows SVE total climate change and Biopile total climate change on load, with the default providers, when served
  over http (`python3 -m http.server --directory web`) and when opened from `file://`; no error banner, no console error.
  Before reporting, open the page in a headless check if you can (e.g. a Node script that evaluates the rendering code against
  the bundle), or at least walk through every rendering path that touches a cut-off row.

## Process

1. Inspect `web/data/case_bundle.json` and `tests/expected_results.json`; print their structure before coding.
2. Write `lca_core.js` and `test.mjs` first; get the test green.
3. Then write `index.html`. Keep the UI simple: one column, sections in the order listed above.
4. Report: what passed, what you assumed, and anything in the data that looked wrong.
