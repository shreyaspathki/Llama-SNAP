from __future__ import annotations

from types import SimpleNamespace

import pytest

from app import main
from app.main import GenerateRequest


def test_sanitize_output_removes_simplify_wrappers() -> None:
    raw = """
Here is the rewritten text:
Buddhism is an old Indian religion.

Note: I've kept the core meaning.
"""
    cleaned = main._sanitize_output("simplify", raw)
    assert cleaned == "Buddhism is an old Indian religion."


def test_sanitize_output_non_simplify_only_trims() -> None:
    raw = "  Keep this exactly.  "
    cleaned = main._sanitize_output("explain", raw)
    assert cleaned == "Keep this exactly."


def test_generate_local_response_qa_uses_base_model(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_generate(cls, prompt: str, **kwargs):
        captured["prompt"] = prompt
        captured["use_adapter"] = kwargs.get("use_adapter")
        captured["temperature"] = kwargs.get("temperature")
        return "Answer"

    monkeypatch.setattr(main.LocalLlamaModel, "generate", classmethod(fake_generate))

    req = GenerateRequest(actionType="qa", prompt="What is Buddhism?")
    res = main._generate_local_response(req, req.prompt)

    assert res.ok is True
    assert res.provider == "local-llama"
    assert res.output == "Answer"
    assert captured["use_adapter"] is False
    assert captured["temperature"] == 0.3


def test_default_flow_prefers_local_and_skips_groq(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_local(cls, prompt: str, **kwargs):
        return "Local response"

    def should_not_run(*args, **kwargs):
        raise AssertionError("Groq path should not run when local succeeds")

    monkeypatch.setattr(main.LocalLlamaModel, "generate", classmethod(fake_local))
    monkeypatch.setattr(main, "run_pydantic_ai_agent", should_not_run)

    req = GenerateRequest(actionType="simplify", prompt="Some text")
    res = main._generate_impl(req, request=SimpleNamespace())

    assert res.ok is True
    assert res.provider == "local-llama"
    assert res.output == "Local response"


def test_default_flow_falls_back_to_groq_raw(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeGroq:
        def chat_completion(self, prompt: str):
            return "Here is the rewritten text:\nClean text", "fake-groq-model"

    def failing_local(cls, prompt: str, **kwargs):
        raise RuntimeError("GPU not available")

    monkeypatch.setattr(main.LocalLlamaModel, "generate", classmethod(failing_local))
    monkeypatch.setattr(main, "_get_groq_keys", lambda: ["key-1"])
    # The pydantic wrapper call in main currently uses keyword `model`; return None to force raw path.
    monkeypatch.setattr(main, "run_pydantic_ai_agent", lambda *args, **kwargs: None)
    monkeypatch.setattr(main, "_get_groq_client", lambda: FakeGroq())

    req = GenerateRequest(actionType="simplify", prompt="Some text")
    res = main._generate_impl(req, request=SimpleNamespace())

    assert res.ok is True
    assert res.provider == "groq"
    assert res.model == "fake-groq-model"
    assert res.output == "Clean text"


def test_default_flow_falls_back_to_ollama_when_local_and_groq_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    def failing_local(cls, prompt: str, **kwargs):
        raise RuntimeError("GPU not available")

    monkeypatch.setattr(main.LocalLlamaModel, "generate", classmethod(failing_local))
    monkeypatch.setattr(main, "_get_groq_keys", lambda: [])
    monkeypatch.setattr(main, "ollama_generate", lambda **kwargs: "Ollama output")

    req = GenerateRequest(actionType="simplify", prompt="Some text")
    res = main._generate_impl(req, request=SimpleNamespace())

    assert res.ok is True
    assert res.provider == "ollama"
    assert res.output == "Ollama output"
