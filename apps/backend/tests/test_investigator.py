import json
from pathlib import Path

import pytest
from moneygraph.store import ArtifactStore
from moneygraph.investigation_tools import InvestigationTools
from moneygraph.investigator import investigate, InvestigatorUnavailable

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(scope="module")
def store():
    return ArtifactStore(ROOT / "results")


def test_all_seven_tools_and_limits(store):
    tools = InvestigationTools(store)
    node = store.ranked[0]
    gid = node["gid"]
    results = [
        tools.get_node(gid),
        tools.get_cluster(node["cluster_id"]),
        tools.get_temporal_patterns(gid),
        tools.compare_nodes([gid, store.ranked[1]["gid"]]),
        tools.get_seed_paths(gid),
    ]
    edge = store.graph["edges"][0]
    result = tools.get_paths(edge["src"], edge["dst"])
    assert [edge["src"], edge["dst"]] in result["paths"]
    canonical = {(e["src"], e["dst"]) for e in store.graph["edges"]}
    for path in result["paths"]:
        assert len(path) <= 5 and len(path) == len(set(path))
        assert all((a, b) in canonical for a, b in zip(path, path[1:]))
    results.append(result)
    seed = next(g for g in tools.adjacency if store.cards[g]["is_seed"] and tools.adjacency[g])
    common = tools.find_common_downstream([seed, seed], 2, 1)
    assert len(common["nodes"]) == 1 and common["nodes"][0]["reached_from"] == 1
    results.append(common)
    for result in results:
        assert result["limitations"]
        json.dumps(result, allow_nan=False)
    with pytest.raises(ValueError):
        tools.find_common_downstream([seed], 5, 10)
    with pytest.raises(ValueError):
        tools.find_common_downstream([seed], 2, 51)
    with pytest.raises(ValueError):
        tools.compare_nodes([gid] * 11)
    with pytest.raises(ValueError):
        tools.get_node(int(gid))
    with pytest.raises(KeyError):
        tools.get_node("999")
    with pytest.raises(ValueError):
        tools.dispatch("__dict__", {})
    with pytest.raises(ValueError):
        tools.find_common_downstream([next(g for g in store.cards if not store.cards[g]["is_seed"])], 2, 10)


def test_optional_configuration(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    with pytest.raises(InvestigatorUnavailable, match="OPENAI_MODEL"):
        investigate("Explain this graph.")
    monkeypatch.setenv("OPENAI_MODEL", "configured-test-model")
    with pytest.raises(InvestigatorUnavailable, match="OPENAI_API_KEY"):
        investigate("Explain this graph.")
    with pytest.raises(ValueError):
        investigate("")


def test_sdk_tool_roundtrip_without_network(store):
    import httpx2 as httpx
    from openai import OpenAI
    requests = []
    gid = store.ranked[0]["gid"]

    def respond(request):
        body = json.loads(request.content)
        requests.append(body)
        if len(requests) == 1:
            output = [{"type": "function_call", "id": "fc_1", "call_id": "call_1",
                       "name": "get_node", "arguments": json.dumps({"gid": gid}),
                       "status": "completed"}]
        else:
            tool_output = next(x for x in body["input"] if x.get("type") == "function_call_output")
            facts = json.loads(tool_output["output"])
            assert facts["gid"] == gid and "score_breakdown" in facts
            output = [{"type": "message", "id": "msg_1", "role": "assistant", "status": "completed",
                       "content": [{"type": "output_text", "text": f"Признаки консолидации: {gid}; гипотеза требует проверки.",
                                    "annotations": []}]}]
        return httpx.Response(200, json={"id": "resp_test", "object": "response",
            "created_at": 1, "status": "completed", "model": "test-model", "output": output})

    with OpenAI(api_key="test-not-a-real-key", http_client=httpx.Client(
        transport=httpx.MockTransport(respond))) as client:
        result = investigate("Объясни " + gid, store, client=client, model="test-model")
    assert len(requests) == 2 and len(result["tool_calls"]) == 1
    assert all(body["store"] is False for body in requests)
    assert requests[0]["tool_choice"] == "required"
    assert gid in result["answer"]


def test_invalid_tool_and_budget(store):
    from types import SimpleNamespace
    class Responses:
        def create(self, **kwargs):
            return SimpleNamespace(output=[
                SimpleNamespace(type="function_call", name="__dict__", arguments="{}", call_id="x")],
                output_text="")
    client = SimpleNamespace(responses=Responses())
    with pytest.raises(InvestigatorUnavailable, match="six model turns"):
        investigate("Try unknown tool", store, client=client, model="test-model")


def test_api_without_model_is_graceful(monkeypatch):
    from fastapi.testclient import TestClient
    from moneygraph.api import create_app
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    with TestClient(create_app(ROOT / "results")) as client:
        assert client.post("/api/investigate", json={"question": "Объясни узел"}).status_code == 503
        assert client.get("/api/top-nodes").status_code == 200


def test_tools_cycles_cross_level_and_unreachable():
    from types import SimpleNamespace
    nodes = {g: {"gid": g, "is_seed": g in ("1", "2"), "priority_score": .5,
                 "limitations": ["observed_graph_only"], "metrics": {"seed_reach_count": 2}}
             for g in ("1", "2", "3", "4", "5")}
    store = SimpleNamespace(nodes=nodes, cards=nodes, node=lambda gid: nodes[gid],
                            graph={"edges": [{"src": a, "dst": b, "sum_kzt": 10}
                                for a,b in [("1","3"),("2","4"),("3","4"),("4","3")]]})
    tools = InvestigationTools(store)
    assert {n["gid"] for n in tools.find_common_downstream(["1","2"], 3, 50)["nodes"]} == {"3","4"}
    assert tools.get_paths("1","5")["paths"] == []
    paths = tools.get_paths("1","4")["paths"]
    assert paths == [["1","3","4"]]
    for item in tools.get_seed_paths("3")["paths"]:
        assert len(item["path"]) == len(set(item["path"]))
