"""Frontend artifacts from calculated facts; gids remain decimal strings."""
import json
from pathlib import Path

from .roles import ROLE_ORDER


METRICS = (
    "incoming_kzt", "outgoing_kzt", "in_degree", "out_degree", "unique_senders",
    "unique_recipients", "retention_obs", "flow_balance", "pagerank", "pagerank_pct",
    "betweenness", "betweenness_pct", "seed_reach_count", "seed_convergence",
    "timing_consistent_turnover", "timing_qualifying_outgoing_kzt", "burst_raw",
    "burst_pct", "synchronous_incoming_raw", "synchronous_incoming_pct",
    "consolidator_retention_used", "bridge_count", "bridge_pct",
)


def priority_components(row):
    """Weighted contributions, which sum to the unrounded priority."""
    return {
        "role": .30 * row.role_weight * row.role_score,
        "seed_convergence": .25 * row.seed_convergence,
        "centrality": .15 * row.centrality,
        "observed_volume": .15 * row.observed_volume_pct,
        "temporal": .10 * row.temporal,
        "resilience": .05 * row.resilience_pct,
    }


def build_product(features, graph):
    cards, nodes = {}, []
    edges = [{"src": a, "dst": b, "sum_kzt": float(d["sum_kzt"]), "n_tx": int(d["n_tx"])}
             for a, b, d in sorted(graph.edges(data=True))]
    incoming = {gid: [] for gid in graph}
    outgoing = {gid: [] for gid in graph}
    for edge in edges:
        incoming[edge["dst"]].append(edge)
        outgoing[edge["src"]].append(edge)
    for r in features.sort_values("gid").itertuples(index=False):
        node = {"gid": r.gid, "depth": int(r.depth), "is_seed": bool(r.is_seed),
                "role": r.role, "role_score": round(r.role_score, 6),
                "priority_score": round(r.priority_score, 6), "cluster_id": int(r.cluster_id)}
        limitations = ["observed_graph_only", *r.limitation_flags]
        if r.is_seed:
            limitations.append("seed_incoming_incomplete")
        action = ("Запросить следующий уровень исходящих переводов." if r.depth == 4 else
                  "Проверить downstream-получателей и распределение исходящего потока." if r.role == "distributor" else
                  "Проверить наблюдаемые пути от связанных seed-узлов." if r.seed_reach_count > 1 else
                  "Запросить полную историю входящих и исходящих переводов за период.")
        cards[r.gid] = {
            **node,
            "score_breakdown": {
                role: {"score": float(getattr(r, role + "_score")),
                       "eligible": bool(getattr(r, role + "_eligible")),
                       "ineligible_reason": None if getattr(r, role + "_eligible") else str(getattr(r, role + "_ineligible_reason"))}
                for role in (*ROLE_ORDER, "peripheral")
            },
            "metrics": {name: getattr(r, name) for name in METRICS},
            "priority_components": priority_components(r),
            "evidence": r.evidence, "limitations": limitations, "next_action": action,
            "incoming_edges": incoming[r.gid], "outgoing_edges": outgoing[r.gid],
        }
        nodes.append(node)
    return cards, {"nodes": nodes, "edges": edges}


def validate_product(cards, graph):
    nodes = {n["gid"]: n for n in graph["nodes"]}
    if set(cards) != set(nodes) or len(nodes) != len(graph["nodes"]):
        raise ValueError("Product node universe mismatch")
    for gid, card in cards.items():
        if not isinstance(gid, str) or not gid.isascii() or not gid.isdecimal() or card["gid"] != gid:
            raise ValueError("Product gid must be an exact decimal string")
        scores = card["score_breakdown"]
        if set(scores) != set((*ROLE_ORDER, "peripheral")):
            raise ValueError("Missing role score metadata")
        if not all(isinstance(x["eligible"], bool) and 0 <= x["score"] <= 1 and
                   (x["eligible"] or x["ineligible_reason"]) for x in scores.values()):
            raise ValueError("Invalid role score metadata")
        if not scores[card["role"]]["eligible"] or (card["depth"] == 4 and scores["terminal"]["eligible"]):
            raise ValueError("Invalid selected role eligibility")
        if abs(sum(card["priority_components"].values()) - card["priority_score"]) > 5.1e-7:
            raise ValueError("Invalid priority breakdown")
    for edge in graph["edges"]:
        if edge["src"] not in nodes or edge["dst"] not in nodes:
            raise ValueError("Product edge endpoint mismatch")
    # allow_nan=False also rejects nonfinite nested metrics.
    json.dumps([cards, graph], allow_nan=False)


def write_product(features, directed, output_dir):
    cards, graph = build_product(features, directed)
    validate_product(cards, graph)
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    for name, value in (("node_cards.json", cards), ("graph.json", graph)):
        (directory / name).write_text(
            json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n",
            encoding="utf-8")
    return cards, graph
