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
| M1 | Frozen data | `data/snapshot/*.json.gz` + `meta.json`; `case/provider_choices.json` complete (every foreground input mapped or declared cut-off); `web/data/case_bundle.json` | Every provider uuid exists in the snapshot and its `ref_flow` matches; cut-off list reviewed and justified in `case/README.md` | ⬜ |
| M2 | Reference implementation | `reference/lca_matrix.py`, `reference/build_case_bundle.py`, `reference/run_case.py`, `reference/validate_vs_paper.py`; `tests/expected_results.json` | SVE > biopile in all categories where the paper says so; SVE operation + GAC share ≥ 85 % of GWP; results table and contribution figures written to `reference/out/` | ⬜ |
| M3 | Prompt pack | `prompts/00_build_tool.md` final; `01_run_case_study.md`; `02_stretch_goals.md`; `student_prompt_cards.md` | A fresh Codex session given only `00_build_tool.md` produces a passing `web/` in ≤ 25 min wall-clock, twice in a row | ⬜ |
| M4 | Web tool & Pages | `web/index.html`, `web/lca_core.js`, `web/test.mjs` committed; Pages live | Opens from `file://` and Pages; `node web/test.mjs` passes; works on a phone screen | ⬜ |
| M5 | Dry run | Timed rehearsal from a fresh clone; screen recording of the live build as fallback (`local/`, not committed) | Runbook timings updated from the rehearsal; every failure seen in rehearsal has a documented fallback | ⬜ |
| M6 | Lecture materials | Slides outline, `lecture/runbook.md`, `lecture/worksheet.md`, answer key (`local/`) | Worksheet solvable in Track C with the web tool alone | ⬜ |

## Open decisions (resolve before M2)

- Default electricity provider for a Korean site: China average mix 2019 (TianGong has no KR grid). Offer provinces as alternatives for the sensitivity exercise.
- Activated carbon provider: TianGong has several coal-based unit operations that all output the same `activated carbon` flow. Pick one gate-to-gate dataset (fruit-shell or wood-chip NESPS2 datasets are single processes) and document why.
- Unit conversions for construction materials (m³ → kg) and diesel (L → kg or MJ): keep them in `case/provider_choices.json` with a source for each factor.
- Whether the web tool solves the full reachable system in the browser (dense Gaussian elimination, fine up to ~1,000 processes) or ships pre-solved background LCI vectors. Default: solve in the browser so students can watch A change.

## Known risks and fallbacks

- **Live build fails or is slow** → open the committed `web/` from M4 and continue; show the recording.
- **No internet in the room** → the tool is static and the bundle is in the repo; nothing needs the network.
- **Students without AI tools** → Track C needs only a browser.
- **TianGong node changes** → the snapshot is frozen; `meta.json` records the crawl date and counts.
