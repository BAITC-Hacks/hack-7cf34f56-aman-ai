# AI Investigator and Evidence Critic

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
| get_methodology_context | topic | deterministic definitions for generic methodology questions |

Every result carries limitation flags. Send minimum structured data to external
models; AI remains optional and cannot affect mandatory CSVs.

## Implemented completion

All eight bounded tools are implemented in moneygraph/investigation_tools.py.
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

The investigator uses one authoritative semantic glossary for prompts and tool
payloads. It distinguishes graph degree from transaction count, percentile rank
from a raw percentage, target gid from source seed gids, and depth 4 from ordinary
node depth. Seed-path results explicitly expose `target_gid` and `target_is_seed`.
Generic questions about the observation boundary use deterministic methodology
facts instead of consuming the node-tool loop.

Before a draft reaches the analyst, a deterministic validator checks supported
metric values and the high-risk semantic distinctions above. A failed draft gets
at most one constrained correction turn with no additional tools. If that answer
still fails, the backend returns a conservative deterministic fallback. Repeated
identical tool calls reuse their result within the investigation.

## Live chat contract

`POST /api/investigate` accepts `question` and an optional decimal-string
`context_gid`. The OpenAI Responses loop must call at least one deterministic
tool before answering. The response contains `answer`, ordered `tools_used`,
compact deterministic `evidence`, merged `limitations`, validated `critic`
metadata, and the bounded `tool_calls` trace. It never exposes private reasoning,
prompts, credentials, Authorization headers, or raw Parquet files.

NVIDIA is an optional evidence critic, not an investigator. It receives the
analyst question, grounded OpenAI draft, compact evidence, bounded tool results,
and limitations. Its JSON result is validated against a strict local schema.
Approval keeps the OpenAI draft; a valid rejection replaces it with the critic's
conservative corrected answer. Missing configuration, timeout, provider error,
or malformed JSON returns `critic.used=false` and keeps the grounded OpenAI draft.

Environment names are `OPENAI_API_KEY`, `OPENAI_MODEL`, `NVIDIA_API_KEY`,
`NVIDIA_MODEL`, and `NVIDIA_BASE_URL`. Store values only in ignored `.env.local`
and load them into the API process. The repository's `.env.example` records the
current non-secret model/base URL configuration. Mandatory analytics remain
independent of every provider.

Validation includes installed-SDK tool roundtrips through mock HTTP, strict critic
approval/rejection validation, malformed/timeout fail-open behavior, context GID,
semantic-validator failures, one-turn correction/fallback, generic methodology
routing, seed target semantics, and artifact immutability. Live authentication
still requires valid local keys.
Implementation follows [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
API testing follows [FastAPI's test client guide](https://fastapi.tiangolo.com/tutorial/testing/).
