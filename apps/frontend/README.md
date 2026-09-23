# MoneyGraph frontend

Independent React + TypeScript + Vite interface using official shadcn/Radix components, Tailwind, and the Canvas-based `react-force-graph-2d` renderer. Fonts and browser assets are bundled locally.

## Run

For an organizer or a fresh checkout, run **`python3 scripts/run-local.py` from the repository root**. It creates the Python environment, installs locked dependencies, runs the three-Parquet analytical pipeline twice and compares the mandatory CSVs, builds this frontend in project mode, and serves it at http://127.0.0.1:5173. It needs Python 3.12+ except 3.14.1 and Node 22.18+; no `.env` or AI keys are required. Input files and offline repeat runs are covered by the [organizer quick start](../../README.md#быстрый-запуск-для-организаторов).

First prepare the Python environment and analytical results using the [repository setup](../../README.md). Then, from this directory (`apps/frontend`):

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. Use Node 22.18+ (Node 24 is tested). Environment variables are read from the repository-root `.env`; only `VITE_*` values are exposed to the browser.

The default is **project mode**, labeled «Данные проекта». It loads the backend's existing analytical results with the complete canonical graph: **2,248 nodes, 3,119 directed edges, 4,840 transactions, and 65 clusters** for the current files. Try the first-ranked GID `100000003115284100`.

`npm run dev` and `npm run build` automatically run `scripts/prepare-project-data.mjs`. In project mode this invokes the Python exporter using repository `.venv/bin/python`, falling back to `python3`; set `MONEYGRAPH_PYTHON` to choose another interpreter. Its inputs are:

- `results/nodes_roles.csv`: backend roles, role scores, priorities, cluster membership, and evidence.
- `results/clusters.csv`: backend community summaries.
- `results/top_nodes.csv`: backend investigation ranking and reasons.
- `data/nodes.parquet` and `data/edges.parquet`: exact GIDs, depths, seed flags, all directed edges, observed amounts, and transaction counts.

The exporter validates these files and writes ignored `public/project-data.json`. It neither reruns analytics nor assigns roles. Observed totals come from complete canonical edges; GIDs remain decimal strings. Missing seed-reach counts, unexported alternative role scores, priority breakdowns, and next actions stay unavailable. Source errors stop preparation; they never switch to synthetic data.

To refresh after a backend pipeline run:

```bash
# From the repository root:
.venv/bin/python main.py
npm --prefix apps/frontend run data:project
```

Reload the browser to load the refreshed export. The normal startup/build hooks also refresh it from existing results. They do not automatically run `main.py`. `transactions.parquet` is used by backend analytics when supported; the frontend export uses aggregated canonical edges and does not invent calendar-date patterns.

The graph supports exact-ID search and selection, hover neighborhoods, directed weighted links, reciprocal curves, zoom/pan, 1–4-hop local traversal, flow tracing, priority/volume/role/cluster/depth/seed filters, top-20/50/100 filtering, color modes, and display/force settings. The inspector, cluster summaries, copying, browser history, priority queue, and transfer CSV export remain available. Scores and account totals are never inferred from the visible filtered graph.

The graph fills the browser workspace. Open **Приоритеты** to choose a ranked client; selecting any node shows its immediate neighborhood. Use **Входящие / Исходящие / Все связи**, 1–4 steps, **В центре**, and **Предыдущий клиент** to investigate. **Вся выборка** restores the overview. Filters, client details, and the single **AI-помощник** launcher open one auxiliary panel at a time. **Данные и запуск** explains the official Parquet inputs. On mobile, selecting a node leaves the graph visible; open **Карточка** for details. Keyboard controls while the canvas is focused: arrows pan, +/− zoom, F centers the selected neighborhood, 0 fits visible nodes, Escape clears selection.

See [AML graph architecture and controls](../../docs/aml-graph.md) for rendering, data preparation, and API limitations.

## CSV analytical dashboard

Click **Загрузить CSV** to open the import screen. Choose a file or drop it onto the upload card; **Скачать пример CSV** provides a template. A successful import opens summary cards, a directed graph, client inflows/outflows, searchable links with CSV export, and daily totals. **К исследованию сети** returns to the project results. Uploaded data stays in memory while switching views and is cleared on page reload.

Supported headers:

| Column | Meaning |
| --- | --- |
| `src`, `dst` | Required sender/recipient GIDs as exact decimal text |
| `amount_kzt` or `amount` | One transaction per row, nonnegative KZT with up to two decimal places |
| `sum_kzt` | Official transaction amount when `date` is present and `n_tx`/`depth` are absent; otherwise aggregated link amount |
| `n_tx` | Optional positive transaction count for an aggregated row; blank means unknown |
| `date`, `transaction_date`, or `dt` | Optional calendar date in `YYYY-MM-DD` format |

Use one amount column and at most one date column. The official `src,dst,date,sum_kzt` transaction schema counts each row once; edge metadata (`n_tx` or `depth`) selects aggregated semantics. For dated aggregates with unknown counts, include an empty `n_tx` column. CSV accepts comma, semicolon, or tab delimiters, UTF-8/BOM, quoted fields and CRLF. Limits are **10 MiB / 50,000 rows**. Invalid rows reject the import with an explanation and preserve the previous dataset. Duplicate transaction rows are retained. GIDs are never converted to numbers; monetary totals use integer minor units and reject amounts that cannot be displayed and exported exactly.

Parsing runs in a browser worker; file contents are never uploaded to a server or sent to AI. Imported CSV analytics do not assign roles, priorities, communities, seeds, or discovery depth. Missing counts and dates stay unknown. Graph rendering is limited to 250 clients and 2,000 directed links, with a visible coverage message; all rows contribute to totals and tables. Both link and daily tables are paginated.

## Synthetic demo mode

Use demo mode explicitly when working on fixture-based UI tests:

```bash
VITE_DATA_MODE=demo npm run dev -- --host 127.0.0.1
```

The original 26 client examples in `public/demo.json` expand deterministically at runtime to 2,248 nodes and 3,119 directed edges. These labeled fixtures are separate from the project results. Useful demo GIDs:

| Gid | Scenario |
| --- | --- |
| `900000000000100001` | Consolidation card with multiple incoming connections |
| `900000000000100008` | Connected node in a directed cycle |
| `900000000000100023` | Depth-4 boundary |
| `900000000000100026` | Isolated seed |

## Agentation feedback

The Agentation toolbar loads only in development and connects to `http://localhost:4747`. It is excluded from production builds.

Register the MCP server once on each developer machine:

```bash
codex mcp add agentation -- npx -y agentation-mcp server
codex mcp list
```

Restart Codex or reload its MCP servers, keep Codex running, and start the frontend with `npm run dev`. Add a note through the toolbar, then ask Codex: “Read my pending Agentation annotations and implement them. Do not modify backend code.”

Setup references: [Agentation MCP](https://www.agentation.com/mcp), [Codex MCP](https://developers.openai.com/codex/mcp).

## Optional HTTP API mode

Inspection of backend `main` at `ff8d22e` found the deterministic CSV pipeline, with no analytical HTTP API implementation. Project mode integrates its actual files. The frontend's future API adapter remains available when a compatible server exists:

```bash
VITE_DATA_MODE=api VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

The backend must permit the frontend's origin through CORS. An empty base URL uses same-origin requests; no development analytical API proxy is configured. Only `api` enables analytical HTTP requests. Project mode reads real results through a local static export; `demo` selects fixtures explicitly.

`src/lib/api.ts` maps the planned endpoints; `src/lib/contracts.ts` validates their proposed payloads. Confirm them with the backend owner before connecting real results:

- `/api/top-nodes`: direct array of `rank,gid,role,priority_score,why`.
- `/api/search?gid=...`: exact match returning `{ "gid": "..." }`, 404 when unknown.
- `/api/nodes/{gid}`: complete `NodeCard` shape in the UI contract.
- `/api/nodes/{gid}/subgraph?hop=1|2`: nodes, directed edges, and coverage metadata, capped at 250 nodes.
- `/api/clusters/{cluster_id}`: cluster summary with string-array `top_gids`.

All gid fields must arrive as decimal strings. Missing optional metrics are `null`. Schema violations show an error; API failures never fall back to demo results. The UI does not generate real rankings or assign roles.

In API mode, `api.network(gid)` adapts the two-hop subgraph and enriches it with the selected card and loaded top list. There is no global graph endpoint. The API's 250-node cap and coverage metadata remain visible, and local traversal operates only on loaded nodes. Graph nodes may optionally supply scores, volume, and degree metrics; unknown values remain neutral or explicitly unavailable. `risk_score` is used only when supplied; otherwise coloring is labeled investigation priority and uses `priority_score`.

See [UI contract](../../docs/moneygraph-ui-design-contract.md) for backend agreement points, including the data's cycles and the seed-reachability calculation. Advanced temporal signals remain future work; the CSV dashboard supplies calendar-day totals when dates are provided. The loaded priority list and observed transfer table can be exported as CSV; these exports do not replace the three mandatory pipeline artifacts.

## Verification

```bash
npm run lint
npm run build
npm test
npm run test:agent
# From the repository root:
.venv/bin/python -m unittest discover -s apps/frontend/scripts -p 'test_export_project_data.py'
```

Tests cover data contracts, exact GIDs, unknown metrics, directed neighborhoods, filters, reciprocal links, logarithmic scaling, full-size fixture integrity, project data loading, API endpoint reuse, exports, server-side tool calls, data-mode isolation, and NVIDIA review failure handling. Generate project data before running the assistant tests (`npm run build` above does this in project mode).

With the default project server running, verify real data workflows from this directory:

```bash
QA_BASE_URL=http://127.0.0.1:5173/ npm run qa:project
QA_BASE_URL=http://127.0.0.1:5173/ npm run qa:csv
```

See the [fullscreen workspace verification report](../../docs/canvas-workspace-qa.md) for current interaction checks and the [project data verification report](../../docs/project-data-qa.md) for earlier integration checks.

For repeatable browser QA, the project runs an official **Playwright MCP** subprocess through its SDK client, using isolated user-scoped Chromium. It does not require system Chrome or changes to global MCP configuration:

```bash
npx playwright install chromium
# In another terminal, start the project server:
VITE_DATA_MODE=project npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
# Then run current Canvas graph checks:
QA_BASE_URL=http://127.0.0.1:5173/ npm run qa:project
```

`qa:browser`, `qa:analyst`, and `qa:graph` are legacy scripts with assumptions about earlier layouts. Their presence does not mean those checks pass against the current fullscreen interface. Use `qa:project` and `qa:csv` for current browser checks.

The historical API-mode suite uses a separate API-mode dev server:

```bash
VITE_DATA_MODE=api npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

`npm run qa:api` intercepts requests with synthetic responses and targets earlier layout controls; it needs migration before reuse. This does not claim real backend integration. The current `qa:project` suite includes delayed, failed, and empty project-loading checks with recovery. Browser reports and screenshots are written to the ignored `qa/` directory.

Regenerate the original 26 examples with `npm run fixtures`. `src/lib/graph-demo.ts` expands them at runtime for the Canvas graph; generated clients are also available through the demo card/search/cluster methods. Both generators are UI test support, not financial inference pipelines.

## Analyst assistant

The single **AI-помощник** button in the header opens AI chat. The selected client remains its context; press Send to submit a question. Source links reopen a client. The conversation supports follow-ups, cancellation, retry, and a new conversation action. The optional NVIDIA mode provides a separate critique of OpenAI's answer.

Use the repository-root `.env.example` as a template. Set `OPENAI_API_KEY` and optionally `NVIDIA_API_KEY` only in the root `.env`, then restart the dev server. `OPENAI_MODEL` and `NVIDIA_MODEL` can override model defaults. Do not use `VITE_` prefixes for keys. No AI request is needed for graph exploration or client inspection.

`npm run dev` includes the server-side bridge at `/api/agent/status` and `/api/agent/chat`. `npm run preview` includes the same bridge for local production-build checks. In project mode, the bridge reads the same validated `public/project-data.json` as the UI. In API mode, also set `ANALYTICS_API_BASE_URL` to the analytical server used by `VITE_API_BASE_URL`; the bridge retrieves and validates its own facts. For a deployed static frontend, run `npm run agent` (loopback port 8787, configurable with `AGENT_PORT`) and route `/api/agent/*` through a same-origin reverse proxy. Add authentication before a multi-user deployment.

Live checks on 2026-09-23 returned authentication failures for both configured providers. UI and orchestration are tested with synthetic data and mocked model responses; live answers require valid keys. No credentials were changed.

See [requirements and pipeline handoff](../../docs/frontend-requirements-and-pipeline.md) for the mandatory features, backend responsibilities, current gaps, and AI tool contract.

## Canvas graph verification

With the project frontend running, `npm run qa:project` runs the Canvas workflows through Playwright MCP and writes screenshots/reports to ignored `qa/`. Override the local server with `QA_BASE_URL=http://127.0.0.1:5180/` if needed. See [graph architecture](../../docs/aml-graph.md) and the [fullscreen verification report](../../docs/canvas-workspace-qa.md).
