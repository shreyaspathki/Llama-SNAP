from __future__ import annotations

from app.providers.pydantic_ai_provider import get_system_prompt


def test_translate_prompt_maps_hi_code() -> None:
    prompt = get_system_prompt("translate", target_language="hi")
    assert "Hindi" in prompt
    assert "Output ONLY the translation" in prompt


def test_simplify_prompt_forbids_extra_wrappers() -> None:
    prompt = get_system_prompt("simplify")
    assert "Output ONLY the simplified text" in prompt
    assert "Do not include any heading" in prompt


def test_unknown_action_returns_safe_default_prompt() -> None:
    prompt = get_system_prompt("unknown-action")
    assert "helpful, harmless, and honest" in prompt
