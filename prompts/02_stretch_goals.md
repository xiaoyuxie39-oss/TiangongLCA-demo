# Stretch goals (pick one; 20–30 minutes each)

1. **Sensitivity slider.** Add a slider for the SVE electricity consumption (50 %–200 % of 148,748 kWh) and show the
   break-even point where SVE's climate score equals Biopile's.
2. **Normalisation.** Add EF 3.1 normalisation factors (per person-year, EU reference) so results can be compared across
   categories as the paper did in person-equivalents. Document the source of the factors in `docs/`.
3. **Sankey of the foreground.** Draw stages → providers → top elementary flows for one category (any small SVG, no library).
4. **Data-quality check.** Load the fourteen KR-2011 processes that TianGong digitised from this paper (uuids in
   `docs/04_case_study_sve_biopile.md`), link them as a product system, and list every inconsistency with `case/foreground_*.json`.
5. **Monte Carlo lite.** Give each foreground amount a ±20 % uniform range, sample 1,000 times in the browser, and show the
   probability that SVE > Biopile for the selected category.
6. **Swap the background.** Point `reference/build_case_bundle.py` at a different electricity flow or region set and regenerate the bundle; compare.
