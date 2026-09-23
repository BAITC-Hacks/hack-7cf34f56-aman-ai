import networkx as nx
import pandas as pd
import pytest

from moneygraph.roles import apply_roles
from test_mandatory_pipeline import row


@pytest.mark.parametrize("depth", [0, 4])
def test_peripheral_uses_eligible_scores(depth):
    g = nx.DiGraph()
    g.add_node("x", depth=depth, is_seed=depth == 0)
    # .30*1 + .25*.92 = .53; ineligible terminal = .96.
    r = row("x", depth=depth, senders_pct=1, inbound_volume_pct=.92,
            retention_obs=1, incoming_kzt=100)
    if depth == 0:
        r["senders_pct"] = .5  # compensate permitted .15 retention
        r["flow_balance"] = 1
        r["in_degree_pct"] = r["out_degree_pct"] = 1
        r["in_degree"] = r["out_degree"] = 1  # theoretical transit .75
    result = apply_roles(pd.DataFrame([r]), g, {"x": 1}).iloc[0]
    assert result.role == "peripheral"
    assert result.role_score == pytest.approx(.47)
    assert result.peripheral_score == pytest.approx(.47)
    assert not result.terminal_eligible


def test_peripheral_low_scores_and_floor():
    g = nx.DiGraph()
    g.add_nodes_from(["low", "floor"])
    f = pd.DataFrame([row("low"), row("floor", receivers_pct=1, outbound_volume_pct=.2)])
    result = apply_roles(f, g, {"low": 1, "floor": 1}).set_index("gid")
    assert result.loc["low", "role"] == "peripheral"
    assert result.loc["low", "role_score"] == 1
    assert result.loc["floor", "role"] == "distributor"
    assert result.loc["floor", "role_score"] == pytest.approx(.55)


@pytest.mark.parametrize("offset,expected", [(0, 1), (1, 1), (2, 1), (3, 0)])
def test_temporal_calendar_window(offset, expected):
    from moneygraph.temporal import add_temporal_features
    tx = pd.DataFrame([
        {"src": "S", "dst": "X", "date": "2026-07-10", "sum_kzt": 10},
        {"src": "X", "dst": "T", "date": f"2026-07-{10+offset}", "sum_kzt": 50},
    ])
    r = add_temporal_features(pd.DataFrame({"gid": ["X"], "depth": [1]}), tx).iloc[0]
    assert r.timing_consistent_turnover == expected


def test_temporal_no_double_count_and_no_incoming():
    from moneygraph.temporal import add_temporal_features
    tx = pd.DataFrame([
        ("S", "X", "2026-07-10", 10), ("S", "X", "2026-07-11", 20),
        ("Q", "X", "2026-07-11", 30), ("X", "T", "2026-07-12", 100),
        ("X", "T", "2026-07-15", 100), ("Z", "T", "2026-07-12", 50),
    ], columns=["src", "dst", "date", "sum_kzt"])
    f = add_temporal_features(pd.DataFrame({"gid": ["X", "Z"], "depth": [1, 1]}), tx).set_index("gid")
    assert f.loc["X", "timing_consistent_turnover"] == .5
    assert f.loc["Z", "timing_consistent_turnover"] == 0
    assert f.loc["X", "burst_raw"] == 2
    assert f.loc["X", "synchronous_incoming_raw"] == 2
    assert f.timing_consistent_turnover.between(0, 1).all()


def test_global_top20_membership_regression():
    from pathlib import Path
    from moneygraph.outputs import validate_outputs
    root = Path(__file__).resolve().parents[3]
    nodes = pd.read_csv(root / "results/nodes_roles.csv", dtype={"gid": str})
    clusters = pd.read_csv(root / "results/clusters.csv")
    top = pd.read_csv(root / "results/top_nodes.csv", dtype={"gid": str})
    validate_outputs(nodes, clusters, top)
    # A perfectly sorted but wrong top list must fail.
    wrong = nodes.sort_values(["priority_score", "gid"], ascending=[False, True]).iloc[1:21]
    wrong = wrong[["gid", "role", "priority_score", "evidence"]].rename(columns={"evidence": "why"})
    wrong.insert(0, "rank", range(1, 21))
    with pytest.raises(ValueError, match="top ordering"):
        validate_outputs(nodes, clusters, wrong)


def test_real_product_json():
    from pathlib import Path
    import json
    from moneygraph.product import validate_product
    root = Path(__file__).resolve().parents[3]
    cards = json.loads((root / "results/node_cards.json").read_text())
    graph = json.loads((root / "results/graph.json").read_text())
    validate_product(cards, graph)
    assert len(cards) == 2248 and len(graph["edges"]) == 3119
    for card in cards.values():
        assert card["evidence"] and card["next_action"]
        assert "observed_graph_only" in card["limitations"]
        if card["depth"] == 4:
            assert card["score_breakdown"]["terminal"]["ineligible_reason"] == "observation_boundary"
            assert card["metrics"]["consolidator_retention_used"] == 0
        if card["is_seed"]:
            assert "seed_incoming_incomplete" in card["limitations"]


def test_real_temporal_peripheral_and_priority_consistency():
    from explore import state
    from moneygraph.roles import ROLE_ORDER
    _, _, _, f, _, _ = state()
    ratio = f.outgoing_kzt.div(f.incoming_kzt.where(f.incoming_kzt > 0))
    assert int(ratio.between(.8, 1.2).sum()) == 72
    for r in f.itertuples(index=False):
        eligible = [getattr(r, name + "_score") for name in ROLE_ORDER if getattr(r, name + "_eligible")]
        maximum = max(eligible, default=0)
        assert r.peripheral_score == pytest.approx(1 - maximum)
        if r.role == "peripheral":
            assert maximum < .55
            assert r.role_score == pytest.approx(1 - maximum)
        else:
            assert getattr(r, r.role + "_eligible")
        temporal = max(r.timing_consistent_turnover, r.burst_pct, r.synchronous_incoming_pct)
        assert r.temporal == temporal
        expected = (.30 * r.role_weight * r.role_score + .25 * r.seed_convergence +
                    .15 * (r.pagerank_pct + r.betweenness_pct) / 2 +
                    .15 * r.observed_volume_pct + .10 * temporal + .05 * r.resilience_pct)
        assert r.priority_score == pytest.approx(expected)
    assert f.timing_consistent_turnover.between(0, 1).all()
    candidates = set(f.sort_values(["preliminary_priority", "gid"], ascending=[False, True]).head(50).gid)
    assert f.loc[~f.gid.isin(candidates), "resilience_pct"].eq(0).all()
    assert not ((f.depth == 4) & (f.role == "terminal")).any()
