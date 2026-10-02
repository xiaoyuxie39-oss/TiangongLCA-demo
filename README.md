# TiangongLCA-demo

**Build a tiny matrix-based LCA tool on TianGong open data, live, with an AI coding agent.**
Workshop kit for a 2–3 hour session at Seoul National University (SNU).

The case study is Jeong & Suh (2011), *Assessment of Environmental Impacts and CO₂ Emissions
from Soil Remediation Technologies using Life Cycle Assessment: Case Studies on SVE and Biopile
Systems*, J. Korean Soc. Environ. Eng. 33(4):267–274, https://doi.org/10.4491/KSEE.2011.33.4.267.
Foreground data come from the paper's Tables 2–3; background data come from the
[TianGong](https://lca.tiangong.earth) open LCA database (MIT licensed).

## What happens in the workshop

1. **Recap (15 min)** – the matrix method (A, B, Q) on a 3-process toy version of the SVE system.
2. **Live build (30 min)** – the instructor runs [`prompts/00_build_tool.md`](prompts/00_build_tool.md)
   in Codex (or Claude Code). The agent generates a single-page HTML calculator from the spec and
   checks itself against [`tests/expected_results.json`](tests/expected_results.json).
3. **Hands-on (60–75 min)** – no preparation is required of students; everyone uses the same web tool, in one of three tracks
   (see [`lecture/worksheet.md`](lecture/worksheet.md)):
   - **Track A – build it yourself.** You have Codex / Claude Code installed. Start from the prompt, then do a stretch goal.
   - **Track B – prompt cards.** You use any chat AI (ChatGPT, Claude, Gemini…). Use the ready-made
     prompts in [`prompts/student_prompt_cards.md`](prompts/student_prompt_cards.md) to interrogate the model and the results.
   - **Track C – no AI needed.** Everything in the worksheet can be done with the dropdowns and charts of the web tool.
4. **Wrap-up (15 min)** – SVE vs biopile, what drives the result, where the data came from, what an AI got right and wrong.

## Quick start

- **Use the tool:** open the GitHub Pages site of this repository (`web/`), or open `web/index.html` locally.
- **Rebuild the data snapshot:** `python3 data/build_snapshot.py` (no login needed, ~10 min).
- **Run the reference implementation and tests:** see [`reference/README.md`](reference/README.md).
- **Run the live build yourself:** install Codex CLI or Claude Code, open this folder, paste `prompts/00_build_tool.md`.

## Repository map

| Path | What it is |
|---|---|
| `AGENTS.md` | Contract for AI coding agents working in this repo (data formats, matrix conventions, acceptance tests) |
| `ROADMAP.md` | Milestones, acceptance criteria and the iteration rule |
| `docs/` | Matrix method notes, TianGong data access guide, ILCD JSON cheat sheet, case study write-up |
| `case/` | Foreground inventories (SVE, biopile) transcribed from the paper, and the provider choices that link them to TianGong |
| `data/` | Snapshot builder and the frozen TianGong snapshot (gzipped JSON) |
| `reference/` | Python reference implementation used to validate results and generate `tests/expected_results.json` |
| `prompts/` | The build prompt used live, follow-up prompts, stretch goals, and student prompt cards |
| `web/` | The single-page tool generated during the workshop, plus `web/data/case_bundle.json` |
| `tests/` | Expected results with tolerances; both the reference and the generated tool must reproduce them |
| `classroom/` | Optional online classroom submission and live aggregate board (ChatGPT Sites deployment) |
| `lecture/` | Runbook with timing and fallbacks, student worksheet, optional one-page note sent to students before the day |

## Data and licenses

- Background data: TianGong open LCA data, read from the public ILCD node `https://lcdn.tiangong.earth/resource`
  and frozen in `data/snapshot/`. MIT license, see https://github.com/tiangong-lca/data.
- Impact assessment: the 25 Environmental Footprint (EF 3.1 family) methods distributed with TianGong.
- Foreground data: transcribed inventory tables from Jeong & Suh (2011). The paper itself is **not** redistributed here.
- Code in this repository: MIT license.

## Status

See [`ROADMAP.md`](ROADMAP.md).
