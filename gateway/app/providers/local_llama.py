import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import os
import logging

logger = logging.getLogger("gateway")

class LocalLlamaModel:
    _instance = None
    _tokenizer = None
    _model = None

    @classmethod
    def load_model(cls):
        if cls._model is not None:
            return

        base_model_path = os.getenv("LOCAL_MODEL_PATH", "/mnt/d/FYP/smart-accessibility/llama3.2-3b-instruct")
        adapter_path = os.getenv("LOCAL_ADAPTER_PATH", "/mnt/d/FYP/smart-accessibility/model_artifacts/llama-lora-v2")
        
        if not os.path.exists(base_model_path):
             logger.warning(f"Local base model not found at {base_model_path}")
             return
        
        if not os.path.exists(adapter_path):
             logger.warning(f"Local adapter not found at {adapter_path}")
             return

        logger.info(f"Loading local model from {base_model_path} and {adapter_path}...")
        try:
            cls._tokenizer = AutoTokenizer.from_pretrained(base_model_path)
            
            # Load base model
            base_model = AutoModelForCausalLM.from_pretrained(
                base_model_path,
                load_in_4bit=True,
                device_map="auto",
                torch_dtype=torch.float16,
            )
            
            # Load adapter
            cls._model = PeftModel.from_pretrained(base_model, adapter_path)
            cls._model.eval()
            logger.info("Local model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load local model: {e}")

    @classmethod
    def generate(cls, prompt: str, max_new_tokens: int = 512, temperature: float = 0.7, use_adapter: bool = True) -> str:
        if cls._model is None:
            cls.load_model()
            if cls._model is None:
                raise RuntimeError("Local model could not be loaded")

        full_prompt = f"<|user|>\n{prompt}\n<|assistant|>\n"
        
        inputs = cls._tokenizer(full_prompt, return_tensors="pt").to(cls._model.device)
        
        with torch.no_grad():
            # Helper context manager to optionally disable adapter
            # If use_adapter is False, we use the base model weights only (Better for General QA)
            context = cls._model.disable_adapter() if not use_adapter else  torch.autograd.set_grad_enabled(False) # null context-ish
            
            with context:
                outputs = cls._model.generate(
                    **inputs,
                    max_new_tokens=max_new_tokens,
                    temperature=temperature,
                    do_sample=True,
                    pad_token_id=cls._tokenizer.eos_token_id,
                    stop_strings=["<|user|>", "<|assistant|>"],
                    tokenizer=cls._tokenizer
                )
            
        generated_ids = outputs[0][inputs.input_ids.shape[1]:]
        response = cls._tokenizer.decode(generated_ids, skip_special_tokens=True)
        # Extra cleanup to ensure no clutter
        response = response.split("<|user|>")[0].split("<|assistant|>")[0].strip()
        return response
