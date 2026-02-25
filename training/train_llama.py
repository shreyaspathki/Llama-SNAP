from __future__ import annotations

import argparse
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, get_peft_model
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
        "--data-path",
        default=str(Path(__file__).resolve().parent / "dataset" / "processed" / "final_train.jsonl"),
        help="JSON or JSONL file containing {instruction,input,output} rows",
    )
    ap.add_argument(
        "--eval-path",
        default=str(Path(__file__).resolve().parent / "dataset" / "processed" / "final_eval.jsonl"),
        help="JSON or JSONL file for validation",
    )
    ap.add_argument(
        "--output-dir",
        default=str(Path(__file__).resolve().parent / "model_artifacts" / "llama-lora-v2"),
        help="Output directory for the adapter",
    )
    ap.add_argument("--max-length", type=int, default=512)
    ap.add_argument("--batch-size", type=int, default=1)
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--grad-accum", type=int, default=4)
    args = ap.parse_args()

    model_path = args.model_path
    data_path = args.data_path

    print("✅ Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(model_path, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    print("✅ Loading base model (4-bit)...")
    from transformers import BitsAndBytesConfig
    
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        quantization_config=quantization_config,
        device_map="auto",
        torch_dtype=torch.float16,
    )

    print("✅ Applying LoRA config...")
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    print(f"✅ Loading datasets from {args.data_path} and {args.eval_path}...")
    data_files = {"train": args.data_path}
    if Path(args.eval_path).exists():
        data_files["validation"] = args.eval_path
    
    data = load_dataset("json", data_files=data_files)
    
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

    print("✅ Starting training...")
    checkpoints_dir = Path(args.output_dir) / "checkpoints"
    training_args = TrainingArguments(
        output_dir=str(checkpoints_dir),
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=args.grad_accum,
        num_train_epochs=args.epochs,
        fp16=True,
        logging_steps=5,
        save_steps=100,
        eval_strategy="steps" if "validation" in tokenized else "no",
        eval_steps=100,
        learning_rate=args.lr,
        warmup_ratio=0.03,
        lr_scheduler_type="cosine",
        report_to="none",
        load_best_model_at_end=True if "validation" in tokenized else False,
        optim="paged_adamw_8bit",
        max_grad_norm=0.3,
    )

    trainer_kwargs = {
        "model": model,
        "args": training_args,
        "train_dataset": tokenized["train"],
        "data_collator": collator,
    }
    
    if "validation" in tokenized:
        trainer_kwargs["eval_dataset"] = tokenized["validation"]

    trainer = Trainer(**trainer_kwargs)
    
    # Check if we have checkpoints and resume
    last_checkpoint = None
    if checkpoints_dir.exists():
        checkpoints = sorted([d for d in checkpoints_dir.iterdir() if d.is_dir() and d.name.startswith("checkpoint-")], key=lambda x: int(x.name.split("-")[1]))
        if checkpoints:
            last_checkpoint = str(checkpoints[-1])
            print(f"✅ Resuming from checkpoint: {last_checkpoint}")

    trainer.train(resume_from_checkpoint=last_checkpoint)

    print(f"✅ Saving LoRA adapter to {args.output_dir} ...")
    model.save_pretrained(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)

    print("🎉 Training complete!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
