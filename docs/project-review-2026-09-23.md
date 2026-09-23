# Project review and CSV dashboard

## Changes

- Unified the investigation graph, controls, legends, inspector, and CSV dashboard on the existing light theme. Clarified Russian copy, score scale, client counts, and aggregated-link terminology.
- Added browser-local CSV import, format template, row validation, exact decimal GIDs, exact minor-unit calculations, summary metrics, directed graph, client selection, search, CSV export, and paginated daily/link tables.
- Imported transfers retain duplicate rows and unknown transaction counts. No roles, priorities, seeds, communities, or discovery depths are inferred. Canvas coverage is explicitly bounded; summaries use the complete upload.
- Corrected terminal evidence that falsely claimed no outgoing transfers for 13 real nodes; identified centrality percentiles as percentiles. Tightened invalid-percentile and missing-evidence validation. Regenerated required CSV outputs without changing roles, scores, or clusters.
- Fixed the assistant test command to use Vitest, matching the tests' imports.

## Verification

- Frontend lint and production build pass.
- 167 automated tests pass: 114 frontend tests (including 70 CSV cases), 12 mocked assistant tests, 16 Python exporter tests, and 25 backend analytical tests. Backend regression coverage includes evidence accuracy and output validation.
- Two isolated backend pipeline runs produced byte-identical required CSVs; 2,248 exact GIDs, 65 clusters, deterministic Top-20, and depth-4 restrictions were validated.
- Playwright MCP project checks: 28 assertions passed at 1440×900 and 1920×1080. Covered real project data, search/selection, inspector, cluster, directed traversal, filters, seed/boundary limitations, loading, empty, failure/retry, and console checks.
- Playwright MCP CSV checks: 26 assertions passed at 1440×900 and 390×844. Covered import errors and recovery, loading, exact totals and GIDs, unknown counts/dates, exact client matching, pagination, export, retained data when changing views, and absence of server uploads.
- No unexpected browser console errors or horizontal overflow in checked workflows. Project error-state testing intentionally returned HTTP 503.

Browser checks ran against a local production preview at `http://127.0.0.1:5184/`. The installed system-browser MCP configuration lacked Chrome; the repository's Playwright MCP subprocess used its installed Chromium instead. Screenshots and reports are under the ignored `apps/frontend/qa/` directory.

## Scope and remaining limitations

The Python analytical HTTP API and advanced temporal/resilience features remain unimplemented optional functionality. Project mode serves the existing deterministic pipeline's prepared export. CSV import supplies descriptive observed analytics, not the full role-scoring pipeline. Uploaded data is held in memory and cleared on refresh. Live OpenAI/NVIDIA calls were not part of this verification; assistant tests use mocked providers. Existing legacy demo browser scripts are not evidence of passing checks; this review ran the current project and CSV suites.

See [frontend README](../apps/frontend/README.md) for accepted CSV headers, limits, startup, and verification commands.
