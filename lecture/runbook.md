# Runbook — 2.5 h workshop (adjust to 2–3 h)

## Before the day

- [ ] M1–M5 in `ROADMAP.md` green on a fresh clone; Pages URL works on a phone.
- [ ] Codex CLI (or Claude Code) logged in on the instructor laptop; `node` ≥ 20 installed (for `node web/test.mjs`).
- [ ] Screen recording of a successful live build saved in `local/` (fallback).
- [ ] Printed or linked: `lecture/worksheet.md`, `prompts/student_prompt_cards.md`, Pages URL as a QR code.
- [ ] Ask the host in advance: room Wi-Fi, how many students bring laptops, who already has Codex/Claude Code/ChatGPT.

## Timeline

| Time | Block | What happens | Material |
|---|---|---|---|
| 0:00–0:10 | Framing | Why build an LCA tool instead of using one; what TianGong is; the case (a paper co-authored at SNU's neighbourhood: Suh) | slides |
| 0:10–0:25 | Matrix recap | A, B, Q on the 3-process toy; solve by hand on the board | `docs/01_matrix_method.md` |
| 0:25–0:35 | Data | Show the TianGong node in a browser; one search; one process JSON; show the KR-2011 processes and ask what's odd | `docs/02`, `docs/04` |
| 0:35–1:05 | **Live build** | Paste `prompts/00_build_tool.md` into Codex; narrate while it works; run `node web/test.mjs`; open the page | prompt, tests |
| 1:05–1:15 | Break | — | — |
| 1:15–2:15 | Hands-on | Tracks A/B/C in parallel; instructor circulates; collect each group's SVE/Biopile GWP and electricity choice on a shared board | worksheet, prompt cards, Pages |
| 2:15–2:30 | Wrap-up | Board results: spread across provinces; who found the Table 4 vs Table 5 discrepancy; what the AI got wrong | — |

## Live-build script (0:35–1:05)

1. `git clone … && cd TiangongLCA-demo && codex` (or `claude`). Show `AGENTS.md` for 30 s: "this is the contract".
2. Paste `prompts/00_build_tool.md`. While it runs, explain what the test checks and why identities (column sums) matter.
3. When it stops: `node web/test.mjs` → expect PASS. Open `web/index.html`. Change the electricity provider to a hydro-heavy province. Watch SVE drop.
4. If it fails after one retry (10 min max): `git checkout -- web && open web/index.html` (committed M4 version) and say so. Play the recording later if useful.

## Fallbacks

| Problem | Do this |
|---|---|
| No Wi-Fi | Everything is local; share the repo zip on a USB stick; Pages replaced by `web/index.html` |
| Codex quota / login fails | Use Claude Code; else committed `web/` + recording |
| Students have no AI tools | Track C; pair them with a Track A student for the last 15 min |
| Results differ from `tests/expected_results.json` | Check `meta.json` crawl date vs bundle; regenerate bundle; it is a teaching moment about frozen data |
