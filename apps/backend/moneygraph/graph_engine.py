from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from math import log1p
from typing import Any

import networkx as nx
import pandas as pd


@dataclass(frozen=True)
class GraphDiagnostics:
    weak_component_count: int
    scc_count: int
    cyclic_scc_count: int
    nodes_in_cyclic_sccs: int
    largest_cyclic_scc: int
    internal_cyclic_scc_edges: int
    self_loop_count: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def gid_text(value: object) -> str:
    """Serialize an integer gid without any floating-point conversion."""
    return str(int(value))


def build_graphs(nodes: pd.DataFrame, edges: pd.DataFrame) -> tuple[nx.DiGraph, nx.Graph]:
    """Build canonical directed flow graph and separate weighted undirected projection."""
    directed = nx.DiGraph()
    for row in nodes.sort_values("gid", kind="stable").itertuples(index=False):
        directed.add_node(gid_text(row.gid), depth=int(row.depth), is_seed=bool(row.is_seed))
    for row in edges.sort_values(["src", "dst"], kind="stable").itertuples(index=False):
        directed.add_edge(
            gid_text(row.src), gid_text(row.dst), sum_kzt=float(row.sum_kzt),
            n_tx=int(row.n_tx), edge_depth=int(row.depth),
        )

    pair_amounts: dict[tuple[str, str], float] = {}
    for source, target, attrs in directed.edges(data=True):
        pair = tuple(sorted((source, target)))
        pair_amounts[pair] = pair_amounts.get(pair, 0.0) + float(attrs["sum_kzt"])
    undirected = nx.Graph()
    undirected.add_nodes_from(directed.nodes(data=True))
    for (left, right), total in sorted(pair_amounts.items()):
        undirected.add_edge(left, right, sum_kzt=total, weight=log1p(total))
    return directed, undirected


def graph_diagnostics(graph: nx.DiGraph) -> GraphDiagnostics:
    components = list(nx.strongly_connected_components(graph))
    cyclic = [component for component in components if len(component) > 1]
    cyclic_sets = [set(component) for component in cyclic]
    internal_edges = sum(
        sum(1 for source, target in graph.edges() if source in component and target in component)
        for component in cyclic_sets
    )
    return GraphDiagnostics(
        weak_component_count=nx.number_weakly_connected_components(graph),
        scc_count=len(components), cyclic_scc_count=len(cyclic),
        nodes_in_cyclic_sccs=sum(map(len, cyclic)),
        largest_cyclic_scc=max((len(component) for component in cyclic), default=0),
        internal_cyclic_scc_edges=internal_edges,
        self_loop_count=nx.number_of_selfloops(graph),
    )


def community_size_distribution(cluster_ids: dict[str, int]) -> dict[str, int]:
    counts = Counter(cluster_ids.values())
    distribution = Counter(counts.values())
    return {str(size): count for size, count in sorted(distribution.items())}
