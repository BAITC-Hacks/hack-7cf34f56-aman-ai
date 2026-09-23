# Organizer startup verification — 2026-09-23

The complete local startup is `python3 scripts/run-local.py` from the repository root. See the [README quick start](../README.md#быстрый-запуск-для-организаторов) for input files, requirements, and options. `python main.py` remains the independent mandatory pipeline.

## What was actually verified

A temporary source snapshot was created without `.env`, `.venv`, `results/`, `node_modules/`, `dist/`, or generated `project-data.json`. It included the three original organizer Parquet files and the current source files. Python 3.14.6, Node 24.21.0, and npm 11.19.0 were installed on the host (macOS arm64).

Running `python3 scripts/run-local.py --prepare-only` created a new virtual environment, installed all seven pinned Python runtime packages from cached distribution wheels, and installed 504 frontend packages with `npm ci` from a copied npm download cache. No installed Python packages or `node_modules` directory were copied into the snapshot. Package downloads from public registries were not tested; the fresh install used local caches with network lookup disabled.

| Check | Result |
| --- | --- |
| First complete Parquet → CSV run | Passed, 18.67 seconds with cold imports |
| Second complete run | Passed, 1.45 seconds |
| Mandatory CSV repeatability | All three files byte-identical (SHA-256 below) |
| Runtime input/output validation | Existing pipeline validation and frontend exporter passed |
| Project export | 2,248 nodes, 3,119 directed edges, 4,840 transactions |
| Community / ranking outputs | 65 communities, 20 ranked nodes |
| Production build | TypeScript and Vite passed |
| Repeat startup with `--skip-install` | Passed, no dependency installation; pipeline about 1.5 seconds per run |
| Startup from a different working directory with `VITE_DATA_MODE=demo` inherited | Passed; paths resolve against the script and the built app uses project mode |
| Preview server on `127.0.0.1:5183` | Passed after allowing the local listener through the execution sandbox |
| HTTP smoke checks | Production HTML, referenced JS/CSS, and project JSON returned HTTP 200 |
| Identifier and source check | All 2,248 JSON GIDs are strings; all 81 seed flags retained; source is `project` |
| AI status without `.env` | `available: false`, `reviewerAvailable: false`, `dataMode: project`; analytics remain available |
| Missing input files | Fails before installation and names all required paths |
| Invalid port | Fails before installation with a clear range error |

The full graph's observed amount is **365,890,012.01 KZT**. The case description gives the rounded total **365,890,012 KZT**. Neither the script nor exporter changes the input amounts.

```text
nodes_roles.csv  5345093a05e7701cd9d384695538cee9a6443811395ed228b2dcba7459084f13
clusters.csv     cef167889e4dc1e93bb6568fea50ff9946594844609f3f0db92a72fa2e3c5d2d
top_nodes.csv    802880c5ab1733ddcf8bda6727c1bbd411f1a495275184f84a5b0ca5fc9753d9
```

Every startup writes an ignored `results/reproducibility.json` containing input and output hashes, dependency-manifest hashes, runtime versions, counts, and the actual timings. The frontend JSON contains a generation timestamp, so the byte comparison deliberately covers the three required CSV artifacts.

## Scope

This validates clean setup from the current working source and the supplied files, on this host, using cached package distributions. It does not claim a fresh online registry download, Windows/Linux execution, live AI connectivity, or analytical support for a differently sized dataset. Browser interaction and layout checks are separate frontend QA. The provided mandatory output validator is specific to the 2,248-node hackathon dataset; the additional CSV dashboard does not replace that pipeline.
