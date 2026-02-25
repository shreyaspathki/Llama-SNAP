import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel, PeftConfig
import argparse
import os
from pathlib import Path

def main():
    # Use relative paths that work on both Windows and WSL
    current_dir = Path(__file__).parent.resolve()
    base_model_path = str(current_dir / "llama3.2-3b-instruct")
    adapter_path = str(current_dir / "model_artifacts/llama-lora-v2")

    print(f"Loading base model from {base_model_path}...")
    tokenizer = AutoTokenizer.from_pretrained(base_model_path)
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_path,
        load_in_4bit=True,
        device_map="auto",
        torch_dtype=torch.float16,
    )

    print(f"Loading LoRA adapter from {adapter_path}...")
    model = PeftModel.from_pretrained(base_model, adapter_path)
    model.eval()

    print("\nModel loaded successfully! Enter your prompt below.")
    print("Type 'exit' to quit.\n")

    while True:
        instruction = input("Instruction: ")
        if instruction.lower() == 'exit':
            break
        
        input_text = input("Input (optional): ")
        
        prompt = f"<|user|>\n{instruction}"
        if input_text:
            prompt += f"\n{input_text}"
        prompt += "\n<|assistant|>\n"

        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=256,
                temperature=0.7,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id
            )

        response = tokenizer.decode(outputs[0], skip_special_tokens=True)
        # We need to strip the prompt from the response to see just the answer
        # The generate method returns the whole sequence (prompt + new tokens) usually, 
        # but skip_special_tokens might mess up exact string matching. 
        # A safer way to display result:
        
        print("\n--- Generated Response ---\n")
        # Removing the prompt part from simple decode if it's there
        response_text = response[len(tokenizer.decode(inputs.input_ids[0], skip_special_tokens=True)):] 
        # Or just printing the whole thing if that's easier, but users prefer just the answer.
        # Let's try to just print the new tokens.
        new_tokens = outputs[0][inputs.input_ids.shape[1]:]
        response_text = tokenizer.decode(new_tokens, skip_special_tokens=True)

        # Stop at the first occurrence of <|user|> or <|assistant|> to prevent hallucinations
        for stop_token in ["<|user|>", "<|assistant|>"]:
            if stop_token in response_text:
                response_text = response_text.split(stop_token)[0]

        print(response_text.strip())
        print("\n--------------------------\n")

if __name__ == "__main__":
    main()
