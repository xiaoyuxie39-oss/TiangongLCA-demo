# Getting TianGong data: three channels

TianGong (天工) is an open, ILCD-based LCA database of mostly Chinese unit processes, maintained at Tsinghua University
(platform: https://lca.tiangong.earth, docs: https://docs.tiangong.earth, code: https://github.com/tiangong-lca).
Data license: MIT.

## Channel 1 — the public ILCD node (what this repo uses)

A soda4LCA-style node that returns JSON **without login**: `https://lcdn.tiangong.earth/resource`.
Verified 2026-10-02: 4,091 processes, 96,820 flows, 25 LCIA methods.

```bash
# list / search processes
curl -s -H "Accept: application/json" \
  "https://lcdn.tiangong.earth/resource/processes?format=json&search=true&name=activated%20carbon&pageSize=10"

# one full process dataset (ILCD structure as JSON, includes exchanges)
curl -s "https://lcdn.tiangong.earth/resource/processes/0aa8c769-a04a-4e76-897a-2b1051cb9344?format=json"

# flows (list view already carries reference property and unit)
curl -s "https://lcdn.tiangong.earth/resource/flows?format=json&pageSize=1000&startIndex=0"

# one LCIA method with all characterisation factors
curl -s "https://lcdn.tiangong.earth/resource/lciamethods/6209b35f-9447-40b5-b68c-a1099e3674a0?format=json"
```

Useful facts and limitations:

- Flow uuids are consistent across the database: all 31 provincial electricity mixes output the same `Electricity`
  flow (`890a70b7-b677-4e2a-8a1b-7d017e0a10ae`, unit MJ). Linking by `ref_flow` works.
- Elementary flows match the EF characterisation factors by uuid (e.g. `carbon dioxide (fossil)` → GWP 1.0).
- There are **no life cycle models** on the node and **no "producers of this flow" endpoint** (`/flows/{uuid}/producers` returns 406).
  Build your own flow → provider index, which is what `data/build_snapshot.py` enables.
- Exchange amounts carry no unit; the unit is the flow's reference unit (see `flows.json`). Electricity is in **MJ**.
- Some endpoints paginate with `startIndex`/`pageSize`; the builder handles that.

`data/build_snapshot.py` crawls all of this into compact JSON once; the workshop never touches the network.

## Channel 2 — the open data repository and platform export

- https://github.com/tiangong-lca/data : ILCD XML for ~4,100 processes, flows, flow properties, unit groups, 25 LCIA methods (≈165 MB).
  Marked as a historical snapshot; the platform is the live source.
- https://lca.tiangong.earth : search, inspect, and export datasets (TIDAS JSON zip, ILCD). Free account needed to export.
- Conversion and validation tools: `tidas` CLI (Rust, https://github.com/tiangong-lca/tidas-toolkit), SDKs (https://github.com/tiangong-lca/tidas-sdks).

## Channel 3 — for AI agents: MCP, CLI, agent skills (optional, needs a TianGong account)

- Remote MCP server: `https://lcamcp.tiangong.earth/mcp` (OAuth 2.1 in the browser). Tools: hybrid search of flows, processes, life cycle models.
  Docs: https://docs.tiangong.earth/en/docs/integration/mcp-lca-remote/
- CLI: `pnpm add --global @tiangong-lca/cli`, then `tiangong-lca auth login`. Search and data-authoring commands.
- Agent skills for Claude Code and Codex: `npx skills add https://github.com/tiangong-lca/agent-skills`
  (the three `*-hybrid-search` skills are read-only).

For the workshop this channel is a *demonstration*, not a dependency: show one MCP search, then switch to the frozen snapshot.

## Case-study coverage check (done 2026-10-02)

TianGong already contains **14 unit processes digitised from Jeong & Suh (2011)** (geo `KR`, year 2011, source field cites the DOI):
6 SVE stages and 8 biopile stages. Their exchanges are *not* linked into a product system, and a few amounts look mistranscribed
(e.g. 10,000 vs 1,000 for pre-treated soil). This repo therefore uses the paper's tables as foreground and TianGong only as
background, and keeps the digitised uuids in `docs/04_case_study_sve_biopile.md` as a data-quality exercise.
