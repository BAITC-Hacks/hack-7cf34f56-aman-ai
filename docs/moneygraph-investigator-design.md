# MoneyGraph Investigator: design

Status: APPROVED.
Decision: pipeline + API + independent frontend.

## Product

The tool starts with 81 known seed clients and reconstructs the observed downstream structure of a four-hop transaction export. It assigns an explainable role to every one of 2,248 nodes, ranks investigation targets, and states limitations rather than claims of guilt.

## Architecture

```text
Parquet → validate → directed graph → feature table → Louvain communities
        → role scores → priority + evidence → CSV + JSON → API → UI
                                                       └→ optional AI tools
```

`python main.py` is the mandatory local pipeline. It creates `nodes_roles.csv`, `clusters.csv`, and `top_nodes.csv` in under five minutes. The UI and AI never block these outputs.

## Non-negotiable data rules

- Preserve gid as a string at the API/frontend boundary; JavaScript numbers would round it.
- Directed edges go only from depth `n` to `n+1`. Do not pitch cycles or return flows for this export.
- Transactions have dates, not times. Temporal claims are same day or one to two days, never minutes.
- `depth=4` is an observation boundary. A zero outgoing degree there is never sufficient terminal evidence.
- Louvain uses a weighted undirected projection only for communities; flow analysis retains the directed graph.
- AI only calls tools and explains calculated facts. It is not a source of roles or scores.

Run communities with `networkx.louvain_communities(undirected_graph, weight="weight", resolution=1.0, seed=42)`. After detection, sort communities by their minimum gid and then size; assign sequential `cluster_id` values in that order. This makes cluster IDs stable across pipeline runs.

## Feature engine

For each gid, calculate: in/out degree, unique senders/recipients, observed inbound/outbound KZT, weighted degree, amount concentration, directed weighted PageRank, betweenness, weak component, community bridge count, and observed pass-through/retention ratios.

`edges.parquet` is the canonical source for all graph, degree, and KZT-volume features because it is the monthly aggregation. Validate it against aggregation of `transactions.parquet`; use transactions only for date-based features. Reject missing or negative KZT, self-loops, duplicate edge pairs, or any src/dst absent from nodes. `amount_concentration` is the largest incident edge amount divided by total observed inbound plus outbound amount. A weak component is computed on the undirected projection. A neighbouring community is a distinct cluster ID of either a predecessor or successor; count each cluster once and exclude the node's own cluster.

### Seed convergence

Give each of the 81 seeds one bit in an 81-bit mask. Process nodes from depth 0 to 4; OR inbound masks at every node. The popcount is `seed_reach_count`, the number of distinct seed branches that can reach a node. Normalize it as `seed_convergence_score`. This is the primary differentiator, but remains evidence of convergence rather than proof that the same funds arrived.

Use `transactions.parquet` for same-day/one-to-two-day pass-through, daily bursts, and synchronized incoming activity. Keep duplicate transaction rows because no transaction ID exists.

Run Louvain on the undirected graph with `log1p(sum_kzt)` weights. For top candidates only, simulate removal and measure impact on largest weak component and seed reachability.

## Role engine

Use independent percentile-ranked scores within a relevant depth group, never a trained classifier and never global hard-coded rules.

| Role | Signals | Guardrail |
|---|---|---|
| consolidator | sender count, inbound volume, seed convergence, observed retention | State signs of consolidation only. |
| transit | in/out similarity, two-sided degree, same/next-day pass-through, continuation | Primarily depths 1–3. |
| distributor | recipient count, outbound volume, fan-out | No assertion about recipients. |
| terminal | inbound activity, low observed outgoing activity | Only depth under 4. |
| coordinator | betweenness, PageRank, bridges, convergence, resilience | Structural hypothesis only. |
| peripheral | no stronger score | Explain the lack of observed pattern. |

Each score is in `[0,1]`; the maximum is the role and `role_score`. Start with a configurable 0.55 confidence floor, then calibrate it from real score distributions.

## Priority and evidence

```text
priority = 0.30 role importance/confidence
         + 0.25 seed convergence
         + 0.15 centrality and bridge contribution
         + 0.15 observed flow volume
         + 0.10 temporal or motif significance
         + 0.05 resilience impact
```

Evidence is template-based and uses actual values. Example: `Признаки консолидации: 11 отправителей, 6 seed-веток, входящий объём в топ-3% кластера.` Boundary limitations appear in the node card and lead to a next-data recommendation.

## Formal scoring specification

This section is the implementation contract for the second hour. `pct_depth(x)` is the tie-aware percentile rank of `x` among nodes at the same depth; a constant or unavailable feature receives `0`. Keep raw values for evidence. The feature `seed_convergence` is `pct_depth(seed_reach_count)`: raw `seed_reach_count` means the number of distinct seed gids having at least one observed directed path to the node, not independent paths.

`retention_obs = incoming_kzt / (incoming_kzt + outgoing_kzt)` when the denominator is positive, otherwise `0`. `flow_balance = max(0, 1 - abs(log((outgoing_kzt + 1)/(incoming_kzt + 1))))`. Values are clipped to `[0,1]`.

```text
consolidator = .30*senders_pct + .25*inbound_volume_pct
             + .30*seed_convergence + .15*retention_obs

transit = .25*mean(in_degree_pct, out_degree_pct) + .30*flow_balance
        + .25*timing_consistent_turnover + .20*continuation
        eligible only at depth 1..3

distributor = .50*receivers_pct + .25*outbound_volume_pct
            + .25*out_degree_pct

terminal = .50*inbound_volume_pct + .30*retention_obs + .20*no_observed_outgoing
         eligible only at depth 1..3 and incoming_kzt > 0

coordinator = .30*pagerank_pct + .30*betweenness_pct
            + .20*bridge_pct + .20*seed_convergence

peripheral = 1 - max(consolidator, transit, distributor, terminal, coordinator)
```

`continuation` is 1 when a node has observed incoming and outgoing edges, otherwise 0. `timing_consistent_turnover` is the share of outgoing KZT on the same day or next two calendar days after a day with inbound activity; it is a timing-consistent signal, not transaction matching. If the temporal module is unavailable, it is 0. `bridge_pct` is the percentile rank of the number of distinct neighbouring communities. `PageRank` is weighted directed PageRank with `alpha=0.85`. Betweenness uses the directed graph with edge distance `1/log1p(sum_kzt)` so larger KZT values represent shorter, stronger routes.

Operationally, an outgoing transaction on day `d` qualifies for timing-consistent turnover when the node has inbound activity on `d`, `d-1`, or `d-2`; divide qualifying outgoing KZT by all observed outgoing KZT. `burst_pct` is the percentile rank of a node's maximum daily transaction count among nodes at the same depth. `synchronous_incoming_pct` is the percentile rank of its maximum number of unique senders on one day. `observed_volume_pct` is `pct_depth(incoming_kzt + outgoing_kzt)`.

Choose the highest eligible role score. If every non-peripheral score is below `.55`, select `peripheral`; otherwise select the highest non-peripheral score. Store all six scores, applicability flags, and limitation flags in the node-card payload.

For priority, define `centrality=.5*pagerank_pct+.5*betweenness_pct`, `temporal=max(timing_consistent_turnover, burst_pct, synchronous_incoming_pct)`, and use zero for unavailable optional components. `role_weight` is 1.0 for coordinator/consolidator, .85 for transit, .80 for distributor, .45 for terminal, and .15 for peripheral.

`resilience_pct` is calculated one node at a time for the candidate set of the top 50 preliminary-priority nodes. Let `L0` be the largest weak-component size and `R0` the count of reachable ordered `(seed, non-seed)` pairs in the directed graph. After removing the node and its incident edges, calculate `L1` and `R1`; `resilience_raw=.5*((L0-L1)/L0)+.5*((R0-R1)/R0)`, with zero-safe denominators. `resilience_pct` is the percentile rank of `resilience_raw` within that candidate set; all other nodes receive zero.

```text
priority = .30*(role_weight*role_score) + .25*seed_convergence
         + .15*centrality + .15*observed_volume_pct
         + .10*temporal + .05*resilience_pct
```

The engine rounds exported scores to six decimals and sorts Top-20 by `priority_score DESC, gid ASC`.

## Required CSV contract

All CSV files are UTF-8, comma separated, include a header, and preserve `gid` as unquoted decimal text without scientific notation.

| File | Exact columns |
|---|---|
| `nodes_roles.csv` | `gid,role,role_score,cluster_id,priority_score,evidence` |
| `clusters.csv` | `cluster_id,n_nodes,n_seed,sum_kzt_internal,top_gids,hypothesis` |
| `top_nodes.csv` | `rank,gid,role,priority_score,why` |

Validation fails if `nodes_roles.csv` does not contain exactly 2,248 unique gids, a role outside the fixed enum, a missing evidence string, or any score outside `[0,1]`. `top_nodes.csv` contains exactly 20 rows for this data. A deterministic validation reruns the pipeline and compares all CSV bytes after stable sorting.

For `clusters.csv`, `n_seed` counts seed nodes physically assigned to the community; `sum_kzt_internal` sums directed edge KZT whose endpoints share the cluster ID; `top_gids` contains the three highest-priority gids joined by `|`; and `hypothesis` is a deterministic template from cluster size, seed count, internal turnover, and top-role mix. Mandatory CSV generation never calls an LLM.

## API contract

In addition to mandatory CSVs, write `results/node_cards.json` and `results/graph.json`.

```text
GET /api/top-nodes
GET /api/nodes/{gid}
GET /api/nodes/{gid}/subgraph?hop=1
GET /api/clusters/{cluster_id}
GET /api/search?gid=
GET /health
```

`node_cards.json` includes score breakdown, priority components, observed flows, seed reach count, limitation flags, incident edges, and recommended next action. Freeze this contract before backend/frontend integration.

```json
{"gid":"100000003684369100","role":"consolidator","role_score":0.91,
 "priority_score":0.87,"cluster_id":4,"seed_reach_count":6,
 "limitations":["observed transactions only"],"next_action":"Review downstream transfers",
 "edges":[{"src":"...","dst":"...","sum_kzt":678000.0}]}
```

`graph.json` is `{ "nodes": [{"gid":"...","role":"...","cluster_id":4}], "edges": [{"src":"...","dst":"...","sum_kzt":678000.0}] }`.

`GET /api/nodes/{gid}` returns 404 for an unknown gid. `hop` is limited to 1 or 2 and subgraphs are capped at 250 nodes. `find_common_downstream` accepts a maximum depth and result limit. `get_paths` returns at most five simple paths with at most four edges, ordered by total transformed distance then lexicographic gid sequence; repeated nodes are excluded. AI tool responses must include limitation flags and evidence snippets.

## UI

Start at Top-20 and gid search. A node card shows role, confidence, priority, cluster, observed flows, connected seed count, evidence, limitations, next request, and a directed one-hop or cluster subgraph. Do not draw all 2,248 nodes simultaneously.

## Optional work, only after must-have

1. Boundary uncertainty, node cards, next-data recommendations.
2. Same-day/one-to-two-day temporal evidence and daily synchronization.
3. Resilience for top candidates.
4. Depth-normalized anomaly flag.
5. OpenAI Investigator with `get_node`, `get_cluster`, `find_common_downstream`, `get_paths`, and `get_temporal_patterns`.

## Five-hour schedule

1. Hour 1: validation, graph, feature table, seed masks, Louvain; frontend works on mock contract.
2. Hour 2: roles, priority, evidence, mandatory CSVs; validate all must-have.
3. Hour 3: real Top-20, search, node card, local graph, cluster view.
4. Hour 4: temporal and resilience; AI only if deterministic demo is stable.
5. Hour 5: clean run, README, solution diagram, three real gids, demo rehearsal.

## Success criteria

- 2,248 complete role rows and all required CSV columns.
- Every role and ranking can be traced to metrics.
- No depth-4 node is terminal solely due to zero outgoing edges.
- The UI finds any named gid and shows its directed links.
- Two local pipeline runs on the same data produce identical required CSV files.
