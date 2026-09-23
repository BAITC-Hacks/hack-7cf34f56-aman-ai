from __future__ import annotations

from math import log

import networkx as nx
import numpy as np
import pandas as pd


def pct_depth(values: pd.Series, depths: pd.Series) -> pd.Series:
    """Deterministic same-depth average-rank percentile with documented fallbacks."""
    result = pd.Series(0.0, index=values.index, dtype=float)
    for depth in sorted(depths.dropna().unique()):
        index = depths.index[depths.eq(depth)]
        group = pd.to_numeric(values.loc[index], errors="coerce")
        valid = group.dropna()
        if len(index) <= 1 or len(valid) != len(index) or valid.nunique(dropna=True) <= 1:
            continue
        ranks = valid.rank(method="average", ascending=True)
        result.loc[index] = ((ranks - 1.0) / (len(index) - 1.0)).clip(0.0, 1.0)
    return result.clip(0.0, 1.0)


def _safe_amount_concentration(incoming: float, outgoing: float, incident_max: float) -> float:
    total = incoming + outgoing
    return incident_max / total if total > 0 else 0.0


def build_features(graph: nx.DiGraph) -> pd.DataFrame:
    """Create one raw and normalized feature row per canonical graph node."""
    nodes = sorted(graph.nodes())
    rows: list[dict[str, float | int | str | bool]] = []
    pagerank = nx.pagerank(graph, alpha=0.85, weight="sum_kzt")
    distance_graph = graph.copy()
    for _, _, attrs in distance_graph.edges(data=True):
        attrs["distance"] = 1.0 / np.log1p(float(attrs["sum_kzt"]))
    betweenness = nx.betweenness_centrality(distance_graph, weight="distance", normalized=True)

    raw_components = list(nx.weakly_connected_components(graph))
    sorted_components = sorted(raw_components, key=lambda component: (min(component), len(component)))
    component_by_gid = {gid: component_id for component_id, component in enumerate(sorted_components, start=1) for gid in component}

    for gid in nodes:
        predecessors = list(graph.predecessors(gid))
        successors = list(graph.successors(gid))
        incoming = sum(float(graph[source][gid]["sum_kzt"]) for source in predecessors)
        outgoing = sum(float(graph[gid][target]["sum_kzt"]) for target in successors)
        incident = [float(graph[source][gid]["sum_kzt"]) for source in predecessors] + [float(graph[gid][target]["sum_kzt"]) for target in successors]
        total = incoming + outgoing
        flow_balance = max(0.0, 1.0 - abs(log((outgoing + 1.0) / (incoming + 1.0))))
        rows.append({
            "gid": gid,
            "depth": int(graph.nodes[gid]["depth"]),
            "is_seed": bool(graph.nodes[gid]["is_seed"]),
            "in_degree": len(predecessors), "out_degree": len(successors),
            "unique_senders": len(predecessors), "unique_recipients": len(successors),
            "weighted_degree": total, "weak_component": component_by_gid[gid],
            "incoming_kzt": incoming, "outgoing_kzt": outgoing,
            "amount_concentration": _safe_amount_concentration(incoming, outgoing, max(incident, default=0.0)),
            "retention_obs": incoming / total if total > 0 else 0.0,
            "flow_balance": min(1.0, flow_balance),
            "pagerank": float(pagerank[gid]), "betweenness": float(betweenness[gid]),
        })
    features = pd.DataFrame(rows)
    for raw_name, pct_name in (
        ("in_degree", "in_degree_pct"), ("out_degree", "out_degree_pct"),
        ("unique_senders", "senders_pct"), ("unique_recipients", "receivers_pct"),
        ("incoming_kzt", "inbound_volume_pct"), ("outgoing_kzt", "outbound_volume_pct"),
        ("pagerank", "pagerank_pct"), ("betweenness", "betweenness_pct"),
    ):
        features[pct_name] = pct_depth(features[raw_name], features["depth"])
    features["observed_volume_pct"] = pct_depth(features["incoming_kzt"] + features["outgoing_kzt"], features["depth"])
    return features
