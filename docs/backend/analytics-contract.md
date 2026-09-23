# Deterministic analytics contract

This document restates the approved design; implementation detail belongs here,
not in an LLM prompt. `edges.parquet` builds the directed money graph. Louvain
alone uses its undirected projection with edge weight `log1p(sum_kzt)`,
`resolution=1.0`, and `seed=42`. Sort communities by minimum gid then size and
assign sequential cluster IDs.

For every feature `pct_depth(x)` is calculated within nodes at the same depth.
For a valid, non-constant group of size `N > 1`, assign ascending average ranks
for ties and return `(average_rank(x)-1)/(N-1)`, clipped to `[0,1]`. Return 0 for
`N == 1`, unavailable/invalid values, or a constant group. Keep raw values for
evidence. Scores are clipped/bounded to `[0,1]`.

## Features and seed convergence

Calculate degrees, unique counterparties, observed inbound/outbound KZT,
weighted degrees, concentration, directed weighted PageRank (`alpha=.85`),
directed weighted betweenness with distance `1/log1p(sum_kzt)`, weak components,
and distinct neighboring communities (excluding own cluster).

The canonical directed graph is not a DAG. `nodes.depth` is minimum discovery
generation and `edges.depth == src.depth + 1` for all supplied edges; destination
depth may be same or earlier. Sort seed gids and adjacency lists by gid. For each
seed, run directed BFS over the complete canonical graph with a visited set and
OR that seed's bit into every reached node mask. `seed_reach_count=popcount(mask)`
counts distinct seed gids with an observed directed path, not paths or money
matching. `seed_convergence=pct_depth(seed_reach_count)`. This is deterministic,
preserves every edge, and costs `O(S × (V + E))`.

`retention_obs=incoming/(incoming+outgoing)` when denominator >0 else 0.
`flow_balance=max(0,1-abs(log((outgoing+1)/(incoming+1))))`, clipped to `[0,1]`.
`continuation=1` only with observed incoming and outgoing edges.

## Roles and selection

```text
consolidator=.30*senders_pct+.25*inbound_volume_pct+.30*seed_convergence+.15*retention_obs
transit=.25*mean(in_degree_pct,out_degree_pct)+.30*flow_balance+.25*timing_consistent_turnover+.20*continuation
distributor=.50*receivers_pct+.25*outbound_volume_pct+.25*out_degree_pct
terminal=.50*inbound_volume_pct+.30*retention_obs+.20*no_observed_outgoing
coordinator=.30*pagerank_pct+.30*betweenness_pct+.20*bridge_pct+.20*seed_convergence
peripheral=clip(1-max(eligible non-peripheral scores, default=0),0,1)
```

Transit is eligible only at depths 1–3. Terminal is eligible only at depths 1–3
with `incoming_kzt>0`; depth 4 receives `observation_boundary`, never terminal
solely because outgoing is zero. Select peripheral when every non-peripheral
score is below .55; otherwise choose the highest eligible non-peripheral score.
Store applicability and limitation flags in node cards. For equal eligible non-peripheral scores, select the first role in this fixed order: `coordinator`, `consolidator`, `transit`, `distributor`, `terminal`.

## Temporal, priority, resilience, evidence

An outgoing transaction on day d qualifies for timing-consistent turnover if
inbound activity exists on d, d-1, or d-2. Divide qualifying outgoing KZT by all
outgoing KZT. `burst_pct` ranks maximum daily transaction count; synchronous
incoming ranks maximum unique daily senders. Dates imply no intraday claim.

`centrality=.5*pagerank_pct+.5*betweenness_pct`; `temporal=max(turnover,burst,sync)`.
Role weights are coordinator/consolidator 1.0, transit .85, distributor .80,
terminal .45, peripheral .15. `preliminary_priority` is the final priority formula
with `resilience_pct=0`; sort it by descending score then ascending gid and select
its first 50 nodes. Remove one candidate at a time: `resilience_raw=.5*(L0-L1)/L0+.5*(R0-R1)/R0` with
zero-safe denominators. Rank only that candidate set; all other nodes receive
`resilience_pct=0`, then calculate final priority.

```text
priority=.30*(role_weight*role_score)+.25*seed_convergence+.15*centrality
       +.15*observed_volume_pct+.10*temporal+.05*resilience_pct
```

Round exported scores to six decimals. Sort Top-20 by priority descending then
gid ascending. Evidence is deterministic, cautious, factual, and <=200 chars.

Depth-4 retention is retained as observed data but excluded from consolidator inference; it is unreliable because the observation boundary truncates outgoing visibility. Consumer views must show role eligibility separately from theoretical score.

Completion: daily incident transaction counts include both endpoints, preserving duplicate transactions; daily incoming sender counts are distinct. All product gids are strings and role scores expose eligibility. Published CSV/JSON ranking uses six-decimal priority then gid.
