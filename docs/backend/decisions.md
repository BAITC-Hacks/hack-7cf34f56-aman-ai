# Decision log

- **ADR-001:** explainable deterministic role scores, not a trained classifier; no ground truth exists.
- **ADR-002:** Seed Convergence runs deterministic per-seed BFS over the complete directed graph; sorted seeds/adjacency, visited sets, and integer bitmasks count distinct seeds, not paths.
- **ADR-003:** depth 4 is an observation boundary and is ineligible for terminal-by-zero-outgoing.
- **ADR-004:** temporal reasoning is calendar-date only (same day/one/two days).
- **ADR-005:** cycles exist in the canonical graph, but cycle detection remains optional and outside P0.
- **ADR-006:** directed graph is canonical for money flow; weighted undirected projection is Louvain-only.
- **ADR-007:** Louvain uses `seed=42`, resolution 1.0, and stable community relabeling.
- **ADR-008:** evidence is deterministic; `role_score` and `priority_score` differ.
- **ADR-009:** gids are JSON strings; CSVs preserve exact decimal representation.
- **ADR-010:** mandatory local pipeline is independent of AI, API, frontend, DB, and cloud.
- **ADR-011:** no database is required for the hackathon dataset.
- **ADR-012:** frontend is teammate-owned; backend agents do not modify it.


- **ADR-013:** `pct_depth` uses same-depth ascending average ranks for ties: `(average_rank-1)/(N-1)` for valid non-constant `N>1` groups, otherwise zero.
- **ADR-014:** preliminary priority is final priority with `resilience_pct=0`, sorted by descending score then ascending gid; only its first 50 nodes receive resilience simulation.
- **ADR-015:** dependency versions must be pinned in the project before final submission. This repository currently has no Python dependency configuration and neither inspected Python runtime has NetworkX installed, so no untested NetworkX version is invented during documentation work.
