import json
from pathlib import Path

import pytest
from moneygraph.store import ArtifactStore
from moneygraph.investigation_tools import InvestigationTools
from moneygraph.investigator import investigate, InvestigatorUnavailable
from moneygraph.critic import CriticConfig, critique
from moneygraph.grounding import validate_answer

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


def openai_node_client(gid, answer="Наблюдаемые признаки требуют дальнейшей проверки."):
    from types import SimpleNamespace

    class Responses:
        def __init__(self):
            self.calls = 0

        def create(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                return SimpleNamespace(output=[SimpleNamespace(
                    type="function_call", name="get_node",
                    arguments=json.dumps({"gid": gid}), call_id="call-1")],
                    output_text="")
            return SimpleNamespace(output=[SimpleNamespace(type="message")],
                                   output_text=answer)

    return SimpleNamespace(responses=Responses())


def critic_client(payload=None, error=None):
    from types import SimpleNamespace

    class Completions:
        def create(self, **kwargs):
            if error:
                raise error
            content = json.dumps(payload, ensure_ascii=False) if not isinstance(payload, str) else payload
            return SimpleNamespace(choices=[SimpleNamespace(
                message=SimpleNamespace(content=content))])

    return SimpleNamespace(chat=SimpleNamespace(completions=Completions()))


CRITIC_CONFIG = CriticConfig("test-not-a-real-key", "critic-test-model",
                             "https://example.invalid/v1")


def test_chat_response_schema_context_and_nvidia_approval(store):
    gid = store.ranked[0]["gid"]
    before = {name: (ROOT / "results" / name).read_bytes() for name in
              ("nodes_roles.csv", "clusters.csv", "top_nodes.csv",
               "node_cards.json", "graph.json")}
    result = investigate(
        "Почему этот узел важен?", store, context_gid=gid,
        client=openai_node_client(gid), model="test-model",
        critic_client=critic_client({"approved": True, "issues": [],
                                     "corrected_answer": None}),
        critic_config=CRITIC_CONFIG)
    assert result["tools_used"] == ["get_node"]
    assert {item["type"] for item in result["evidence"]} >= {
        "role", "priority", "seed_reachability", "observed_flow"}
    assert result["critic"] == {"used": True, "approved": True, "issues": [],
                                 "corrected_answer": None, "status": "approved"}
    assert result["limitations"]
    after = {name: (ROOT / "results" / name).read_bytes() for name in before}
    assert before == after


def test_nvidia_rejection_uses_validated_correction(store):
    gid = store.ranked[0]["gid"]
    corrected = "Узел имеет наблюдаемые структурные признаки; вывод требует проверки."
    result = investigate(
        "Назови вывод", store, client=openai_node_client(
            gid, "Этот клиент доказанно организатор преступной группы."), model="test-model",
        critic_client=critic_client({
            "approved": False,
            "issues": [{"type": "guilt_claim", "claim": "доказанно организатор",
                        "reason": "Детерминированные данные не устанавливают вину."}],
            "corrected_answer": corrected}), critic_config=CRITIC_CONFIG)
    assert result["answer"] == corrected
    assert result["critic"]["status"] == "corrected"
    assert result["critic"]["issues"][0]["type"] == "guilt_claim"


@pytest.mark.parametrize("client", [
    critic_client("not-json"),
    critic_client(error=TimeoutError("provider timeout")),
    critic_client({"approved": False, "issues": [], "corrected_answer": None}),
])
def test_nvidia_unavailable_or_malformed_fails_open(store, client):
    gid = store.ranked[0]["gid"]
    draft = "Наблюдаемый вывод из рассчитанных фактов."
    result = investigate("Объясни узел", store, client=openai_node_client(gid, draft),
                         model="test-model", critic_client=client,
                         critic_config=CRITIC_CONFIG)
    assert result["answer"] == draft
    assert result["critic"]["used"] is False
    assert result["critic"]["status"] == "unavailable"


def test_critic_not_configured_is_explicit(monkeypatch):
    for name in ("NVIDIA_API_KEY", "NVIDIA_MODEL", "NVIDIA_BASE_URL"):
        monkeypatch.delenv(name, raising=False)
    result = critique("q", "draft", [], [], [])
    assert result["used"] is False and result["status"] == "not_configured"


def test_semantic_validator_rejects_degree_percentile_depth_and_numeric_errors(store):
    tools = InvestigationTools(store)
    transit_gid = "100000003635170100"
    node = tools.get_node(transit_gid)
    trace = [{"tool": "get_node", "arguments": {"gid": transit_gid}, "result": node}]
    assert any("in_degree" in error for error in validate_answer(
        f"У узла {node['metrics']['in_degree']} входящих транзакций.", trace))
    synchronous = round(node["metrics"]["synchronous_incoming_pct"] * 100)
    assert any("percentile" in error for error in validate_answer(
        f"{synchronous}% входящих переводов были синхронными.", trace))
    assert any("non-boundary" in error for error in validate_answer(
        "Глубина анализа ограничена: depth 1.", trace))
    assert any("priority" in error for error in validate_answer(
        "Приоритетный скор равен 0.123456.", trace))


def test_seed_target_semantics_and_methodology_tool(store):
    tools = InvestigationTools(store)
    target = "100000003115284100"
    result = tools.get_seed_paths(target)
    assert result["target_gid"] == target and result["target_is_seed"] is False
    trace = [{"tool": "get_seed_paths", "arguments": {"gid": target}, "result": result}]
    assert any("target_gid" in error for error in validate_answer(
        f"Проверьте seed {target}.", trace))
    policy = tools.get_methodology_context("observation_boundary")
    assert policy["source"] == "approved_analytics_contract"
    assert "observation_boundary" in policy["limitations"]


def test_methodology_question_without_context_completes(store):
    from types import SimpleNamespace

    class Responses:
        def __init__(self): self.calls = 0
        def create(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                return SimpleNamespace(output=[SimpleNamespace(
                    type="function_call", name="get_methodology_context",
                    arguments=json.dumps({"topic": "observation_boundary"}),
                    call_id="method-1")], output_text="")
            return SimpleNamespace(output=[SimpleNamespace(type="message")],
                output_text=("Depth 4 — граница наблюдения: исходящие переводы за ней могут "
                             "не входить в экспорт, поэтому отсутствие исходящих не доказывает Terminal."))

    client = SimpleNamespace(responses=Responses())
    result = investigate("Почему depth=4 нельзя автоматически считать Terminal?",
                         store, client=client, model="test-model")
    assert result["tools_used"] == ["get_methodology_context"]
    assert client.responses.calls == 2
    assert validate_answer(result["answer"], result["tool_calls"]) == []


def test_only_one_correction_turn_then_safe_fallback(store):
    from types import SimpleNamespace
    gid = "100000003115284100"

    class Responses:
        def __init__(self): self.calls = 0
        def create(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                return SimpleNamespace(output=[SimpleNamespace(
                    type="function_call", name="get_node",
                    arguments=json.dumps({"gid": gid}), call_id="node-1")], output_text="")
            if self.calls in (2, 3):
                return SimpleNamespace(output=[SimpleNamespace(type="message")],
                    output_text="У узла 8 входящих транзакций.")
            raise AssertionError("more than one correction turn")

    client = SimpleNamespace(responses=Responses())
    result = investigate("Объясни узел", store, client=client, model="test-model")
    assert client.responses.calls == 3
    assert validate_answer(result["answer"], result["tool_calls"]) == []
    assert "входящих связей" in result["answer"]
