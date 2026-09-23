"""Validation and precision checks for the frontend's read-only data adapter."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import pandas as pd


SCRIPT = Path(__file__).with_name("export-project-data.py")
SPEC = importlib.util.spec_from_file_location("export_project_data", SCRIPT)
exporter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exporter)

A, B, C = "100000000000000001", "100000000000000002", "100000000000000003"


class ProjectExportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "data").mkdir()
        (self.root / "results").mkdir()
        pd.DataFrame({"gid": [int(A), int(B), int(C)], "depth": [0, 1, 4],
                      "is_seed": [True, False, False]}).to_parquet(self.root / "data/nodes.parquet")
        # The return edge B → A must survive; this canonical graph is not a DAG.
        pd.DataFrame({"src": [int(A), int(B), int(B)], "dst": [int(B), int(A), int(C)],
                      "sum_kzt": [100.0, 20.0, 50.0], "n_tx": [2, 1, 1],
                      "depth": [1, 2, 2]}).to_parquet(self.root / "data/edges.parquet")
        pd.DataFrame([
            [A, "distributor", ".8", "1", ".8", "Observed outgoing transfers."],
            [B, "transit", ".7", "1", ".7", "Observed incoming and outgoing transfers."],
            [C, "peripheral", ".6", "2", ".9", "Observation boundary."],
        ], columns=exporter.CSV_COLUMNS["nodes_roles"]).to_csv(self.root / "results/nodes_roles.csv", index=False)
        pd.DataFrame([
            ["1", "2", "1", "120", f"{A}|{B}", "Observed community."],
            ["2", "1", "0", "0", C, "Boundary observation."],
        ], columns=exporter.CSV_COLUMNS["clusters"]).to_csv(self.root / "results/clusters.csv", index=False)
        pd.DataFrame([
            ["1", C, "peripheral", ".9", "Boundary observation."],
            ["2", A, "distributor", ".8", "Observed distribution."],
            ["3", B, "transit", ".7", "Observed two-sided flow."],
        ], columns=exporter.CSV_COLUMNS["top_nodes"]).to_csv(self.root / "results/top_nodes.csv", index=False)

    def change_csv(self, name, column, value, row=0):
        path = self.root / "results" / f"{name}.csv"
        table = pd.read_csv(path, dtype=str, keep_default_na=False)
        table.loc[row, column] = value
        table.to_csv(path, index=False)

    def change_parquet(self, name, column, value, row=0):
        path = self.root / "data" / f"{name}.parquet"
        table = pd.read_parquet(path)
        # Assign whole columns to allow deliberately invalid dtypes in tests.
        values = table[column].tolist()
        values[row] = value
        table[column] = values
        table.to_parquet(path)

    def test_exact_gids_cycles_and_observed_metrics(self):
        dataset = exporter.build_dataset(self.root)
        self.assertEqual([node["gid"] for node in dataset["nodes"]], [A, B, C])
        self.assertEqual([entry["gid"] for entry in dataset["top"]], [C, A, B])
        self.assertEqual(dataset["nodes"][0]["observed_flows"], {
            "incoming_kzt": 20, "outgoing_kzt": 100, "in_degree": 1, "out_degree": 1, "in_tx": 1, "out_tx": 2,
        })
        self.assertEqual(dataset["metadata"]["total_kzt"], 170)
        self.assertEqual(dataset["metadata"]["transaction_count"], 4)
        self.assertIn((B, A), [(edge["src"], edge["dst"]) for edge in dataset["edges"]])
        self.assertIn("incomplete_seed_inflows", [item["code"] for item in dataset["nodes"][0]["limitations"]])
        self.assertIn("observation_boundary", [item["code"] for item in dataset["nodes"][2]["limitations"]])
        for node in dataset["nodes"]:
            self.assertIsNone(node["seed_reach_count"])
            self.assertEqual(node["priority_components"], [])
            self.assertNotIn("risk_score", node)
            self.assertEqual(node["role_scores"][node["role"]]["score"], node["role_score"])
            self.assertTrue(all(value["score"] is None for role, value in node["role_scores"].items() if role != node["role"]))

    def test_rejects_malformed_csv_gids(self):
        for value in ("1e17", "100000000000000001.0", "", "-1", "001", " 100000000000000001"):
            with self.subTest(value=value):
                self.change_csv("nodes_roles", "gid", value)
                with self.assertRaisesRegex(ValueError, "exact decimal integer"):
                    exporter.build_dataset(self.root)

    def test_rejects_float_parquet_gid_before_precision_can_be_lost(self):
        self.change_parquet("nodes", "gid", float(A))
        with self.assertRaisesRegex(ValueError, "exact decimal integer"):
            exporter.build_dataset(self.root)

    def test_rejects_duplicate_nodes_and_missing_role_rows(self):
        self.change_csv("nodes_roles", "gid", B)
        with self.assertRaisesRegex(ValueError, "duplicate or unknown gid"):
            exporter.build_dataset(self.root)
        self.change_csv("nodes_roles", "gid", A)
        path = self.root / "results/nodes_roles.csv"
        table = pd.read_csv(path, dtype=str)
        table.iloc[:2].to_csv(path, index=False)
        with self.assertRaisesRegex(ValueError, "exactly the gids"):
            exporter.build_dataset(self.root)

    def test_rejects_duplicate_or_dangling_edges(self):
        path = self.root / "data/edges.parquet"
        table = pd.read_parquet(path)
        pd.concat([table, table.iloc[:1]], ignore_index=True).to_parquet(path)
        with self.assertRaisesRegex(ValueError, "duplicate edge"):
            exporter.build_dataset(self.root)
        table.to_parquet(path)
        self.change_parquet("edges", "dst", 999)
        with self.assertRaisesRegex(ValueError, "unknown endpoint"):
            exporter.build_dataset(self.root)

    def test_rejects_invalid_scores(self):
        for value in ("NaN", "inf", "-0.1", "1.01", ""):
            with self.subTest(value=value):
                self.change_csv("nodes_roles", "priority_score", value)
                with self.assertRaises(ValueError):
                    exporter.build_dataset(self.root)

    def test_rejects_invalid_edge_amounts_and_counts(self):
        for value in (float("nan"), float("inf"), -1.0):
            with self.subTest(value=value):
                self.change_parquet("edges", "sum_kzt", value)
                with self.assertRaisesRegex(ValueError, "finite non-negative"):
                    exporter.build_dataset(self.root)
        self.change_parquet("edges", "sum_kzt", 100)
        self.change_parquet("edges", "n_tx", 1.5)
        with self.assertRaisesRegex(ValueError, "exact decimal integer"):
            exporter.build_dataset(self.root)

    def test_rejects_inconsistent_clusters(self):
        for column, value, original, message in [
            ("n_nodes", "3", "2", "member or seed count"),
            ("n_seed", "0", "1", "member or seed count"),
            ("sum_kzt_internal", "121", "120", "internal amount"),
            ("top_gids", f"{C}|{B}", f"{A}|{B}", "ranked cluster members"),
        ]:
            with self.subTest(column=column):
                self.change_csv("clusters", column, value)
                with self.assertRaisesRegex(ValueError, message):
                    exporter.build_dataset(self.root)
                self.change_csv("clusters", column, original)

    def test_accepts_six_decimal_cluster_rounding(self):
        self.change_csv("clusters", "sum_kzt_internal", "120.0000004")
        exporter.build_dataset(self.root)

    def test_rejects_inconsistent_top_nodes(self):
        for column, value, original, message in [
            ("rank", "2", "1", "rank or role"),
            ("role", "terminal", "peripheral", "rank or role"),
            ("priority_score", ".8", ".9", "priority disagrees"),
            ("gid", A, C, "priority DESC"),
        ]:
            with self.subTest(column=column):
                self.change_csv("top_nodes", column, value)
                with self.assertRaisesRegex(ValueError, message):
                    exporter.build_dataset(self.root)
                self.change_csv("top_nodes", column, original)

    def test_rejects_boundary_terminal(self):
        self.change_csv("nodes_roles", "role", "terminal", row=2)
        with self.assertRaisesRegex(ValueError, "depth-4 boundary"):
            exporter.build_dataset(self.root)

    def test_rejects_schema_changes(self):
        path = self.root / "results/clusters.csv"
        table = pd.read_csv(path, dtype=str).drop(columns=["n_seed"])
        table.to_csv(path, index=False)
        with self.assertRaisesRegex(ValueError, "columns must be"):
            exporter.build_dataset(self.root)

    def test_accepts_optional_extra_columns(self):
        for name in exporter.CSV_COLUMNS:
            path = self.root / "results" / f"{name}.csv"
            table = pd.read_csv(path, dtype=str)
            table["optional_note"] = "Additional context"
            table.to_csv(path, index=False)
        self.assertEqual(exporter.build_dataset(self.root)["metadata"]["node_count"], 3)

    def test_rejects_duplicate_headers_before_pandas_can_rename_them(self):
        path = self.root / "results/nodes_roles.csv"
        original = path.read_text()
        path.write_text(original.replace("gid,role,role_score,", "gid,gid,role_score,", 1))
        with self.assertRaisesRegex(ValueError, "duplicate column"):
            exporter.build_dataset(self.root)

    def test_atomic_output_retains_previous_file_on_serialization_failure(self):
        output = self.root / "export.json"
        exporter.write_atomic(output, {"previous": True})
        with self.assertRaises(ValueError):
            exporter.write_atomic(output, {"invalid": float("nan")})
        self.assertEqual(json.loads(output.read_text()), {"previous": True})
        self.assertEqual(list(self.root.glob(".export.json.*.tmp")), [])


class RealProjectDataTests(unittest.TestCase):
    def test_existing_dataset_is_consistent_and_retains_exact_source_gids(self):
        root = SCRIPT.resolve().parents[3]
        dataset = exporter.build_dataset(root)
        self.assertEqual(dataset["metadata"]["node_count"], 2248)
        self.assertEqual(dataset["metadata"]["edge_count"], 3119)
        self.assertEqual(dataset["metadata"]["transaction_count"], 4840)
        self.assertEqual(sum(node["is_seed"] for node in dataset["nodes"]), 81)
        source_gids = set(pd.read_csv(root / "results/nodes_roles.csv", dtype=str)["gid"])
        self.assertEqual({node["gid"] for node in dataset["nodes"]}, source_gids)
        self.assertEqual(dataset["top"][0]["gid"], "100000003115284100")
        self.assertEqual(dataset["top"][0]["priority_score"], .862398)
        self.assertEqual(sum(cluster["n_nodes"] for cluster in dataset["clusters"]), 2248)
        serialized = json.dumps(dataset, allow_nan=False)
        self.assertEqual(len(json.loads(serialized)["edges"]), 3119)


if __name__ == "__main__":
    unittest.main()
