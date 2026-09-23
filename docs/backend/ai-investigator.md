# AI Investigator (P2)

`Analyst question → LLM tool selection → deterministic tool → structured facts → LLM explanation`.
The LLM may explain returned facts and limitations; it must never invent graph
facts, roles, scores, paths, or recommendations as observations.

| Tool | Input | Output / limits / errors |
|---|---|---|
| get_node | string gid | node card; 404 unknown |
| get_cluster | cluster_id | cluster facts; 404 unknown |
| find_common_downstream | seed_gids, max_depth, limit | string gids + counts; bounded depth/result limit |
| get_paths | source_gid,target_gid | <=5 simple <=4-edge paths; invalid/unknown errors |
| get_seed_paths | gid | bounded observed seed paths + limitations |
| get_temporal_patterns | gid | date-level signals only; unavailable flag |
| compare_nodes | gids | bounded factual comparison |
| simulate_node_removal | gid | optional candidate-only resilience result |

Every result carries limitation flags. Send minimum structured data to external
models; AI remains optional and cannot affect mandatory CSVs.
