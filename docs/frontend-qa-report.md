# Frontend verification — first implementation

Date: 2026-09-23. Frontend: `apps/frontend/`. Design/setup commit: `ca34c40` on `main`.

## Implemented

Three-panel investigation workspace with Top-20, exact string-gid search, role filtering, one/two-hop directed local graph, role/cluster colors, cluster summary, and a shadcn Node Inspector. The inspector includes role confidence, separate priority, observed amounts/counts, evidence, six role scores, priority contributions, incoming/outgoing connections, limitations and next request. Narrow screens use a titled Sheet with focus restoration.

The first implementation is a visibly labeled synthetic demo. Real API mode uses an explicit adapter and runtime schemas, but integration with the teammate's backend is pending contract agreement.

## Checks completed

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, no warnings |
| `npm run build` | Passed, no bundle-size warnings after splitting graph and validation chunks |
| `npm test` | Six tests passed |
| Desktop Playwright MCP, 1440×900 | Initial empty selection, Top-20, local graph, evidence, connections, cluster navigation, two-hop state, boundary and isolated-seed lookup passed |
| Input/data handling | Long decimal IDs retained; unknown gid preserved previous selection; invalid numeric-ID response rejected |
| Empty/loading/error states | Empty ranking displayed analysis-not-ready; empty role filter reset; delayed fixture loading; HTTP 503 and successful retry; malformed payload all passed |
| Mobile Playwright MCP, 390×844 | Inspector opens, full gid visible, width 390 px, no page horizontal overflow, close restores focus |
| API-mode checks | Intercepted synthetic API: delayed A response did not overwrite B; 404 preserved valid selection; direct link restored ID and boundary notice |
| Narrow viewport, 720×450 | No page horizontal overflow; this approximates a 200% desktop viewport, not a full browser zoom audit |
| Console/network | No unexpected runtime/console errors or failed network requests in normal workflows; HTTP failures were intentionally injected for error tests |

Screenshots were captured and visually inspected at `apps/frontend/qa/selected-desktop.png` and `apps/frontend/qa/mobile-inspector.png`. Generated screenshots and JSON reports are ignored by Git. Repeatable commands are documented in [the frontend README](../apps/frontend/README.md).

## Browser environment

The globally configured Playwright MCP could not launch because system Chrome is absent. Its Chrome installer required an administrator password. QA instead used the official project-local Playwright MCP subprocess with user-scoped Chromium and an isolated browser context. The global MCP configuration was not changed.

## Startup regression: Agentation

Reproduced a blank page caused by the cached repository-root Agentation dependency failing to resolve React. Vite now deduplicates `react` and `react-dom` against the frontend installation. An error boundary contains optional annotation-tool failures so MoneyGraph stays usable.

Lint, production build, and all six unit tests passed after the fix. The Playwright MCP suite passed all 25 checks, including the visible Agentation button, normal desktop/mobile workflows with no unexpected console errors, a deliberately failed Agentation module with successful node selection, and toolbar recovery after reload. Screenshot: `apps/frontend/qa/startup-recovered.png`.

## Remaining integration work

- Freeze real API envelopes and map any wire-name differences in `src/lib/api.ts`.
- Confirm cycle-safe seed reach, optional-computation flags, cluster membership, and subgraph coverage semantics with the backend owner.
- Validate every screen against real pipeline outputs; only synthetic/demo and intercepted API responses were tested here.
- Add optional full cluster graph, temporal charts, export delivery, and AI only after the deterministic integration is ready.

This report does not assert that the analytical pipeline, real rankings, all 2,248-node lookup, or real backend integration is complete.

## Analyst workflow and chat revision — 2026-09-23

The readable flow revision passed the 25 existing Playwright MCP workflow checks at 1440×900 and 390×844, plus 21 analyst/chat checks: left-to-right relationships, no overlapping node cards, full transfer table, CSV downloads, explicit explain submission, server request context, source navigation, conversation retention, follow-ups, loading, cancel, retry, new conversation, unavailable AI, and mobile focus restoration. Model responses in these browser tests were intercepted synthetic responses. Screenshots: `apps/frontend/qa/analyst-chat-desktop.png`, `apps/frontend/qa/analyst-chat-mobile.png`, and `apps/frontend/qa/startup-recovered.png`.

Sixteen unit tests passed, including server tool execution, runtime validation, source references, backend-failure isolation and optional NVIDIA review handling. Lint and build passed for the tested revision. Exact-key scanning found neither configured API credential in the generated browser assets.

Live inference remains blocked: OpenAI returned HTTP 401 `invalid_api_key`; NVIDIA returned HTTP 401 when tested with a model from its current catalog. Provider keys were not printed or modified. A retired NVIDIA model was replaced in the server default; this does not resolve the authentication failure.

### Concurrent workspace changes

After the successful UI checks, another edit began adding `AMLGraph`, expanding the demo fixture, modifying shared node contracts and replacing `graph-panel.tsx`. The latest combined workspace build has integration/type errors in those evolving graph files and the App-to-graph props. Earlier screenshots and passed checks do not certify that combined revision. The graph integration decision is pending; unrelated concurrent work has been preserved.
