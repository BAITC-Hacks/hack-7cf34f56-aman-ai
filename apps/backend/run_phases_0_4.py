from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from moneygraph.communities import compute_communities
from moneygraph.data_validation import load_and_validate
from moneygraph.features import build_features
from moneygraph.graph_engine import community_size_distribution, build_graphs, graph_diagnostics
from moneygraph.seed_convergence import compute_seed_convergence


def summary(values):
    return {"min": float(values.min()), "median": float(values.median()), "max": float(values.max())}


def run(data_dir: Path, output: Path) -> dict:
    started = time.perf_counter()
    bundle = load_and_validate(data_dir)
    directed, undirected = build_graphs(bundle.nodes, bundle.edges)
    features = compute_seed_convergence(directed, build_features(directed))
    cluster_ids, clusters = compute_communities(directed, undirected)
    diagnostics = {
        "data": bundle.report.to_dict(),
        "graph": graph_diagnostics(directed).to_dict(),
        "communities": {
            "community_count": len(clusters),
            "community_size_distribution": community_size_distribution(cluster_ids),
            "seed_count_per_community": {str(int(row.cluster_id)): int(row.n_seed) for row in clusters.itertuples(index=False)},
        },
        "features": {
            "pagerank": summary(features["pagerank"]),
            "betweenness": summary(features["betweenness"]),
            "incoming_kzt": summary(features["incoming_kzt"]),
            "outgoing_kzt": summary(features["outgoing_kzt"]),
        },
        "seed_convergence": {
            "min": int(features["seed_reach_count"].min()),
            "median": float(features["seed_reach_count"].median()),
            "mean": float(features["seed_reach_count"].mean()),
            "max": int(features["seed_reach_count"].max()),
            "counts_at_least": {str(limit): int((features["seed_reach_count"] >= limit).sum()) for limit in (2, 3, 5, 10)},
            "top_20": features.sort_values(["seed_reach_count", "gid"], ascending=[False, True], kind="stable")
            .head(20).loc[:, ["gid", "seed_reach_count"]].to_dict(orient="records"),
        },
        "runtime_seconds": round(time.perf_counter() - started, 6),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(diagnostics, ensure_ascii=False, indent=2), encoding="utf-8")
    return diagnostics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run MoneyGraph backend phases 0–4 diagnostics.")
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--output", type=Path, default=Path("results/diagnostics_phase_0_4.json"))
    args = parser.parse_args()
    print(json.dumps(run(args.data_dir, args.output), ensure_ascii=False, indent=2))
