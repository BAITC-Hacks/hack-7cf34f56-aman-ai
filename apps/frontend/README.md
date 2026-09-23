# MoneyGraph frontend

Independent React + TypeScript + Vite interface using official shadcn/Radix components, Tailwind, and React Flow. Fonts and browser assets are bundled locally.

## Run

From this directory (`apps/frontend`):

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. Node 22.12+ (or a compatible newer version) is recommended by the installed toolchain.

The default is **synthetic demo mode**, with a persistent label. The 26 demo clients, example roles, and priorities are UI fixtures, not analysis of the hackathon dataset. The backend and mandatory CSV pipeline are independent and have not been changed.

Useful demo gids:

| Gid | Scenario |
| --- | --- |
| `900000000000100001` | Consolidation card with multiple incoming connections |
| `900000000000100008` | Connected node in a directed cycle |
| `900000000000100023` | Depth-4 boundary |
| `900000000000100026` | Isolated seed |

Top-20, role filtering, exact-ID search, one/two-hop graph, role/cluster colors, fit/zoom, cluster summaries, inspector tabs, copying, browser history and responsive inspector are implemented. Incoming/outgoing connections retain their directions. Scores and amounts are never derived from the visible graph. Seed reach is explicitly unknown in these fixtures.

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

See [UI contract](../../docs/moneygraph-ui-design-contract.md) for backend agreement points, including the data's cycles and the seed-reachability calculation. Full cluster graphs, CSV download delivery, temporal charts and AI are not part of this first frontend slice.

## Verification

```bash
npm run lint
npm run build
npm test
```

Six unit tests cover identifier precision, invalid payloads, directed cycles, isolated nodes, graph capping, and fixture reconciliation.

For repeatable browser QA, the project runs an official **Playwright MCP** subprocess through its SDK client, using isolated user-scoped Chromium. It does not require system Chrome or changes to global MCP configuration:

```bash
npx playwright install chromium
# Keep the default demo dev server running on 127.0.0.1:5173.
npm run qa:browser
```

To verify race conditions and API behavior, also start a separate API-mode dev server in another terminal:

```bash
VITE_DATA_MODE=api npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Then run `npm run qa:api`. This test intercepts requests with synthetic responses; it does not claim real backend integration. Browser reports and screenshots are written to the ignored `qa/` directory. The QA scripts expect the exact local ports above and only interact with those development servers.

Regenerate demo fixtures with `npm run fixtures`. Their generator is UI test support, not a financial inference pipeline.
