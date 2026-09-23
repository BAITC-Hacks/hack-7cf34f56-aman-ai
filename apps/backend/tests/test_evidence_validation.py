from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from moneygraph.evidence import make_evidence
from moneygraph.features import pct_depth
from moneygraph.outputs import CLUSTER_COLUMNS, NODE_COLUMNS, TOP_COLUMNS, validate_outputs


@pytest.mark.parametrize("out_degree,outgoing", [(1, 57_500.0), (1, 0.0)])
def test_terminal_evidence_preserves_observed_outgoing(out_degree, outgoing):
    evidence = make_evidence(SimpleNamespace(
        role="terminal", incoming_kzt=2_500_000.0,
        outgoing_kzt=outgoing, out_degree=out_degree, limitation_flags=[],
    ))
    assert "нет наблюдаемых исходящих" not in evidence
    assert f"исходящий объём {outgoing:.0f} KZT" in evidence
    assert len(evidence) <= 200


def test_terminal_evidence_can_report_no_observed_outgoing():
    evidence = make_evidence(SimpleNamespace(
        role="terminal", incoming_kzt=10_000.0,
        outgoing_kzt=0.0, out_degree=0, limitation_flags=[],
    ))
    assert "нет наблюдаемых исходящих переводов" in evidence


def test_coordinator_evidence_identifies_percentiles_and_boundary():
    evidence = make_evidence(SimpleNamespace(
        role="coordinator", pagerank_pct=.92, betweenness_pct=.81,
        seed_reach_count=81, limitation_flags=["observation_boundary"],
    ))
    assert "процентили" in evidence
    assert "depth-группе" in evidence
    assert "PageRank 0.92" in evidence and "betweenness 0.81" in evidence
    assert "Граница наблюдения depth=4 ограничивает выводы." in evidence
    assert len(evidence) <= 200


@pytest.mark.parametrize("invalid", [np.inf, -np.inf, np.nan])
def test_nonfinite_percentiles_follow_invalid_group_fallback(invalid):
    values = pd.Series([1., 2., invalid, 10., 20.])
    depths = pd.Series([1, 1, 1, 2, 2])
    assert pct_depth(values, depths).tolist() == [0., 0., 0., 0., 1.]


@pytest.fixture
def valid_output_frames():
    nodes = pd.DataFrame([
        [str(gid), "peripheral", .5, 1, .5, "Наблюдаемых данных недостаточно."]
        for gid in range(10_000, 12_248)
    ], columns=NODE_COLUMNS)
    clusters = pd.DataFrame([
        [1, 2248, 1, 0., "10000|10001|10002", "Наблюдаемое сообщество."]
    ], columns=CLUSTER_COLUMNS)
    top = pd.DataFrame([
        [rank, str(9_999 + rank), "peripheral", .5, "Наблюдаемых данных недостаточно."]
        for rank in range(1, 21)
    ], columns=TOP_COLUMNS)
    validate_outputs(nodes, clusters, top)
    return nodes, clusters, top


@pytest.mark.parametrize("invalid", [None, np.nan, "", "   ", "x" * 201])
@pytest.mark.parametrize("frame_index,column", [(0, "evidence"), (2, "why")])
def test_output_validation_rejects_missing_or_invalid_evidence(valid_output_frames, invalid, frame_index, column):
    valid_output_frames[frame_index].loc[0, column] = invalid
    with pytest.raises(ValueError, match="evidence"):
        validate_outputs(*valid_output_frames)
