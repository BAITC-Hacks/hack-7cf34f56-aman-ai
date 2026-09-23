# moneygraph-priority-engine

## Purpose
Implement priority components, bounded resilience, and deterministic ranking.

## When to use
Use only for the corresponding backend phase after reading existing code and tests.

## Required reading
Read `AGENTS.md`, `apps/backend/AGENTS.md`, `docs/moneygraph-investigator-design.md`,
`docs/backend/analytics-contract.md`, the phase contract, and `docs/backend/testing-strategy.md`.

## Inputs
Validated project files and the phase inputs defined in `docs/backend/implementation-plan.md`.

## Outputs
Only the scoped module/tests/artifacts defined for the phase. Preserve the frontend contract.

## Non-negotiable rules
- **DO NOT MODIFY `apps/frontend`.**
- Preserve gids exactly; JSON/API gids are strings.
- Keep P0 local, deterministic, and independent of frontend/API/LLM/cloud.
- Define preliminary priority as final priority with `resilience_pct=0`, select its
  stable top 50 by score DESC/gid ASC, then calculate final resilience/priority.
- Follow the approved formulas and depth-4 boundary; do not silently redesign them.
- Treat results as investigative hypotheses, never guilt claims.

## Tests
Add focused synthetic and integration tests from `docs/backend/testing-strategy.md`; run relevant
tests before and after changes and report actual commands/results.

## Done condition
The scoped contract is implemented, tested, deterministic, and does not change unrelated modules.

## Common failure modes
Float-coercing gids; reversing edges; using transactions as canonical topology; counting paths instead
of distinct seeds; nondeterministic Louvain/ordering; terminal labeling at depth 4; scores outside
`[0,1]`; optional dependencies in `python main.py`; untested completion claims.
