# case/ — foreground inventories and provider choices

- `foreground_sve.json`, `foreground_biopile.json`: the paper's Tables 2–3, one object per stage, amounts **as printed**
  (L, m³, m², m, kWh, kg, tkm). Each input has an `item` key.
- `provider_choices.json`: one entry per `item`. It says which TianGong flow the item is, how to convert the printed unit into the
  flow's reference unit, which TianGong process supplies it by default, and which alternatives are worth trying.
  Items that cannot be linked are declared `"cutoff": true` with a reason — they still appear in the tool's cut-off list.

Schema of a provider entry:

```json
"electricity": {
  "flow": "890a70b7-b677-4e2a-8a1b-7d017e0a10ae",
  "flow_name": "Electricity", "flow_unit": "MJ",
  "convert": {"from": "kWh", "factor": 3.6, "note": "1 kWh = 3.6 MJ"},
  "default_provider": "0aa8c769-a04a-4e76-897a-2b1051cb9344",
  "default_provider_name": "Electricity production ; Electricity mix ; China (2019)",
  "alternatives": ["<uuid>", "..."],
  "why": "TianGong has no Korean grid; the national average is the neutral default. Provinces are offered for the sensitivity exercise."
}
```

Status: entries marked `"todo": true` are filled in during M1 from the snapshot (`reference/build_case_bundle.py --check` lists them).
