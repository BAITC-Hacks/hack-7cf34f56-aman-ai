# Output contract

P0 outputs under `results/`, UTF-8 comma-separated with headers and six-decimal
score precision:

| File | Exact columns | Ordering |
|---|---|---|
| nodes_roles.csv | `gid,role,role_score,cluster_id,priority_score,evidence` | gid ascending |
| clusters.csv | `cluster_id,n_nodes,n_seed,sum_kzt_internal,top_gids,hypothesis` | cluster_id ascending |
| top_nodes.csv | `rank,gid,role,priority_score,why` | priority DESC, gid ASC |

Role enum: `consolidator`, `transit`, `distributor`, `terminal`, `coordinator`,
`peripheral`. CSV gids are exact decimal text without scientific notation. Scores
are non-null and in `[0,1]`; evidence/why are nonempty and evidence <=200 chars.
`top_nodes.csv` has at least 20 rows (exactly 20 for current data).

P1 output files are `results/node_cards.json` and `results/graph.json`. Every gid
in JSON is a string. Null means unavailable/unknown; use limitation flags rather
than treating unknown as zero in explanation. `top_gids` is `|`-joined string ids.
Examples in `docs/backend/examples/` are **MOCK**, not analytical output.

Product JSON is implemented. node_cards.json maps string gid to a full card;
graph.json has node/edge arrays. See frontend-handoff.md for eligibility metadata
and weighted priority components. Exported global ranking uses published
six-decimal scores, then gid; Top-20 is validated against that complete ranking.
