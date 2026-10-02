# Case study: SVE vs biopile remediation of a TPH-contaminated site

**Source.** Seung-Woo Jeong (Kunsan National University) and Sangwon Suh (Bren School, UC Santa Barbara), 2011.
*Assessment of Environmental Impacts and CO₂ Emissions from Soil Remediation Technologies using Life Cycle Assessment —
Case Studies on SVE and Biopile Systems.* Journal of Korean Society of Environmental Engineers 33(4):267–274.
https://doi.org/10.4491/KSEE.2011.33.4.267 (Korean, English abstract and tables).
Inventories below are transcribed from Tables 1–3; results from Tables 4–5 and Figs. 3–5. The PDF is not redistributed.

## Goal and scope

- **Function:** remediate the contaminated soil of a site. **Functional unit:** 1,000 m³ of soil (200 m² × 5 m),
  TPH 10,000 mg/kg → 500 mg/kg (95 % removal). Reference flow: the remediated site.
- **Systems:** soil vapor extraction (SVE, in situ) vs biopile (ex situ, on site). Both modelled in six stages.
- **Boundary:** materials and energy consumed on site, their production and transport (30 km round trip); construction and
  diesel data from the Korean MOE remediation cost-standardisation study and construction-cost standard. Decommissioning,
  monitoring and groundwater excluded. Background: ecoinvent LCI v2.1; software CMLCA 5.1.
- **LCIA:** EDIP 2003 (9 categories), characterised and normalised to person-equivalents (PE). CO₂ emissions reported separately.
- Design basis (Table 1): SVE vapour concentration 220 g/m³, extraction 34 m³/h, efficiency 11 %, 750 days (2.05 yr),
  1 extraction + 2 monitoring wells; biopile degradation 37 mg/kg/day, 514 days (1.41 yr), two 500 m³ piles.

## Inventory — SVE (Table 2)

| Stage | Inputs |
|---|---|
| Transportation | all materials 99.8 t, 30 km round → **2,994 tkm** |
| Site foundation | office, storage and system foundation: gravel 9.6 m³, concrete 19 m³, wire mesh 96 m²; backhoe diesel 21 L |
| Well installation | 3 wells: PVC 45 kg, sand 0.3 m³, bentonite 211 kg, mortar 2,291 kg; drilling-rig diesel 11 L |
| SVE system assembly | flexible polyurethane hose 340 m, sand 4 m³, concrete 5 m³, welding (gas) 100 m |
| SVE operation | electricity **148,748 kWh** over 2.05 yr (estimated from three systems' data) |
| GAC replacement | granular activated carbon **18,000 kg** (Freundlich isotherm for benzene, 0.152 g/g; GAC LCI after Bayer et al. 2005) |

## Inventory — biopile (Table 3)

| Stage | Inputs |
|---|---|
| Transportation | all materials 117 t, 30 km round → **3,510 tkm** |
| Excavation | excavator (0.7 m³, 27.4 h) diesel 288 L; dump truck (10.5 t, 27.4 h) diesel 515 L |
| Site preparation | tyre roller (15 t, 2 h) diesel 16 L; gravel 7.8 m³; sand 60 m³; THP tube 58 m; HDPE sheet (2 mm) 600 m²; polypropylene textile 600 m²; welding (gas) 100 m |
| Operation | water 67.4 t; ammonium sulphate 2,708 kg; potassium sulphate 558 kg; micro-organism 4,777 L; electricity **63,700 kWh** over 1.41 yr |
| GAC replacement | activated carbon **1,368 kg** |
| Backfilling | excavator diesel 288 L; dump truck diesel 515 L |

## Results reported by the paper

**Table 4 — EDIP 2003, characterised and normalised**

| Category | SVE | Biopile | Unit | SVE (PE) | Biopile (PE) |
|---|---|---|---|---|---|
| Acidification | 3.39E+04 | 4.86E+03 | m² | 15.41 | 2.21 |
| Ecotoxicity (water) | 6.09E+07 | 2.06E+07 | m³ water | 173.01 | 58.52 |
| Ecotoxicity (soil) | 2.80E+05 | 8.97E+04 | m³ soil | 0.29 | 0.09 |
| GWP 100a | 5.75E+03 | 4.32E+03 | kg CO₂-eq | 0.66 | 0.50 |
| Human toxicity (air) | 1.14E+11 | 1.55E+10 | m³ air | 37.25 | 5.07 |
| Human toxicity (surface water) | 3.24E+06 | 1.01E+06 | m³ water | 62.07 | 19.35 |
| Human toxicity (soil) | 4.11E+04 | 6.73E+03 | m³ soil | 323.62 | 52.99 |
| Ozone formation (human) | 92.5 | 15.9 | person·ppm·h | 9.25 | 1.59 |
| Eutrophication | 1.09E+03 | 183 | kg NO₃-eq | 18.79 | 3.16 |

**Table 5 — CO₂ (kg, ecoinvent sub-compartments)**

| Sub-compartment | SVE | Biopile |
|---|---|---|
| air, high population density | 177,000 | 26,600 |
| air, low population density | 174,000 | 24,500 |
| air, unspecified | 9,370 | 987 |
| air, lower stratosphere + upper troposphere | 0.00173 | 0.00522 |
| **Total** | **360,000** | **52,100** |

**Stage contributions (normalised, all categories summed).** SVE: operation 386 PE (60 %), GAC replacement 233 PE (36 %), the
other four stages ≈ 4 %. Biopile: operation 80 PE (55.7 %), GAC 18 PE (12.4 %), excavation 17, backfill 17, transport ≈ 8, site
preparation ≈ 2. Electricity is the dominant input in both systems; human toxicity (soil) dominates SVE, ecotoxicity (water)
dominates biopile. SVE is higher than biopile in all nine categories.

> Discussion point: Table 4's GWP (5.75 t CO₂-eq for SVE) and Table 5's CO₂ total (360 t) differ by ~60×. With 148,748 kWh of
> electricity and 18 t of activated carbon, hundreds of tonnes is the plausible order of magnitude. Ask the students which table
> they trust and why, then let the tool arbitrate.

## How this repo maps the case to TianGong

- Foreground: `case/foreground_sve.json`, `case/foreground_biopile.json` (the tables above, one JSON object per stage).
- Background links: `case/provider_choices.json` (TianGong process uuid per input, with unit conversions and alternatives);
  how each was chosen and what the verifier objected to: `docs/05_provider_mapping_decisions.md`.
- Reference run (2026-10-02, China 2019 grid, EF 3.1): SVE 92.8 t CO₂-eq vs biopile 45.9 t (ratio 2.0); SVE operation 86.4 t
  (electricity), GAC 0 because TianGong's activated-carbon records carry no inputs; biopile excavation and backfill 2.2 t each
  from the diesel combustion add-on. Full table: `reference/out/validation.md`.
- Expected deviations from the paper, to be discussed rather than hidden: Chinese background instead of ecoinvent/Korean;
  EF 3.1 instead of EDIP 2003; GAC modelled with a TianGong activated-carbon dataset instead of Bayer et al. (2005).
  The *ordering* (SVE ≫ biopile; operation + GAC dominate SVE) is what we expect to reproduce.

## TianGong already has this paper (data-quality exercise)

Thirteen KR-2011 unit processes in the snapshot cite this paper (6 SVE + 7 biopile). SVE: barrier layer `521537b7-28c2-4806-8532-659cd4d25f2a`,
materials transport `67ed2674-976c-45f5-8933-ee8f220aca1e`, extraction wells `dcf5877b-f79e-464c-bdc5-67cc670f55e0`,
system assembly (search "SVE system assembly"), operation (`Remediated soil ; … SVE system operation for 2.05 years`),
exhaust-gas disposal `2f2acd1d-c8ed-4f6d-9a08-324d513c7be3`. Biopile: hardened ground, materials transport, excavation,
soil conditioning, pile maintenance, waste-gas disposal, backfilling (search "ex situ remediation ; Biopile").
Things students should spot: the stages are not linked to each other, electricity appears as 535,492.8 MJ (= 148,748 kWh),
pre-treated soil is 10,000 in one process and 1,000 in the next, and the materials-transport process outputs 99,800 "kg"
of a service flow. Good material for "what does a reviewer check?".
