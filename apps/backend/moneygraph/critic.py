"""Optional NVIDIA grounding critic. Provider failure never blocks OpenAI output."""
from dataclasses import dataclass, field
import json
import os

from pydantic import BaseModel, ConfigDict, Field, model_validator


CRITIC_INSTRUCTIONS = """You are an evidence critic for an AML investigation assistant.
Compare the draft only with the supplied deterministic evidence. Detect unsupported
facts, invented gids, amounts or paths, wrong roles/scores, guilt claims, sub-day
time claims, and missing depth-4 observation-boundary limitations. Do not perform
a new investigation. Return JSON only with exactly: approved, issues,
corrected_answer. Each issue has type, claim, reason. If rejecting, provide a
conservative corrected answer grounded only in the evidence. Never call a person
criminal, guilty, money launderer, or organizer as fact."""


class CriticIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str = Field(min_length=1, max_length=80)
    claim: str = Field(min_length=1, max_length=1000)
    reason: str = Field(min_length=1, max_length=1000)


class CriticDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    approved: bool
    issues: list[CriticIssue] = Field(max_length=20)
    corrected_answer: str | None = Field(default=None, max_length=8000)

    @model_validator(mode="after")
    def validate_decision(self):
        if self.approved and self.issues:
            raise ValueError("Approved critic response cannot contain issues")
        if self.approved and self.corrected_answer:
            raise ValueError("Approved critic response cannot replace the answer")
        if not self.approved and not self.issues:
            raise ValueError("Rejected critic response must explain an issue")
        if not self.approved and not (self.corrected_answer or "").strip():
            raise ValueError("Rejected critic response must contain a corrected answer")
        return self


@dataclass(frozen=True)
class CriticConfig:
    api_key: str = field(repr=False)
    model: str
    base_url: str
    timeout: float = 20.0

    @classmethod
    def from_environment(cls):
        values = {name: os.environ.get(name, "").strip() for name in
                  ("NVIDIA_API_KEY", "NVIDIA_MODEL", "NVIDIA_BASE_URL")}
        if not all(values.values()):
            return None
        return cls(values["NVIDIA_API_KEY"], values["NVIDIA_MODEL"],
                   values["NVIDIA_BASE_URL"])


def unavailable(status):
    return {"used": False, "approved": None, "issues": [],
            "corrected_answer": None, "status": status}


def critique(question, draft, evidence, tool_calls, limitations, *, client=None, config=None):
    """Return validated critic metadata; all failures deliberately fail open."""
    config = config or CriticConfig.from_environment()
    if config is None:
        return unavailable("not_configured")
    payload = {
        "question": question,
        "draft": draft,
        "evidence": evidence,
        "tool_results": [{"tool": item["tool"], "result": item["result"]}
                         for item in tool_calls],
        "limitations": limitations,
    }
    serialized = json.dumps(payload, ensure_ascii=False, allow_nan=False)
    if len(serialized) > 100_000:
        payload["tool_results"] = [{"tool": item["tool"]} for item in tool_calls]
        payload["evidence_note"] = "Tool details omitted by the bounded critic payload limit."
        serialized = json.dumps(payload, ensure_ascii=False, allow_nan=False)

    owned_client = None
    try:
        if client is None:
            from openai import OpenAI
            owned_client = OpenAI(api_key=config.api_key, base_url=config.base_url,
                                  timeout=config.timeout, max_retries=0)
            client = owned_client
        completion = client.chat.completions.create(
            model=config.model,
            messages=[
                {"role": "system", "content": CRITIC_INSTRUCTIONS},
                {"role": "user", "content": serialized},
            ],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=2000,
        )
        content = completion.choices[0].message.content
        decision = CriticDecision.model_validate_json(content)
        return {"used": True, "approved": decision.approved,
                "issues": [issue.model_dump() for issue in decision.issues],
                "corrected_answer": decision.corrected_answer,
                "status": "approved" if decision.approved else "corrected"}
    except Exception:
        return unavailable("unavailable")
    finally:
        if owned_client is not None:
            owned_client.close()
