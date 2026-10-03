# The matrix method, as implemented here

This is the computational structure behind every LCA tool (Heijungs & Suh, *The Computational Structure
of Life Cycle Assessment*, 2002). We implement the smallest honest version of it.

## Objects

| Symbol | Shape | Meaning |
|---|---|---|
| **A** | n_processes × n_processes | Technology matrix. Column j describes process j: + its reference product on the diagonal, − its product inputs in the rows of the providers it is linked to. Square by construction. |
| **B** | n_elementary × n_processes | Intervention matrix. Emissions (outputs) and resource extractions (inputs) of each process. |
| **f** | n_products | Final demand (the functional unit), e.g. 1 "Remediated soil, SVE" = 1,000 m³. |
| **s** | n_processes | Scaling vector: how many times each process must run. |
| **g** | n_elementary | Life cycle inventory. |
| **Q** | n_methods × n_elementary | Characterisation factors (one row per impact category). |
| **h** | n_methods | Impact scores. |

## Equations

```
A s = f            →  s = A⁻¹ f          (solve, do not invert)
g   = B s
h   = Q g = Q B s
```

Contribution analysis is just "do not sum yet":

```
H_process[k, j] = Σ_i Q[k, i] · B[i, j] · s[j]        (impact k caused by process j)
H_stage[k, stage] = (Q B A⁻¹ e_stage)[k]               (impact of demanding 1 unit of that stage alone; exact because the solution is linear in f, so Σ_stage H_stage = h)
H_flow[k, i] = Q[k, i] · g[i]                          (impact k caused by elementary flow i)
```

Summing `H_process` over the processes j recovers `h` (Σⱼ H_process[k, j] = h[k]). That identity is the first test.

## Sign and unit conventions used in this repository

- Row i of A is "the reference product of column i". A consumer's product input is linked to one provider column, so A is
  square even when several processes make the same product (30 provincial electricity mixes plus the national average). Which provider is chosen is
  a modelling decision, logged in `provider_log`.
- Foreground stages are synthetic columns with reference amount 1 whose inputs are the paper's amounts converted to the
  TianGong flow units; a synthetic system column consumes 1 of each stage; the demand is 1 unit of the system column.

- Amounts are taken **as stored** in TianGong (reference unit of the flow; electricity is in MJ).
- A[i, j] = +amount for the reference output of process j; A[i, j] = −amount for each product input i of process j.
  No normalisation to "per 1 unit of output" is needed; the solver takes care of it.
- Elementary-flow outputs enter B with +amount; elementary-flow *inputs* (resources, land, water) also enter B with +amount
  but are matched to factors with direction `in`. Q is built direction-aware: key (flow uuid, direction).
- A product input whose flow has **no provider** in the system is a **cut-off**: its row is dropped from A and the
  (process, flow, amount) triple is reported. Cut-offs are not errors; they are findings.
- Multi-output processes are reduced to their reference flow. Other product or waste outputs are listed as "unlinked outputs".

## Provider resolution (how a product input finds its column)

1. If `case/provider_choices.json` names a provider for this flow (globally, or for this consuming stage), use it.
2. Else collect all processes whose `ref_flow` equals the flow.
3. If exactly one: use it. If several: prefer the most specific geography match (shared trailing tokens of the location code),
   on ties the more general dataset (a `CN` consumer gets the national mix, not an arbitrary province), then the latest `year`,
   then the smallest uuid. Records whose reference exchange is an input, or that consume their own product, are never providers.
4. Record every automatic choice in the result (`provider_log`) so a student can see it and override it.

## Toy example (three processes)

Reference flows: **remediated soil** (1,000 m³ per run of the SVE operation), **electricity** (3.6 MJ per run of the grid-mix process),
**activated carbon** (1,000 kg per run of the production process). Numbers are from the case study and TianGong.

```
                 SVE op.     grid mix     AC prod.
remediated soil   +1000          0           0
electricity     −535492.8      +3.6          0
activated carbon −18000          0        +1000

f = [1000, 0, 0]ᵀ      →   s = [1, 148748, 18]ᵀ
```

So the grid-mix process runs 148,748 times (one per kWh) and activated-carbon production 18 times (18 t).
If the grid mix emits 0.2 kg CO₂ per run (i.e. per kWh) and AC production 10,000 kg per run, then
g_CO₂ = 0.2·148,748 + 10,000·18 = 29,750 + 180,000 kg, and the per-process contribution shows immediately that
activated carbon, not electricity, dominates the climate score. The real system adds the upstream of the grid mix
(thermal power → coal mining → …) by exactly the same mechanism, which is why the matrix must be solved rather than summed.

## What to show students

1. Print A for the foreground only (6 stages + their direct providers). It fits on a slide.
2. Print the size of the full reachable A (a few hundred columns) and the sparsity. That is the "background".
3. Print `provider_log` and the cut-off list. Those are the modelling decisions an LCA practitioner is responsible for.
   Print them readably: dataset names, amounts and a one-line reason (`label`, `why_short`), not uuids or rule codes.
   The uuids stay traceable in the audit view of a local copy (`web/index.html?audit=1` opened from `file://` or
   localhost); the public site never shows them.
4. Let students open any dataset: what it consumes (and from which provider, or cut off), what it emits, and the impact of
   one unit of its product with everything upstream (solve A s = e_j, then Q B s). A linked dataset with no inputs at all,
   like the activated-carbon record, never shows up in the cut-off list; it only becomes visible here.
