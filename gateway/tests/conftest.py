from __future__ import annotations

import sys
import types


# Provide lightweight stubs so tests can import app.main without requiring torch/transformers/peft.
if "torch" not in sys.modules:
    torch_stub = types.ModuleType("torch")
    torch_stub.float16 = "float16"

    class _NoGrad:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class _Autograd:
        @staticmethod
        def set_grad_enabled(_enabled):
            return _NoGrad()

    torch_stub.no_grad = lambda: _NoGrad()
    torch_stub.autograd = _Autograd()
    sys.modules["torch"] = torch_stub

if "transformers" not in sys.modules:
    transformers_stub = types.ModuleType("transformers")

    class _AutoModelForCausalLM:
        @staticmethod
        def from_pretrained(*args, **kwargs):
            class _FakeModel:
                device = "cpu"

                def eval(self):
                    return None

                def generate(self, **kwargs):
                    return [[1, 2, 3]]

            return _FakeModel()

    class _AutoTokenizer:
        eos_token_id = 0

        @staticmethod
        def from_pretrained(*args, **kwargs):
            class _FakeTokenizer:
                eos_token_id = 0

                def __call__(self, *_args, **_kwargs):
                    class _Inputs(dict):
                        input_ids = [[1, 2, 3]]

                        def to(self, _device):
                            return self

                    return _Inputs()

                def decode(self, *_args, **_kwargs):
                    return "decoded"

            return _FakeTokenizer()

    transformers_stub.AutoModelForCausalLM = _AutoModelForCausalLM
    transformers_stub.AutoTokenizer = _AutoTokenizer
    sys.modules["transformers"] = transformers_stub

if "peft" not in sys.modules:
    peft_stub = types.ModuleType("peft")

    class _PeftModel:
        @staticmethod
        def from_pretrained(base_model, *args, **kwargs):
            return base_model

    peft_stub.PeftModel = _PeftModel
    sys.modules["peft"] = peft_stub
