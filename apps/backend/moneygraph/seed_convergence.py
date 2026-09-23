from __future__ import annotations

import networkx as nx
import pandas as pd

from .features import pct_depth


def compute_seed_convergence(graph: nx.DiGraph, features: pd.DataFrame) -> pd.DataFrame:
    """Run deterministic per-seed BFS over the complete directed graph."""
    masks = {gid: 0 for gid in graph.nodes}
    seeds = sorted(gid for gid, attrs in graph.nodes(data=True) if attrs.get("is_seed"))
    adjacency = {gid: sorted(graph.successors(gid)) for gid in graph.nodes}
    for bit_index, seed in enumerate(seeds):
        bit = 1 << bit_index
        visited = {seed}
        queue = [seed]
        for gid in queue:
            masks[gid] |= bit
            for target in adjacency[gid]:
                if target not in visited:
                    visited.add(target)
                    queue.append(target)
    result = features.copy()
    result["seed_mask"] = result["gid"].map(masks).astype(object)
    result["seed_reach_count"] = result["seed_mask"].map(int.bit_count).astype(int)
    result["seed_convergence"] = pct_depth(result["seed_reach_count"], result["depth"])
    return result
