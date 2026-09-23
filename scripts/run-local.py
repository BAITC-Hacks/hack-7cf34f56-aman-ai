#!/usr/bin/env python3
"""Prepare and serve MoneyGraph from the three organizer Parquet files.

Run from any directory with Python 3.12+ (except 3.14.1) and Node 22.18+.
No .env, AI credentials, existing results, or global Python packages are needed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "apps" / "frontend"
INPUTS = ("nodes.parquet", "edges.parquet", "transactions.parquet")
OUTPUTS = ("nodes_roles.csv", "clusters.csv", "top_nodes.csv")


def run(command: list[str | Path], *, env: dict[str, str] | None = None) -> None:
    print("\n> " + " ".join(str(part) for part in command), flush=True)
    subprocess.run([str(part) for part in command], cwd=ROOT, env=env, check=True)


def preflight(port: int) -> tuple[str, Path]:
    if sys.version_info < (3, 12) or sys.version_info[:3] == (3, 14, 1):
        raise ValueError("Use Python 3.12+ except 3.14.1; Python 3.14.6 is tested.")
    if not 1 <= port <= 65535:
        raise ValueError("--port must be between 1 and 65535.")
    missing = [str(Path("data") / name) for name in INPUTS if not (ROOT / "data" / name).is_file()]
    if missing:
        raise ValueError(
            "Missing input files: " + ", ".join(missing)
            + ". Extract the organizers' archive so these files are directly inside "
            + str(ROOT / "data") + ". Keep the three original Parquet files together."
        )
    node = shutil.which("node")
    npm = shutil.which("npm")
    if node is None or npm is None:
        raise ValueError("Install Node.js 22.18+ with npm, then rerun this command.")
    version = subprocess.check_output([node, "--version"], text=True).strip()
    match = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)", version)
    if match is None or tuple(map(int, match.groups())) < (22, 18, 0):
        raise ValueError(f"Node.js 22.18+ is required; found {version}.")
    python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    print(f"Python {sys.version.split()[0]}, Node {version}; all three Parquet inputs found.", flush=True)
    return npm, python


def fingerprints() -> dict[str, str]:
    return {name: hashlib.sha256((ROOT / "results" / name).read_bytes()).hexdigest() for name in OUTPUTS}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare-only", action="store_true", help="Prepare and verify all artifacts, then exit without starting the server.")
    parser.add_argument("--skip-install", action="store_true", help="Reuse an already prepared .venv and node_modules; no package installation.")
    parser.add_argument("--port", type=int, default=5173, help="Local preview port (default: 5173).")
    args = parser.parse_args()
    try:
        npm, python = preflight(args.port)
        if args.skip_install:
            if not python.is_file() or not (FRONTEND / "node_modules" / ".package-lock.json").is_file():
                raise ValueError("--skip-install needs an existing .venv and npm ci installation. Run once without --skip-install.")
        else:
            if not python.is_file():
                run([sys.executable, "-m", "venv", ROOT / ".venv"])
            run([python, "-m", "pip", "install", "--disable-pip-version-check", "-r", ROOT / "requirements.txt"])
            run([npm, "--prefix", FRONTEND, "ci", "--no-audit", "--no-fund"])

        # Explicit project mode takes precedence over developer .env settings.
        # Runtime credentials are optional and are never created or printed here.
        env = {**os.environ, "VITE_DATA_MODE": "project", "MONEYGRAPH_PYTHON": str(python)}
        elapsed = []
        first = None
        for iteration in (1, 2):
            started = time.monotonic()
            run([python, ROOT / "main.py"], env=env)
            elapsed.append(round(time.monotonic() - started, 2))
            current = fingerprints()
            if first is None:
                first = current
            elif current != first:
                raise ValueError("Mandatory CSV files differ between the two pipeline runs.")
            if elapsed[-1] >= 300:
                raise ValueError(f"Pipeline run {iteration} exceeded the case's five-minute limit ({elapsed[-1]} s).")
        print(f"\nAll three CSV files are byte-identical across both runs ({elapsed[0]} s, {elapsed[1]} s).", flush=True)

        # prebuild exports and validates current CSVs against the canonical nodes
        # and edges before bundling; no analytical API server is required.
        run([npm, "--prefix", FRONTEND, "run", "build"], env=env)
        dataset = json.loads((FRONTEND / "public" / "project-data.json").read_text(encoding="utf-8"))
        metadata = dataset["metadata"]
        report = {
            "python": subprocess.check_output([python, "--version"], text=True).strip(),
            "node": subprocess.check_output([shutil.which("node"), "--version"], text=True).strip(),
            "npm": subprocess.check_output([npm, "--version"], text=True).strip(),
            "source": "project",
            "dependency_sha256": {str(path): hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in (
                Path("requirements.txt"), Path("apps/backend/requirements.txt"), Path("apps/frontend/package-lock.json"),
            )},
            "input_sha256": {name: hashlib.sha256((ROOT / "data" / name).read_bytes()).hexdigest() for name in INPUTS},
            "output_sha256": first,
            "pipeline_seconds": elapsed,
            "node_count": metadata["node_count"],
            "edge_count": metadata["edge_count"],
            "transaction_count": metadata["transaction_count"],
            "seed_count": sum(node["is_seed"] for node in dataset["nodes"]),
            "cluster_count": len(dataset["clusters"]),
            "top_count": len(dataset["top"]),
            "total_kzt": metadata["total_kzt"],
        }
        report_path = ROOT / "results" / "reproducibility.json"
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"\nReady: {metadata['node_count']:,} nodes, {metadata['edge_count']:,} directed links, {metadata['transaction_count']:,} transactions.", flush=True)
        print(f"CSV files: {ROOT / 'results'}\nVerification: {report_path}", flush=True)
        if not args.prepare_only:
            print(f"\nOpen http://127.0.0.1:{args.port} — press Ctrl+C to stop.", flush=True)
            run([npm, "--prefix", FRONTEND, "run", "preview", "--", "--host", "127.0.0.1", "--port", str(args.port), "--strictPort"], env=env)
        return 0
    except KeyboardInterrupt:
        print("\nMoneyGraph stopped.")
        return 130
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"\nMoneyGraph setup failed: {exc}", file=sys.stderr)
        print("Fix the reported step and rerun this command. See README.md for input paths and manual setup.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
