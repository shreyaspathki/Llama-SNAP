# Llama-SNAP: Simplify, Narrate, Adapt & Personalise

Llama-SNAP is a browser accessibility project that helps users simplify complex text, get explanations, translate content, and improve reading comfort directly in the browser. The current design uses a Chrome extension UI, a FastAPI gateway, and a fine-tuned local Llama 3.2 3B Instruct model with LoRA adapters for task-specific behavior.

## 🚀 Key Features

### 🧠 Cognitive Accessibility (AI-Powered)
- **Simplify**: Rewrites complex text into plain English (aimed at a 10-year-old reading level).
- **Explain**: Provides clear, context-aware explanations for difficult concepts.
- **Summarize**: Condenses long articles into concise paragraphs.
- **Expand**: Adds context and detail to brief text.
- **Translate**: High-quality translation to **Hindi** and **Kannada**, optimized for natural sentence structure using Llama guidelines.

### 👁️ Visual Accessibility
- **Dyslexia Friendly Font**: Toggles a specialized font (OpenDyslexic) to improve readability.
- **High Contrast**: Increases contrast for users with low vision.
- **Reading Ruler**: A horizontal guide to help users stay on the correct line.
- **Color Vision Themes**: Protanopia, deuteranopia, and tritanopia support for color-blind users.

## 🏗️ Architecture

The project consists of three main components:

1.  **Chrome Extension**: The React/Vite-based popup, options page, background worker, and content script that handle user actions and page overlays.
2.  **AI Gateway (FastAPI)**: A local Python server that receives requests from the extension and routes them to the selected provider.
3.  **LLM Engine**:
    - **Primary**: Local **Llama 3.2 3B Instruct** with LoRA adapters for simplification/accessibility tasks.
    - **Fallback / Alternatives**: Groq, Ollama, or other configured providers depending on gateway settings.

## 🛠️ Installation & Setup

### Prerequisites
- Python 3.10+
- Node.js & npm (for building the extension)
- NVIDIA GPU is recommended for local inference, or enough RAM for CPU-only loading.

### 1. Backend Setup

Navigate to the gateway folder and install dependencies:

```bash
cd gateway
pip install -r requirements.txt
```

**Model Setup:**
1.  Download the **Llama 3.2 3B Instruct** base model.
2.  Ensure your fine-tuned LoRA adapters are in `model_artifacts/llama-lora-v2` (or update paths in `.env`).

**Run the Server:**

```bash
python -m uvicorn gateway.app.main:app --reload
```

The API starts at http://localhost:8000.

### 2. Extension Setup

1.  Navigate to the Extension folder:
    ```bash
    cd Extension
    npm install
    npm run build
    ```
2.  Open Chrome and go to `chrome://extensions`.
3.  Enable **Developer Mode** (top right).
4.  Click **Load unpacked**.
5.  Select the `Extension/dist` (or `Extension` depending on build) folder.

## ⚙️ Configuration

Create a `.env` file in `gateway/`:

```env
# Local Model Paths
LOCAL_MODEL_PATH="/path/to/llama3.2-3b-instruct"
LOCAL_ADAPTER_PATH="/path/to/model_artifacts/llama-lora-v2"

# Optional Cloud Fallbacks
GROQ_API_KEY="your_groq_key"
GEMINI_API_KEY="your_gemini_key"
```

The gateway defaults to local inference when the extension asks for the local strategy. Cloud providers are optional fallbacks.

## 📖 Usage

1.  **Activate**: Click the SNAP extension icon in your browser toolbar.
2.  **Select Text**: Highlight any text on a webpage.
3.  **Toolbar**: A floating toolbar will appear. Click "Simplify", "Explain", or "Translate".
4.  **Fallback**: If no text is selected, SNAP can process the entire visible page content.

The active extension build lives in `Extension/` and outputs to `Extension/dist/`. The old static UI files under `Extension/src/ui/` are legacy references and not the primary app entry points.

## 🤝 Contributing

Contributions are welcome! Please ensure you test the local model inference before submitting PRs.

## 📄 License

MIT License

