# Fullscreen workspace verification — 2026-09-23

The graph fills the viewport below the compact header. Priorities, client details, filters, and the single AI launcher open auxiliary panels on demand. Selecting a client opens its direct neighborhood; direction, one-to-four steps, focus, previous client, and whole-dataset controls support investigation.

## Executed checks

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run build` | Passed, including project export and TypeScript |
| `npm test` | 116 tests passed |
| `npm run test:agent` | 12 tests passed with mocked model providers |
| `QA_BASE_URL=http://127.0.0.1:5184/ npm run qa:project` | 61 browser checks passed |
| `QA_BASE_URL=http://127.0.0.1:5184/ npm run qa:csv` | 26 browser checks passed |
| `python3 scripts/run-local.py --skip-install --prepare-only` | Passed; pipeline runs 1.82 and 1.52 seconds, three mandatory CSVs byte-identical |

Browser checks used the production preview in project mode, via the official Playwright MCP subprocess and installed Chromium. The configured system Chrome path was unavailable; no global browser configuration was changed. Real organizer-derived data supplied 2,248 nodes, 3,119 directed links, 4,840 transactions, and 65 communities. Delayed, empty, and failed project loads were intercepted deliberately for recovery checks. No unexpected console or runtime errors occurred; the intentional HTTP 503 was the only logged browser error.

The project suite covered initial full-network loading; exact GID search; priority, linked-client, and actual canvas-click selection; numerical evidence in the inspector; incoming/outgoing/both traversal; one-to-four steps; previous-client navigation; panning, zoom, focus, and fit; role/cluster filters and reset; transfer pagination/export; one AI launcher; full-screen mode; boundary/seed limitations; and loading/empty/error recovery. A four-step exploration of A followed by B and then Previous Client correctly starts each selected client at one step. Clicking the background preserves selection.

Screenshots were inspected at 1440×900, 1920×1080, and 390×844. The desktop canvas measures 1440×836 below the 64-pixel header. Selected nodes stay in the uncovered canvas beside the inspector. Mobile selection leaves the graph visible, with client details available in a sheet. No page overflow or inaccessible controls remained. The error retry button was moved below the floating toolbar, and tooltips now clear when the pointer leaves the canvas.

CSV checks covered empty, invalid, processing, and successful imports; exact GIDs and amounts; duplicate-row preservation; unknown transaction counts; daily summaries; graph links; export; switching files; mobile layout; and preserving the previous valid upload. A separate browser import of the unfiltered organizer `transactions.parquet` converted to `src,dst,date,sum_kzt` CSV produced **365,890,012.01 KZT**, **4,840 transfers**, **3,119 directed pairs**, and **2,229 distinct transfer participants**. The other 19 nodes occur only in `nodes.parquet`; a transfer-only CSV cannot represent them. The CSV graph shows a bounded selection of clients while dashboard totals cover the whole file.

Reports and screenshots are local ignored artifacts under `apps/frontend/qa/`: `project-browser-report.json`, `project-1440.png`, `project-selected-1440.png`, `project-1920.png`, `project-selected-mobile.png`, and `project-mobile.png`.

## Reproduction and limits

Run `python3 scripts/run-local.py` from the repository root with the three original Parquet files in `data/`. First setup requires the documented Python/Node versions and access to package distributions. See [organizer verification](organizer-reproducibility.md) for the separate fresh-environment test, input/output hashes, and platform limits. Core analytics and graph exploration require no AI keys.

These checks validate the current project and CSV workflows on this host. Live AI responses and other operating systems were not verified in this change. Older `qa:browser`, `qa:analyst`, `qa:graph`, and `qa:api` scripts retain assumptions about previous layouts; use `qa:project` and `qa:csv` for the current interface.
