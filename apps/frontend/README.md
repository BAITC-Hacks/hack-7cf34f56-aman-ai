# MoneyGraph frontend

Independent React + TypeScript + Vite interface using official shadcn/Radix components, Tailwind, and the Canvas-based `react-force-graph-2d` renderer. Fonts and browser assets are bundled locally.

## Run

From this directory (`apps/frontend`):

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. Use Node 22.18+ (Node 24 is tested). Environment variables are read from the repository-root `.env`; only `VITE_*` values are exposed to the browser.

The default is **synthetic demo mode**, with a persistent label. The original 26 client examples in `public/demo.json` are expanded deterministically at runtime to 2,248 nodes and 3,119 directed edges. Their roles and priorities are UI fixtures, not analysis of the hackathon dataset. The original cards and top-20 examples remain available. The backend and mandatory CSV pipeline are independent and have not been changed.

Useful demo gids:

| Gid | Scenario |
| --- | --- |
| `900000000000100001` | Consolidation card with multiple incoming connections |
| `900000000000100008` | Connected node in a directed cycle |
| `900000000000100023` | Depth-4 boundary |
| `900000000000100026` | Isolated seed |

The graph supports exact-ID search and selection, hover neighborhoods, directed weighted links, reciprocal curves, zoom/pan, 1–4-hop local traversal, flow tracing, priority/volume/role/cluster/depth/seed filters, top-20/50/100 filtering, color modes, and display/force settings. The inspector, cluster summaries, copying, browser history, priority queue, and transfer CSV export remain available. Scores and account totals are never inferred from the visible graph. Seed reach is explicitly unknown in these fixtures.

See [AML graph architecture and controls](../../docs/aml-graph.md) for rendering, formulas, fixture generation, and API limitations. API mode only loads an existing two-hop neighborhood; choosing local depth 3 or 4 does not fetch additional data.

## Agentation feedback

The Agentation toolbar loads only in development and connects to `http://localhost:4747`. It is excluded from production builds.

Register the MCP server once on each developer machine:

```bash
codex mcp add agentation -- npx -y agentation-mcp server
codex mcp list
```

Restart Codex or reload its MCP servers, keep Codex running, and start the frontend with `npm run dev`. Add a note through the toolbar, then ask Codex: “Read my pending Agentation annotations and implement them. Do not modify backend code.”

Setup references: [Agentation MCP](https://www.agentation.com/mcp), [Codex MCP](https://developers.openai.com/codex/mcp).

## Backend integration

Set these non-secret variables when the API contract is ready:

```bash
VITE_DATA_MODE=api VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

The backend must permit the frontend's origin through CORS. An empty base URL uses same-origin requests; no development API proxy is currently configured. Only `api` enables real requests; the default is the explicitly labeled demo.

`src/lib/api.ts` maps the planned endpoints; `src/lib/contracts.ts` validates their proposed payloads. Confirm them with the backend owner before connecting real results:

- `/api/top-nodes`: direct array of `rank,gid,role,priority_score,why`.
- `/api/search?gid=...`: exact match returning `{ "gid": "..." }`, 404 when unknown.
- `/api/nodes/{gid}`: complete `NodeCard` shape in the UI contract.
- `/api/nodes/{gid}/subgraph?hop=1|2`: nodes, directed edges, and coverage metadata, capped at 250 nodes.
- `/api/clusters/{cluster_id}`: cluster summary with string-array `top_gids`.

All gid fields must arrive as decimal strings. Missing optional metrics are `null`. Schema violations show an error; API failures never fall back to demo results. The UI does not generate real rankings or assign roles. Period and expected real dataset size are fixed descriptors for this single hackathon export, not API health/readiness indicators.

`api.network(gid)` adapts the existing two-hop subgraph and enriches it with the selected card and loaded top list. There is no global graph endpoint. The API's 250-node cap and coverage metadata remain visible, and local traversal operates only on loaded nodes. Graph nodes may optionally supply scores, volume, and degree metrics; unknown values remain neutral or explicitly unavailable. `risk_score` is used only when supplied; otherwise coloring is labeled investigation priority and uses `priority_score`.

See [UI contract](../../docs/moneygraph-ui-design-contract.md) for backend agreement points, including the data's cycles and the seed-reachability calculation. Full cluster graphs and temporal charts remain future work. The loaded priority list and observed transfer table can be exported as CSV; these exports do not replace the three mandatory pipeline artifacts.

## Verification

```bash
npm run lint
npm run build
npm test
```

Tests cover data contracts, exact GIDs, unknown metrics, directed neighborhoods, filters, reciprocal links, logarithmic scaling, full-size fixture integrity, API endpoint reuse, exports, server-side tool calls, data-mode isolation, and NVIDIA review failure handling. See the graph documentation for the current browser-validation status.

For repeatable browser QA, the project runs an official **Playwright MCP** subprocess through its SDK client, using isolated user-scoped Chromium. It does not require system Chrome or changes to global MCP configuration:

```bash
npx playwright install chromium
# Keep the default demo dev server running on 127.0.0.1:5173.
npm run qa:browser
npm run qa:analyst
```

To verify race conditions and API behavior, also start a separate API-mode dev server in another terminal:

```bash
VITE_DATA_MODE=api npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Then run `npm run qa:api`. This test intercepts requests with synthetic responses; it does not claim real backend integration. Browser reports and screenshots are written to the ignored `qa/` directory. The QA scripts expect the exact local ports above and only interact with those development servers.

Regenerate the original 26 examples with `npm run fixtures`. `src/lib/graph-demo.ts` expands them at runtime for the Canvas graph; generated clients are also available through the demo card/search/cluster methods. Both generators are UI test support, not financial inference pipelines.

## Analyst assistant

The right panel switches between the client inspector and AI chat. Explain with AI fills a question; press Send to submit it. Source links reopen a client. The conversation supports follow-ups, cancellation, retry, and a new conversation action. The optional NVIDIA mode provides a separate critique of OpenAI's answer.

Use the repository-root `.env.example` as a template. Set `OPENAI_API_KEY` and optionally `NVIDIA_API_KEY` only in the root `.env`, then restart the dev server. `OPENAI_MODEL` and `NVIDIA_MODEL` can override model defaults. Do not use `VITE_` prefixes for keys. No AI request is needed for graph exploration or client inspection.

`npm run dev` includes the server-side bridge at `/api/agent/status` and `/api/agent/chat`. `npm run preview` includes the same bridge for local production-build checks. In API mode, also set `ANALYTICS_API_BASE_URL` to the analytical server used by `VITE_API_BASE_URL`; the bridge retrieves and validates its own facts. For a deployed static frontend, run `npm run agent` (loopback port 8787, configurable with `AGENT_PORT`) and route `/api/agent/*` through a same-origin reverse proxy. Add authentication before a multi-user deployment.

Live checks on 2026-09-23 returned authentication failures for both configured providers. UI and orchestration are tested with synthetic data and mocked model responses; live answers require valid keys. No credentials were changed.

See [requirements and pipeline handoff](../../docs/frontend-requirements-and-pipeline.md) for the mandatory features, backend responsibilities, current gaps, and AI tool contract.

## Canvas graph verification

With the demo frontend running, `npm run qa:graph` runs the Canvas workflows through Playwright MCP and writes screenshots/reports to ignored `qa/`. Override the local server with `QA_BASE_URL=http://127.0.0.1:5180/` if needed. See [graph architecture](../../docs/aml-graph.md) and [verification report](../../docs/aml-graph-qa.md).
