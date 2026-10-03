# Follow-up prompt — the student edition of the tool

Run this after `00_build_tool.md` has produced a passing `web/`. It turns the tool into the edition students use on
GitHub Pages: readable on screen, with the data behind each number one click away. The committed `web/` already is this
edition; use the prompt to rebuild it, or to repeat the step with an agent as a stretch exercise.

## Goal

1. **No audit clutter on screen.** The default view prints names, amounts, units and each item's `label` and `why_short`
   from the bundle. No uuid, no resolution-rule code (`foreground-choice`, `geo-match-…`, `self-netted`), no mapping or
   verifier note, no data warnings, no matrix density. `index.html?audit=1` brings all of them back for the instructor, but
   only on a local copy (`file://` or localhost): the public site ignores the parameter (see Acceptance in `AGENTS.md`).
   TianGong names: render `;` and `|` separators as ` · `.
2. **Dataset card.** Every provider and process name opens a dialog: name, location, year and source in words a student
   can read (census datasets: "China's Second National Pollution Source Census (NESPS2)" instead of the Chinese handbook
   page; input-output sectors: what CEEIO is); the Chinese name, classification path and dataset type only in the audit
   view; the role in the model; the impact of one unit of its reference product with everything upstream (solve
   A s = e_j, then Q B s; for a foreground provider also per printed unit, e.g. per kWh); every input with what it is
   linked to (a clickable provider, "cut-off", or the own product netted on the diagonal), every output (reference product,
   emission with its characterisation factor for the selected category, by-product not linked); a link to
   `https://lcdn.tiangong.earth/datasetdetail/process.xhtml?uuid=<uuid>`; a Back button for links followed inside the card.
   A dataset without inputs says so plainly ("No inputs listed in this dataset.") and nothing more: students draw the conclusion.
3. **Flow drill-down.** Each of the top 10 elementary flows opens a list of the processes that emit it, with value and share
   (Q[k,i] B[i,j] s_j; the list sums to the flow's total).
4. **Same background on both sides.** Provider choices stay per system. When the two systems use different datasets for the
   same item (typically electricity), show a banner in the header and above the results, with one button per direction
   that copies the choice to the other system.
5. **Cut-offs and provider choices**, readable: foreground cut-offs with their one-line reason; the background cut-offs as
   one sentence with their count and one example (the foreground provider that loses the largest share of its product
   inputs, e.g. 4 of the 5 inputs of the China grid mix), since each dataset card shows its own; the provider log as input,
   stage, provider, number of options and `why_short`. The audit view adds the grouped background list and the automatic
   background choices with their rule.
6. **Results** for both systems side by side (main categories; the nine sub-indicators folded). The CSV export holds both
   systems; the method uuids only in the audit view.

## Constraints

- Keep `lca_core.js` pure. Add `flowByProcess(system, scaling, method, row)` and `unitImpacts(system, columnId)`.
- Put the HTML builders in `web/lca_ui.js`, also pure (no DOM, strings out), so Node can render every panel.
- Labels and short reasons come from the bundle (`case/mapping/assemble.py` → `case/provider_choices.json` →
  `reference/build_case_bundle.py`), never from strings typed into the UI. Rebuilding the bundle refreshes the inline copy.
- Keep the status line "Solved both systems in … ms": the pre-class note tells students to look for it.
- No horizontal page scroll at 375 px; wide tables scroll inside their own box.

## Acceptance

`node web/test.mjs` passes, including: the default view of every panel (both systems, three categories) and the dataset
card of every process in the bundle contain no uuid or audit code in visible text or tooltips, and no Chinese name,
classification path, dataset type, background list, automatic choices or matrix density; the audit view does show uuids,
but only for local addresses; the student CSV has no uuid; every cut-off row renders; the drill-down sums to each flow's total; for stages without add-ons, Σ amount × unit
impact of the provider equals the stage result; the mismatch banner appears only for a one-sided change and disappears
after syncing; the inline bundle equals `web/data/case_bundle.json`. Then open the page once, in a browser, at desktop and
phone width, and open the activated-carbon dataset card.
