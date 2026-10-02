# ILCD-as-JSON cheat sheet (TianGong node) and the compact snapshot

## Process dataset (`/resource/processes/{uuid}?format=json`)

```
processInformation.dataSetInformation.UUID
processInformation.dataSetInformation.name.baseName[]            {value, lang}   ← "en" and "zh"
processInformation.dataSetInformation.name.treatmentStandardsRoutes[]
processInformation.dataSetInformation.name.mixAndLocationTypes[]
processInformation.dataSetInformation.classificationInformation.classification[].class[] {value, level}
processInformation.dataSetInformation.generalComment[]           {value, lang}
processInformation.quantitativeReference.referenceToReferenceFlow[]   ← dataSetInternalID(s) of the reference exchange
processInformation.time.referenceYear
processInformation.geography.locationOfOperationSupplyOrProduction.location   e.g. "CN", "KR", "SH-CN"
modellingAndValidation.LCIMethodAndAllocation.typeOfDataSet      "Unit process, single operation" | ...
modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.referenceToDataSource[] {refObjectId, shortDescription[]}
exchanges.exchange[]:
    dataSetInternalID            integer
    referenceToFlowDataSet       {refObjectId: <flow uuid>, shortDescription[]}
    exchangeDirection            "Input" | "Output"
    meanAmount, resultingAmount  number (reference unit of the flow)
    generalComment[]
```

There is **no** `referenceToProviderProcess` — providers are resolved by matching flow uuids.

## Flow dataset (`/resource/flows/{uuid}?format=json`)

```
flowInformation.dataSetInformation.UUID
flowInformation.dataSetInformation.name.baseName[]
flowInformation.dataSetInformation.classificationInformation.classification[].class[]
modellingAndValidation.LCIMethod.typeOfDataSet       "Elementary flow" | "Product flow" | "Waste flow"
flowProperties.flowProperty[]                        reference property → unit group → unit
```

The **list view** (`/resource/flows?format=json&pageSize=1000`) already gives `name, type, classific, refProp, refPropUnit`,
which is all the snapshot needs.

## LCIA method dataset (`/resource/lciamethods/{uuid}?format=json`)

```
LCIAMethodInformation.dataSetInformation.UUID / name[] / methodology[] / impactCategory[] / impactIndicator
LCIAMethodInformation.quantitativeReference.referenceQuantity.shortDescription[]   e.g. "kg CO2 Equivalents"
characterisationFactors.factor[]:
    referenceToFlowDataSet.refObjectId    <flow uuid>
    exchangeDirection                     "Output" (emissions) | "Input" (resources)
    meanValue                             number
```

The 25 methods on the node (EF 3.1 family): Acidification; Climate change (+ fossil/biogenic/LULUC); Ecotoxicity freshwater (+ inorganics/organics);
Particulate matter; Eutrophication marine/freshwater/terrestrial; Human toxicity cancer and non-cancer (+ inorganics/organics);
Ionising radiation; Land use; Ozone depletion; Photochemical ozone formation; Resource use fossils; Resource use minerals and metals; Water use.

## Compact snapshot written by `data/build_snapshot.py`

```json
// processes.json  (array)
{ "uuid": "...", "version": "1.1", "name": "Electricity production ; Electricity mix ; China", "name_zh": "...",
  "geo": "CN", "year": "2019", "type": "Unit process, single operation",
  "classification": ["Unit processes / Energy carriers and technologies / Electricity"],
  "comment": "...", "sources": [{"uuid": "...", "name": "..."}],
  "ref_flow": "890a70b7-b677-4e2a-8a1b-7d017e0a10ae",
  "exchanges": [ {"dir": "in", "flow": "...", "name": "electricity for thermal power", "amount": 2.505},
                 {"dir": "out", "flow": "890a70b7-...", "name": "Electricity", "amount": 3.6, "ref": true} ] }

// flows.json  (object keyed by uuid)
"890a70b7-b677-4e2a-8a1b-7d017e0a10ae": {"name": "Electricity", "type": "Product flow",
   "category": "Energy carriers and technologies / Electricity", "prop": "Net calorific value", "unit": "MJ"}

// lcia_methods.json  (array)
{ "uuid": "6209b35f-...", "name": "Climate change", "unit": "kg CO2 Equivalents", "methodology": ["Environmental Footprint"],
  "impact_category": ["Climate change"], "indicator": "Radiative forcing as Global Warming Potential (GWP100)",
  "factors": [ ["<flow uuid>", "out", 1.0], ... ] }
```

Index you will want immediately:

```python
producers = {}                       # flow uuid -> [process uuid, ...]
for p in processes:
    if p["ref_flow"]:
        producers.setdefault(p["ref_flow"], []).append(p["uuid"])
```
