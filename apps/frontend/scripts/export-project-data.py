#!/usr/bin/env python3
"""Package existing analytical CSVs and canonical edges for the frontend.

This adapter only reads backend results. It never runs the analytical pipeline,
reassigns roles, or rewrites its inputs. Run with the repository Python venv.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
from pathlib import Path
import re
import tempfile
from datetime import datetime, timezone
from numbers import Integral

import pandas as pd


ROLES = ("consolidator", "transit", "distributor", "terminal", "coordinator", "peripheral")
CSV_COLUMNS = {
    "nodes_roles": ["gid", "role", "role_score", "cluster_id", "priority_score", "evidence"],
    "clusters": ["cluster_id", "n_nodes", "n_seed", "sum_kzt_internal", "top_gids", "hypothesis"],
    "top_nodes": ["rank", "gid", "role", "priority_score", "why"],
}
SOURCE_FILES = [
    "results/nodes_roles.csv", "results/clusters.csv", "results/top_nodes.csv",
    "data/nodes.parquet", "data/edges.parquet",
]
DECIMAL_INTEGER = re.compile(r"(?:0|[1-9][0-9]*)\Z")
CSV_TOLERANCE = 1e-6


def integer(value: object, field: str, minimum: int = 0) -> int:
    """Reject floats rather than recover potentially rounded identifiers."""
    if isinstance(value, bool):
        raise ValueError(f"{field}: expected an exact integer")
    if isinstance(value, Integral):
        result = int(value)
    elif isinstance(value, str) and DECIMAL_INTEGER.fullmatch(value):
        result = int(value)
    else:
        raise ValueError(f"{field}: expected exact decimal integer text or an integer")
    if result < minimum:
        raise ValueError(f"{field}: must be at least {minimum}")
    return result


def gid(value: object, field: str) -> str:
    return str(integer(value, field))


def number(value: object, field: str, maximum: float | None = None) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field}: expected a finite non-negative number") from exc
    if isinstance(value, bool) or not math.isfinite(result) or result < 0:
        raise ValueError(f"{field}: expected a finite non-negative number")
    if maximum is not None and result > maximum:
        raise ValueError(f"{field}: must be at most {maximum}")
    return result


def nonempty(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field}: must contain text")
    return value


def read_csv(root: Path, name: str) -> list[dict]:
    path = root / "results" / f"{name}.csv"
    with path.open(encoding="utf-8-sig", newline="") as stream:
        headers = next(csv.reader(stream), [])
    if len(headers) != len(set(headers)):
        raise ValueError(f"{name}.csv: duplicate column names")
    if not set(CSV_COLUMNS[name]).issubset(headers):
        raise ValueError(f"{name}.csv: required columns must be {','.join(CSV_COLUMNS[name])}")
    # Read every field as text: pandas must never infer a float for a GID.
    # Optional additional columns are permitted by the source README.
    table = pd.read_csv(path, dtype=str, keep_default_na=False)
    return table.to_dict("records")


def read_parquet(root: Path, name: str, columns: set[str]) -> list[dict]:
    table = pd.read_parquet(root / "data" / f"{name}.parquet")
    if set(table.columns) != columns:
        raise ValueError(f"{name}.parquet: columns must be {', '.join(sorted(columns))}")
    # Column-preserving records avoid the float coercion of iterrows().
    return table.to_dict("records")


def rank_key(node: dict) -> tuple[float, int]:
    return -node["priority_score"], int(node["gid"])


def build_dataset(root: Path) -> dict:
    raw_nodes = read_parquet(root, "nodes", {"gid", "depth", "is_seed"})
    nodes: dict[str, dict] = {}
    for row in raw_nodes:
        node_gid = gid(row["gid"], "nodes.parquet gid")
        if node_gid in nodes:
            raise ValueError(f"nodes.parquet: duplicate gid {node_gid}")
        depth = integer(row["depth"], f"node {node_gid} depth")
        if depth > 4 or not isinstance(row["is_seed"], bool):
            raise ValueError(f"node {node_gid}: depth must be 0..4 and is_seed boolean")
        if row["is_seed"] != (depth == 0):
            raise ValueError(f"node {node_gid}: seed flag and depth 0 disagree")
        nodes[node_gid] = {"gid": node_gid, "depth": depth, "is_seed": row["is_seed"]}
    if not nodes:
        raise ValueError("nodes.parquet: no nodes")

    assigned = set()
    for row in read_csv(root, "nodes_roles"):
        node_gid = gid(row["gid"], "nodes_roles.csv gid")
        if node_gid in assigned or node_gid not in nodes:
            raise ValueError(f"nodes_roles.csv: duplicate or unknown gid {node_gid}")
        assigned.add(node_gid)
        role = row["role"]
        if role not in ROLES:
            raise ValueError(f"node {node_gid}: unknown role {role}")
        evidence = nonempty(row["evidence"], f"node {node_gid} evidence")
        if len(evidence) > 200:
            raise ValueError(f"node {node_gid}: evidence exceeds 200 characters")
        node = nodes[node_gid]
        if node["depth"] == 4 and role == "terminal":
            raise ValueError(f"node {node_gid}: depth-4 boundary cannot be terminal")
        node.update({
            "role": role, "role_score": number(row["role_score"], f"node {node_gid} role_score", 1),
            "priority_score": number(row["priority_score"], f"node {node_gid} priority_score", 1),
            "cluster_id": integer(row["cluster_id"], f"node {node_gid} cluster_id"),
            "evidence": evidence,
        })
    if assigned != set(nodes):
        raise ValueError("nodes_roles.csv: must contain exactly the gids in nodes.parquet")

    edges = []
    pairs = set()
    incoming: dict[str, list] = {node_gid: [] for node_gid in nodes}
    outgoing: dict[str, list] = {node_gid: [] for node_gid in nodes}
    for row in read_parquet(root, "edges", {"src", "dst", "sum_kzt", "n_tx", "depth"}):
        src, dst = gid(row["src"], "edge src"), gid(row["dst"], "edge dst")
        if src not in nodes or dst not in nodes:
            raise ValueError(f"edges.parquet: unknown endpoint {src} → {dst}")
        if src == dst:
            raise ValueError(f"edges.parquet: self-loop at {src}")
        if (src, dst) in pairs:
            raise ValueError(f"edges.parquet: duplicate edge {src} → {dst}")
        pairs.add((src, dst))
        edge_depth = integer(row["depth"], f"edge {src} → {dst} depth", 1)
        if edge_depth > 4 or edge_depth != nodes[src]["depth"] + 1:
            raise ValueError(f"edge {src} → {dst}: depth must equal source depth + 1 within 1..4")
        edge = {"src": src, "dst": dst, "sum_kzt": number(row["sum_kzt"], "edge sum_kzt"),
                "n_tx": integer(row["n_tx"], "edge n_tx", 1)}
        edges.append(edge)
        incoming[dst].append(edge)
        outgoing[src].append(edge)
    edges.sort(key=lambda edge: (int(edge["src"]), int(edge["dst"])))

    groups: dict[int, list] = {}
    for node in nodes.values():
        groups.setdefault(node["cluster_id"], []).append(node)
    internal_amounts: dict[int, list] = {cluster_id: [] for cluster_id in groups}
    for edge in edges:
        cluster_id = nodes[edge["src"]]["cluster_id"]
        if cluster_id == nodes[edge["dst"]]["cluster_id"]:
            internal_amounts[cluster_id].append(edge["sum_kzt"])

    clusters = []
    seen_clusters = set()
    for row in read_csv(root, "clusters"):
        cluster_id = integer(row["cluster_id"], "clusters.csv cluster_id")
        if cluster_id in seen_clusters or cluster_id not in groups:
            raise ValueError(f"clusters.csv: duplicate or unknown cluster {cluster_id}")
        seen_clusters.add(cluster_id)
        members = groups[cluster_id]
        cluster = {
            "cluster_id": cluster_id, "n_nodes": integer(row["n_nodes"], "cluster n_nodes"),
            "n_seed": integer(row["n_seed"], "cluster n_seed"),
            "sum_kzt_internal": number(row["sum_kzt_internal"], "cluster sum_kzt_internal"),
            "top_gids": [gid(value, "cluster top_gids") for value in row["top_gids"].split("|")],
            "hypothesis": nonempty(row["hypothesis"], "cluster hypothesis"),
        }
        if cluster["n_nodes"] != len(members) or cluster["n_seed"] != sum(node["is_seed"] for node in members):
            raise ValueError(f"cluster {cluster_id}: member or seed count disagrees with nodes")
        if not math.isclose(cluster["sum_kzt_internal"], math.fsum(internal_amounts[cluster_id]), rel_tol=0, abs_tol=CSV_TOLERANCE):
            raise ValueError(f"cluster {cluster_id}: internal amount disagrees with canonical edges")
        expected_top = [node["gid"] for node in sorted(members, key=rank_key)[:3]]
        if cluster["top_gids"] != expected_top:
            raise ValueError(f"cluster {cluster_id}: top_gids disagree with ranked cluster members")
        clusters.append(cluster)
    if seen_clusters != set(groups):
        raise ValueError("clusters.csv: missing node clusters")
    clusters.sort(key=lambda cluster: cluster["cluster_id"])

    top = []
    ranking = sorted(nodes.values(), key=rank_key)
    for index, row in enumerate(read_csv(root, "top_nodes")):
        node_gid = gid(row["gid"], "top_nodes.csv gid")
        if index >= len(ranking) or node_gid != ranking[index]["gid"]:
            raise ValueError("top_nodes.csv: gids must follow priority DESC, gid ASC")
        node = nodes[node_gid]
        entry = {"rank": integer(row["rank"], "top rank", 1), "gid": node_gid, "role": row["role"],
                 "priority_score": number(row["priority_score"], "top priority_score", 1),
                 "why": nonempty(row["why"], "top why")}
        if entry["rank"] != index + 1 or entry["role"] != node["role"]:
            raise ValueError(f"top node {node_gid}: rank or role disagrees with nodes_roles.csv")
        if not math.isclose(entry["priority_score"], node["priority_score"], rel_tol=0, abs_tol=CSV_TOLERANCE):
            raise ValueError(f"top node {node_gid}: priority disagrees with nodes_roles.csv")
        top.append(entry)
    if len(top) < min(20, len(nodes)):
        raise ValueError("top_nodes.csv: must include at least the first 20 nodes (or all for a smaller dataset)")

    for node_gid, node in nodes.items():
        inbound, outbound = incoming[node_gid], outgoing[node_gid]
        limitations = [{"code": "observed_coverage", "message": "Только наблюдаемые переводы внутри выгрузки; это не полная история счёта."}]
        if node["depth"] == 4:
            limitations.append({"code": "observation_boundary", "message": "Граница наблюдения depth=4: отсутствие исходящих переводов не означает, что движение средств закончилось."})
        if node["is_seed"]:
            limitations.append({"code": "incomplete_seed_inflows", "message": "Входящие потоки seed-узла неполны: поступления извне выборки не наблюдаются."})
        node.update({
            "observed_flows": {"incoming_kzt": math.fsum(edge["sum_kzt"] for edge in inbound),
                               "outgoing_kzt": math.fsum(edge["sum_kzt"] for edge in outbound),
                               "in_degree": len(inbound), "out_degree": len(outbound),
                               "in_tx": sum(edge["n_tx"] for edge in inbound),
                               "out_tx": sum(edge["n_tx"] for edge in outbound)},
            "seed_reach_count": None,
            "role_scores": {role: {"score": node["role_score"] if role == node["role"] else None,
                                   "applicable": True,
                                   "reason": None if role == node["role"] else "В CSV нет отдельной оценки этой роли."} for role in ROLES},
            "priority_components": [], "limitations": limitations, "next_action": None,
            "edges": sorted(inbound + outbound, key=lambda edge: (int(edge["src"]), int(edge["dst"]))),
        })
    return {
        "nodes": sorted(nodes.values(), key=lambda node: int(node["gid"])), "edges": edges,
        "top": top, "clusters": clusters,
        "metadata": {"source": "project", "node_count": len(nodes), "edge_count": len(edges),
                     "transaction_count": sum(edge["n_tx"] for edge in edges),
                     "total_kzt": math.fsum(edge["sum_kzt"] for edge in edges),
                     "generated_at": datetime.now(timezone.utc).isoformat(), "files": SOURCE_FILES},
    }


def write_atomic(output: Path, dataset: dict) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, prefix=f".{output.name}.", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(dataset, stream, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            stream.write("\n")
        os.replace(temporary, output)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument("--out", type=Path, help="Destination JSON (default: apps/frontend/public/project-data.json)")
    args = parser.parse_args()
    try:
        dataset = build_dataset(args.root)
        output = args.out or args.root / "apps/frontend/public/project-data.json"
        write_atomic(output, dataset)
    except (OSError, ValueError, OverflowError) as exc:
        parser.exit(1, f"Project data export failed: {exc}\n")
    metadata = dataset["metadata"]
    print(f"Exported {metadata['node_count']:,} real nodes, {metadata['edge_count']:,} directed edges, "
          f"{metadata['transaction_count']:,} transactions → {output}")


if __name__ == "__main__":
    main()
