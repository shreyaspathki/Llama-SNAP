from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import httpx


GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")


@dataclass
class KeyState:
    key: str
    cooldown_until: float = 0.0


class GroqClient:
    def __init__(self, api_keys: List[str], *, model: str, timeout_s: int = 60):
        if not api_keys:
            raise ValueError("No Groq API keys provided")
        self._keys = [KeyState(k) for k in api_keys]
        self._model = model
        self._timeout_s = timeout_s
        self._idx = 0

    def _pick_key(self) -> KeyState:
        now = time.time()
        for _ in range(len(self._keys)):
            ks = self._keys[self._idx % len(self._keys)]
            self._idx += 1
            if ks.cooldown_until <= now:
                return ks
        # if all in cooldown, just return next
        ks = self._keys[self._idx % len(self._keys)]
        self._idx += 1
        return ks

    def chat_completion(self, *, prompt: str) -> Tuple[str, str]:
        ks = self._pick_key()

        payload: Dict[str, Any] = {
            "model": self._model,
            "temperature": 0.0,
            "top_p": 1.0,
            "max_tokens": 512,
            "messages": [
                {"role": "system", "content": "You are a stateless language model."},
                {"role": "user", "content": prompt},
            ],
        }

        headers = {
            "Authorization": f"Bearer {ks.key}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=self._timeout_s) as client:
            r = client.post(f"{GROQ_BASE_URL}/chat/completions", headers=headers, json=payload)

        if r.status_code in (401, 403):
            raise RuntimeError("Groq auth failed (check API key)")

        if r.status_code == 429:
            # cooldown key for a bit and fail so caller can retry/fallback logic if desired
            ks.cooldown_until = time.time() + 60
            raise RuntimeError("Groq rate limited (429)")

        r.raise_for_status()
        data = r.json()

        try:
            text = data["choices"][0]["message"]["content"]
        except Exception:
            raise RuntimeError(f"Unexpected Groq response shape: {data}")

        out = str(text or "").strip()
        if not out:
            raise RuntimeError("Groq returned empty response")

        return out, self._model


def try_pydantic_ai(prompt: str, *, model: str, api_key: str) -> Optional[str]:
    """Best-effort pydantic_ai call.

    pydantic_ai APIs have changed over time; this function tries a couple common import paths.
    If it can't use pydantic_ai, it returns None and the caller should fall back to raw HTTP.
    """

    # NOTE: We keep this optional so the gateway still runs even if pydantic_ai isn't installed
    # or its API shape differs.
    try:
        from pydantic_ai import Agent  # type: ignore
    except Exception:
        return None

    OpenAIModel = None
    for mod in (
        "pydantic_ai.models.openai",
        "pydantic_ai.models",
    ):
        try:
            m = __import__(mod, fromlist=["OpenAIModel"])
            OpenAIModel = getattr(m, "OpenAIModel")
            break
        except Exception:
            continue

    if OpenAIModel is None:
        return None

    try:
        ai_model = OpenAIModel(
            model,
            api_key=api_key,
            base_url=GROQ_BASE_URL,
        )
        agent = Agent(ai_model)
        result = agent.run_sync(prompt)
        # result may be str-like or have .data depending on versions
        if isinstance(result, str):
            return result.strip()
        data = getattr(result, "data", None)
        if isinstance(data, str):
            return data.strip()
        return str(result).strip()
    except Exception:
        return None
