"""Bounded deterministic tools. They read artifacts, never invoke a model."""
from collections import Counter, deque
import math

from .store import ArtifactStore


def bounded_integer(value, minimum, maximum, name):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"{name} must be an integer in [{minimum}, {maximum}]")
    return value


class InvestigationTools:
    def __init__(self, store: ArtifactStore):
        self.store = store
        self.adjacency = {gid: [] for gid in store.nodes}
        self.reverse = {gid: [] for gid in store.nodes}
        self.amounts = {}
        for e in store.graph["edges"]:
            self.adjacency[e["src"]].append(e["dst"])
            self.reverse[e["dst"]].append(e["src"])
            self.amounts[e["src"], e["dst"]] = e["sum_kzt"]
        for adjacency in (self.adjacency, self.reverse):
            for targets in adjacency.values():
                targets.sort()

    def limitations(self, gids):
        return sorted({"observed_graph_only", *(
            flag for gid in gids for flag in self.store.cards[gid]["limitations"])})

    def get_node(self, gid):
        card = self.store.node(gid)
        # Only the requested card, with bounded incident-edge examples.
        return {**card, "incoming_edges": card["incoming_edges"][:10],
                "outgoing_edges": card["outgoing_edges"][:10],
                "edges_truncated": len(card["incoming_edges"]) > 10 or len(card["outgoing_edges"]) > 10}

    def get_cluster(self, cluster_id):
        bounded_integer(cluster_id, 1, 1000000, "cluster_id")
        cluster = self.store.clusters[cluster_id]
        result = {k: v for k, v in cluster.items() if k != "members"}
        result["role_mix"] = dict(sorted(Counter(n["role"] for n in cluster["members"]).items()))
        result["limitations"] = sorted(set(result["limitations"]) |
                                      set(self.limitations(n["gid"] for n in cluster["members"])))
        return result

    def _gids(self, gids, maximum=10):
        if not isinstance(gids, list) or not 1 <= len(gids) <= maximum:
            raise ValueError(f"Expected 1–{maximum} string gids")
        for gid in gids:
            self.store.node(gid)
        return sorted(set(gids))

    def find_common_downstream(self, seed_gids, max_depth, limit):
        seeds = self._gids(seed_gids)
        bounded_integer(max_depth, 1, 4, "max_depth")
        bounded_integer(limit, 1, 50, "limit")
        if not all(self.store.cards[g]["is_seed"] for g in seeds):
            raise ValueError("seed_gids must contain known seeds")
        reaches = []
        for seed in seeds:
            distances, queue = {seed: 0}, deque([seed])
            while queue:
                source = queue.popleft()
                if distances[source] == max_depth:
                    continue
                for target in self.adjacency[source]:
                    if target not in distances:
                        distances[target] = distances[source] + 1
                        queue.append(target)
            reaches.append(distances)
        common = set.intersection(*(set(r) for r in reaches)) - set(seeds)
        ranked = sorted(common, key=lambda n: (-self.store.cards[n]["priority_score"], n))
        gids = ranked[:limit]
        return {"nodes": [{"gid": gid, "reached_from": len(seeds),
                           "distance_by_seed": {seed: reach[gid] for seed, reach in zip(seeds, reaches)}}
                          for gid in gids],
                "max_depth": max_depth, "total_matches": len(common),
                "truncated": len(common) > limit,
                "limitations": self.limitations([*seeds, *gids]) +
                               ["bounded_observed_paths_not_fund_matching"]}

    def get_paths(self, source_gid, target_gid):
        self.store.node(source_gid)
        self.store.node(target_gid)
        found, stack, explored = [], [(source_gid,)], 0
        while stack and explored < 20000:
            path = stack.pop()
            explored += 1
            if path[-1] == target_gid:
                found.append(path)
                continue
            if len(path) == 5:  # at most four directed edges
                continue
            for target in reversed(self.adjacency[path[-1]]):
                if target not in path:
                    stack.append((*path, target))
        def distance(path):
            return sum(1 / math.log1p(self.amounts[a, b]) for a, b in zip(path, path[1:]))
        ranked = sorted(found, key=lambda p: (distance(p), p))
        paths = ranked[:5]
        return {"paths": [list(p) for p in paths], "max_edges": 4,
                "truncated": bool(stack) or len(ranked) > 5,
                "search_truncated": bool(stack),
                "limitations": self.limitations([source_gid, target_gid, *(n for p in paths for n in p)]) +
                               ["bounded_observed_paths_not_fund_matching"]}

    def get_seed_paths(self, gid):
        self.store.node(gid)
        # Reverse BFS returns a shortest observed directed witness per reached seed.
        paths, queue = {gid: (gid,)}, deque([gid])
        while queue:
            node = queue.popleft()
            if len(paths[node]) == 5:
                continue
            for previous in self.reverse[node]:
                if previous not in paths:
                    paths[previous] = (previous, *paths[node])
                    queue.append(previous)
        seeds = sorted(s for s in paths if self.store.cards[s]["is_seed"])
        selected = seeds[:5]
        return {"gid": gid, "seed_reach_count": self.store.cards[gid]["metrics"]["seed_reach_count"],
                "paths": [{"seed_gid": s, "path": list(paths[s])} for s in selected],
                "max_edges": 4, "bounded_seed_count": len(seeds),
                "truncated": len(seeds) > 5,
                "limitations": self.limitations([gid, *(n for s in selected for n in paths[s])]) +
                               ["bounded_observed_paths_not_fund_matching",
                                "seed_reach_count_includes_paths_beyond_display_bound"]}

    def get_temporal_patterns(self, gid):
        card = self.store.node(gid)
        names = ("timing_consistent_turnover", "timing_qualifying_outgoing_kzt",
                 "burst_raw", "burst_pct", "synchronous_incoming_raw", "synchronous_incoming_pct")
        return {"gid": gid, "metrics": {n: card["metrics"][n] for n in names},
                "interpretation": "Outgoing on day d qualifies with observed incoming on d, d-1 or d-2.",
                "limitations": card["limitations"] + ["calendar_dates_only", "not_fund_matching"]}

    def compare_nodes(self, gids):
        gids = self._gids(gids)
        keys = ("gid", "role", "role_score", "priority_score", "priority_components",
                "evidence", "limitations")
        return {"nodes": [{k: self.store.cards[g][k] for k in keys} for g in gids],
                "limitations": self.limitations(gids)}

    def dispatch(self, name, arguments):
        allowed = {"get_node", "get_cluster", "find_common_downstream", "get_paths",
                   "get_seed_paths", "get_temporal_patterns", "compare_nodes"}
        if name not in allowed:
            raise ValueError("Unknown investigation tool")
        if not isinstance(arguments, dict):
            raise ValueError("Tool arguments must be an object")
        return getattr(self, name)(**arguments)


GID = {"type": "string", "pattern": "^[0-9]{1,20}$"}
GIDS = {"type": "array", "items": GID, "minItems": 1, "maxItems": 10}


def tool_schema(name, properties, description):
    return {"type": "function", "name": name, "description": description, "strict": True,
            "parameters": {"type": "object", "properties": properties,
                           "required": list(properties), "additionalProperties": False}}


TOOL_SCHEMAS = [
    tool_schema("get_node", {"gid": GID}, "Get calculated role, eligibility, metrics and evidence for one node."),
    tool_schema("get_cluster", {"cluster_id": {"type": "integer", "minimum": 1, "maximum": 1000000}},
                "Get observed cluster summary; clusters are structural hypotheses."),
    tool_schema("find_common_downstream", {"seed_gids": GIDS,
                "max_depth": {"type": "integer", "minimum": 1, "maximum": 4},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50}},
                "Find nodes reached by all listed known seeds within bounded directed paths."),
    tool_schema("get_paths", {"source_gid": GID, "target_gid": GID},
                "Get up to five simple observed directed paths of at most four edges."),
    tool_schema("get_seed_paths", {"gid": GID},
                "Get up to five shortest seed path witnesses of at most four edges."),
    tool_schema("get_temporal_patterns", {"gid": GID},
                "Get calendar-date temporal consistency; never transaction-level fund matching."),
    tool_schema("compare_nodes", {"gids": GIDS}, "Compare up to ten nodes using deterministic priority contributions."),
]
