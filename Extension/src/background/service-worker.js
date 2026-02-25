import { callOllama, callGateway } from '../lib/ai-client.js';


const DEFAULT_SETTINGS = {
  uiMode: 'popup', 
  language: 'en',
  easyRead: false,
  dyslexiaFont: false,
  highContrast: false,
  focusMode: false,
  readingRuler: false,
  fontScale: 1,
  
  // AI
  aiProvider: 'gateway', // Enforce gateway
  forceStrategy: 'local', // Enforce local model
  gatewayUrl: "http://localhost:8000/v1/generate",
  groqModel: "", 
  ollamaModel: "llama3.2:3b",
  geminiApiKey: '',
  geminiModel: 'gemini-1.5-flash-latest',
  maxTokens: 512,
  privacyOnlySelectedText: true
};

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, items => {
      resolve({ ...DEFAULT_SETTINGS, ...items });
    });
  });
}

async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  return new Promise(resolve => {
    chrome.storage.sync.set(next, () => resolve(next));
  });
}


function createPrompt(type, text, lang) {
  text = (text || '').trim();
  if (!text) return `User provided empty text. Reply with "No text selected."`;

  switch (type) {
    case 'simplify':
      return `Rewrite the following text to be very simple and easy to read (plain english, short sentences). Output ONLY the simplified text. Text: "${text}"`;
    case 'explain':
      return `Explain the main concept in this text clearly. Output ONLY the explanation: "${text}"`;
    case 'summarize':
      return `Summarize this text in one short paragraph. Output ONLY the summary: "${text}"`;
    case 'expand':
      return `Expand on this text with more details and context. Output ONLY the expanded text: "${text}"`;
    case 'translate':
      const target = (lang === 'hi') ? 'Hindi' : (lang === 'kn' ? 'Kannada' : 'English');
      return `Translate the following to ${target}. Ensure every word is translated. Output ONLY the translation. Text: "${text}"`;
    default:
      return `Task: ${type}. Text: "${text}"`;
  }
}

async function routeAIRequest(type, payload) {
  const settings = await getSettings();

  // 1. Gateway or Groq Only
  if (settings.aiProvider === 'gateway' || settings.aiProvider === 'groq_only') {
    try {
      const prompt = (payload.text || '').trim(); // Use raw text for Gateway, it constructs prompts
      const forceProvider = (settings.aiProvider === 'groq_only') ? 'groq' : (settings.forceStrategy || 'local');
      const modelOverride = settings.groqModel || undefined;
      
      const output = await callGateway({
        url: settings.gatewayUrl || "http://localhost:8000/v1/generate",
        actionType: type,
        prompt: prompt, // Send raw prompt, backend adds System Prompts
        forceProvider,
        modelOverride,
        targetLanguage: payload.lang // Pass Language if available
      });
      return { ok: true, output };
    } catch(e) {
      return { ok: false, error: e.toString() };
    }
  }

  // 2. Direct Ollama
  if (settings.aiProvider === 'ollama') {
    try {
      const prompt = createPrompt(type, payload.text, payload.lang);
      const output = await callOllama({
        model: settings.ollamaModel || "llama3.2:3b",
        prompt: prompt 
      });
      return { ok: true, output };
    } catch(e) {
      return { ok: false, error: e.toString() };
    }
  }

  if (settings.aiProvider === 'mock') {
    switch (type) {
      case 'simplify': {
        const simplified = MOCK_RESPONSES.simplify(payload.text);
        return {
          ok: true,
          output: simplified,
          metrics: {
            flesch: fleschReadingEase(payload.text),
            smog: smogIndex(payload.text)
          }
        };
      }
      case 'explain':
        return { ok: true, output: MOCK_RESPONSES.explain(payload.text) };
      case 'expand':
        return { ok: true, output: MOCK_RESPONSES.expand(payload.text) };
      case 'summarize':
        return { ok: true, output: MOCK_RESPONSES.summarize(payload.text) };
      case 'translate': {
        const key = payload.lang === 'hi' ? 'translate_hi' : 'translate_kn';
        return { ok: true, output: MOCK_RESPONSES[key](payload.text) };
      }
      default:
        return { ok: false, error: 'Unknown mock type' };
    }
  }

  // Gemini routing (fetch via service worker; never expose key to content)
  if (settings.aiProvider === 'gemini') {
    if (!settings.geminiApiKey) {
      return { ok: false, error: 'Missing Gemini API Key' };
    }
    try {
      const resolvedModel = await resolveGeminiModel(settings.geminiModel, settings.geminiApiKey);
      const instruction = (function(){
        switch(type){
          case 'simplify': return 'Rewrite in simpler language without losing meaning.';
          case 'explain': return 'Explain clearly in a few sentences with examples if useful.';
          case 'expand': return 'Expand with more detail and context while staying factual.';
          case 'summarize': return 'Summarize concisely, covering the key points only.';
          case 'translate': return `Translate to ${payload.lang==='hi'?'Hindi':'Kannada'} in natural tone.`;
          default: return type.toUpperCase();
        }
      })();
      const prompt = `Task: ${instruction}\n\nText to process:\n${payload.text}`;
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(resolvedModel) + ':generateContent?key=' + encodeURIComponent(settings.geminiApiKey);
      const body = {
        contents: [{ parts: [{ text: prompt }]}],
        generationConfig: { maxOutputTokens: settings.maxTokens }
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.text();
        // Try fallback model if 404 Not Found or unsupported
        if (res.status === 404) {
          const fbModel = 'gemini-1.5-flash-latest';
          const url2 = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(fbModel) + ':generateContent?key=' + encodeURIComponent(settings.geminiApiKey);
          const res2 = await fetch(url2, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          if (res2.ok) {
            try { await chrome.storage.sync.set({ geminiModel: fbModel }); } catch(_){}
            const data2 = await res2.json();
            const textOut2 = data2?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const metrics2 = type === 'simplify' ? { flesch: fleschReadingEase(payload.text), smog: smogIndex(payload.text) } : undefined;
            return { ok: true, output: textOut2, metrics: metrics2 };
          }
        }
        return { ok: false, error: 'Gemini error: ' + err };
      }
      const data = await res.json();
      const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const metrics = type === 'simplify' ? {
        flesch: fleschReadingEase(payload.text),
        smog: smogIndex(payload.text)
      } : undefined;
      return { ok: true, output: textOut, metrics };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  return { ok: false, error: 'Unsupported AI provider' };
}

// Resolve and validate Gemini model against available models, prefer ones supporting generateContent.
async function resolveGeminiModel(model, apiKey) {
  let m = model || 'gemini-1.5-flash-latest';
  if (!/-latest$|-001$|-002$/.test(m)) m = m + '-latest';
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey);
    const res = await fetch(url);
    if (!res.ok) return m;
    const data = await res.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    const candidates = models.filter(x => Array.isArray(x?.supportedGenerationMethods) && x.supportedGenerationMethods.includes('generateContent'));
    const names = candidates.map(c => (c.name || '').split('/').pop());
    if (names.includes(m)) return m;
    const preferred = names.find(n => /gemini-1\.5-flash.*latest/.test(n)) || names.find(n => /gemini-1\.5-pro.*latest/.test(n)) || names[0];
    return preferred || m;
  } catch (_) { return m; }
}

chrome.runtime.onInstalled.addListener(async () => {
  await setSettings({});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'getSettings': {
          const s = await getSettings();
          sendResponse({ ok: true, settings: s });
          break;
        }
        case 'setSettings': {
          const s = await setSettings(msg.patch || {});
          sendResponse({ ok: true, settings: s });
          break;
        }
        case 'capturePage': {
          try {
            const windowId = sender?.tab?.windowId;
            const dataUrl = await new Promise((resolve, reject) => {
              const cb = (url) => { if (chrome.runtime.lastError) reject(chrome.runtime.lastError); else resolve(url); };
              if (windowId !== undefined) chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, cb);
              else chrome.tabs.captureVisibleTab({ format: 'png' }, cb);
            });
            sendResponse({ ok: true, dataUrl });
          } catch (e) {
            sendResponse({ ok: false, error: e.message || String(e) });
          }
          break;
        }
        case 'aiRequest': {
          console.log('[SW] aiRequest received:', msg);
          const { actionType, payload } = msg;
          const res = await routeAIRequest(actionType, payload);
          console.log('[SW] aiRequest result:', res);
          sendResponse(res);
          break;
        }
        case 'exportAnnotations': {
          // Payload: { url, annotations, format }
          // Convert to data URL and return for download; keep deterministic
          const { annotations, format } = msg;
          const content = JSON.stringify({ annotations, format, ts: Date.now() }, null, 2);
          const blob = new Blob([content], { type: 'application/json' });
          const reader = new FileReader();
          reader.onload = () => sendResponse({ ok: true, dataUrl: reader.result });
          reader.onerror = () => sendResponse({ ok: false, error: 'Export failed' });
          reader.readAsDataURL(blob);
          break;
        }
        case 'downloadPdf': {
          try {
            const { dataUrl, filename } = msg;
            // Prefer silent download to default folder
            const id = await chrome.downloads.download({ url: dataUrl, filename: filename || 'snap-output.pdf', saveAs: false });
            if (typeof id !== 'number') throw new Error('Download was not started');
            sendResponse({ ok: true });
          } catch (e) {
            // Fallback: open the data URL in a new tab to allow manual save
            try {
              await chrome.tabs.create({ url: msg.dataUrl });
            } catch (_) {}
            sendResponse({ ok: false, error: e.message || String(e) });
          }
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true; // keep channel open
});

// Keyboard command to toggle overlay (Alt+X by default)
try {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-overlay') return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content-script.js'] });
      chrome.tabs.sendMessage(tab.id, { type: 'toggleOverlay' });
    } catch (_) {}
  });
} catch (_) {}
