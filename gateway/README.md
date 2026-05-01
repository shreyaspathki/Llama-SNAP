# Local AI Gateway (local-first, provider-aware)

Purpose:
- Provide a single localhost HTTP API for the Chrome extension.
- Prefer the local fine-tuned Llama 3.2 3B Instruct model when requested.
- Fall back to Groq or Ollama only when configured or explicitly selected.

## Install

```bash
cd /d/FYP/smart-accessibility/gateway
pip install -r requirements.txt
```

## Configure

Set env vars (recommended via a `.env` file in this folder):

- `LOCAL_MODEL_PATH=/path/to/llama3.2-3b-instruct`
- `LOCAL_ADAPTER_PATH=/path/to/model_artifacts/llama-lora-v2`
- `OLLAMA_URL=http://localhost:11434/api/generate`
- `OLLAMA_MODEL=my-llama:latest` (or `llama3.2:3b`)
- `GROQ_API_KEY=...` (single key) **or** `GROQ_API_KEYS=key1,key2,key3,key4` (comma-separated)
- `GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct` (or any Groq model you prefer)

## Run

```bash
cd /d/FYP/smart-accessibility
python -m uvicorn gateway.app.main:app --host 127.0.0.1 --port 8000
```

Health check:
- http://127.0.0.1:8000/health

Generate endpoint:
- POST http://127.0.0.1:8000/v1/generate

Body:
```json
{"actionType":"simplify","prompt":"..."}
```
