from __future__ import annotations

import networkx as nx
import pandas as pd


def compute_communities(directed: nx.DiGraph, undirected: nx.Graph) -> tuple[dict[str, int], pd.DataFrame]:
    """Run fixed-seed Louvain and assign cluster ids independent of set iteration."""
    communities = nx.community.louvain_communities(undirected, weight="weight", resolution=1.0, seed=42)
    ordered = sorted((sorted(community) for community in communities), key=lambda community: (community[0], len(community)))
    cluster_ids = {gid: cluster_id for cluster_id, community in enumerate(ordered, start=1) for gid in community}
    internal = {cluster_id: 0.0 for cluster_id in range(1, len(ordered) + 1)}
    for source, target, attrs in directed.edges(data=True):
        if cluster_ids[source] == cluster_ids[target]:
            internal[cluster_ids[source]] += float(attrs["sum_kzt"])
    rows = []
    for cluster_id, community in enumerate(ordered, start=1):
        rows.append({
            "cluster_id": cluster_id,
            "n_nodes": len(community),
            "n_seed": sum(bool(directed.nodes[gid]["is_seed"]) for gid in community),
            "internal_observed_kzt": internal[cluster_id],
        })
    return cluster_ids, pd.DataFrame(rows)
