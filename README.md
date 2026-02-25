# SNAP: Smart Neural Accessibility Platform

SNAP is an intelligent browser extension designed to make the web more accessible for users with cognitive disabilities, language barriers, or reading difficulties. It leverages a fine-tuned Local Large Language Model (LLM) to simplify complex text, explain concepts, and provide translations in real-time, while ensuring privacy by processing data locally or through a secure gateway.

## 🚀 Key Features

### 🧠 Cognitive Accessibility (AI-Powered)
- **Simplify**: Rewrites complex text into plain English (aimed at a 10-year-old reading level).
- **Explain**: Provides clear, context-aware explanations for difficult concepts.
- **Summarize**: Condenses long articles into concise paragraphs.
- **Expand**: Adds context and detail to brief text.
- **Translate**: High-quality translation to **Hindi** and **Kannada**, optimized for natural sentence structure.

### 👁️ Visual Accessibility
- **Dyslexia Friendly Font**: Toggles a specialized font (OpenDyslexic) to improve readability.
- **High Contrast**: Increases contrast for users with low vision.
- **Reading Ruler**: A horizontal guide to help users stay on the correct line.
- **Focus Mode**: Dimming distractions to highlight only the paragraph being read.

## 🏗️ Architecture

The project consists of three main components:

1.  **Chrome Extension**: The frontend interface (Popup & Sidebar) injected into web pages. It captures text and user preferences.
2.  **AI Gateway (FastAPI)**: A local Python server that routes requests. It manages prompts and connects to the LLM.
3.  **LLM Engine**:
    - **Primary**: Local Llama 3.2 3B (Fine-Tuned with LoRA adapters for simplification/accessibility tasks).
    - **Fallback**: Integration with Groq or Gemini APIs for higher throughput or backup.

## 🛠️ Installation & Setup

### Prerequisites
- Python 3.10+
- Node.js & npm (for building the extension)
- NVIDIA GPU (Recommended for local inference) or sufficient RAM.

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
# If using Auto-Reload (Development)
uvicorn main:app --reload

# If stable (Production)
uvicorn main:app
```
(The API will start at http://localhost:8000)

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

## 📖 Usage

1.  **Activate**: Click the SNAP extension icon in your browser toolbar.
2.  **Select Text**: Highlight any text on a webpage.
3.  **Toolbar**: A floating toolbar will appear. Click "Simplify", "Explain", or "Translate".
4.  **Fallback**: If no text is selected, SNAP can process the entire visible page content.

## 🤝 Contributing

Contributions are welcome! Please ensure you test the local model inference before submitting PRs.

## 📄 License

MIT License

