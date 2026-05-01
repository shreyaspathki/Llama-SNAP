from __future__ import annotations

from fastapi.testclient import TestClient

from app import main


def test_health_endpoint_returns_status(monkeypatch):
    # Avoid loading the heavy local model during test app startup.
    monkeypatch.setattr(main.LocalLlamaModel, "load_model", classmethod(lambda cls: None))
    monkeypatch.setattr(main, "_get_groq_keys", lambda: ["key-1"])

    with TestClient(main.app) as client:
        res = client.get("/health")

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["groq_enabled"] is True
    assert "ollama_model" in body
