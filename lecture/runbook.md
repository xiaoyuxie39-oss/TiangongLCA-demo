# Runbook — 2.5 h workshop (adjust to 2–3 h)

## Before the day

- [ ] M1–M5 in `ROADMAP.md` green on a fresh clone; Pages URL works on a phone.
- [ ] Codex CLI (or Claude Code) logged in on the instructor laptop; `node` ≥ 20 installed (for `node web/test.mjs`).
- [ ] M4 web tool committed and live on Pages: it is the fallback for the live build and the tool for Track C.
- [ ] Printed or linked: `lecture/worksheet.md`, `prompts/student_prompt_cards.md`, the Pages URL and the classroom site URL as QR codes.
- [ ] Classroom site: open `/facilitator.html`, sign in with the PIN, note the six-digit classroom code, and open the student page on a phone.
- [ ] Two to three days before: push the repo (Track A clones it at home), then send the optional one-page note
      `lecture/before_class.md` to the host to forward: its text as the e-mail, the Word copy
      `local/handout/TiangongLCA_SNU_before_you_come.docx` attached (rebuild with `node build_handout.js` there).
- [ ] Ask the host in advance: room Wi-Fi, projector, a whiteboard or pen tablet (the matrix recap is solved by hand), roughly how many students bring laptops. No preparation is asked of students;
      anyone with a browser can do Track C, anyone with a chat AI can do Track B, and Track A is for those who already use Codex/Claude Code.

## Timeline

| Time | Block | What happens | Material |
|---|---|---|---|
| 0:00–0:10 | Framing | Why build an LCA tool instead of using one; what TianGong is; the case (a paper co-authored at SNU's neighbourhood: Suh) | slides |
| 0:10–0:25 | Matrix recap | A, B, Q on the 3-process toy; solve by hand on the board | `docs/01_matrix_method.md` |
| 0:25–0:35 | Data & the case | Show the TianGong node in a browser (or the snapshot CLI); one process JSON; the case in five minutes; the KR-2011 processes and what a reviewer would notice | `docs/02`, `docs/04` |
| 0:35–1:05 | **Live build** | 0:35–0:40 the agent in four minutes (loop, contract, test); paste `prompts/00_build_tool.md` into Codex; narrate while it works; run `node web/test.mjs`; open the page | prompt, tests |
| 1:05–1:15 | Break | — | — |
| 1:15–2:15 | Hands-on | Tracks A/B/C in parallel; instructor circulates; after question 5 each group saves one answer on the classroom site (Q1 and Q4 in t CO₂-eq, the same province in both systems; Q2 and Q5 as choices); lock at 2:10 | worksheet, prompt cards, Pages, classroom site |
| 2:15–2:30 | Wrap-up | Reveal the classroom board: spread across provinces; our numbers; the GAC = 0 slide (a linked dataset with no upstream); the four debates; what the AI got wrong; export the CSV | slides |

## Live-build script (0:35–1:05)

1. `git clone … && cd TiangongLCA-demo && codex` (or `claude`). Show `AGENTS.md` for 30 s: "this is the contract".
2. Paste `prompts/00_build_tool.md`. While it runs, explain what the test checks and why identities (column sums) matter.
3. When it stops: `node web/test.mjs` → expect PASS. Open `web/index.html`. Change the SVE electricity provider to a hydro-heavy province
   (Qinghai, Yunnan, Sichuan) and watch SVE drop below Biopile; then set Biopile to the same province: SVE is higher again (ratio ≈ 1.4).
   The dropdown belongs to one system, and a comparison needs the same grid on both sides — worksheet question 4 asks for exactly that.
4. If it fails after one retry (10 min max): `git checkout -- web && open web/index.html` (committed M4 version) and say so.

## Rehearsal log

| Date | Setup | Result |
|---|---|---|
| 2026-10-02 | Fresh clone, `codex exec` (Codex CLI 0.160, model gpt-5.6-sol, medium reasoning), prompt `prompts/00_build_tool.md` verbatim, no human input | **11 min 55 s** to a passing tool: `web/lca_core.js`, `web/test.mjs`, `web/index.html` (embeds a compressed copy of the bundle for `file://`); 505 checks PASS; it also flagged a genuine inconsistency between `AGENTS.md` and the reference (own-product consumption), fixed afterwards |
| 2026-10-02 | Follow-up: `codex exec resume --last` with a two-sentence change request after the reference fix (own-product netting) | **1 min 59 s**; it changed `lca_core.js`, extended `test.mjs`, refreshed the embedded bundle; 507 checks PASS |
| 2026-10-02 | Bug report from opening the page in a browser: cut-off rows (diesel, inoculum) crashed the foreground table — the test cannot see UI bugs | **3 min 7 s** to fix; lesson added to the prompt: name the cut-off rows explicitly and ask for a render check. Always open the page once before declaring victory |

Budget for the live slot: 30 min = 12 min build + 5 min test/open + buffer. If the build passes early, use the time to change a provider live.

## Live results board

- Primary: the classroom site https://tiangong-lca-classroom-2026.xiaoyuxie39.chatgpt.site/ (built with Codex; code and setup in
  `classroom/README.md`). Show its six-digit code on the projector. Groups join after question 5 and save one paired answer:
  baseline SVE and Biopile (Q1), one electricity provider with both totals after the change (Q4), and choices for Q2 and Q5, in t CO₂-eq.
  They can edit until you lock. Ask groups to join only after question 5: the form asks why GAC is near zero, which would give away Q2.
  Lock at 2:10; at 2:15 reveal the anonymised distribution on `/board.html`; download the CSV from the facilitator page.
- Fallback if the site is down: the Google Sheet "TiangongLCA results board (live)" (link and setup in `lecture/README_board.md`;
  source `lecture/results_board_live.csv`). Students type rows from any phone; project columns H–N.
- Fallback without internet: `web/board.html` on the projector laptop (instructor types rows; stored in the browser; CSV export).

## Fallbacks

| Problem | Do this |
|---|---|
| No Wi-Fi | Everything is local; share the repo zip on a USB stick; Pages replaced by `web/index.html` |
| Codex quota / login fails | Use Claude Code; else committed `web/` |
| Students have no AI tools | Track C; pair them with a Track A student for the last 15 min |
| Results differ from `tests/expected_results.json` | Check `meta.json` crawl date vs bundle; regenerate bundle; it is a teaching moment about frozen data |
