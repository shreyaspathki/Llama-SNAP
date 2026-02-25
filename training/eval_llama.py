from __future__ import annotations

import argparse
from pathlib import Path

import torch
from datasets import load_dataset
from peft import PeftModel
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    DataCollatorForLanguageModeling,
    Trainer,
    TrainingArguments,
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--model-path",
        default=str(Path(__file__).resolve().parent / "llama3.2-3b-instruct"),
        help="Path to the base model directory",
    )
    ap.add_argument(
        "--adapter-path",
        default=str(Path(__file__).resolve().parent / "model_artifacts" / "llama-lora-v2"),
        help="Path to the lora adapter directory",
    )
    ap.add_argument(
        "--data-path",
        default=str(Path(__file__).resolve().parent / "dataset" / "processed" / "final_eval.jsonl"),
        help="JSON or JSONL file containing {instruction,input,output} rows for evaluation",
    )
    ap.add_argument("--max-length", type=int, default=1024)
    ap.add_argument("--batch-size", type=int, default=1)
    args = ap.parse_args()

    model_path = args.model_path
    adapter_path = args.adapter_path
    data_path = args.data_path

    print("✅ Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(model_path, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    print("✅ Loading base model (4-bit)...")
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        load_in_4bit=True,
        device_map="auto",
        torch_dtype=torch.float16,
    )

    print("✅ Loading LoRA adapter...")
    model = PeftModel.from_pretrained(model, adapter_path)
    
    print("✅ Loading evaluation dataset...")
    data = load_dataset("json", data_files=data_path)

    def format_prompt(example):
        instruction = example.get("instruction", "")
        input_text = example.get("input", "")
        output_text = example.get("output", "")

        if input_text:
            text = (
                "<|user|>\n" + instruction + "\n" + input_text + "\n<|assistant|>\n" + output_text
            )
        else:
            text = "<|user|>\n" + instruction + "\n<|assistant|>\n" + output_text

        return {"text": text}

    print("✅ Formatting prompts...")
    data = data.map(format_prompt)

    def tokenize(example):
        return tokenizer(
            example["text"],
            truncation=True,
            padding="max_length",
            max_length=args.max_length,
        )

    print("✅ Tokenizing dataset...")
    tokenized = data.map(tokenize, batched=True, remove_columns=data["train"].column_names)

    def add_labels(example):
        example["labels"] = example["input_ids"].copy()
        return example

    tokenized = tokenized.map(add_labels, batched=False)
    
    collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)
    
    # We use Trainer just for evaluation convenience
    training_args = TrainingArguments(
        output_dir="tmp_eval",
        per_device_eval_batch_size=args.batch_size,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        eval_dataset=tokenized["train"], # load_dataset with data_files creates 'train' split by default
        data_collator=collator,
    )

    print("✅ Starting evaluation...")
    metrics = trainer.evaluate()
    print("\nEvaluation Metrics:")
    print(metrics)
    
    try:
        perplexity = torch.exp(torch.tensor(metrics["eval_loss"]))
        print(f"Perplexity: {perplexity.item():.2f}")
    except:
        pass

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
