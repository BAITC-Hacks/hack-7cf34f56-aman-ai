# Backend handoff

Frontend-owned code remains under `apps/frontend`; this document only states
backend guarantees. P0 generates `nodes_roles.csv`, `clusters.csv`, and
`top_nodes.csv`. P1 may generate `node_cards.json`, `graph.json`, and the API in
`api-contract.md`. Every gid in JSON/API payloads is a **string**.

Guaranteed fields: Top-20 rank/gid/role/priority/why; node role, score, priority,
cluster, observed flows, seed reach count, evidence, limitation flags, next action,
and directed incident edges; cluster size, seeds, internal KZT, top gids, and
hypothesis; bounded local subgraph nodes and directed edges. Role enum is the six
values in `output-contract.md`. Optional fields (temporal, resilience, AI answer)
may be unavailable and must be represented with null/flags, not fabricated.

MOCK payloads in `docs/backend/examples/` are safe integration shapes only and
are not actual HackAlem results.
