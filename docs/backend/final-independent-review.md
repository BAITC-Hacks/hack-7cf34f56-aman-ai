# Final independent review — MoneyGraph backend and AI chat

**Date:** 2026-09-23

**Scope:** raw Parquet → deterministic analytics → CSV/JSON → Explorer/API → live OpenAI

**Reviewer posture:** results below were recomputed from source data in a separate audit script and were not accepted from earlier reports.

## EXECUTIVE SUMMARY

The backend satisfies all five HackAlem must-haves and the current frontend/API
handoff. An independent reconstruction matched production Seed Convergence,
features, selected roles, role scores, priority scores, cluster assignments and
Top-20. The clean pipeline finished in 6.039 seconds internally and the working pipeline in
about 2.2 seconds, both far below five minutes. All 62 tests pass. Five exact live
OpenAI questions passed semantic and factual review.

The optional NVIDIA critic is fail-open and currently receives 401 on inference;
it is not required by the current chat scope and does not affect OpenAI or the
deterministic backend. No credential was found in tracked files, generated
artifacts, the diff or Git history.

## MUST-HAVE MATRIX

| Requirement | Status | Independent evidence |
|---|---|---|
| One-command reproducible pipeline | **PASS** | `python main.py`; fresh environment 6.039 s internal runtime; creates all required outputs |
| Role, score, cluster, priority and evidence for 2,248 nodes | **PASS** | 2,248 unique exact gids; complete valid rows; evidence nonempty and <=200 chars |
| Formal explainable role criteria | **PASS** | documented bounded formulas, eligibility and 0.55 floor; Explorer verified for all six roles |
| Network clustering | **PASS** | deterministic weighted Louvain; 65 clusters; required cluster fields present |
| Correct Top-20 and arbitrary-GID inspection | **PASS** | global ranking reconstructed exactly; API and Explorer inspect real arbitrary gids |
| Runtime below five minutes | **PASS** | 2.00–2.23 s working process runs; 6.039 s clean internal runtime |
| Clean-machine README | **PASS** | fresh copied checkout, new venv, requirements install, pipeline, API and tests succeeded |
| Scaling to ~1M nodes | **PASS** | README and `docs/backend/scaling.md` cover graph engine, approximation and bounded serving |
| Cautious AML language | **PASS** | deterministic evidence and live AI describe hypotheses/signals, never guilt |

## RAW DATA VALIDATION

Independent Parquet reads produced:

- 2,248 nodes, 3,119 directed edges, 4,840 transaction rows and 81 seeds;
- depth counts `81 / 472 / 462 / 789 / 444` for depths 0–4;
- observed edge total `365,890,012.01 KZT` (the case document reports the rounded integer `365,890,012`);
- 97 exact duplicate transaction rows, retained because there is no transaction ID;
- zero duplicate aggregated edge pairs, zero self-loops and zero missing endpoints;
- destination-minus-source depth counts: `+1=2,374`, `0=236`, `-1=433`, `-2=56`, `-3=20`; all 745 cross-level edges remain canonical;
- 35 weak components including 19 isolated nodes, hence 16 nontrivial components;
- 2,023 SCCs; 84 cyclic SCCs containing 309 nodes; largest size 85; 548 internal cyclic edges;
- 19 seeds absent from edges, 12 recipient-only seeds and 31 seeds without outgoing edges;
- 377 nodes have observed outgoing above incoming when zero-incoming nodes are included; 354 have positive observed incoming and outgoing above it, matching the case statement.

## FEATURE AUDIT

All-node comparisons returned zero mismatches for in/out degree, distinct
counterparties, incoming/outgoing KZT, retention, flow balance, PageRank,
betweenness, bridge count, same-depth percentiles, observed volume inputs and all
implemented temporal fields. PageRank and betweenness were recomputed directly
with the documented weights/distances. Samples and full vectors across every
depth were therefore covered.

`pct_depth` uses ascending average ranks with the documented constant, invalid
and singleton fallbacks. Its values are ranks inside a depth group, not measured
shares.

## SEED CONVERGENCE AUDIT

An independent method used `networkx.descendants(seed) ∪ {seed}` for each of the
81 seeds and counted seed membership per node. It retained cycles and cross-level
edges. Comparison against all 2,248 production values found **0 mismatches**.

## TEMPORAL AUDIT

The independent transaction-row calculation qualified an outgoing amount on day
`d` once when any incoming activity existed on `d`, `d-1` or `d-2`. Same-day,
next-day and two-day fixtures pass; later activity is excluded; multiple matching
incoming days do not duplicate an outgoing amount. Duplicate source rows remain
part of incident daily counts and daily incoming sender counts remain distinct.

There are exactly 72 nodes with positive observed incoming and an outgoing/incoming
ratio in `[0.8, 1.2]`. Production selects 60 Transit nodes overall; 38 of the 72
ratio candidates are Transit, matching the documented result.

## ROLE ENGINE AUDIT

All six scores, eligibility rules, fixed tie order and the 0.55 floor were
reconstructed independently. Selected role mismatches: **0/2,248**. Published
role-score mismatches: **0/2,248**.

Final distribution: Consolidator 141, Transit 60, Distributor 522, Terminal 954,
Coordinator 60 and Peripheral 511. Peripheral uses only eligible non-peripheral
scores. Transit/Terminal are ineligible outside depths 1–3; depth-4 Terminal count
is zero. Depth-4 Consolidator excludes the retention contribution without
renormalization.

## PRIORITY AUDIT

The independent reconstruction used resilience zero for preliminary priority,
selected the same deterministic 50 candidates, recomputed removal impact and then
the final score. Published priority mismatches: **0/2,248**. The CSV Top-20 equals
the true global order under `priority_score DESC, gid ASC` at six-decimal output
precision.

## LOUVAIN AUDIT

Pinned environment: Python 3.14.0 and NetworkX 3.7. Reciprocal directed amounts
were summed before `log1p`; Louvain used `weight="weight"`, resolution 1.0 and
seed 42. Two independent runs produced identical assignments: 65 communities,
10 containing multiple seeds. All 2,248 cluster IDs match Product JSON.

## PRODUCT JSON AUDIT

`node_cards.json` contains 2,248 string-keyed cards. `graph.json` contains 2,248
string-gid nodes and 3,119 directed string-endpoint edges. Strict JSON parsing
found no NaN or Infinity. Full-card comparisons found no mismatch in selected
role, role score, priority, cluster, metrics, all six score/eligibility entries,
boundary limitations, next action or weighted priority-component sum.

## API AUDIT

An actual Uvicorn server returned 200 for health, Top-20, real node, hop-1,
hop-2, real cluster, prefix search and live investigation. Unknown/malformed gids
returned 404/400. Hop-2 was deterministically capped at 250 nodes. All GIDs remain
strings. `POST /api/investigate` returned answer, tools, evidence, limitations,
critic metadata and bounded tool trace without secrets or analytical recomputation.

## OPENAI LIVE AUDIT

Current local live model: `gpt-5.6`. All five exact questions passed:

1. High-priority GID: `get_node`; validator PASS; role, priority, amounts, seed count and depth-relative ranks correct.
2. Node comparison: `compare_nodes`; validator PASS; both roles/scores/flows/counterparties correct.
3. Transit explanation: `get_node`; validator PASS; degree remained graph links, turnover was not presented as fund matching.
4. Generic depth-4 policy: `get_methodology_context`; validator PASS; no tool-loop exhaustion and no invented node limitation.
5. Reaching seeds: `get_node`, `get_seed_paths`, `get_cluster`; validator PASS; source seeds, target gid and `target_is_seed=true` remained distinct.

No answer treated degree as transaction count, percentile as a raw share, a
non-boundary depth as a limitation, or an unverified role as guilt. NVIDIA critic
status was consistently `unavailable`; OpenAI remained available as designed.

## EXPLORER AUDIT

Real `explain` subprocesses succeeded for Consolidator, Transit, Distributor,
Terminal, Coordinator, Peripheral, depth-4 boundary and a deterministic ordinary
depth-2 node. Each displayed the production role formula and final priority
without a crash; ineligible roles were displayed as N/A with a reason.

## SECRET AUDIT

**SECRET LEAK FOUND: NO.** Exact locally configured provider values were absent
from current tracked files, generated artifacts, the Git diff and all Git history.
No live credential-format string or Authorization header was found in repository
content. `.env`, `.env.*`, `.env.local` and `.venv/` are ignored.

## CLEAN ENVIRONMENT

A separate checkout copy excluded `.git`, `.venv`, `.env.local` and frontend
`node_modules`. A new Python 3.14 venv followed README installation commands.
`python main.py` succeeded with 6.039 seconds internal runtime (19.57 seconds cold
process wall time), a clean Uvicorn process served `/health` and `/api/top-nodes`,
and the full suite passed 62/62. No provider secret
or hidden environment state was required for mandatory analytics or read-only API.

## TESTS

`PYTHONPATH=apps/backend python -m pytest apps/backend/tests -q`:
**62 passed in 6.77 s** in the working environment and **62 passed in 6.81 s**
in the fresh environment. No critical test was skipped.

## DETERMINISM

Two complete working-environment runs were byte-identical for all required CSV,
Product JSON and deterministic diagnostics. SHA-256 values:

- `nodes_roles.csv`: `68ca46192d1b7f664df39ea276584c107ff0a01cc81d9448a579ffd21b541946`
- `clusters.csv`: `35a25e809fc929afe482aa520702202833235534babdfb0eb0cde17b589da6a2`
- `top_nodes.csv`: `8294221cda17a96f392c99bd8d34b1151955f86e912daf5328d589347e913519`
- `node_cards.json`: `10636e100c4c66a5d263698c51c6684dee4d29a438cbb0f2bd16e717ac6896e1`
- `graph.json`: `55e5554f3213d9ea352b5a6207c8b6ecb15f7e39e1190d151aa462aec9b0520c`
- `analytics_diagnostics.json`: `d72aa7016e9f033ed873138f8e85e54b2ea2d0e40f53a2edaebfabe4d817c37c`

## RISKS

- NVIDIA inference authentication returns 401 although the catalog/model listing
  is visible; the critic is optional and fail-open, so this is a demo enhancement
  risk rather than a submission blocker.
- AI prose remains a bounded analyst hypothesis. The deterministic evidence and
  tool trace are authoritative.
- NetworkX Louvain output is version-sensitive; reproducibility therefore depends
  on the pinned Python/NetworkX environment already documented and tested.
- The frontend is teammate-owned. No `apps/frontend` file differs from
  `origin/main`; backend HTTP contracts were verified independently.

## FINAL STATUS

**READY TO PUSH**
