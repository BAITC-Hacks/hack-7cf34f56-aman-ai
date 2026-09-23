# Backend Agent Instructions — MoneyGraph Investigator

Read the root [AGENTS.md](../../AGENTS.md) first. The approved analytical source
of truth is [docs/moneygraph-investigator-design.md](../../docs/moneygraph-investigator-design.md).
The contracts in `docs/backend/` operationalize that design; they do not override it.

## Ownership boundary

This directory owns the local Python pipeline, deterministic analytics, exported
results, JSON artifacts, optional API, and their tests.

**DO NOT MODIFY `apps/frontend`** unless a future user request explicitly asks for it.
Do not make the mandatory pipeline depend on the frontend, an API server, an LLM,
an external database, network access, or cloud services.

## Module boundaries

Keep responsibilities separate: data validation; graph construction; features;
seed convergence; communities; roles; priority/resilience; evidence; outputs;
optional API; and tests. `main.py` orchestrates these modules and produces the
three required CSVs. Read `docs/backend/implementation-plan.md` before choosing
or changing a boundary.

## Non-negotiable analytics

- `edges.parquet` is canonical for directed topology, amounts, degree, and flow
  features. Transactions are for date-level temporal features after validation.
- Preserve the directed graph for flow analysis. Use only the weighted undirected
  projection for Louvain as specified in `analytics-contract.md`.
- Sort seed gids and adjacency lists; for every seed run directed BFS over the
  complete canonical graph with a visited set, OR its bit into reached nodes, and
  popcount distinct reachable seed gids. Preserve cross-level edges and cycles.
- Apply the six role formulae, eligibility, confidence floor, and priority formula
  exactly as documented. Scores must be bounded in `[0,1]`.
- Treat depth 4 as the observation boundary; it is never terminal solely because
  it has no observed outgoing edges.
- Evidence is deterministic, factual, cautious, and within the required limit.

## Data and interface rules

Use exact integer/decimal-safe handling for gids. At every JSON/API/frontend
boundary a gid is a string; CSV gid values are exact decimal text, never floats
or scientific notation. Emit the exact mandatory CSV schemas in
`docs/backend/output-contract.md`, stable sorting, UTF-8, and six-decimal scores.

## Tests and performance

Read `docs/backend/testing-strategy.md`. Add or update focused tests for every
analytical change; run the relevant suite before and after it. The full local
`python main.py` pipeline must finish in under five minutes and run deterministically.
Report actual commands and outcomes, including failures.

## AI separation and definition of done

AI is P2. It may invoke deterministic tools and explain their structured facts;
it may not assign authoritative roles, scores, graph links, or evidence. A phase
is done only when its contract, focused tests, integration path, and deterministic
output requirements are satisfied. Never report completion without executed
validation.
