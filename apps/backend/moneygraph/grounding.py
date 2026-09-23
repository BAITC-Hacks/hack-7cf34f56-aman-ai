"""Deterministic natural-language checks and safe explanations for tool facts."""
import json
import re


def _sentences(text):
    return re.split(r"(?<=[.!?])\s+|\n+", text)


def _number(value):
    return float(str(value).replace(" ", "").replace(",", "."))


def _close(value, expected):
    return abs(value - expected) <= max(0.0006, abs(expected) * 0.001)


def validate_answer(answer, trace):
    """Return semantic errors found by deterministic checks; empty means pass."""
    if not isinstance(answer, str) or not answer.strip():
        return ["answer is empty"]
    text = answer.lower()
    errors = []
    nodes, metric_records, methodology_topics = [], [], set()
    seed_targets = []
    known_amounts, role_scores, priority_scores, seed_counts = set(), set(), set(), set()

    for call in trace:
        result = call.get("result", {})
        if call.get("tool") == "get_methodology_context":
            methodology_topics.add(result.get("topic"))
        if "metrics" in result:
            metric_records.append(result["metrics"])
        if "role_score" in result and "metrics" in result:
            nodes.append(result)
        if call.get("tool") == "compare_nodes":
            nodes.extend(result.get("nodes", []))
        if call.get("tool") == "get_seed_paths":
            seed_targets.append((result.get("target_gid", result.get("gid")),
                                 bool(result.get("target_is_seed", False))))
            seed_counts.update(x for x in (result.get("seed_reach_count"),
                                           result.get("bounded_seed_count")) if x is not None)

    for node in nodes:
        metrics = node.get("metrics", {})
        role_scores.add(float(node["role_score"]))
        priority_scores.add(float(node["priority_score"]))
        seed_counts.add(metrics.get("seed_reach_count"))
        for name in ("incoming_kzt", "outgoing_kzt"):
            if name in metrics:
                known_amounts.add(float(metrics[name]))
        for edge in (*node.get("incoming_edges", []), *node.get("outgoing_edges", [])):
            if "sum_kzt" in edge:
                known_amounts.add(float(edge["sum_kzt"]))

        for direction, field in (("incoming", "in_degree"), ("outgoing", "out_degree")):
            if field not in metrics:
                continue
            value = int(metrics[field])
            patterns = [
                rf"\b{value}\s+{direction}\s+(?:transactions?|transfers?)",
                rf"\b{value}\s+(?:входящ\w*|исходящ\w*)\s+(?:транзакц\w*|перевод\w*)",
            ]
            if any(re.search(pattern, text) for pattern in patterns):
                errors.append(f"{field} was described as transaction count")

        limitations = set(node.get("limitations", []))
        if "observation_boundary" not in limitations and int(node.get("depth", -1)) != 4:
            if re.search(r"(?:глубин\w*\s+анализ\w*\s+огранич|depth\s+(?:is\s+)?limit)", text):
                errors.append("non-boundary node depth was described as an observation limit")

    for metrics in metric_records:
        for name, value in metrics.items():
            if not name.endswith("_pct") or not isinstance(value, (int, float)):
                continue
            percent = round(float(value) * 100)
            roots = ("sync", "синхрон") if "synchronous" in name else (
                "burst", "всплеск") if "burst" in name else ()
            for sentence in _sentences(text):
                if roots and any(root in sentence for root in roots) and re.search(rf"\b{percent}\s*%", sentence):
                    if not any(word in sentence for word in
                               ("percentile", "перцентил", "процентил", "rank", "ранг")):
                        errors.append(f"{name} percentile was described as a raw percentage")

    if "observation_boundary" not in methodology_topics and not any(
            "observation_boundary" in node.get("limitations", []) for node in nodes):
        if re.search(r"(?:границ\w*\s+наблюден|observation\s+boundary)", text):
            errors.append("observation boundary was asserted without supporting facts")

    for gid, is_seed in seed_targets:
        if gid and not is_seed:
            patterns = [rf"\bseed(?:-уз(?:ел|ла|лу|лом|лы|лов))?\s+{re.escape(gid)}\b",
                        rf"\b{re.escape(gid)}\s+(?:is\s+)?(?:a\s+)?seed\b"]
            if any(re.search(pattern, text) for pattern in patterns):
                errors.append("target_gid was incorrectly called a seed")

    numeric_rules = [
        (r"(?:role[- ]?score|роль[- ]?скор|оценк\w*\s+рол\w*)\D{0,20}(\d+(?:[.,]\d+)?)",
         role_scores, "role score"),
        (r"(?:priority[- ]?score|приоритет\w*\s+(?:скор|оценк\w*))\D{0,20}(\d+(?:[.,]\d+)?)",
         priority_scores, "priority score"),
    ]
    for pattern, expected, label in numeric_rules:
        for match in re.finditer(pattern, text):
            value = _number(match.group(1))
            if expected and not any(_close(value, item) for item in expected):
                errors.append(f"unsupported numeric {label}: {value}")

    for match in re.finditer(r"([\d\s.,]+)\s*kzt\b", text):
        raw = re.sub(r"[\s,]", "", match.group(1))
        try:
            value = float(raw)
        except ValueError:
            continue
        if known_amounts and not any(_close(value, item) for item in known_amounts):
            errors.append(f"unsupported KZT amount: {value}")

    for match in re.finditer(r"(?:из\s+|from\s+|минимум\s+|at\s+least\s+)?(\d+)\s+(?:известн\w*\s+)?seed", text):
        value = int(match.group(1))
        if seed_counts and value not in seed_counts:
            errors.append(f"unsupported seed count: {value}")

    return list(dict.fromkeys(errors))


def safe_fallback(trace):
    """Produce a cautious answer directly from structured facts."""
    parts = []
    for call in trace:
        name, result = call.get("tool"), call.get("result", {})
        if "error" in result:
            continue
        if name == "get_methodology_context":
            parts.append("Методологический контекст: " + "; ".join(result["facts"]) + ".")
        elif name == "get_node":
            m = result["metrics"]
            parts.append(
                f"Узел {result['gid']}: роль {result['role']} (score {result['role_score']:.6f}), "
                f"priority {result['priority_score']:.6f}; наблюдаемый входящий объём "
                f"{m['incoming_kzt']:.0f} KZT, исходящий {m['outgoing_kzt']:.0f} KZT; "
                f"{m['in_degree']} наблюдаемых входящих связей и {m['out_degree']} исходящих; "
                f"достижим из {m['seed_reach_count']} известных seed-узлов.")
            if "observation_boundary" in result.get("limitations", []):
                parts.append("Узел находится на границе наблюдения depth=4; отсутствие наблюдаемых исходящих переводов не подтверждает Terminal.")
        elif name == "compare_nodes":
            rows = [f"{n['gid']}: {n['role']}, role score {n['role_score']:.6f}, priority {n['priority_score']:.6f}"
                    for n in result["nodes"]]
            parts.append("Сравнение рассчитанных фактов: " + "; ".join(rows) + ".")
        elif name == "get_temporal_patterns":
            m = result["metrics"]
            parts.append(f"Для {result['gid']} timing-consistent turnover={m['timing_consistent_turnover']:.6f}; "
                         "значения *_pct являются depth-relative percentile ranks, а не долями транзакций.")
        elif name == "get_seed_paths":
            listed = ", ".join(item["seed_gid"] for item in result["paths"])
            parts.append(f"Целевой узел {result['target_gid']} достижим из "
                         f"{result['seed_reach_count']} известных seed-узлов. "
                         f"Показанные seed-источники: {listed}.")
        elif name == "get_paths":
            parts.append("Наблюдаемые направленные пути: " + json.dumps(result["paths"], ensure_ascii=False) + ".")
        elif name == "find_common_downstream":
            gids = ", ".join(item["gid"] for item in result["nodes"])
            parts.append(f"Общие наблюдаемые downstream-узлы: {gids or 'не найдены в заданных границах' }.")
        elif name == "get_cluster":
            parts.append(f"Кластер {result['cluster_id']}: {result['n_nodes']} узлов, "
                         f"{result['n_seed']} seed-узлов; это структурная гипотеза.")
    parts.append("Вывод является гипотезой для проверки по неполному наблюдаемому графу.")
    return " ".join(parts)
