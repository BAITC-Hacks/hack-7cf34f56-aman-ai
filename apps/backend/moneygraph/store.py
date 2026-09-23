"""Read-only precomputed artifact store shared by API and investigation tools."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


class ArtifactStore:
    def __init__(self, directory=ROOT / "results"):
        directory = Path(directory)
        self.cards = json.loads((directory / "node_cards.json").read_text(encoding="utf-8"))
        self.graph = json.loads((directory / "graph.json").read_text(encoding="utf-8"))
        self.nodes = {n["gid"]: n for n in self.graph["nodes"]}
        self.ranked = sorted(self.cards.values(), key=lambda c: (-c["priority_score"], c["gid"]))
        self.neighbors = {gid: set() for gid in self.nodes}
        for e in self.graph["edges"]:
            self.neighbors[e["src"]].add(e["dst"])
            self.neighbors[e["dst"]].add(e["src"])
        with (directory / "clusters.csv").open(encoding="utf-8", newline="") as file:
            self.clusters = {}
            for row in csv.DictReader(file):
                c = {k: int(row[k]) for k in ("cluster_id", "n_nodes", "n_seed")}
                c.update(sum_kzt_internal=float(row["sum_kzt_internal"]),
                         top_gids=row["top_gids"].split("|"), hypothesis=row["hypothesis"])
                c["members"] = [n for n in self.graph["nodes"] if n["cluster_id"] == c["cluster_id"]]
                c["limitations"] = ["observed_graph_only", "communities_are_structural_hypotheses"]
                self.clusters[c["cluster_id"]] = c

    @staticmethod
    def valid_gid(gid):
        if not isinstance(gid, str) or not 1 <= len(gid) <= 20 or not gid.isascii() or not gid.isdecimal():
            raise ValueError("gid must be a decimal string of 1–20 digits")
        return gid

    def node(self, gid):
        return self.cards[self.valid_gid(gid)]

    def top(self, limit=20):
        if not 1 <= limit <= 100:
            raise ValueError("limit must be 1–100")
        return [{"rank": i, **{k: c[k] for k in ("gid", "role", "priority_score")},
                 "why": c["evidence"]} for i, c in enumerate(self.ranked[:limit], 1)]

    def search(self, gid, limit=20):
        self.valid_gid(gid)
        if not 1 <= limit <= 50:
            raise ValueError("limit must be 1–50")
        if gid in self.nodes:
            return [self.nodes[gid]]
        return [self.nodes[key] for key in sorted(self.nodes) if key.startswith(gid)][:limit]

    def subgraph(self, gid, hop=1):
        self.node(gid)
        if hop not in (1, 2):
            raise ValueError("hop must be 1 or 2")
        # Collect the complete bounded-hop neighborhood before a deterministic cap,
        # keeping center, nearest nodes, then gid order.
        distances, frontier = {gid: 0}, {gid}
        for distance in range(1, hop + 1):
            new = set()
            for source in sorted(frontier):
                new.update(self.neighbors[source])
            new.difference_update(distances)
            distances.update({n: distance for n in new})
            frontier = new
        selected = sorted(distances, key=lambda n: (distances[n], n))[:250]
        selected_set = set(selected)
        return {"nodes": [self.nodes[n] for n in selected],
                "edges": [e for e in self.graph["edges"]
                          if e["src"] in selected_set and e["dst"] in selected_set],
                "center_gid": gid, "hop": hop, "truncated": len(distances) > 250,
                "total_nodes": len(distances), "limitations": self.cards[gid]["limitations"]}
