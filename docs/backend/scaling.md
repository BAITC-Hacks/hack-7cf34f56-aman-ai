# Scaling beyond the hackathon graph

NetworkX is appropriate for the current ~2k-node graph, not a 1M-node service.
At scale, use a columnar ingestion path and igraph, graph-tool, or another
optimized engine; replace exact betweenness with approximation; use scalable
Louvain/Leiden; retain compact bitset seed propagation; precompute/cache node and
cluster features; serve bounded subgraphs only; and avoid full-graph JSON.
Caching/API keys must preserve string gids and reproducible analytics versions.
This is an explanation only, not a requirement to implement 1M-node infrastructure.
