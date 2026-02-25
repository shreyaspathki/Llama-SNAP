// SNAP Background Service Worker (MV3, ES Module)
// Routes AI requests (Mock/Gemini), handles storage, messaging.

const DEFAULT_SETTINGS = {
  uiMode: 'popup', // 'popup' | 'overlay'
  language: 'en',
  easyRead: false,
  dyslexiaFont: false,
  highContrast: false,
  focusMode: false,
  readingRuler: false,
  fontScale: 1,
  aiProvider: 'mock', // 'mock' | 'gemini'
  geminiApiKey: '',
  geminiModel: 'gemini-1.5-flash',
  maxTokens: 512,
  privacyOnlySelectedText: true
};

// Simple deterministic mock outputs
const MOCK_RESPONSES = {
  simplify: (text) => `Simplified: ${text.slice(0, 200)}...`,
  explain: (text) => `Explanation: This term refers to a commonly used concept. Source: SNAP Mock.`,
  expand: (text) => `Expanded: ${text} Further context: This elaboration adds clarity without new facts.`,
  translate_hi: (text) => `अनुवादित: ${text}`,
  translate_kn: (text) => `ಅನುವಾದಿಸಲಾಗಿದೆ: ${text}`
};

function fleschReadingEase(text) {
  // Basic approximation: words, sentences, syllables
  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  const words = (text.match(/\b\w+\b/g) || []).length || 1;
  const syllables = (text.match(/[aeiouy]+/gi) || []).length || 1;
  const asl = words / sentences; // average sentence length
  const asw = syllables / words; // average syllables per word
  const score = 206.835 - 1.015 * asl - 84.6 * asw;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function smogIndex(text) {
  const polysyllables = (text.match(/\b\w{3,}?[aeiouy]{3,}\w*\b/gi) || []).length;
  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  const smog = 1.0430 * Math.sqrt(polysyllables * (30 / sentences)) + 3.1291;
  return Math.round(smog * 10) / 10;
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.sync.set(next);
  return next;
}

async function routeAIRequest(type, payload) {
  const settings = await getSettings();
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
      const prompt = `${type.toUpperCase()}\nText:\n${payload.text}\nConstraints: factual tone, no hallucinations.`;
      // Minimal Google Generative Language API call (pseudo endpoint illustration)
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(settings.geminiModel) + ':generateContent?key=' + encodeURIComponent(settings.geminiApiKey);
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
        case 'aiRequest': {
          const { actionType, payload } = msg;
          const res = await routeAIRequest(actionType, payload);
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
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true; // keep channel open
});

// Toggle overlay on active tab via command
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'toggle-overlay') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'toggleOverlay' });
    }
  } catch (e) {
    // No-op
  }
});
