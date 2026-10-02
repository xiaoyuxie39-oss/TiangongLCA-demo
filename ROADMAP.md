# ROADMAP — milestones, acceptance criteria, iteration rule

Target: a 2–3 hour workshop at SNU. Everything below must be true on a **fresh clone**.

## Iteration rule

Each milestone ends with: (1) acceptance checks pass, (2) `ROADMAP.md` status updated,
(3) one commit on `main`. Decisions that change a convention are written into `AGENTS.md` and `docs/`
in the same commit. Nothing is "done" until it has been exercised by an agent from the prompt alone.

## Milestones

| # | Milestone | Deliverables | Acceptance | Status |
|---|---|---|---|---|
| M0 | Scaffold | Repo layout, `README`, `AGENTS.md`, docs 01–04, foreground JSON, snapshot builder, prompt drafts, runbook & worksheet drafts, GitHub repo + Pages workflow | Fresh clone makes sense to a reader; `python3 data/build_snapshot.py --limit 12` works | ✅ 2026-10-02 |
| M1 | Frozen data | `data/snapshot/*.json.gz` + `meta.json`; `case/provider_choices.json` complete (every foreground input mapped or declared cut-off); `web/data/case_bundle.json` | Every provider uuid exists in the snapshot and its `ref_flow` matches; cut-off list reviewed and justified in `case/README.md` | ✅ 2026-10-02 (20/20 items; 2 cut-offs; `docs/05`) |
| M2 | Reference implementation | `reference/lca_matrix.py`, `reference/build_case_bundle.py`, `reference/run_case.py`, `reference/validate_vs_paper.py`; `tests/expected_results.json` | SVE > biopile for climate change; SVE operation + GAC share ≥ 85 % of GWP; results table and contribution figures written to `reference/out/` | ✅ 2026-10-02 (SVE 92.8 t vs 45.9 t; op+GAC 93 %; only 6/25 categories SVE > biopile — see `reference/out/validation.md`) |
| M3 | Prompt pack | `prompts/00_build_tool.md` final; `01_run_case_study.md`; `02_stretch_goals.md`; `student_prompt_cards.md` | A fresh Codex session given only `00_build_tool.md` produces a passing `web/` in ≤ 25 min wall-clock, twice in a row | ✅ 2026-10-02: fresh-clone build 11 min 55 s, 505/505; follow-up change request 1 min 59 s, 507/507 (see `lecture/runbook.md`) |
| M4 | Web tool & Pages | `web/index.html`, `web/lca_core.js`, `web/test.mjs` committed; Pages live | Opens from `file://` and Pages; `node web/test.mjs` passes; works on a phone screen | ✅ 2026-10-02: Codex-built `web/` committed as the fallback; `node web/test.mjs` 507/507 |
| M5 | Dry run | Timed rehearsal from a fresh clone; screen recording of the live build as fallback (`local/`, not committed) | Runbook timings updated from the rehearsal; every failure seen in rehearsal has a documented fallback | ⬜ |
| M6 | Lecture materials | Slides outline, `lecture/runbook.md`, `lecture/worksheet.md`, answer key (`local/`) | Worksheet solvable in Track C with the web tool alone | ⬜ |

## Decisions taken (2026-10-02)

- Electricity: China average mix 2019 as default (0.58 kg CO₂/kWh implied); Guangdong, Zhejiang, Fujian, Sichuan, Inner Mongolia as alternatives.
- Activated carbon: coal / physical activation NESPS2 record (direct emissions only, no inputs → ≈ 0 climate impact); the gap vs the paper's 36 % is the headline discussion point.
- Diesel: cut-off upstream + sourced combustion add-on (2.68 kg CO₂/L). Road freight: CEEIO monetary sector at 0.0809 EUR/tkm.
- Conversions and sources per item in `case/provider_choices.json`; reasoning in `docs/05`.
- The web tool solves the full reachable system in the browser (≈180 columns per system).

## Open decisions

- Whether to add a literature-based cradle-to-gate add-on for GAC (needs a verified source) so the SVE/biopile ratio moves towards the paper's 6.9, or to keep the gap as the lesson. Default: keep the gap, offer the add-on as stretch goal 6.

## Known risks and fallbacks

- **Live build fails or is slow** → open the committed `web/` from M4 and continue; show the recording.
- **No internet in the room** → the tool is static and the bundle is in the repo; nothing needs the network.
- **Students without AI tools** → Track C needs only a browser.
- **TianGong node changes** → the snapshot is frozen; `meta.json` records the crawl date and counts.
