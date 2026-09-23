# AML investigation graph

MoneyGraph uses `react-force-graph-2d` to render a force-directed transaction network on Canvas. The interaction follows the useful concepts of a local knowledge graph: selection, nearby connections, sparse labels, zoom/pan, and adjustable forces. Nodes remain anonymized clients; roles and scores describe hypotheses for analyst review.

## Run

Use Node 22.18 or newer and first prepare the backend Python environment/results using the [repository setup](../README.md). From `apps/frontend`:

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

Open the Vite URL, normally `http://127.0.0.1:5173`. **Project mode is the default** and loads real results from the repository. The current export contains 2,248 nodes, 3,119 directed edges, 4,840 transactions, and 65 clusters. Its first-ranked GID is `100000003115284100`. The installed renderer is `react-force-graph-2d` (`^1.29.1`); the lockfile records the installed dependency tree. No analytical HTTP server or AI key is required for graph exploration.

Use `VITE_DATA_MODE=demo npm run dev` for explicitly labeled synthetic fixtures. For a future compatible analytical API:

```bash
VITE_DATA_MODE=api VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Only the literal data mode `api` enables analytical HTTP requests. Failed project-file or API requests do not switch to demo data. CORS must permit the frontend origin when an API runs on another origin.

## Real project data

The `predev` and `prebuild` hooks run `scripts/prepare-project-data.mjs`. In project mode it selects the repository's `.venv/bin/python` or falls back to `python3` (`MONEYGRAPH_PYTHON` overrides this), then runs `scripts/export-project-data.py`. The exporter reads the three backend outputs—`results/nodes_roles.csv`, `results/clusters.csv`, `results/top_nodes.csv`—and canonical `data/nodes.parquet` / `data/edges.parquet`. It validates their schemas, exact GIDs, score ranges, memberships, rankings, counts, and canonical graph totals before writing ignored `apps/frontend/public/project-data.json`.

Roles, role confidence, priority, evidence, cluster assignments, and the priority queue come directly from the backend CSVs. Full observed incoming/outgoing amounts, degrees, transaction counts, and incident edges come from canonical aggregated edges. Seed reach, unexported alternative-role scores, priority components, and next actions remain unavailable. The adapter does not run the analytics pipeline, change its output files, or infer missing scores.

After recomputing analytics, refresh the export and reload the browser:

```bash
# From the repository root:
.venv/bin/python main.py
npm --prefix apps/frontend run data:project
```

Startup and production builds also refresh from existing files. In project mode `api.network()` loads the complete export with `scope: 'dataset'`, so depth 1–4 traversal operates on all supplied edges. This is complete only for the provided observation window; it does not recover transfers beyond depth 4 or outside the dataset. No HTTP endpoints were added to the backend.

## Architecture and data boundary

| File | Responsibility |
| --- | --- |
| `apps/frontend/scripts/prepare-project-data.mjs` | Startup/build hook selecting the Python exporter for project mode. |
| `apps/frontend/scripts/export-project-data.py` | Read-only validation and conversion of backend CSVs plus canonical Parquet nodes/edges. |
| `apps/frontend/src/lib/contracts.ts` | Zod validation for project data, API responses, and optional graph metrics. |
| `apps/frontend/src/lib/api.ts` | Project/demo/API mode selection, cached local data, optional endpoint calls, and `api.network(gid, signal)`. |
| `apps/frontend/src/lib/graph-adapter.ts` | `AMLGraphData`, normalization, unknown-value handling, scaling/color functions, and directed breadth-first traversal. |
| `apps/frontend/src/lib/graph-demo.ts` | Deterministic expansion of the small fixture into a full-size synthetic network. |
| `apps/frontend/src/lib/graph-settings.ts` | Typed settings, intersected filters, and quick presets. |
| `apps/frontend/src/components/graph-settings.tsx` | shadcn filter, grouping, display, and force controls. |
| `apps/frontend/src/components/graph-panel.tsx` | Global/local scope, tracing controls, transfer table, legend, and coverage notices. |
| `apps/frontend/src/components/AMLGraph.tsx` | Backend-independent Canvas renderer, simulation, highlighting, tooltips, and camera controls. |
| `apps/frontend/src/App.tsx` | Shared GID selection, search, navigation, inspector integration, and resource loading. |

The renderer receives only normalized nodes and links. It creates its own simulation objects because the graph library mutates positions and resolves link endpoints into node references. API objects and string endpoint identifiers remain intact.

All GIDs are **decimal strings**, including `gid`, `src`, `dst`, `source`, and `target`. Existing examples exceed `Number.MAX_SAFE_INTEGER`; converting them to JavaScript numbers would silently corrupt identity, search, and connectivity. Clusters, counts, depths, amounts, and scores retain their numeric types.

## Optional API contract and coverage

The frontend client defines these routes for a future analytical HTTP service. Read-only inspection of backend `main` at `ff8d22e` found the CSV pipeline but no analytical HTTP API. The current integration therefore uses project files; the API schemas still require agreement with the backend owner:

| Request | Expected response |
| --- | --- |
| `GET /api/top-nodes` | Array of ranked nodes with string GIDs, role, priority, and explanation. |
| `GET /api/search?gid=...` | Exact match envelope `{ "gid": "..." }`; 404 when unknown. |
| `GET /api/nodes/{gid}` | Full `NodeCard`, including observed flows, evidence, limitations, and incident edges. |
| `GET /api/nodes/{gid}/subgraph?hop=1\|2` | Nodes, directed edges, and coverage metadata; at most 250 nodes. |
| `GET /api/clusters/{cluster_id}` | Cluster summary with string-array `top_gids`. |

In API mode, `api.network(gid)` calls the subgraph endpoint with `hop=2`, plus the selected card and top list for optional enrichment. It makes no per-node card requests for the rest of the graph. Optional enrichment failures leave unavailable metrics unknown; a failed graph request remains an error.

There is **no global graph endpoint**. In API mode the overview is labeled as the loaded graph, and `scope: 'neighborhood'` accompanies the normalized data. With no selection, the API client returns an empty scope without requesting a global network. The UI reports `coverage.truncated`, `total_nodes`, `total_edges`, and `limit` as provided; unknown totals remain unknown.

Local depth 1–4 and Incoming/Outgoing/Both traversal operate on the currently loaded, filtered graph. In API mode, selecting depth 3 or 4 cannot retrieve nodes outside the two-hop, 250-node response. Project mode has the complete supplied network. Filters can remove intermediate paths in any mode.

## Scores, money, and visual encoding

The fill score is `risk_score ?? priority_score`. A supplied risk score of zero is valid. The graph does not invent risk scores or transform priority into a probability. When risk is absent, the UI labels the metric **Investigation Priority**. Mixed responses explicitly identify the per-node risk/priority fallback. A missing score uses neutral gray (`#8290a6`) and an unavailable textual value.

The continuous palette linearly interpolates RGB channels between these anchors:

| Score | Color | Interpretation |
| --- | --- | --- |
| 0.00 | `#52bb8a` | Low observed signal |
| 0.40 | `#d8cf5b` | Moderate observed signal |
| 0.65 | `#e89a49` | Elevated signal |
| 1.00 | `#ed5763` | High investigation priority |

Scores are clamped to 0–1 for coloring. The alternative Role and Cluster modes use categorical palettes while retaining numeric score information in tooltips and the inspector. Seed status uses a pale outer ring, and selection uses a bright outer ring. Neither changes the score fill. Textual scores and the inspector supplement the color scale.

Account volume is supplied `total_volume_kzt`, or supplied incoming plus outgoing amounts when **both** are known. Missing values do not become zero. Account totals, degrees, role confidence, and evidence are never reconstructed from a possibly capped subgraph. The adapter can enrich them from the full selected `NodeCard`; a top-list match only supplies its known priority.

For a valid nonnegative amount `v` and positive maximum `M`, define:

```text
L(v, M) = ln(1 + min(v, M)) / ln(1 + M)
```

`logScale` returns the minimum size for unknown, non-finite, zero, or negative values, or an invalid/nonpositive maximum. The Canvas renderer uses maxima from the currently rendered graph, with a minimum maximum of 1.

```text
Mvolume = max(1, known rendered account volumes)
radius = (3 + 14 × L(volume, Mvolume)) × nodeScale

If volume is unknown:
radius = (3 + 8 × (priority_score ?? 0)) × nodeScale

Selected circle radius = radius × 1.12

Mtransfer = max(1, rendered link sum_kzt values)
edge width = (0.3 + 2.0 × L(sum_kzt, Mtransfer)) × linkScale
Highlighted edge width = edge width × 1.3
```

Default scale multipliers are 1. Known-money radii therefore range from 3 to 17 graph units; base edge widths range from 0.3 to 2.3. These bounded logarithmic scales prevent an unusually large account or transfer from dominating the view. Scale controls intentionally adjust the displayed size; filtering can change the normalization maximum.

Arrows indicate payer → recipient. Ordinary edges are straight. Reciprocal directed edges both use curvature `0.18`; reversing their endpoints puts the arcs on opposite sides, so the two transfers remain visible. Self-links use curvature `0.65`. Tooltips preserve source, target, amount, transaction count, and direction. Amounts use compact KZT formatting such as `₸2.4M`; the transfer table retains readable numeric amounts.

## Investigation controls

- Hover highlights the node, immediate incoming/outgoing edges, and neighbors; unrelated nodes fade to 14% opacity.
- Selection persists after hover, moves the camera, and updates the existing inspector. Background click or Clear removes selection. Focus recenters the selected node.
- Exact decimal GID search opens the same selection used by the graph, queue, and inspector. Browser history retains selection.
- Local Graph traverses 1–4 hops in Both, Incoming, or Outgoing direction. Reciprocal links retain separate identities such as `source->target`.
- Trace Flow emphasizes paths within the selected hop and direction scope. Directional particles are normally off; tracing or the display switch enables them. Reduced-motion preference suppresses particles and smooth selection travel.
- Filters include score bands, minimum observed volume, six roles, cluster, dataset depth 0–4, seed/non-seed status, isolated-node hiding, and top 20/50/100/all by `priority_score`. Unknown scores remain in All but cannot satisfy a score band or top-priority filter; unknown volume cannot satisfy a positive minimum.
- Quick presets reset selection filters and apply Top Priority, Large Flows (at least 25% of the loaded maximum), the seed network (seeds plus their immediate incoming/outgoing neighbors), coordinators, or consolidators. Appearance and force settings remain intact.
- Display settings control arrows, labels, edge amounts, seed rings, particles, node size, edge width, and label visibility.
- Force settings control center/community attraction, repulsion, link strength, and distance. Reset Layout releases pinned positions and restarts settling. Dragging a node pins its final position until reset.

Labels for selected and hovered nodes are always drawn. The highest eight scored nodes become labeled earlier than ordinary nodes; ordinary labels require more zoom. Full GIDs appear for selection/hover, while ordinary labels use a short suffix. The transfer table provides keyboard-accessible GID links and pages of 100 rows, alongside CSV export. The Canvas region also supports arrow-key pan, plus/minus zoom, and Escape to clear selection.

## Synthetic demo and performance

`public/demo.json` remains the original 26-node fixture produced by `npm run fixtures`. On its first demo load, `expandDemoFixture` deterministically adds synthetic IDs and communities at runtime. The complete fixture has **2,248 nodes, 3,119 unique directed edges, 4,840 transactions, 81 seeds, and 444 depth-4 nodes**. It preserves the original cards, directed-cycle example, top-20 examples, and isolated seed. Generated card metrics reconcile to generated incident edges; demo search and cluster/card methods also resolve generated nodes.

The original priority queue is a preserved set of demonstration examples. Graph Top-N filters independently sort the loaded graph's synthetic priority values. Neither is presented as a ranking computed from the hackathon data. Generated communities, scores, evidence, and roles are explicitly synthetic, including high/low signal, large-volume, reciprocal, and boundary examples.

Canvas draws nodes and links without thousands of React elements. Graph loading is separate from selection in project and demo modes, derived filters/highlight sets are memoized, simulation positions are stored outside React state and reused by GID, and display-only changes retain the graph objects. Simulation ticks do not update React state. The renderer is lazy-loaded, labels are zoom-dependent, transfer rows are paginated, and the simulation settles after bounded ticks. These choices target the documented 2,248-node workload; they do not establish a million-node performance claim.

## Observation limits and backend work

The dataset was collected by outgoing traversal from seeds to depth 4. A depth-4 account with no visible outgoing transfers receives a **Graph boundary** notice: missing outgoing observations do not prove that funds stayed in the account. Depth-4 sinks are not automatically assigned a terminal role. Seed incoming amounts remain incomplete and receive a separate notice. Supplied total volume, or observed incoming plus outgoing volume when absent, is transaction activity, not an account balance.

The frontend change does not alter the teammate's backend. Project mode supplies the full provided network and cluster membership from existing files. Additional per-node analytical breakdowns, temporal analysis, and any future HTTP service depend on agreed backend exports/contracts. Current runtime validation prevents silently accepting incompatible responses. No global API route, production identity, customer attribute, or missing analytical result is fabricated.

## Validation status

Automated coverage includes exact int64 string IDs, unknown metrics and score fallback, reciprocal/directional hop traversal, bounded logarithmic scaling, full-size fixture reconciliation, project data loading, filtering, and optional API routes. Run from `apps/frontend`:

```bash
npm run lint
npm run build
npm test
```

The earlier synthetic-graph implementation was verified on 2026-09-23 with lint, TypeScript/production build, and 35 tests. Those results are historical and do not establish that the current project-data integration has passed. Its browser checks used Playwright MCP with installed Chromium through the SDK (the configured Chrome executable was unavailable). Canvas screenshots were inspected at 1440×900 and 1920×1080. The demo was exercised for search, Canvas clicks and hover, background clear, filters, local traversal, tracing, keyboard controls, forces, and display changes.

Canvas instrumentation verified green/red fills, different radii, and curved link drawing. The initial full application used 822 DOM elements; graph nodes are Canvas drawings. This is a local smoke performance check, not a benchmark on all hardware. Demo interaction checks had no console/runtime errors.

API-mode checks used intercepted responses and covered delayed loading, 503/retry, empty/recovery, stale-response prevention, sparse unknown metrics, truncated coverage, exact/unknown search, and missing boundary/seed warnings. Only deliberately injected HTTP errors appeared. The teammate's real backend was not exercised.

Repeat the fixture-based graph checks with an explicit demo server running:

```bash
VITE_DATA_MODE=demo npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
# In another terminal:
QA_BASE_URL=http://127.0.0.1:5173/ npm run qa:graph
```

See [historical Canvas QA report](aml-graph-qa.md) for those fixture/API-mock artifacts. Real project-mode QA must exercise the generated export separately.
