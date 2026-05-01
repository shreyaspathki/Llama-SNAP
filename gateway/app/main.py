from __future__ import annotations

import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from .providers.groq_provider import GroqClient
from .providers.pydantic_ai_provider import run_pydantic_ai_agent, get_system_prompt
from .providers.ollama import ollama_generate
from .providers.local_llama import LocalLlamaModel


load_dotenv()


class GenerateRequest(BaseModel):
    actionType: str = Field(..., description="simplify|explain|expand|translate")
    prompt: str
    forceProvider: Optional[str] = None # 'groq', 'ollama', 'local' or None
    modelOverride: Optional[str] = None # Optional model name to override server default
    targetLanguage: Optional[str] = None # Add target language support


class GenerateResponse(BaseModel):
    ok: bool
    output: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    error: Optional[str] = None
    elapsed: Optional[float] = None


app = FastAPI(title="Smart Accessibility Gateway", version="0.1.0")


@app.on_event("startup")
async def startup_event():
    print("INFO:  🚀 Server Starting... Pre-loading Local Llama Model (This may take 1-2 minutes)...")
    try:
        # Pre-load the model so the first user request is fast
        LocalLlamaModel.load_model()
        print("INFO:  ✅ Local Llama Model Ready!")
    except Exception as e:
        print(f"WARN:  ⚠️ Failed to pre-load model: {e}")


def _env_list(name: str) -> list[str]:
    raw = os.getenv(name, "")
    return [x.strip() for x in raw.split(",") if x.strip()]


def _get_groq_keys() -> list[str]:
    keys = _env_list("GROQ_API_KEYS")
    if keys:
        return keys

    single = (os.getenv("GROQ_API_KEY") or "").strip()
    return [single] if single else []


def _get_groq_client() -> Optional[GroqClient]:
    keys = _get_groq_keys()
    if not keys:
        return None
    model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
    return GroqClient(keys, model=model)


@app.get("/health")
def health():
    return {
        "ok": True,
        "ollama_url": os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate"),
        "ollama_model": os.getenv("OLLAMA_MODEL", "llama3.2:3b"),
        "groq_enabled": bool(_get_groq_keys()),
    }


@app.post("/v1/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest, request: Request):
    import time
    start_ts = time.time()
    response = _generate_impl(req, request)
    response.elapsed = time.time() - start_ts
    print(f"INFO: [Timing] Action={req.actionType} Time={response.elapsed:.4f}s")
    return response


def _generate_impl(req: GenerateRequest, request: Request):
    prompt = (req.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Missing prompt")

    if req.forceProvider == 'groq':
        keys = _get_groq_keys()
        if not keys:
             return GenerateResponse(ok=False, error="Force Groq requested but no keys configured")
        
        groq_model = req.modelOverride or os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
        print(f"DEBUG: FORCING GROQ with model={groq_model}")

        try:
            text = run_pydantic_ai_agent(req.actionType, prompt, model=groq_model, api_key=keys[0], target_language=req.targetLanguage)
            if text:
                return GenerateResponse(ok=True, output=text, provider="groq+pydantic_ai", model=groq_model)
        except Exception as e:
             print(f"DEBUG: Pydantic AI failed: {e}")
        
        # Fallback to raw client if pydantic failed
        groq = _get_groq_client()
        if groq:
            try:
                text, used_model = groq.chat_completion(prompt=prompt)
                return GenerateResponse(ok=True, output=text, provider="groq", model=used_model)
            except Exception as e_groq:
                return GenerateResponse(ok=False, error=f"Groq failed: {e_groq}")
        return GenerateResponse(ok=False, error="Groq client Init failed")

    if req.forceProvider == 'local':
        print(f"DEBUG: FORCING LOCAL MODEL")
        
        # Inject System Prompt to guide the model (matches training format: sys + input)
        sys_prompt = get_system_prompt(req.actionType, target_language=req.targetLanguage)
        final_prompt = prompt
        if sys_prompt:
             final_prompt = f"{sys_prompt}\n{prompt}"
        
        # Strategy: Use Fine-Tuned Adapter for specific tasks (simplify, etc)
        # But use Base Model (disable adapter) for General QA to avoid overfitted/narrow responses
        is_qa = (req.actionType.lower() == 'qa')
        use_adapter = not is_qa
        
        # Lower temperature for QA to reduce verbosity/hallucination
        temperature = 0.3 if is_qa else 0.7
        
        print(f"DEBUG: use_adapter={use_adapter}, temp={temperature} for action={req.actionType}")

        try:
            text = LocalLlamaModel.generate(final_prompt, use_adapter=use_adapter, temperature=temperature)
            return GenerateResponse(ok=True, output=text, provider="local-llama", model="llama3.2-3b-ft")
        except Exception as e:
            return GenerateResponse(ok=False, error=f"Local model failed: {e}")

    # DEFAULT (no force): PRIORITY 1 - Try Local First (Privacy-First Design)
    print("DEBUG: Attempting local inference first...")
    
    # Inject System Prompt to guide the model (matches training format: sys + input)
    sys_prompt = get_system_prompt(req.actionType, target_language=req.targetLanguage)
    final_prompt = prompt
    if sys_prompt:
         final_prompt = f"{sys_prompt}\n{prompt}"
    
    # Strategy: Use Fine-Tuned Adapter for specific tasks (simplify, etc)
    # But use Base Model (disable adapter) for General QA to avoid overfitted/narrow responses
    is_qa = (req.actionType.lower() == 'qa')
    use_adapter = not is_qa
    
    # Lower temperature for QA to reduce verbosity/hallucination
    temperature = 0.3 if is_qa else 0.7
    
    print(f"DEBUG: use_adapter={use_adapter}, temp={temperature} for action={req.actionType}")

    try:
        text = LocalLlamaModel.generate(final_prompt, use_adapter=use_adapter, temperature=temperature)
        print("DEBUG: Success via Local Model")
        return GenerateResponse(ok=True, output=text, provider="local-llama", model="llama3.2-3b-ft")
    except Exception as e:
        print(f"DEBUG: Local inference failed: {e}, falling back to Groq...")
    
    # PRIORITY 2: Try Groq (if api keys configured)
    keys = _get_groq_keys()
    if keys:
        groq_model = req.modelOverride or os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
        print(f"DEBUG: Attempting Groq with model={groq_model}")
        
        # A) Try Pydantic AI Agent first
        try:
            text = run_pydantic_ai_agent(req.actionType, prompt, model=groq_model, api_key=keys[0], target_language=req.targetLanguage)
            if text:
                print("DEBUG: Success via Pydantic AI")
                return GenerateResponse(ok=True, output=text, provider="groq+pydantic_ai", model=groq_model)
        except Exception as e:
            print(f"DEBUG: Pydantic AI failed, trying raw Groq client: {e}")

        # B) Try Raw Groq Client
        groq = _get_groq_client()
        if groq:
            try:
                text, used_model = groq.chat_completion(prompt=prompt)
                print("DEBUG: Success via Raw Groq")
                return GenerateResponse(ok=True, output=text, provider="groq", model=used_model)
            except Exception as e_groq:
                print(f"DEBUG: Groq failed: {e_groq}, falling back to Ollama...")
    
    # PRIORITY 3: Fallback to Ollama
    print("DEBUG: Falling back to Ollama...")
    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
    ollama_model = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
    ollama_timeout_s = int(os.getenv("OLLAMA_TIMEOUT_S", "120"))
    ollama_connect_timeout_s = int(os.getenv("OLLAMA_CONNECT_TIMEOUT_S", "2"))

    try:
        out = ollama_generate(
            prompt=prompt,
            model=ollama_model,
            url=ollama_url,
            timeout_s=ollama_timeout_s,
            connect_timeout_s=ollama_connect_timeout_s,
        )
        return GenerateResponse(ok=True, output=out, provider="ollama", model=ollama_model)
    except Exception as e_ollama:
        return GenerateResponse(ok=False, error=f"All providers failed. Ollama: {e_ollama}")
