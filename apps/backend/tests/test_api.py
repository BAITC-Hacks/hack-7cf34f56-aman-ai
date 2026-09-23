from pathlib import Path
import json
import pytest
from fastapi.testclient import TestClient
from moneygraph.api import create_app

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def client():
    with TestClient(create_app(ROOT / "results")) as client:
        yield client


def test_read_endpoints(client):
    assert client.get("/health").json() == {"status": "ok", "artifacts_ready": True}
    top = client.get("/api/top-nodes").json()
    assert len(top) == 20
    gid = top[0]["gid"]
    assert isinstance(gid, str)
    card = client.get(f"/api/nodes/{gid}").json()
    assert len(card["score_breakdown"]) == 6
    assert client.get("/api/nodes/999").status_code == 404
    assert client.get("/api/nodes/1e17").status_code == 400
    assert client.get(f'/api/clusters/{card["cluster_id"]}').status_code == 200
    assert client.get("/api/clusters/999999").status_code == 404
    assert client.get("/api/search", params={"gid": gid}).json()[0]["gid"] == gid
    prefix = client.get("/api/search", params={"gid": gid[:7], "limit": 3}).json()
    assert 0 < len(prefix) <= 3 and all(n["gid"].startswith(gid[:7]) for n in prefix)
    assert client.get("/api/search", params={"gid": "9"}).json() == []


@pytest.mark.parametrize("hop", [1, 2])
def test_subgraph(client, hop):
    gid = client.get("/api/top-nodes").json()[0]["gid"]
    result = client.get(f"/api/nodes/{gid}/subgraph", params={"hop": hop})
    assert result.status_code == 200
    data = result.json()
    assert 1 <= len(data["nodes"]) <= 250
    ids = {n["gid"] for n in data["nodes"]}
    raw = json.loads((ROOT / "results/graph.json").read_text())
    canonical = {(e["src"], e["dst"]) for e in raw["edges"]}
    assert gid in ids
    assert all(isinstance(x, str) for x in ids)
    assert all((e["src"], e["dst"]) in canonical and e["src"] in ids and e["dst"] in ids for e in data["edges"])


def test_invalid_hop_boundary_metadata_and_missing_results(client, tmp_path):
    cards = json.loads((ROOT / "results/node_cards.json").read_text())
    gid = next(g for g, c in cards.items() if c["depth"] == 4)
    assert client.get(f"/api/nodes/{gid}/subgraph?hop=3").status_code == 400
    card = client.get(f"/api/nodes/{gid}").json()
    assert card["score_breakdown"]["terminal"] == {
        "score": cards[gid]["score_breakdown"]["terminal"]["score"],
        "eligible": False, "ineligible_reason": "observation_boundary"}
    with TestClient(create_app(tmp_path)) as missing:
        assert missing.get("/health").status_code == 200
        assert missing.get("/api/top-nodes").status_code == 503


def test_subgraph_cap_preserves_center_and_direction():
    from moneygraph.store import ArtifactStore
    store = ArtifactStore.__new__(ArtifactStore)
    gids = [str(i) for i in range(301)]
    store.nodes = {g: {"gid": g} for g in gids}
    store.cards = {g: {"gid": g, "limitations": ["observed_graph_only"]} for g in gids}
    store.graph = {"nodes": list(store.nodes.values()),
                   "edges": [{"src": "0", "dst": g} for g in gids[1:]]}
    store.neighbors = {g: {"0"} for g in gids}
    store.neighbors["0"] = set(gids[1:])
    data = store.subgraph("0", 1)
    assert len(data["nodes"]) == 250 and data["truncated"]
    assert data["nodes"][0]["gid"] == "0" and data["total_nodes"] == 301
    assert len(data["edges"]) == 249
    assert all(e["src"] == "0" for e in data["edges"])
