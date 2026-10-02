# Follow-up prompt — run and interpret the case study

Using the tool you just built (or the committed one in `web/`), produce `reference/out/case_report.md` with:

1. Climate change (GWP100) and the other 24 categories for SVE and Biopile with default providers, in a table.
2. The ratio SVE / Biopile per category, and whether SVE is higher in every category (the paper says it is, under EDIP 2003).
3. Contribution by stage for climate change, human toxicity (non-cancer) and freshwater ecotoxicity, for both systems.
   State the share of "operation + GAC replacement" for SVE and compare it with the paper's 96 %.
4. The provider log and the cut-off list, with one sentence each on whether the cut-off could change the ranking.
5. A sensitivity run: replace the China average electricity mix by the two provinces with the highest and lowest
   climate-change intensity in the bundle. Report how the SVE total and the SVE/Biopile ratio move.
6. Three sentences on why the absolute numbers differ from the paper (background database, LCIA method, GAC dataset, year).
