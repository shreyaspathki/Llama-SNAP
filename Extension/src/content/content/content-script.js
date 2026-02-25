// SNAP Content Script
// Injects Shadow DOM overlay toolbar, handles text selection, inline actions.

const SNAP_NS = 'snap-overlay';
let overlayRoot; // Shadow root
let toolbarEl;
let drawingManager;
let currentLang = 'en';
let overlayCanvasHost; // host for drawing Shadow DOM
let overlayHostEl; // DOM element host for toolbar
let I18N = { en: {}, hi: {}, kn: {} };
function t(key) { return (I18N[currentLang] && I18N[currentLang][key]) || key; }

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => resolve(res));
  });
}

async function loadSettings() {
  const res = await sendMessage({ type: 'getSettings' });
  if (res?.ok) {
    currentLang = res.settings.language || 'en';
    await loadI18n(currentLang);
    applyAccessibility(res.settings);
  }
}

async function loadI18n(lang){
  try {
    const url = chrome.runtime.getURL('ui/i18n/' + lang + '.json');
    const data = await fetch(url).then(r=>r.json());
    I18N[lang] = data;
  } catch(e) {}
}

function applyAccessibility(settings) {
  document.documentElement.style.setProperty('--snap-font-scale', settings.fontScale || 1);
  const html = document.documentElement;
  html.classList.toggle('snap-easy-read', !!settings.easyRead);
  html.classList.toggle('snap-dyslexia', !!settings.dyslexiaFont);
  html.classList.toggle('snap-contrast', !!settings.highContrast);
  html.classList.toggle('snap-focus', !!settings.focusMode);
  html.classList.toggle('snap-ruler', !!settings.readingRuler);
}

function ensureStyleHost() {
  if (!document.getElementById('snap-global-style')) {
    const style = document.createElement('style');
    style.id = 'snap-global-style';
    style.textContent = `
      html { --snap-font-scale: 1; }
      body, body * { font-size: calc(var(--snap-font-scale) * 1em); }
      .snap-dyslexia { font-family: 'OpenDyslexic', Arial, sans-serif !important; }
      .snap-contrast { filter: contrast(1.25); }
      .snap-focus *:not(:hover):not(:focus) { opacity: 0.85; }
      .snap-ruler { cursor: crosshair; }
    `;
    document.head.appendChild(style);
  }
}

function createOverlay() {
  if (overlayHostEl) return;
  const host = document.createElement('div');
  host.setAttribute('aria-label', 'SNAP Toolbar');
  host.setAttribute('role', 'toolbar');
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.top = '20px';
  host.style.left = '20px';
  host.style.width = '360px';
  host.style.height = 'auto';

  overlayRoot = host.attachShadow({ mode: 'open' });
  toolbarEl = document.createElement('div');
  toolbarEl.id = 'snap-toolbar';
  toolbarEl.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, Arial; }
      .wrap {
        background: linear-gradient(135deg, #0f1220, #1e2448);
        color: #e6e9ff; border: 1px solid #39406b; border-radius: 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35); padding: 12px;
      }
      .top { display: flex; gap: 8px; flex-wrap: wrap; }
      button { background: #2a315b; color: #dfe3ff; border: 1px solid #3b4271;
        border-radius: 10px; padding: 8px 10px; cursor: pointer; }
      button:hover { background: #36407a; }
      .row { margin-top: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .label { font-size: 12px; opacity: 0.9; }
      .dock { margin-left: auto; }
      input[type=range] { width: 120px; }
      .radio, .checkbox { display: flex; gap: 8px; align-items: center; }
      .sep { height: 1px; background: #39406b; margin: 10px 0; }
    </style>
    <div class="wrap" tabindex="0" aria-label="SNAP Floating Toolbar">
      <div class="top" aria-label="Primary AI actions">
        <button id="btn-simplify" aria-label="${t('simplify')}">${t('simplify')}</button>
        <button id="btn-explain" aria-label="${t('explain')}">${t('explain')}</button>
        <button id="btn-expand" aria-label="${t('expand')}">${t('expand')}</button>
        <div>
          <button id="btn-translate" aria-label="${t('translate')}">${t('translate')}</button>
          <div id="translate-menu" style="display:none; margin-top:6px;">
            <button id="btn-translate-hi">${t('translateHindi')}</button>
            <button id="btn-translate-kn">${t('translateKannada')}</button>
          </div>
        </div>
        <button id="btn-close" class="dock">${t('close')}</button>
      </div>
      <div class="sep"></div>
      <div class="row" aria-label="Read Aloud">
        <button id="btn-read">${t('readAloud')}</button>
        <button id="btn-stop">${t('stop')}</button>
        <span class="label">${t('rate')}</span><input id="rate" type="range" min="0.8" max="1.6" step="0.05" value="1">
        <span class="label">${t('pitch')}</span><input id="pitch" type="range" min="0.8" max="1.6" step="0.05" value="1">
      </div>
      <div class="row" aria-label="Accessibility Toggles">
        <label><input id="tog-easy" type="checkbox"> ${t('easyRead')}</label>
        <label><input id="tog-dys" type="checkbox"> ${t('dyslexia')}</label>
        <label><input id="tog-contrast" type="checkbox"> ${t('contrast')}</label>
        <label><input id="tog-focus" type="checkbox"> ${t('focus')}</label>
        <label><input id="tog-ruler" type="checkbox"> ${t('ruler')}</label>
      </div>
      <div class="row" aria-label="Size Control">
        <span class="label">${t('size')}</span>
        <input id="size" type="range" min="0.8" max="1.8" step="0.05" value="1">
        <button id="btn-dock" class="dock">${t('dock')}</button>
      </div>
      <div class="sep"></div>
      <div class="row" aria-label="Drawing Tools">
        <button id="pen">Pen</button>
        <button id="highlighter">Highlighter</button>
        <button id="clear">Clear</button>
        <button id="export">Export</button>
      </div>
    </div>
  `;
  overlayRoot.appendChild(toolbarEl);
  document.documentElement.appendChild(host);
  overlayHostEl = host;

  makeDraggable(host);
  initEvents();
  initDrawing(host);
}

function destroyOverlay() {
  try {
    overlayRoot?.host?.remove();
  } catch(e) {}
  overlayRoot = null;
  toolbarEl = null;
  overlayHostEl = null;
  try {
    overlayCanvasHost?.remove();
  } catch(e) {}
  overlayCanvasHost = null;
}

function toggleOverlay() {
  if (overlayHostEl) {
    destroyOverlay();
    console.log('[SNAP] Overlay toggled OFF');
  } else {
    createOverlay();
    console.log('[SNAP] Overlay toggled ON');
  }
}

function makeDraggable(host) {
  let isDrag = false, sx = 0, sy = 0, ox = 0, oy = 0;
  host.addEventListener('mousedown', (e) => {
    // Start drag only when clicking non-interactive area to avoid blocking buttons
    const interactive = e.target.closest('button, input, select, label, a, textarea');
    const toolbar = e.target.closest('#snap-toolbar');
    if (toolbar && !interactive) {
      isDrag = true; sx = e.clientX; sy = e.clientY; ox = parseInt(host.style.left); oy = parseInt(host.style.top);
      e.preventDefault();
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (isDrag) { host.style.left = (ox + e.clientX - sx) + 'px'; host.style.top = (oy + e.clientY - sy) + 'px'; }
  });
  window.addEventListener('mouseup', () => { isDrag = false; });
}

function selectedTextOrMain() {
  const sel = window.getSelection();
  const text = sel && sel.toString().trim();
  if (text) return text;
  const article = document.querySelector('article') || document.querySelector('main') || document.body;
  return (article.innerText || '').trim().slice(0, 4000);
}

function highlightReplacement(originalNode, newText) {
  const span = document.createElement('span');
  span.setAttribute('data-original', originalNode.innerText);
  span.style.background = 'rgba(255, 196, 0, 0.15)';
  span.style.borderRadius = '6px';
  span.style.padding = '2px 2px';
  span.textContent = newText;
  originalNode.replaceWith(span);
}

function initEvents() {
  const $ = (id) => overlayRoot.getElementById(id);
  console.log('[SNAP] Overlay initialized, binding events');
  $('btn-translate').addEventListener('click', () => {
    const menu = $('translate-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });
  $('btn-close').addEventListener('click', () => {
    destroyOverlay();
    console.log('[SNAP] Overlay closed');
  });
  $('btn-dock').addEventListener('click', () => {
    // Dock to top-right
    toolbarEl.host.style.top = '20px';
    toolbarEl.host.style.left = (window.innerWidth - 380) + 'px';
  });

  async function ai(type, extra = {}) {
    const text = selectedTextOrMain();
    console.log('[SNAP] AI request', type, { extra, textLen: text?.length });
    const res = await sendMessage({ type: 'aiRequest', actionType: type, payload: { text, ...extra } });
    if (!res?.ok) return;
    if (type === 'simplify') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const temp = document.createElement('span');
        range.surroundContents(temp);
        highlightReplacement(temp, res.output);
        const scoresNote = document.createElement('span');
        scoresNote.style.fontSize = '0.85em';
        scoresNote.style.opacity = '0.8';
        scoresNote.textContent = ` (Flesch ${res.metrics?.flesch}, SMOG ${res.metrics?.smog})`;
        temp.nextSibling && temp.nextSibling.appendChild ? temp.nextSibling.appendChild(scoresNote) : temp.parentElement.appendChild(scoresNote);
      }
    } else if (type === 'explain') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        const tip = document.createElement('div');
        tip.textContent = res.output;
        tip.style.position = 'fixed';
        tip.style.left = rect.left + 'px';
        tip.style.top = (rect.bottom + 6) + 'px';
        tip.style.background = 'rgba(30,34,72,0.95)';
        tip.style.color = '#dfe3ff'; tip.style.padding = '8px 10px'; tip.style.border = '1px solid #3b4271'; tip.style.borderRadius = '10px';
        tip.style.zIndex = '2147483647'; tip.style.maxWidth = '320px';
        document.body.appendChild(tip);
        setTimeout(() => tip.remove(), 8000);
      }
    } else if (type === 'expand') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const temp = document.createElement('span');
        range.surroundContents(temp);
        highlightReplacement(temp, res.output);
      }
    } else if (type === 'translate') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const temp = document.createElement('span');
        range.surroundContents(temp);
        highlightReplacement(temp, res.output);
      }
    }
  }

  $('btn-simplify').addEventListener('click', () => ai('simplify'));
  $('btn-explain').addEventListener('click', () => ai('explain'));
  $('btn-expand').addEventListener('click', () => ai('expand'));
  $('btn-translate-hi').addEventListener('click', () => ai('translate', { lang: 'hi' }));
  $('btn-translate-kn').addEventListener('click', () => ai('translate', { lang: 'kn' }));

  $('btn-read').addEventListener('click', () => {
    const text = selectedTextOrMain();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = parseFloat($('rate').value);
    utter.pitch = parseFloat($('pitch').value);
    // Try language detection: simple check for Devanagari/Kannada blocks
    if (/\p{Script=Devanagari}/u.test(text)) utter.lang = 'hi-IN';
    else if (/\p{Script=Kannada}/u.test(text)) utter.lang = 'kn-IN';
    else utter.lang = 'en-US';
    window.speechSynthesis.speak(utter);
    console.log('[SNAP] TTS start', { rate: utter.rate, pitch: utter.pitch, lang: utter.lang });
  });
  $('btn-stop').addEventListener('click', () => {
    window.speechSynthesis.cancel();
    console.log('[SNAP] TTS stop');
  });

  // Accessibility toggles synced to storage
  $('tog-easy').addEventListener('change', async (e) => sendMessage({ type: 'setSettings', patch: { easyRead: e.target.checked } }).then(loadSettings));
  $('tog-dys').addEventListener('change', async (e) => sendMessage({ type: 'setSettings', patch: { dyslexiaFont: e.target.checked } }).then(loadSettings));
  $('tog-contrast').addEventListener('change', async (e) => sendMessage({ type: 'setSettings', patch: { highContrast: e.target.checked } }).then(loadSettings));
  $('tog-focus').addEventListener('change', async (e) => sendMessage({ type: 'setSettings', patch: { focusMode: e.target.checked } }).then(loadSettings));
  $('tog-ruler').addEventListener('change', async (e) => sendMessage({ type: 'setSettings', patch: { readingRuler: e.target.checked } }).then(loadSettings));

  $('size').addEventListener('input', async (e) => sendMessage({ type: 'setSettings', patch: { fontScale: parseFloat(e.target.value) } }).then(loadSettings));

  $('export').addEventListener('click', async () => {
    const url = location.href;
    const annotations = drawingManager?.getAnnotations() || [];
    const res = await sendMessage({ type: 'exportAnnotations', url, annotations, format: 'json' });
    if (res?.ok) {
      const a = document.createElement('a');
      a.href = res.dataUrl; a.download = 'snap-annotations.json'; a.click();
    }
  });
}

function initDrawing(host) {
  const canvasHost = document.createElement('div');
  overlayCanvasHost = canvasHost;
  const shadow = canvasHost.attachShadow({ mode: 'open' });
  const canvas = document.createElement('canvas');
  const style = document.createElement('style');
  style.textContent = `
    :host { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483646; }
    canvas { width: 100%; height: 100%; }
  `;
  shadow.append(style, canvas);
  document.documentElement.appendChild(canvasHost);

  const ctx = canvas.getContext('2d');
  let penColor = 'rgba(255, 220, 0, 0.9)';
  let penWidth = 3;
  let isDrawing = false;
  let paths = JSON.parse(localStorage.getItem('snap.paths.' + location.href) || '[]');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.scale(dpr, dpr);
    redraw();
  }
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paths.forEach(p => {
      ctx.strokeStyle = p.color; ctx.lineWidth = p.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      p.points.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
      ctx.stroke();
    });
  }
  resize();
  window.addEventListener('resize', resize);

  function pointer(el, enable) { el.style.pointerEvents = enable ? 'auto' : 'none'; }
  pointer(canvasHost, true);
  canvas.addEventListener('pointerdown', (e) => { isDrawing = true; const p = { color: penColor, width: penWidth, points: [{ x: e.offsetX, y: e.offsetY }] }; paths.push(p); });
  canvas.addEventListener('pointermove', (e) => { if (!isDrawing) return; const p = paths[paths.length - 1]; p.points.push({ x: e.offsetX, y: e.offsetY }); redraw(); });
  canvas.addEventListener('pointerup', () => { isDrawing = false; localStorage.setItem('snap.paths.' + location.href, JSON.stringify(paths)); });

  const $ = (id) => overlayRoot.getElementById(id);
  $('pen').addEventListener('click', () => { penColor = 'rgba(255, 220, 0, 0.9)'; penWidth = 3; });
  $('highlighter').addEventListener('click', () => { penColor = 'rgba(0, 196, 255, 0.25)'; penWidth = 16; });
  $('clear').addEventListener('click', () => { paths = []; redraw(); localStorage.removeItem('snap.paths.' + location.href); });

  drawingManager = {
    getAnnotations: () => paths.slice()
  };
}

(async function main() {
  ensureStyleHost();
  await loadSettings();
  // Do not auto-open; honor Alt+Space and popup actions
  // createOverlay();
  window.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') {
      destroyOverlay();
      console.log('[SNAP] Overlay closed via ESC');
    }
  });
  // Clean up overlay on page navigation/unload
  window.addEventListener('pagehide', () => { destroyOverlay(); });
  window.addEventListener('beforeunload', () => { destroyOverlay(); });
})();

// Listen for popup commands (TTS, AI proxy)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'tts') {
        if (msg.cmd === 'start') {
          const text = selectedTextOrMain();
          const u = new SpeechSynthesisUtterance(text);
          u.rate = msg.rate || 1; u.pitch = msg.pitch || 1;
          if (/\p{Script=Devanagari}/u.test(text)) u.lang = 'hi-IN';
          else if (/\p{Script=Kannada}/u.test(text)) u.lang = 'kn-IN';
          else u.lang = 'en-US';
          window.speechSynthesis.speak(u);
          sendResponse({ ok: true });
        } else if (msg.cmd === 'stop') {
          window.speechSynthesis.cancel();
          sendResponse({ ok: true });
        }
      } else if (msg.type === 'aiProxy') {
        const { actionType, payload } = msg;
        const text = selectedTextOrMain();
        const res = await new Promise(r=> chrome.runtime.sendMessage({ type: 'aiRequest', actionType, payload: { text, ...(payload||{}) } }, rr=> r(rr)));
        sendResponse(res);
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true;
});

// Receive toggle from background command
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'toggleOverlay') {
    toggleOverlay();
    sendResponse({ ok: true });
    return true;
  }
});
