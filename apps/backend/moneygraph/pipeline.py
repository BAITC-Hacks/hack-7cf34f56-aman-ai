"""Shared deterministic pipeline; no API or model dependency."""
from pathlib import Path
from .data_validation import load_and_validate
from .graph_engine import build_graphs
from .features import build_features
from .seed_convergence import compute_seed_convergence
from .communities import compute_communities
from .temporal import add_temporal_features
from .roles import apply_roles
from .priority import apply_priority
from .evidence import apply_evidence


def calculate(data_dir: Path):
    bundle = load_and_validate(data_dir)
    directed, undirected = build_graphs(bundle.nodes, bundle.edges)
    features = compute_seed_convergence(directed, build_features(directed))
    ids, clusters = compute_communities(directed, undirected)
    features = add_temporal_features(features, bundle.transactions)
    features = apply_evidence(apply_priority(apply_roles(features, directed, ids), directed))
    return bundle, directed, undirected, features, ids, clusters
