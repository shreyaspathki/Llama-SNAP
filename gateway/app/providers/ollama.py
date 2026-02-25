from __future__ import annotations

import os
from typing import Any, Dict, Optional

import httpx


def ollama_generate(
    *,
    prompt: str,
    model: str,
    url: str,
    timeout_s: int = 120,
    connect_timeout_s: int = 2,
) -> str:
    payload: Dict[str, Any] = {
        "model": model,
        "stream": False,
        "system": (
            "You are a stateless language model.\n"
            "Ignore all prior conversations and context.\n"
            "Follow ONLY the instructions in the user prompt.\n"
            "Do not assume the task type."
        ),
        "prompt": prompt,
        "options": {
            "temperature": 0.0,
            "num_ctx": 2048,
            "num_predict": 512,
        },
    }

    timeout = httpx.Timeout(
        connect=connect_timeout_s,
        read=timeout_s,
        write=timeout_s,
        pool=timeout_s,
    )

    with httpx.Client(timeout=timeout) as client:
        r = client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()

    out = str(data.get("response", "") or "").strip()
    if not out:
        raise RuntimeError("Ollama returned empty response")
    return out
