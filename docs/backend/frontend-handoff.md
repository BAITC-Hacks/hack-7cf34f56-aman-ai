# Backend handoff — implemented

Run `python main.py` to regenerate all CSVs, `node_cards.json`, `graph.json` and
`analytics_diagnostics.json`. All gids, edge src/dst and path elements are strings.
Scores are heuristic signals, not probabilities of guilt.

The API loads artifacts once at startup, does no analytical recalculation per
request and must be restarted after regenerating results.

## Running

```bash
python -m pip install -r apps/backend/requirements-api.txt
python -m uvicorn moneygraph.api:app --app-dir apps/backend --host 127.0.0.1 --port 8000
```

CORS permits localhost:5173 and 127.0.0.1:5173. Frontend is unchanged.

## Actual endpoints

- `GET /health`: `{"status":"ok","artifacts_ready":true}`. If artifacts are
  missing, health still works; data endpoints return 503 with regeneration advice.
- `GET /api/top-nodes?limit=20`: array of rank/gid/role/priority_score/why;
  limit 1–100, same deterministic ordering as CSV.
- `GET /api/nodes/{gid}`: full card.
- `GET /api/nodes/{gid}/subgraph?hop=1`: nodes, directed edges, center_gid,
  hop, truncated, total_nodes, limitations. Hop 1 or 2, at most 250 nodes.
  Neighborhood discovery ignores direction only for local display, while returned
  edges preserve direction. Cap keeps center then nearest nodes then gid order.
- `GET /api/clusters/{cluster_id}`: cluster_id, n_nodes, n_seed,
  sum_kzt_internal, top_gids array, hypothesis, members, limitations.
- `GET /api/search?gid=100000&limit=20`: exact match first or prefix matches;
  maximum 50, gid ascending.
- Unknown nodes/clusters: 404. Malformed gid or out-of-range numeric hop: 400.
  Invalid integer parameters / query limits: 422.

## Product files

`node_cards.json` is a mapping from string gid to card; `graph.json` contains
`nodes` and `edges` arrays. A graph node has gid, depth, is_seed, role,
role_score, priority_score, cluster_id. Edges have src, dst, sum_kzt, n_tx.

A card adds:
- `score_breakdown`: all six roles, each with score, eligible, ineligible_reason
  (null when eligible). **Show N/A for ineligible scores**; theoretical score may
  be displayed only with its ineligible reason.
- `metrics`: raw flows/degrees, retention, flow balance, centralities and
  percentiles, seed count/convergence, temporal signals and raw daily maxima.
- `priority_components`: six weighted contributions, summing to priority
  within the six-decimal export tolerance.
- `evidence`, `limitations`, `next_action`, `incoming_edges`, `outgoing_edges`.

Limitations include observed_graph_only; seed nodes also have
seed_incoming_incomplete; depth 4 adds observation_boundary and
retention_boundary_unreliable. Temporal values describe calendar-date consistency
and do not match individual incoming funds to outgoing transactions.
Read actual generated cards for integration; examples/*.mock.json are historical
mock examples, not authoritative output.

Optional `POST /api/investigate` accepts `question` (1–2000 characters) and
optional string `context_gid`. It returns answer, ordered tools_used, compact
evidence, limitations, critic status, and bounded tool_calls. Missing OpenAI
configuration/SDK or exhausted evidence budget: 503; OpenAI provider failure:
502; unknown context: 404. NVIDIA failure keeps the OpenAI answer and returns
`critic.used=false`. Treat model prose as an investigation hypothesis; tool
results are authoritative and do not change roles or priority. The frontend
never receives either provider key. Exact schema: [ai-chat-handoff.md](ai-chat-handoff.md).
