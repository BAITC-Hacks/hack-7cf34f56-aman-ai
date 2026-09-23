# Canvas AML graph verification — 2026-09-23

Lint, TypeScript/production build, 35 unit tests, and Playwright MCP browser checks pass. The analytical backend was not modified or used. API behavior was tested with intercepted synthetic responses.

## Environment

- Demo URL: `http://127.0.0.1:5180/` (Vite).
- Intercepted API URL: `http://127.0.0.1:5181/` (stopped after verification).
- Installed Chromium controlled by the official Playwright MCP subprocess through its SDK. The preconfigured MCP could not find system Chrome; no browser installation was required.
- Screenshots visually inspected at 1440×900 and 1920×1080. Existing browser QA also covers mobile inspector/focus restoration.
- Data: deterministic 2,248-node / 3,119-link demo and sparse API fixtures.

## Verified

| Area | Checks |
| --- | --- |
| Rendering | Full Canvas network; 822 initial application DOM elements, without per-node React elements. |
| Selection | Queue, exact 18-digit GID search, actual Canvas click/hover, Focus, background Clear, matching inspector. |
| Limitations | Isolated seed, depth-4 caveat, incomplete seed inflows, unknown metrics shown as unavailable. |
| Traversal | Local depths 1–4, incoming/outgoing/both, Trace Flow, distinct reciprocal transfers. |
| Filters | Top 20/50, low/high bands, minimum volume/empty/reset, coordinator preset, seed network, cluster. Unit tests additionally cover role/depth/seed intersections and isolated nodes. |
| Settings | Role/cluster legends, display changes preserve settled layout, keyboard sliders, forces/reset. |
| Visual encoding | Instrumented Canvas operations confirm green/red fills (278 distinct colors), different circle radii, quadratic curves. Scaling formulas independently unit-tested. |
| Accessibility/layout | Keyboard search/transfer links, labeled controls/slider thumbs, keyboard zoom/pan/Escape; no desktop horizontal overflow. |
| Errors | Delayed graph, 503/retry, empty/recovery, malformed response, optional Agentation failure/recovery. |
| API | Existing routes only; two-hop/250-node disclosure, truncated 26/500 response, stale-response prevention, exact/unknown search, unknown score/volume tooltip. |

The graph suite had no console/runtime errors. API/fault-injection checks recorded only deliberate HTTP/module failures. A short idle frame sample after interaction had a 16.7ms median interval; this is a local smoke measurement, not a hardware-independent benchmark.

## Reproduce

From `apps/frontend`, with the demo Vite server running:

```bash
npm run lint
npm run build
npm test
QA_BASE_URL=http://127.0.0.1:5180/ npm run qa:graph
QA_BASE_URL=http://127.0.0.1:5180/ npm run qa:browser
```

`qa:graph` covers Canvas interactions, controls, and rendering encodings. `qa:browser` retains inspector/mobile/data-state/Agentation checks, adapted to Canvas.

Ignored local artifacts:

- `apps/frontend/qa/graph-browser-report.json`
- `apps/frontend/qa/browser-report.json`
- `apps/frontend/qa/aml-1440.png`
- `apps/frontend/qa/aml-selected-1440.png`
- `apps/frontend/qa/aml-1920.png`
- `apps/frontend/qa/aml-settings-1920.png`
- `apps/frontend/qa/canvas-api-check-report.txt`
- `apps/frontend/qa/canvas-api-unknown-report.txt`
- `apps/frontend/qa/aml-api-sparse-1440.png`
- `apps/frontend/qa/aml-api-unknown-tooltip.png`

## Remaining backend dependencies

No global-graph endpoint is agreed. Live mode displays the capped two-hop response; local depth 3–4 traverses only already loaded data. Live graph scores/volumes remain neutral/unknown until supplied. A real backend end-to-end run remains dependent on its available service and agreed contract. See [architecture and visual formulas](aml-graph.md).
