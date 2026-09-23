# API contract — implemented
The read-only API serves precomputed results; it is never imported by main.py.
See [frontend-handoff.md](frontend-handoff.md) for exact payloads, commands,
errors, CORS and bounds. REST data endpoints are GET /health, /api/top-nodes,
/api/nodes/{gid}, /api/nodes/{gid}/subgraph, /api/clusters/{cluster_id},
/api/search. Numeric JSON gids are forbidden. AI is a separate optional module.
