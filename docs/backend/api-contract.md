# API contract (P1)

The API is optional and reads deterministic P0/P1 artifacts. It never blocks
`python main.py`. All gid values/parameters are decimal strings.

| Endpoint | Purpose | Response / errors / limits |
|---|---|---|
| `GET /health` | process health | `{ "status":"ok" }`; no analytical dependency |
| `GET /api/top-nodes` | ranked candidates | top-node array; optional bounded `limit`, max 100 |
| `GET /api/nodes/{gid}` | node card | card object; 400 malformed gid, 404 unknown gid |
| `GET /api/nodes/{gid}/subgraph?hop=1` | local directed graph | nodes/edges; hop only 1/2, max 250 nodes; 400/404 |
| `GET /api/clusters/{cluster_id}` | cluster details | cluster + member summary; 404 unknown cluster |
| `GET /api/search?gid=` | exact gid lookup | matching node or empty list; string gid only |
| `POST /api/investigate` | reserved P2 AI | not implemented until tool contract is stable |

MOCK node response: `{ "gid":"100000003684369100", "role":"consolidator",
"role_score":0.91, "cluster_id":4, "priority_score":0.87,
"limitations":["observed transactions only"], "next_action":"Review downstream transfers" }`.
No endpoint claims guilt, exposes numeric JSON gids, or silently expands a bounded
subgraph.
