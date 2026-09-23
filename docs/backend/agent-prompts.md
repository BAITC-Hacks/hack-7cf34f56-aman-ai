# Backend agent prompt library

Use the preamble below verbatim, then append the phase request from the table.

> Read `AGENTS.md`, `apps/backend/AGENTS.md`, `docs/moneygraph-investigator-design.md`, the relevant `docs/backend/*` contract, and relevant MoneyGraph skill before changing code. Inspect existing implementation and tests first. Implement only this phase, add/update focused tests, run tests, report files changed, actual test results, and discrepancies. Never claim success without executed validation. **DO NOT MODIFY `apps/frontend`.**

| Prompt | Append this phase request |
|---|---|
| 1 Final engineering review | Review readiness only; do not modify code. Classify BLOCKER/IMPORTANT/NICE TO HAVE and end GO/NO-GO. |
| 2 Data validation | Implement phase 0 strictly against the data contract; no analytics. |
| 3 Graph + features | Implement phases 1–2 using canonical directed edges. |
| 4 Seed Convergence | Implement phase 3 with synthetic merge and same-seed multipath tests. |
| 5 Louvain | Implement phase 4 with fixed seed and stable cluster IDs. |
| 6 Role Engine | Implement phase 5 formulas/eligibility exactly; no classifier. |
| 7 Priority + Evidence | Implement phases 6–7, bounded scores and deterministic cautious evidence. |
| 8 Required CSV | Implement phase 8 and rerun-byte validation. |
| 9 Product JSON | Implement phase 9 with string gids and mock-contract compatibility. |
| 10 FastAPI | Implement phase 10 only; API remains optional to pipeline. |
| 11 Temporal | Implement phase 11 at calendar-date granularity. |
| 12 Resilience | Implement phase 12 for top preliminary 50 only. |
| 13 AI Investigator | Implement phase 13 as tools + factual explanation boundary only. |
| 14 Strict backend code review | Review the changed phase against all contracts; do not modify code. |
| 15 Analytics QA | Test synthetic and actual-data invariants; report failures without altering formulas. |
| 16 Final HackAlem validation | Run the jury command, validate artifacts/limits/determinism; do not add scope. |
| 17 README/demo preparation | Document actual behavior and demo steps only after P0 works; do not modify frontend. |
