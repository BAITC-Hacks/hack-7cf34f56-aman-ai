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
- **ADR-015:** dependency versions must be pinned in the project before final submission. At the documentation-only review checkpoint the repository had no Python dependency configuration and neither inspected Python runtime had NetworkX installed, so no untested NetworkX version is invented during documentation work.
- **ADR-016:** At depth 4, retention remains observable but is excluded from consolidator scoring because outgoing visibility is truncated; its 0.15 contribution is zero and is not redistributed.
- **ADR-017:** A theoretical role score and role eligibility are distinct. Consumer-facing views must expose eligibility and ineligible reasons, especially terminal at the observation boundary.

- **ADR-018:** Peripheral confidence uses the same eligible non-peripheral score set as selection; complement of its maximum, default maximum zero. Ineligible theoretical scores cannot reduce Peripheral confidence.
- **ADR-019:** Date-only turnover, incident daily counts (duplicates retained), and distinct daily senders are now calculated. Priority temporal uses their approved maximum without weight changes.
- **ADR-020:** Exported Top-20 is validated against the global node ranking at six-decimal published score precision, with gid tie-break.
- **ADR-021:** JSON artifacts are generated locally; API serves one snapshot loaded at startup. API/AI dependencies stay in separate optional requirements.

- **ADR-022:** Completion tested Python 3.14.0 / NetworkX 3.7 in a clean environment. Reciprocal KZT is summed before log1p; repeated Louvain yields 65 communities and 10 multi-seed communities. Do not match the alternative 3.6.1 result by tuning.
