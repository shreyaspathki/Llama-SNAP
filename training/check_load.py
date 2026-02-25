from transformers import AutoModelForCausalLM, BitsAndBytesConfig, AutoTokenizer
import torch
from pathlib import Path

model_path = str(Path("llama3.2-3b-instruct").resolve())

print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(model_path)

print("Loading model...")
quantization_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True,
)

try:
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        quantization_config=quantization_config,
        device_map="auto",
        torch_dtype=torch.float16,
    )
    print("Success!")
except Exception as e:
    print(f"Failed: {e}")
