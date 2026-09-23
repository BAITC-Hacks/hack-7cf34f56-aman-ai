# API contract — implemented
The read-only API serves precomputed results; it is never imported by main.py.
See [frontend-handoff.md](frontend-handoff.md) for exact payloads, commands,
errors, CORS and bounds. REST data endpoints are GET /health, /api/top-nodes,
/api/nodes/{gid}, /api/nodes/{gid}/subgraph, /api/clusters/{cluster_id},
/api/search. Numeric JSON gids are forbidden. AI is a separate optional module.

`POST /api/investigate` accepts:

```json
{"question":"Почему узел важен?","context_gid":"100000003115284100"}
```

`context_gid` is optional and always a decimal string. Success returns `answer`,
`tools_used`, deterministic `evidence`, `limitations`, `critic`, and bounded
`tool_calls`. Missing OpenAI configuration is 503; provider failure is 502;
unknown context is 404; validation failure is 422. NVIDIA unavailability never
changes the HTTP success of an otherwise grounded OpenAI answer.
