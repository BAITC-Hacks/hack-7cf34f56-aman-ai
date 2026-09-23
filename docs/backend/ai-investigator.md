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

## Implemented completion

All seven required tools are implemented in moneygraph/investigation_tools.py.
Common downstream accepts 1–10 known seeds, max_depth 1–4, limit 1–50.
Paths are simple, at most four edges and five results, sorted by transformed
distance then gid sequence. A 20,000-state budget returns search_truncated when
exhausted; results then describe discovered candidates, not exhaustive absence.
Seed paths are bounded reverse-BFS witnesses, while the displayed reach count
still comes from complete production BFS.
Node edge samples are capped at ten per direction; cluster tools omit full
member lists; comparisons are limited to ten nodes. Every result has limitations.
API/CLI are optional; six model rounds / twelve calls / 30s request timeout.

Configured via OPENAI_API_KEY and OPENAI_MODEL. No key is read from or saved to
project files. Missing configuration fails gracefully. Main.py does not import
this module or SDK. Model answers cannot modify any artifact.
Responses uses strict function schemas, store=False, function_call_output and
reasoning encrypted content for stateless multi-turn context. Tool evidence is
required before an answer; invalid calls return structured errors.
Tool traces are returned beside the explanation for independent inspection.

Validation includes an actual installed SDK roundtrip through mock HTTP and
deterministic tools. This does not prove live authentication/model availability;
no live call was possible during completion because no API key/model was set.
The official documentation MCP was unavailable in this session. Implementation
was checked against [official function calling documentation](https://developers.openai.com/api/docs/guides/function-calling).
API testing follows [FastAPI's test client guide](https://fastapi.tiangolo.com/tutorial/testing/).
