"""Authoritative semantics for AI-facing MoneyGraph facts."""

SEMANTIC_GLOSSARY = {
    "in_degree": "number of observed incoming graph edges / sender relationships; not transaction count",
    "out_degree": "number of observed outgoing graph edges / recipient relationships; not transaction count",
    "n_tx": "observed transaction count aggregated on an edge",
    "unique_senders": "number of distinct observed senders",
    "unique_recipients": "number of distinct observed recipients",
    "percentile": "a *_pct field is a depth-relative percentile rank, not the raw feature value or share",
    "seed_reach_count": "number of known seed gids with at least one observed directed path to the target node",
    "target_gid": "the node being investigated; it is a seed only when target_is_seed is true",
    "depth": "minimum discovery generation in the supplied graph; only depth 4 is the observation boundary",
    "observation_boundary": "at depth 4, outgoing transfers beyond the export may be unobserved; zero observed outgoing does not prove funds stopped",
}

METHODOLOGY = {
    "observation_boundary": {
        "facts": [
            "depth is the minimum discovery generation in the supplied graph",
            "depth 4 is the traversal observation boundary",
            "outgoing transfers beyond depth 4 may be absent from the export",
            "zero observed outgoing at depth 4 does not prove funds stopped",
            "depth-4 nodes are not Terminal solely because no outgoing edge is observed",
        ],
        "limitations": ["observation_boundary", "observed_graph_only"],
    },
    "degree": {
        "facts": [SEMANTIC_GLOSSARY["in_degree"], SEMANTIC_GLOSSARY["out_degree"],
                  SEMANTIC_GLOSSARY["n_tx"]],
        "limitations": ["observed_graph_only"],
    },
    "percentile": {
        "facts": [SEMANTIC_GLOSSARY["percentile"]],
        "limitations": ["depth_relative_comparison"],
    },
    "seed_reachability": {
        "facts": [SEMANTIC_GLOSSARY["seed_reach_count"], SEMANTIC_GLOSSARY["target_gid"]],
        "limitations": ["observed_graph_only", "paths_do_not_prove_same_funds"],
    },
}


def definitions(*names):
    """Return only requested definitions; *_pct fields share one definition."""
    result = {}
    for name in names:
        key = "percentile" if name.endswith("_pct") else name
        if key in SEMANTIC_GLOSSARY:
            result[name] = SEMANTIC_GLOSSARY[key]
    return result


def methodology(topic):
    if topic not in METHODOLOGY:
        raise ValueError("Unknown methodology topic")
    return {"topic": topic, **METHODOLOGY[topic],
            "source": "approved_analytics_contract"}


def prompt_glossary():
    return "\n".join(f"- {name}: {meaning}" for name, meaning in SEMANTIC_GLOSSARY.items())
