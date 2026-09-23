from pathlib import Path
import sys
import time
import json

sys.path.insert(0, str(Path(__file__).parent / "apps/backend"))
from moneygraph.pipeline import calculate
from moneygraph.outputs import write_outputs
from moneygraph.diagnostics import diagnostics
from moneygraph.product import write_product


def main():
    started = time.perf_counter()
    root = Path(__file__).parent
    bundle, directed, undirected, features, ids, clusters = calculate(root / "data")
    nodes, cluster_out, top = write_outputs(features, clusters, root / "results")
    write_product(features, directed, root / "results")
    (root / "results/analytics_diagnostics.json").write_text(
        json.dumps(diagnostics(features, ids), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"MoneyGraph complete: {len(nodes)} nodes, {len(cluster_out)} clusters, "
          f"{len(top)} top nodes in {time.perf_counter() - started:.3f}s.")


if __name__ == "__main__":
    main()
