# AI chat frontend handoff

The backend endpoint is `POST http://127.0.0.1:8000/api/investigate`. Start the
API with provider variables loaded server-side. Frontend code must never read or
send an OpenAI or NVIDIA key.

## Request

```json
{
  "question": "Почему этот узел имеет высокий priority?",
  "context_gid": "100000003115284100"
}
```

`question` is required and limited to 1–2000 characters. `context_gid` is
optional, must be a decimal string of at most 20 digits, and should be the
currently selected node.

## Successful response

```json
{
  "answer": "Краткая гипотеза, основанная на рассчитанных фактах.",
  "tools_used": ["get_node", "get_seed_paths"],
  "evidence": [
    {"type": "role", "label": "Role · 100000003115284100", "value": {"role": "consolidator", "score": 0.97}},
    {"type": "seed_reachability", "label": "Known seeds · 100000003115284100", "value": 11}
  ],
  "limitations": ["ai_explanation_requires_verification", "observed_graph_only"],
  "critic": {
    "used": true,
    "approved": true,
    "issues": [],
    "corrected_answer": null,
    "status": "approved"
  },
  "tool_calls": [{"tool": "get_node", "arguments": {"gid": "100000003115284100"}, "result": {}}]
}
```

Evidence values may be strings, numbers, arrays, or small objects. Render them as
supporting facts; do not reinterpret or recompute scores. `tool_calls` is a
bounded audit trace and may be hidden behind a details view.

Critic UI states:

- `used=true`, `approved=true`: **Evidence checked ✓**.
- `used=true`, `approved=false`: answer was replaced by a validated conservative
  correction; show **Evidence corrected** and optionally list issues.
- `used=false`: show **Critic unavailable**. The OpenAI answer remains usable as
  a hypothesis grounded in the returned deterministic evidence.

## Errors

- `404`: unknown `context_gid`.
- `422`: malformed request or numeric GID.
- `503`: OpenAI/SDK configuration unavailable, insufficient evidence, or bounded
  model/tool budget exhausted. Deterministic GET endpoints still work.
- `502`: OpenAI provider request failed. Do not display backend traceback text.

NVIDIA failure is not an HTTP error. The endpoint never returns chain-of-thought,
system prompts, developer prompts, credentials, or Authorization headers.
