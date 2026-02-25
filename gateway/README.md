# Local AI Gateway (Ollama-first, Groq fallback)

Purpose:
- Provide a single localhost HTTP API for the Chrome extension.
- Try local Ollama first (your fine-tuned model).
- If Ollama fails/unavailable, fall back to Groq (server-side keys).

## Install

```bash
cd /d/FYP/smart-accessibility/gateway
pip install -r requirements.txt
```

## Configure

Set env vars (recommended via a `.env` file in this folder):

- `OLLAMA_URL=http://localhost:11434/api/generate`
- `OLLAMA_MODEL=my-llama:latest` (or `llama3.2:3b`)
- `GROQ_API_KEY=...` (single key) **or** `GROQ_API_KEYS=key1,key2,key3,key4` (comma-separated)
- `GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct` (or any Groq model you prefer)

## Run

```bash
cd /d/FYP/smart-accessibility/gateway
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health check:
- http://127.0.0.1:8000/health

Generate endpoint:
- POST http://127.0.0.1:8000/v1/generate

Body:
```json
{"actionType":"simplify","prompt":"..."}
```
