# Data contract

Observed sources are `data/nodes.parquet`, `data/edges.parquet`, and
`data/transactions.parquet`. The official case declares 2,248 nodes, 3,119
aggregated edges, 4,840 transactions, 81 seeds, dates 2026-07-01..2026-07-31,
and total turnover 365,890,012 KZT. Validate rather than hard-code counts.

| File / field | Observed/declared dtype | Meaning and canonical use | Validation / limitation |
|---|---|---|---|
| nodes.gid | int64 | client ID; universe | non-null, unique; preserve exact decimal |
| nodes.depth | int64 | minimum traversal generation | integer 0..4 |
| nodes.is_seed | boolean | known starting client | validate seed count; seed incoming incomplete |
| edges.src, edges.dst | int64 | payer and receiver | non-null nodes; directed `src→dst`; no self-loop |
| edges.sum_kzt | double | monthly aggregate KZT | finite, non-negative; canonical graph amount |
| edges.n_tx | int64 | aggregate transaction count | positive integer; reconcile to transactions |
| edges.depth | int32 | source expansion depth + 1 (observed) | verify `edges.depth == src.depth + 1`; actual target depth may be same/earlier |
| transactions.src,dst | int64 | transaction endpoints | endpoints in nodes |
| transactions.date | date | calendar date | parseable; no time-of-day inference |
| transactions.sum_kzt | double | transaction amount | finite, non-negative; retain duplicate rows |

The source export follows outgoing-only traversal from 81 seeds to depth 4; the
threshold excludes transfers below 5,000 KZT. It lacks customer attributes and
role ground truth. At depth 4, absent outgoing activity is an observation boundary.
Transactions have dates only. Do not deduplicate transactions without a transaction
ID. Unknown source semantics must be recorded as `UNKNOWN`, never invented.


## Audited graph structure

The supplied files match declared row counts and schema. For all 3,119 edges,
`edges.depth == src.depth + 1`; 745 have `dst.depth <= src.depth`. These are
canonical directed edges and must remain in all graph analysis. `nodes.depth`
therefore represents minimum discovery generation, while `edges.depth` represents
the source outgoing traversal step. The graph has 2,023 SCCs, including 84 cyclic
SCCs of size >1 (309 nodes, largest 85), and no self-loops. Cycle analysis remains
optional; deterministic per-seed BFS handles reachability.
