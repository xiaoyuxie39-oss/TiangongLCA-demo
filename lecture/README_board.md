# Live results board — how to run it

**Sheet:** https://docs.google.com/spreadsheets/d/1Jo00NyXXPqxO4o_aZ51GcqlzsoaU7YNb2SfOiIqvYWE/edit
(owner: the instructor's Google account; created from `lecture/results_board_live.csv`).

## Before class (2 minutes, once)

1. Open the sheet → **Share** → *General access* → **Anyone with the link** → **Editor**. Copy the link, make a QR code.
2. Optional: *Data → Protect sheets and ranges* on columns H:N so students cannot edit the formulas.
3. Optional: add dropdowns on B2:B500 (SVE, Biopile) and C2:C500 (provider names from column H) via *Data → Data validation*.

## In class

- Students open the link on a phone or laptop and type one row per result in columns A–E: group, SVE or Biopile,
  the electricity provider they chose in the tool, climate change in tonnes CO₂-eq, optional note. No account needed.
- Project the same sheet scrolled to columns H–N (zoom ~125 %). Everything there recalculates within a second:
  entries / min / median / max / mean per system, the SVE/biopile ratio next to the paper's 6.9, the mean per
  electricity provider with inline bars, and the latest eight entries.
- Provider matching is tolerant: "Sichuan", "sichuan hydro" and "Electricity mix ; Sichuan" all count for Sichuan.

## Fallbacks

- No internet: open `web/board.html` on the projector laptop and type the rows yourself; it draws the same picture.
- Sheet damaged: *File → Version history* restores it, or re-upload `lecture/results_board_live.csv` to Drive (it converts
  to a Sheet with the formulas live) and share again.
