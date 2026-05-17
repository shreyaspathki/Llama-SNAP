# Llama - SNAP: AI Browser Extension for Accessibility

This repository implements Llama-SNAP, an accessibility-first browser extension that uses a local LLM to simplify, explain, translate, and otherwise adapt web content for users with reading or cognitive difficulties. The extension prioritizes privacy by default — user data and preferences are stored locally and the AI gateway can run locally as a FastAPI service.

Project report: [/mnt/d/FYP/final_llama_snap_report.pdf](../final_llama_snap_report.pdf)

## Authors & Mentors
- Shreyas Vasanth Kumar Pathki (01JST22UCS145)
- Nishchal Venkatraman Naik (01JST22UCS098)
- Pavan V (01JST22UCS106)
- Arya Gowda S (01JST22UCS023)

Supervision: Shwethashree G C (Assistant Professor, Dept. of CSE)

## Summary (from project report)
SNAP injects a Shadow DOM toolbar into web pages to provide an insulated UI. A local FastAPI gateway routes requests to a local Llama-based model (Llama 3.2 3B with LoRA adapters) and provides fallback paths (Groq/Gemini) when configured. Key capabilities include text simplification, explanations, summarization, translation (Hindi & Kannada), dyslexia-friendly fonts, high-contrast themes, and a reading ruler.

## Key Features
- Simplify, Explain, Summarize, Expand, Translate
- Dyslexia-friendly font toggle and high-contrast themes
- Reading ruler and focus/dimming modes to reduce visual distractions
- Local-first model inference with optional secure cloud fallbacks
- Privacy-oriented: user data is stored in `chrome.storage` and the gateway is local by default

## Quickstart

Prerequisites:
- Python 3.10+
- Node.js & npm

1) Backend (gateway)
```bash
cd gateway
pip install -r requirements.txt
# Configure paths in gateway/.env
uvicorn main:app --reload
```

2) Build and load the extension
```bash
cd Extension
npm install
npm run build
# Load the produced `dist` into chrome://extensions → Load unpacked
```

3) Run and test
- Open any webpage, click the SNAP icon, or use the keyboard shortcut (Alt+X) to toggle the overlay. Select text and try "Simplify" or "Translate".

## Icons
Canonical project icon: `src/assets/logosnap.png`. Size-specific icons (`src/assets/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`) are generated and included for crisp display in browser UI.

## Configuration
Create `gateway/.env` with at minimum:
```env
LOCAL_MODEL_PATH="/absolute/path/to/llama3.2-3b-instruct"
LOCAL_ADAPTER_PATH="/absolute/path/to/model_artifacts/llama-lora-v2"
```
Optional keys: `GROQ_API_KEY`, `GEMINI_API_KEY`.

## Development notes
- The popup React app entry is `index.html` → `src/popup-main.tsx` → `src/components/SnapPopup.tsx`.
- Content script is `src/content/content-script.js` (injects Shadow DOM overlay).
- Background service worker is `src/background/service-worker.js` and broadcasts settings to tabs.
- Tests and model prompt validation are under `gateway/tests/` (run `pytest`).

## Contributing
Please open issues or PRs. Run local gateway inference tests before submitting model-related changes.

## License
MIT

