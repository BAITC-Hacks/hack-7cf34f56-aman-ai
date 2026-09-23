from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd

from moneygraph.communities import compute_communities
from moneygraph.data_validation import load_and_validate
from moneygraph.features import build_features, pct_depth
from moneygraph.graph_engine import build_graphs, graph_diagnostics
from moneygraph.seed_convergence import compute_seed_convergence

ROOT = Path(__file__).resolve().parents[3]


def make_graph(edges, seeds=("S1",), depths=None):
    depths = depths or {}
    graph = nx.DiGraph()
    nodes = sorted(set(seeds) | {node for edge in edges for node in edge})
    for node in nodes:
        graph.add_node(node, is_seed=node in seeds, depth=depths.get(node, 0))
    for source, target in edges:
        graph.add_edge(source, target, sum_kzt=10.0, n_tx=1, edge_depth=1)
    return graph


def features_for(graph):
    return pd.DataFrame({"gid": sorted(graph.nodes()), "depth": [graph.nodes[gid]["depth"] for gid in sorted(graph.nodes())]})


def test_pct_depth_exact_contract():
    values = pd.Series([1.0, 2.0, 2.0, 4.0])
    depths = pd.Series([0, 0, 0, 0])
    assert pct_depth(values, depths).tolist() == [0.0, 0.5, 0.5, 1.0]
    assert pct_depth(pd.Series([3.0, 3.0]), pd.Series([0, 0])).tolist() == [0.0, 0.0]
    assert pct_depth(pd.Series([3.0]), pd.Series([0])).tolist() == [0.0]
    assert pct_depth(pd.Series([np.nan, 1.0]), pd.Series([0, 0])).tolist() == [0.0, 0.0]


def test_seed_convergence_cases():
    convergence = make_graph([("S1", "A"), ("A", "X"), ("S2", "B"), ("B", "X")], seeds=("S1", "S2"))
    result = compute_seed_convergence(convergence, features_for(convergence)).set_index("gid")
    assert result.loc["X", "seed_reach_count"] == 2

    same_seed = make_graph([("S1", "A"), ("A", "X"), ("S1", "B"), ("B", "X")])
    assert compute_seed_convergence(same_seed, features_for(same_seed)).set_index("gid").loc["X", "seed_reach_count"] == 1

    cyclic = make_graph([("S1", "A"), ("A", "B"), ("B", "C"), ("C", "A")])
    cycle_result = compute_seed_convergence(cyclic, features_for(cyclic)).set_index("gid")
    assert cycle_result.loc[["A", "B", "C"], "seed_reach_count"].tolist() == [1, 1, 1]

    cross_level = make_graph([("S1", "A"), ("A", "Earlier")], depths={"S1": 0, "A": 1, "Earlier": 0})
    assert compute_seed_convergence(cross_level, features_for(cross_level)).set_index("gid").loc["Earlier", "seed_reach_count"] == 1

    disconnected = make_graph([("S1", "A")], seeds=("S1", "S2"))
    disconnected_result = compute_seed_convergence(disconnected, features_for(disconnected)).set_index("gid")
    assert disconnected_result.loc["S2", "seed_reach_count"] == 1
    assert disconnected_result.loc["A", "seed_reach_count"] == 1


def test_graph_features_and_louvain_are_deterministic():
    direction_nodes = pd.DataFrame({"gid": [1, 2], "depth": [0, 1], "is_seed": [True, False]})
    direction_edges = pd.DataFrame({"src": [1], "dst": [2], "sum_kzt": [10.0], "n_tx": [1], "depth": [1]})
    direction_graph, _ = build_graphs(direction_nodes, direction_edges)
    assert direction_graph.has_edge("1", "2")
    assert not direction_graph.has_edge("2", "1")

    nodes = pd.DataFrame({"gid": [101, 202, 303, 404], "depth": [0, 1, 0, 1], "is_seed": [True, False, True, False]})
    edges = pd.DataFrame({"src": [101, 202, 303, 404], "dst": [202, 101, 404, 303], "sum_kzt": [100.0, 50.0, 100.0, 50.0], "n_tx": [1, 1, 1, 1], "depth": [1, 2, 1, 2]})
    directed, undirected = build_graphs(nodes, edges)
    assert graph_diagnostics(directed).cyclic_scc_count == 2
    features = build_features(directed)
    assert len(features) == len(nodes)
    assert np.isfinite(features.select_dtypes("number").to_numpy()).all()
    assert features.loc[features["gid"] == "101", "retention_obs"].iloc[0] > 0
    first, first_meta = compute_communities(directed, undirected)
    second, second_meta = compute_communities(directed, undirected)
    assert first == second
    assert set(first) == set(features["gid"])
    assert first_meta.equals(second_meta)


def test_validation_rejects_endpoint_absent_from_nodes(tmp_path):
    nodes = pd.DataFrame({"gid": [1, 2], "depth": [0, 1], "is_seed": [True, False]})
    edges = pd.DataFrame({"src": [1], "dst": [3], "sum_kzt": [10.0], "n_tx": [1], "depth": [1]})
    transactions = pd.DataFrame({"src": [1], "dst": [3], "date": pd.to_datetime(["2026-07-01"]), "sum_kzt": [10.0]})
    nodes.to_parquet(tmp_path / "nodes.parquet")
    edges.to_parquet(tmp_path / "edges.parquet")
    transactions.to_parquet(tmp_path / "transactions.parquet")
    with __import__("pytest").raises(ValueError, match="endpoint"):
        load_and_validate(tmp_path)


def test_real_data_validation_and_graph_invariants():
    bundle = load_and_validate(ROOT / "data")
    assert bundle.report.node_count == 2248
    assert bundle.report.edge_count == 3119
    assert bundle.report.seed_count == 81
    assert bundle.report.edge_depth_delta_distribution == {"-3": 20, "-2": 56, "-1": 433, "0": 236, "1": 2374}
    assert pd.api.types.is_integer_dtype(bundle.nodes["gid"])
    directed, _ = build_graphs(bundle.nodes, bundle.edges)
    diagnostics = graph_diagnostics(directed)
    assert diagnostics.cyclic_scc_count == 84
    assert diagnostics.self_loop_count == 0
    first, _ = compute_communities(directed, build_graphs(bundle.nodes, bundle.edges)[1])
    second, _ = compute_communities(directed, build_graphs(bundle.nodes, bundle.edges)[1])
    assert first == second
