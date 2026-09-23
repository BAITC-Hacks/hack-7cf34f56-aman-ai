from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from pandas.api import types as pdt

NODES_COLUMNS = ("gid", "depth", "is_seed")
EDGES_COLUMNS = ("src", "dst", "sum_kzt", "n_tx", "depth")
TRANSACTION_COLUMNS = ("src", "dst", "date", "sum_kzt")


class ValidationError(ValueError):
    """Raised when source data breaks a required analytical invariant."""


@dataclass
class ValidationReport:
    node_count: int
    edge_count: int
    transaction_count: int
    seed_count: int
    depth_distribution: dict[str, int]
    edge_depth_delta_distribution: dict[str, int]
    zero_edge_amount_count: int
    zero_transaction_amount_count: int
    duplicate_transaction_row_count: int
    cross_level_edge_count: int
    checks: dict[str, bool] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DataBundle:
    nodes: pd.DataFrame
    edges: pd.DataFrame
    transactions: pd.DataFrame
    report: ValidationReport


def _require_columns(frame: pd.DataFrame, expected: tuple[str, ...], label: str) -> None:
    if tuple(frame.columns) != expected:
        raise ValidationError(f"{label} columns must be {expected}; got {tuple(frame.columns)}")


def _assert_no_missing(frame: pd.DataFrame, columns: tuple[str, ...], label: str) -> None:
    missing = frame.loc[:, columns].isna().any()
    bad = missing[missing].index.tolist()
    if bad:
        raise ValidationError(f"{label} has missing values in {bad}")


def _assert_integer(frame: pd.DataFrame, column: str, label: str) -> None:
    if not pdt.is_integer_dtype(frame[column]):
        raise ValidationError(f"{label}.{column} must be an integer dtype, got {frame[column].dtype}")


def _assert_numeric(frame: pd.DataFrame, column: str, label: str) -> None:
    values = frame[column]
    if not pdt.is_numeric_dtype(values) or not np.isfinite(values.astype(float)).all():
        raise ValidationError(f"{label}.{column} must be finite numeric values")


def _validate_aggregate_reconciliation(edges: pd.DataFrame, transactions: pd.DataFrame) -> None:
    grouped = (
        transactions.groupby(["src", "dst"], as_index=False, sort=False)
        .agg(sum_kzt=("sum_kzt", "sum"), n_tx=("sum_kzt", "size"))
    )
    merged = edges.merge(grouped, on=["src", "dst"], how="outer", suffixes=("_edge", "_tx"), indicator=True)
    if not (merged["_merge"] == "both").all():
        raise ValidationError("edge pairs do not match transaction aggregation")
    amounts_match = np.isclose(merged["sum_kzt_edge"], merged["sum_kzt_tx"], rtol=1e-10, atol=1e-6)
    counts_match = merged["n_tx_edge"].eq(merged["n_tx_tx"])
    if not bool(amounts_match.all() and counts_match.all()):
        raise ValidationError("edge amounts or n_tx do not reconcile to transactions")


def load_and_validate(data_dir: str | Path) -> DataBundle:
    """Load Parquets without gid float coercion and validate the canonical data contract."""
    data_dir = Path(data_dir)
    nodes = pd.read_parquet(data_dir / "nodes.parquet")
    edges = pd.read_parquet(data_dir / "edges.parquet")
    transactions = pd.read_parquet(data_dir / "transactions.parquet")

    _require_columns(nodes, NODES_COLUMNS, "nodes")
    _require_columns(edges, EDGES_COLUMNS, "edges")
    _require_columns(transactions, TRANSACTION_COLUMNS, "transactions")
    _assert_no_missing(nodes, NODES_COLUMNS, "nodes")
    _assert_no_missing(edges, EDGES_COLUMNS, "edges")
    _assert_no_missing(transactions, TRANSACTION_COLUMNS, "transactions")
    for frame, label, columns in ((nodes, "nodes", ("gid", "depth")), (edges, "edges", ("src", "dst", "n_tx", "depth")), (transactions, "transactions", ("src", "dst"))):
        for column in columns:
            _assert_integer(frame, column, label)
    for frame, label in ((edges, "edges"), (transactions, "transactions")):
        _assert_numeric(frame, "sum_kzt", label)
        if (frame["sum_kzt"] < 0).any():
            raise ValidationError(f"{label}.sum_kzt contains negative values")
    if not pdt.is_bool_dtype(nodes["is_seed"]):
        raise ValidationError("nodes.is_seed must be boolean")
    if nodes["gid"].duplicated().any():
        raise ValidationError("nodes.gid must be unique")
    if not nodes["depth"].between(0, 4).all():
        raise ValidationError("nodes.depth must be in [0, 4]")
    if (edges["n_tx"] <= 0).any():
        raise ValidationError("edges.n_tx must be positive")
    if (edges["src"] == edges["dst"]).any():
        raise ValidationError("self-loops are not allowed by the source contract")
    if edges.duplicated(["src", "dst"]).any():
        raise ValidationError("aggregated src/dst edge pairs must be unique")

    gids = set(nodes["gid"].tolist())
    endpoints = set(edges["src"].tolist()) | set(edges["dst"].tolist())
    tx_endpoints = set(transactions["src"].tolist()) | set(transactions["dst"].tolist())
    if not endpoints.issubset(gids) or not tx_endpoints.issubset(gids):
        raise ValidationError("edge or transaction endpoint is absent from nodes")
    transactions = transactions.copy()
    transactions["date"] = pd.to_datetime(transactions["date"], errors="raise")
    if transactions["date"].isna().any():
        raise ValidationError("transactions.date contains invalid values")
    _validate_aggregate_reconciliation(edges, transactions)

    depth_by_gid = nodes.set_index("gid")["depth"]
    source_depth = edges["src"].map(depth_by_gid)
    destination_depth = edges["dst"].map(depth_by_gid)
    if not edges["depth"].eq(source_depth + 1).all():
        raise ValidationError("edges.depth must equal source node depth + 1")
    deltas = (destination_depth - source_depth).astype(int)
    delta_distribution = {str(key): int(value) for key, value in deltas.value_counts().sort_index().items()}
    report = ValidationReport(
        node_count=len(nodes), edge_count=len(edges), transaction_count=len(transactions),
        seed_count=int(nodes["is_seed"].sum()),
        depth_distribution={str(key): int(value) for key, value in nodes["depth"].value_counts().sort_index().items()},
        edge_depth_delta_distribution=delta_distribution,
        zero_edge_amount_count=int(edges["sum_kzt"].eq(0).sum()),
        zero_transaction_amount_count=int(transactions["sum_kzt"].eq(0).sum()),
        duplicate_transaction_row_count=int(transactions.duplicated().sum()),
        cross_level_edge_count=int((deltas <= 0).sum()),
        checks={"edge_depth_is_source_step": True, "transaction_aggregate_matches_edges": True},
        warnings=["Duplicate transaction rows are retained because transactions have no transaction ID."],
    )
    return DataBundle(nodes=nodes, edges=edges, transactions=transactions, report=report)
