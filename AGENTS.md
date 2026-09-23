# MoneyGraph frontend workflow

Shared copies of the project's frontend skills and supporting resources are in [.codex/skills/frontend-design](.codex/skills/frontend-design/README.md). Read the matching `SKILL.md` there if a named skill is not installed locally.

- Use the `moneygraph-frontend` and official `shadcn` skills for frontend work. Use shadcn MCP to inspect component APIs and examples. Prefer existing shadcn components over custom equivalents.
- For the right-hand Node Inspector, use Card, Badge, Tabs, Tooltip, ScrollArea, Progress, and Separator as appropriate.
- After significant UI implementation, use `frontend-qa`: run `npm run lint`, run `npm run build`, start the frontend, test core workflows with Playwright MCP, inspect the browser console, verify the 1440x900 layout, and test empty/loading/error states. Fix relevant failures and report anything still failing or blocked before declaring completion. Run commands from the frontend package; a missing app or script is not a passing check.
- Always use the OpenAI developer documentation MCP server when implementing or modifying OpenAI API functionality. Report missing MCP access explicitly.
- The teammate owns the backend. Inspect its branch and compare API contracts read-only when requested; do not modify that branch. Report affected frontend types and API calls with the compared refs.
- Follow `docs/project_description.md` and `starter/READ_2.md`. Treat roles as investigation hypotheses, preserve numerical evidence, and surface depth-4 truncation and incomplete seed inflows.
- Keep credentials out of source control and browser code. GitHub MCP reads `GITHUB_PAT_TOKEN` from the environment of the Codex process.


---

# MoneyGraph backend workflow

# AGENTS.md — MoneyGraph Investigator

## 1. Project Context

We are building **MoneyGraph Investigator** for the HackAlem AI hackathon.

Track:
Analytics & Decision-Making / Cybersecurity & Compliance.

Development time:
Approximately 5 hours.

Team:
2 developers.

Responsibilities:
- Developer 1: backend, graph analytics, scoring, pipeline, AI integration.
- Developer 2: frontend and visualization.

The system analyzes an anonymized banking transaction graph starting from
81 known seed clients and reconstructs the observed downstream financial
structure.

The primary user is an AML / financial-monitoring analyst.

The central product question is:

> Which nodes should the analyst investigate first, and why?

The system does NOT determine guilt.

All conclusions must be framed as:
- observable structural signals;
- hypotheses for investigation;
- evidence derived from the provided transaction graph.

Never describe a node as a criminal, organizer, money launderer, or guilty
party based solely on this system.

---

# 2. Source of Truth

Before planning, reviewing, or implementing backend functionality, read:

    docs/moneygraph-investigator-design.md

This document is the PRIMARY technical source of truth.

Also read the HackAlem case specification if it is available in the
repository.

Priority of instructions:

1. HackAlem mandatory requirements
2. docs/moneygraph-investigator-design.md
3. AGENTS.md
4. Current implementation task
5. Optional improvements

Do not silently redesign decisions already specified in the design document.

If implementation reveals a contradiction or blocker:

1. stop;
2. describe the problem;
3. show the affected design assumption;
4. propose the smallest possible correction.

Do not perform large architectural rewrites without justification.

---

# 3. Core Architecture

The approved architecture is:

    Parquet
       ↓
    Validation
       ↓
    Directed Graph
       ↓
    Feature Engine
       ↓
    Seed Convergence
       ↓
    Louvain Communities
       ↓
    Role Engine
       ↓
    Priority Engine
       ↓
    Evidence Engine
       ↓
    ┌───────────────────────┐
    │                       │
    CSV                  JSON/API
    │                       │
    Jury                 Frontend
                            │
                            ↓
                     AI Investigator

The mandatory pipeline is:

    python main.py

It must produce:

    results/nodes_roles.csv
    results/clusters.csv
    results/top_nodes.csv

The mandatory pipeline MUST work without:

- OpenAI;
- NVIDIA;
- internet access;
- frontend;
- external databases;
- cloud infrastructure.

AI is an optional investigation layer on top of deterministic analytics.

---

# 4. Input Data

Expected input files:

    nodes.parquet
    edges.parquet
    transactions.parquet

Expected scale:

    2,248 nodes
    3,119 edges
    4,840 transactions
    81 seed nodes

Do not hard-code these counts into analytical algorithms.

They may be used for validation of the hackathon dataset.

---

# 5. GID Safety

GIDs may exceed JavaScript's safe integer range.

Backend internal representation may follow the source data where safe,
but at every JSON/API/frontend boundary:

    gid MUST be serialized as a string.

Never send a large gid to JavaScript as a numeric JSON value.

Never convert gid through floating point.

CSV output must preserve the exact decimal representation without
scientific notation.

---

# 6. Canonical Data Sources

Use:

    edges.parquet

as the canonical source for:

- graph structure;
- src → dst relationships;
- aggregated KZT volume;
- degree calculations;
- monthly flow calculations.

Use:

    transactions.parquet

for:

- calendar-date temporal analysis;
- same-day behavior;
- one-day behavior;
- two-day behavior;
- daily bursts;
- synchronized daily activity.

Do NOT use transactions.parquet as the primary source of graph totals
without validating it against edges.parquet.

Keep duplicate transaction rows unless there is explicit evidence that
they are duplicates. There is no transaction ID.

---

# 7. Data Validation

Validate before analytics.

Check:

- missing gid;
- missing src/dst;
- missing amounts;
- negative amounts;
- self-loops;
- duplicate aggregated edge pairs;
- edge endpoints absent from nodes;
- seed count;
- depth values;
- graph direction assumptions;
- date parsing;
- unexpected schema changes.

Never silently repair important data inconsistencies.

Report them.

---

# 8. Critical Graph Constraint

The canonical directed graph is **not a DAG**. `nodes.depth` is the minimum
discovery generation. For all 3,119 supplied edges, `edges.depth == src.depth + 1`;
it marks the source outgoing traversal step and does not constrain destination
depth. Keep every directed edge, including 745 whose destination is at the same
or an earlier node depth. Cycle analysis is optional and is not P0.

# 9. Observation Boundary

Traversal stops at:

    depth = 4

Therefore:

    out_degree == 0

at depth 4 does NOT mean money stopped there.

It may simply mean that observation ended.

Hard rule:

    depth=4 nodes must never be classified as terminal
    solely because they have no observed outgoing edges.

Expose an explicit limitation such as:

    observation_boundary

or equivalent.

Recommended next action may state that additional downstream transactions
are required.

---

# 10. Incomplete Financial Observation

This graph is NOT the customer's complete banking history.

Only observed transfers inside the supplied export exist.

Incoming/outgoing ratios therefore represent:

    observed incoming
    observed outgoing

not true account balances or complete cash flow.

Seed incoming flows may be incomplete.

Do not describe:

    incoming_kzt - outgoing_kzt

as an account balance.

Use terminology such as:

    observed incoming volume
    observed outgoing volume
    observed retention signal
    observed pass-through signal

---

# 11. Temporal Limitation

transactions.parquet contains calendar dates, not time-of-day timestamps.

Never produce claims such as:

    "money was forwarded after 70 minutes"

or:

    "within 2 hours"

Supported temporal statements are:

    same calendar day
    within 1 calendar day
    within 2 calendar days

Temporal analysis is evidence, not transaction-level money matching.

---

# 12. Directed vs Undirected Graphs

Maintain two concepts.

## Directed Graph

The directed graph is authoritative for:

- money direction;
- seed propagation;
- upstream/downstream relationships;
- path analysis;
- in/out degree;
- PageRank;
- financial-flow interpretation.

## Undirected Projection

A weighted undirected projection may be used for:

- Louvain community detection;
- weak structural analysis.

Never infer money direction from the undirected projection.

---

# 13. Louvain

Community detection follows the approved design.

Use a weighted undirected projection.

Edge weight:

    log1p(sum_kzt)

Run:

    networkx.louvain_communities(
        graph,
        weight="weight",
        resolution=1.0,
        seed=42
    )

Community detection must be deterministic for the hackathon pipeline.

After community detection, assign stable cluster IDs according to the
sorting rule defined in:

    docs/moneygraph-investigator-design.md

Do not let arbitrary set ordering determine cluster IDs.

Louvain communities represent:

    densely/interactively connected transaction communities

They do NOT represent criminal organizations.

---

# 14. Seed Convergence

Seed Convergence counts distinct seed gids with at least one observed directed
path to a node, never paths or proof of common funds. Sort seeds and adjacency
lists by gid. For each seed, run directed BFS over the complete canonical graph
with a visited set and OR that seed's bit into every reached node mask.
`seed_reach_count=popcount(mask)`, then `seed_convergence=pct_depth(seed_reach_count)`.
This handles cycles and preserves cross-level edges in `O(S × (V + E))`.

# 15. Feature Engine

Maintain raw values for explainability.

Core structural features include:

- in_degree
- out_degree
- unique_senders
- unique_recipients
- weighted degree
- PageRank
- betweenness
- weak component
- bridge/community information

Financial features include:

- observed incoming KZT
- observed outgoing KZT
- amount concentration
- observed retention
- flow balance

Seed features include:

- seed_reach_count
- seed_convergence
- depth

Temporal features may include:

- timing_consistent_turnover
- burst percentile
- synchronized incoming percentile

Do not add features merely because they are available in NetworkX.

Every feature must have an analytical reason.

---

# 16. Percentile Normalization

Role scoring primarily uses depth-relative percentile ranks.

Use the exact percentile definition from the design document.

Percentiles must be:

- deterministic;
- tie-aware;
- bounded to [0,1].

If a feature is:

- unavailable;
- invalid;
- constant within its comparison group;

follow the fallback behavior specified in the design.

Keep raw feature values for evidence generation.

---

# 17. Role Engine

There are six required roles:

    consolidator
    transit
    distributor
    terminal
    coordinator
    peripheral

Do NOT train a supervised role classifier.

There is no role ground truth.

Roles are determined by independent explainable scores.

Use the EXACT formulas defined in:

    docs/moneygraph-investigator-design.md

Do not casually modify weights.

If real data reveals a mathematical defect:

1. demonstrate the defect;
2. explain its effect;
3. propose the smallest correction.

---

# 18. Role Interpretation

## Consolidator

Evidence may include:

- many observed senders;
- high observed incoming volume;
- seed convergence;
- observed retention.

Describe as:

    signs of consolidation

not:

    money collector for criminals.

## Transit

Evidence may include:

- two-sided connectivity;
- similar observed incoming/outgoing flows;
- same-day / one-to-two-day turnover;
- downstream continuation.

Primarily applicable at depths 1–3.

## Distributor

Evidence may include:

- many recipients;
- high observed outgoing volume;
- strong fan-out.

## Terminal

Evidence may include:

- observed incoming activity;
- little/no observed outgoing activity.

Eligible only according to the design rules.

depth=4 boundary nodes require uncertainty handling.

## Coordinator

This is a STRUCTURAL hypothesis.

Evidence may include:

- PageRank;
- betweenness;
- bridge position;
- seed convergence;
- resilience impact.

Never claim:

    high PageRank = organizer

or:

    coordinator role proves leadership.

## Peripheral

Use when stronger role evidence is absent.

Explain the absence of strong observed patterns.

---

# 19. Role Score vs Priority Score

These concepts MUST remain separate.

role_score answers:

    How strongly does the node match its assigned functional role?

priority_score answers:

    How useful is this node as an investigation target?

A node may have:

    high role confidence
    but low investigation priority.

Do not merge these concepts.

---

# 20. Priority Engine

Use the exact formula defined in the design document.

Current approved structure:

    role contribution
    + seed convergence
    + centrality / bridge contribution
    + observed volume
    + temporal significance
    + resilience impact

All components must be bounded.

Final:

    priority_score ∈ [0,1]

Sorting must be deterministic.

Top nodes are ordered by:

    priority_score DESC
    gid ASC

unless the design document explicitly changes this rule.

---

# 21. Evidence Engine

Mandatory CSV evidence is deterministic.

Do NOT call an LLM to populate mandatory evidence.

Evidence must use actual calculated values.

Good:

    "Признаки консолидации: 11 наблюдаемых отправителей,
     достижим из 6 известных seed-узлов, входящий объём в топ-3%
     своей depth-группы."

Bad:

    "This account is clearly laundering money."

Evidence must:

- explain the role;
- reference calculated metrics;
- be understandable without ML expertise;
- remain within the required output length.

Never invent metrics.

---

# 22. Resilience

Resilience is optional.

Only calculate it for the candidate set specified in the design.

Do not run expensive removal analysis across every node unnecessarily.

Measure structural impact according to the approved formula.

Interpretation:

    structural importance under node removal

not:

    proof of criminal importance.

---

# 23. Required Outputs

The mandatory files are:

## nodes_roles.csv

Exact columns:

    gid
    role
    role_score
    cluster_id
    priority_score
    evidence

## clusters.csv

Exact columns:

    cluster_id
    n_nodes
    n_seed
    sum_kzt_internal
    top_gids
    hypothesis

## top_nodes.csv

Exact columns:

    rank
    gid
    role
    priority_score
    why

Do not change mandatory schemas without checking the HackAlem specification.

---

# 24. Mandatory Validation

Before declaring the pipeline complete, validate:

- exactly 2,248 unique gids for this dataset;
- every node has a role;
- every node has role_score;
- every node has priority_score;
- every node has cluster_id;
- every node has non-empty evidence;
- scores are within [0,1];
- roles belong to the approved enum;
- required CSV columns match exactly;
- Top-20 ordering is deterministic;
- no depth-4 boundary node is terminal solely because of zero outgoing;
- no gid precision was lost.

Run:

    python main.py

twice.

After stable sorting, mandatory CSV outputs must be deterministic.

---

# 25. Product JSON

In addition to mandatory CSVs, the backend may generate:

    results/node_cards.json
    results/graph.json

JSON exists for the frontend.

It is NOT a replacement for mandatory CSV outputs.

At JSON/API boundaries:

    gid = string

Node-card payload should expose:

- gid
- role
- role_score
- priority_score
- cluster_id
- raw important metrics
- score breakdown
- seed_reach_count
- evidence
- limitation flags
- recommended next action
- relevant incident edges

Keep this contract stable because frontend development happens in parallel.

---

# 26. API

The intended lightweight API contract is:

    GET /health
    GET /api/top-nodes
    GET /api/nodes/{gid}
    GET /api/nodes/{gid}/subgraph?hop=1
    GET /api/clusters/{cluster_id}
    GET /api/search?gid=

Do not add database infrastructure merely to support these endpoints.

The API should primarily serve precomputed analytical results.

---

# 27. Frontend Constraints

Frontend is owned by another developer.

Do not modify frontend architecture unless explicitly requested.

Backend responsibility is to maintain stable:

- CSV schemas;
- JSON schemas;
- API contracts.

UI should focus on:

    Top investigation targets
        ↓
    GID search
        ↓
    Node Card
        ↓
    Local directed graph / cluster

Do not require rendering all 2,248 nodes simultaneously.

---

# 28. AI Investigator

AI is OPTIONAL until mandatory analytics work.

AI must NOT calculate authoritative:

- role;
- role_score;
- priority_score;
- cluster membership;
- graph metrics.

Those come from deterministic code.

The AI Investigator operates through tools.

Potential tools:

    get_node(gid)
    get_cluster(cluster_id)
    find_common_downstream(seed_gids)
    get_paths(source, target)
    get_seed_paths(gid)
    get_temporal_patterns(gid)
    compare_nodes(gids)

The LLM may:

- choose tools;
- combine retrieved facts;
- explain results;
- summarize evidence;
- propose the next analytical query.

The LLM must NOT invent:

- transactions;
- paths;
- balances;
- identities;
- relationships;
- graph metrics.

If information is unavailable, say so.

---

# 29. OpenAI / NVIDIA

External model APIs are available for optional functionality.

Their availability must NOT be required for:

    python main.py

Use model APIs where they add analytical UX value.

Do not use APIs merely to increase "AI usage."

Prefer deterministic computation for numerical and graph facts.

---

# 30. Security / Privacy

Dataset gids are anonymized identifiers.

Do not attempt to infer:

- names;
- IIN;
- age;
- gender;
- employer;
- income;
- real-world identity.

Do not enrich nodes using external personal data.

Do not send unnecessary raw transaction data to external LLM APIs.

Prefer sending only the minimum structured facts required for explanation.

---

# 31. Performance

Mandatory full pipeline:

    raw parquet → required CSV

must complete in under five minutes on a normal laptop.

Avoid unnecessary:

- all-pairs shortest paths;
- enumeration of every simple path;
- graph-wide node-removal simulation;
- repeated PageRank;
- repeated Louvain;
- per-node LLM calls.

Precompute reusable features once.

---

# 32. Scaling

Current dataset is small enough for Pandas + NetworkX.

For approximately 1 million nodes, the documented scaling strategy should
mention changes such as:

- move from NetworkX to igraph / graph-tool or another optimized graph engine;
- use vectorized or columnar processing;
- approximate betweenness rather than exact graph-wide calculation;
- preserve bitset-style seed propagation where applicable;
- use scalable Louvain/Leiden implementation;
- avoid generating full graph JSON;
- serve bounded subgraphs;
- precompute investigation features.

Implementation for 1M nodes is NOT required for the hackathon.

Documentation is required.

---

# 33. Testing Philosophy

Test analytical correctness, not just code execution.

Required unit-test areas:

- seed-mask propagation;
- percentile normalization;
- flow_balance;
- retention;
- role eligibility;
- depth=4 boundary;
- role selection;
- priority range;
- deterministic sorting;
- deterministic cluster IDs;
- CSV schema;
- gid serialization.

Use tiny synthetic graphs where expected results are obvious.

Example:

    S1 → A → X
    S2 → B → X

Expected:

    seed_reach_count(X) = 2

Tests should make analytical assumptions visible.

---

# 34. Development Priorities

Priority order:

## P0 — mandatory

1. Load and validate data
2. Build directed graph
3. Build base feature engine
4. Calculate Seed Convergence
5. Build deterministic Louvain communities
6. Calculate six independent role scores
7. Select roles and calculate priority
8. Generate deterministic evidence
9. Generate mandatory CSV outputs
10. Make `python main.py` reproducible
11. Run mandatory validation
12. Verify deterministic rerun

## P1 — high value

1. Generate product JSON
2. Add lightweight API
3. Maintain the frontend integration contract
4. Add calendar-date temporal signals
5. Add limitation flags and recommended next actions
6. Calculate resilience for top candidates

## P2 — optional after stability

1. AI Investigator
2. OpenAI tool calling
3. Advanced investigation tools
4. Additional anomaly analysis
5. Demo polish

---

# 35. Backend Agent Workflow

Before modifying backend code, every implementation agent must:

1. read `AGENTS.md`;
2. read `apps/backend/AGENTS.md`;
3. read `docs/moneygraph-investigator-design.md`;
4. read the relevant backend contract;
5. read the relevant MoneyGraph skill;
6. inspect existing implementation and tests;
7. run relevant tests before and after changes;
8. never modify `apps/frontend`;
9. report files changed and actual test results; and
10. never claim completion if tests were not executed.
