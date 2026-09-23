# Backend implementation plan

Read the approved design and `apps/backend/AGENTS.md` before each phase. This is a
sequence for incremental delivery; P0 must work as `python main.py` before P1/P2.

| Phase | Priority | Goal, output, dependencies, and done condition |
|---|---|---|
| 0 — Data validation | P0 | Read the three Parquets, preserve gids, validate schemas/constraints and reconcile transaction aggregates to edges. Output: validated frames + report. Depends on source files. Tests: schema, missing/negative, endpoints, depth, duplicate policy. Done: failures are explicit. |
| 1 — Directed graph | P0 | Build the canonical `src → dst` graph from edges and an undirected projection. Output: deterministic graph objects. Depends on phase 0. Tests: directions, weights, components, no loops. Done: every valid edge appears once. |
| 2 — Base features | P0 | Produce one feature row per node: degrees, flows, centralities, components, concentration. Depends on phase 1. Tests: synthetic feature values and bounded ratios. Done: all gids represented. |
| 3 — Seed Convergence | P0 | Sort seeds/adjacency, run one visited directed BFS per seed over the complete graph, and OR its bit into each reached node. Output: raw masks/counts and depth-relative score. Depends on phases 0–2. Tests: merge, same-seed multipath, cycle, cross-level edge, disconnected seed. Done: no mutation/order dependence. |
| 4 — Louvain | P0 | Run fixed-seed Louvain on the prescribed projection; assign stable IDs. Depends on phase 1. Tests: rerun identity and stable relabeling. Done: every gid has one cluster. |
| 5 — Role Engine | P0 | Calculate six scores, eligibility, and role selection. Depends on phases 2–4 and temporal defaults. Tests: formulas, floor, depth-4 eligibility. Done: each role/score is explainable. |
| 6 — Priority Engine | P0 | Calculate preliminary priority with `resilience_pct=0`, choose the stable top 50, then calculate bounded resilience and final priority. Depends on phase 5. Tests: range, ties, candidate scoping. Done: deterministic ranking. |
| 7 — Deterministic Evidence | P0 | Build cautious evidence templates from actual metrics. Depends on phases 5–6. Tests: nonempty, <=200 characters, boundary language. Done: no LLM call. |
| 8 — Required CSV outputs | P0 | Write three exact UTF-8 CSV contracts to `results/`. Depends on phases 4–7. Tests: headers, rows, gid rendering, bytes on rerun. Done: `python main.py` succeeds locally in <5 min. |
| 9 — Product JSON | P1 | Write `node_cards.json` and `graph.json` using string gids. Depends on P0. Tests: schemas and JSON-safe IDs. Done: frontend-safe artifacts exist. |
| 10 — Lightweight API | P1 | Expose the documented read-only endpoints over product JSON. Depends on phase 9. Tests: success, 404, caps. Done: server is optional to pipeline. |
| 11 — Temporal features | P1 | Calculate calendar-date pass-through, burst, and synchronization. Depends on validation + transactions. Tests: same/one/two-day boundaries and duplicate retention. Done: unavailable values default per contract. |
| 12 — Resilience | P1 | Simulate only top-50 preliminary candidates. Depends on priority inputs. Tests: zero-safe denominators and candidate exclusion. Done: no graph-wide removal loop. |
| 13 — AI Investigator | P2 | Add tool-driven explanation only. Depends on stable JSON/API. Tests: tool limits and fact/limitation propagation. Done: no mandatory result depends on AI. |
| 14 — Final validation/demo | P0 | Clean run, deterministic rerun, README instructions, named-gid checks. Depends on all selected phases. Tests: full suite and output validation. Done: jury command produces CSVs. |

Suggested modules: `data_validation`, `graph_engine`, `features`,
`seed_convergence`, `communities`, `roles`, `priority`, `evidence`, `outputs`,
`product_json`, `api`, and `tests`. Do not create production code in a phase until
its predecessor contract and tests are understood.

Failure conditions for every phase: silent coercion of gid, hidden repair of
invalid data, nondeterministic ordering, an output contract change, or any
frontend/LLM dependency in the P0 command.
