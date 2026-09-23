# Real project data verification — 2026-09-23

The frontend now uses the backend's existing CSV results and canonical Parquet graph by default. Read-only comparison of `main` and `origin/main` at `ff8d22e` found the analytical pipeline implemented in `34d2c2a`, without an analytical HTTP server. No backend code or generated analytical results were changed.

## Sources and contract

The frontend exporter reads `results/nodes_roles.csv`, `results/clusters.csv`, `results/top_nodes.csv`, `data/nodes.parquet`, and `data/edges.parquet`. It produces ignored `apps/frontend/public/project-data.json`, validated by `projectDataSchema`. `api.top`, `node`, `search`, `cluster`, `graph`, and `network` use this file in project mode; the assistant retrieves facts from the same file server-side. Existing optional API routes remain available in explicit API mode.

The current files contain 2,248 clients, 3,119 directed links, 4,840 transactions, 81 seeds, and 65 clusters. Observed edge amounts total 365,890,012.01 KZT. First-ranked GID `100000003115284100` retains the backend priority `0.862398`. Roles, rankings, scores, and evidence are preserved; observed flow totals are derived from complete canonical edges. Missing metrics remain unavailable. Depth-4 truncation and incomplete seed inflows remain visible.

## Results

| Check | Result |
| --- | --- |
| Frontend lint | Passed |
| TypeScript and production build, including real data preparation | Passed |
| Frontend unit tests | 42 passed |
| Python exporter validation and integration tests | 16 passed |
| Assistant service tests with mocked providers | 12 passed |
| Playwright MCP real data scenarios | 28 assertions passed |
| Visual review | Full network and selected inspector at 1440×900; network at 1920×1080 |

Browser checks covered exact CSV evidence and scores, complete graph counts, flow totals, cluster hypotheses, exact GID search, unknown GIDs, local 1–4-hop traversal, flow tracing, seed and boundary warnings, top-20 filtering, empty filters, loading, empty responses, failure/retry, concise inputs, and matching assistant data mode. No runtime or console errors occurred during normal workflows; only the deliberately injected HTTP 503 appeared during failure checks. Project mode did not fetch demo fixtures or analytical API routes.

AI providers were mocked for these checks; this report does not establish that live provider credentials work. The current browser suite tests real file integration, not an analytical HTTP service. Earlier demo/API fixture reports remain separate.

## Reproduce

Prepare Python dependencies as described in the repository README. From `apps/frontend`:

```bash
npm run lint
npm run build
npm test
npm run test:agent
```

From the repository root:

```bash
.venv/bin/python -m unittest discover -s apps/frontend/scripts -p 'test_export_project_data.py'
```

Start the frontend in project mode. From `apps/frontend`, with Playwright Chromium installed:

```bash
QA_BASE_URL=http://127.0.0.1:5182/ npm run qa:project
```

Use the actual local Vite port. The verified server ran on port 5182. Ignored local artifacts include `apps/frontend/qa/project-browser-report.json`, `project-1440.png`, `project-inspector-1440.png`, and `project-1920.png` in the same directory.
