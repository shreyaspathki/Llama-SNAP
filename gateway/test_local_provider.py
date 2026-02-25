from app.providers.local_llama import LocalLlamaModel

def test_local_provider():
    print("Testing Local Provider...")
    prompt = "Simplify: The cat sat on the mat."
    try:
        response = LocalLlamaModel.generate(prompt, max_new_tokens=50)
        print(f"Response: {response}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_local_provider()
