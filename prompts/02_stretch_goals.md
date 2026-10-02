# Stretch goals (pick one; 20–30 minutes each)

1. **Sensitivity slider.** Add a slider for the SVE electricity consumption (50 %–200 % of 148,748 kWh) and show the
   break-even point where SVE's climate score equals Biopile's.
2. **Normalisation.** Add EF 3.1 normalisation factors (per person-year, EU reference) so results can be compared across
   categories as the paper did in person-equivalents. Document the source of the factors in `docs/`.
3. **Sankey of the foreground.** Draw stages → providers → top elementary flows for one category (any small SVG, no library).
4. **Data-quality check.** Load the thirteen KR-2011 processes that TianGong digitised from this paper (uuids in
   `docs/04_case_study_sve_biopile.md`), link them as a product system, and list every inconsistency with `case/foreground_*.json`.
5. **Monte Carlo lite.** Give each foreground amount a ±20 % uniform range, sample 1,000 times in the browser, and show the
   probability that SVE > Biopile for the selected category.
6. **Fix the GAC gap.** TianGong's activated-carbon records have no inputs, so GAC scores ≈ 0 while the paper gives it 36 % of SVE's
   impact. Find a sourced cradle-to-gate figure (e.g. Bayer et al. 2005, the paper's own source), add it as an `addons` entry on
   `activated_carbon` in `case/provider_choices.json`, regenerate, and report how the SVE/biopile ratio moves.
