if (!window.snapContentScriptInjected) {
  window.snapContentScriptInjected = true;

(function () {

  const SNAP_NS = 'snap-overlay';
  let overlayRoot; // Shadow root
  let toolbarEl;
  let overlayHostEl; // host element for toolbar
  let overlayState = { mode: 'floating', minimized: false, position: { x: 20, y: 20 } };

  function sendMessage(msg) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(msg, (res) => resolve(res));
      } else {
        resolve({});
      }
    });
  }

  function createOverlay() {
    if (overlayHostEl) return;
    // Clean potentially stale elements
    document.querySelectorAll('#snap-overlay-host').forEach(n => n.remove());

    const host = document.createElement('div');
    host.id = 'snap-overlay-host';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    host.style.top = '0px';
    host.style.left = '0px';

    // Check persisted state
    try {
      const saved = localStorage.getItem('snap.overlayState');
      if (saved) overlayState = JSON.parse(saved);
    } catch (e) { }

    overlayRoot = host.attachShadow({ mode: 'open' });
    toolbarEl = document.createElement('div');

    // Inject Styles & HTML — Canva-style icon-only toolbar
    toolbarEl.innerHTML = `
    <style>
      :host { all: initial; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
      * { box-sizing: border-box; }

      .toolbar {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 4px;
        width: max-content;
        background: #18181B;
        border-radius: 16px;
        padding: 6px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15);
        animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
      }

      @keyframes popIn {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }

      /* Drag handle / logo */
      .drag-handle {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #10B981, #0D9488);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 800;
        font-size: 18px;
        cursor: grab;
        flex-shrink: 0;
        transition: transform 0.15s;
      }
      .drag-handle:active { cursor: grabbing; transform: scale(0.95); }

      /* Divider */
      .divider {
        width: 1px;
        height: 28px;
        background: #3F3F46;
        margin: 0 2px;
        flex-shrink: 0;
      }

      /* Group toggle button (Smart Tools / Accessibility) */
      .group-btn {
        position: relative;
        height: 40px;
        border: none;
        background: #27272A;
        border-radius: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 14px;
        color: #A1A1AA;
        font-size: 12px;
        font-weight: 600;
        font-family: inherit;
        transition: all 0.15s;
        flex-shrink: 0;
        white-space: nowrap;
      }
      .group-btn:hover { background: #3F3F46; color: #FFFFFF; }
      .group-btn.expanded { background: #10B981; color: #FFFFFF; }
      .group-btn .dot-indicator {
        width: 6px; height: 6px; border-radius: 50%;
        background: #10B981; display: none;
        position: absolute; top: 6px; right: 6px;
      }
      .group-btn.has-active .dot-indicator { display: block; }
      .group-btn.expanded .dot-indicator { background: white; }

      /* Expandable panel (sub-buttons) */
      .expand-panel {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 2px;
        max-width: 0;
        overflow: hidden;
        opacity: 0;
        transition: max-width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease, padding 0.2s ease;
        padding: 0;
      }
      .expand-panel.open {
        max-width: 400px;
        opacity: 1;
        padding: 0 4px;
        overflow: visible;
      }

      /* Icon button */
      .icon-btn {
        position: relative;
        width: 36px;
        height: 36px;
        border: none;
        background: transparent;
        border-radius: 10px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #A1A1AA;
        transition: all 0.15s;
        flex-shrink: 0;
      }
      .icon-btn:hover { background: #27272A; color: #FFFFFF; }
      .icon-btn:active { transform: scale(0.92); }
      .icon-btn.active { background: #10B981; color: #FFFFFF; }
      .icon-btn.close-btn:hover { background: #7F1D1D; color: #FCA5A5; }

      /* Tooltip */
      .icon-btn::after, .group-btn::after {
        content: attr(data-tip);
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%) scale(0.9);
        background: #FAFAFA;
        color: #18181B;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 8px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: all 0.15s;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border: 1px solid #E4E4E7;
      }
      .icon-btn:hover::after { opacity: 1; transform: translateX(-50%) scale(1); }
      .group-btn:not(.expanded):hover::after { opacity: 1; transform: translateX(-50%) scale(1); }

      /* Lang picker */
      .lang-picker {
        position: absolute;
        bottom: calc(100% + 8px);
        right: 0;
        background: #FAFAFA;
        border: 1px solid #E4E4E7;
        border-radius: 10px;
        padding: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        display: none;
        flex-direction: column;
        gap: 2px;
        z-index: 100;
        animation: popIn 0.15s ease-out;
      }
      .lang-picker.open { display: flex; }
      .lang-opt {
        padding: 6px 12px;
        border: none;
        background: transparent;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        color: #3F3F46;
        cursor: pointer;
        text-align: left;
        white-space: nowrap;
        transition: background 0.1s;
      }
      .lang-opt:hover { background: #ECFDF5; color: #059669; }
      .lang-opt.selected { background: #10B981; color: white; }

      /* Toggle indicator dot */
      .toggle-dot {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #10B981;
        display: none;
      }
      .icon-btn.on .toggle-dot { display: block; }

      /* Minimized bubble */
      .minimized-btn {
        display: none;
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, #10B981, #0D9488);
        border-radius: 50%;
        color: white;
        font-weight: 800;
        font-size: 18px;
        align-items: center;
        justify-content: center;
        cursor: grab;
        box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
        transition: transform 0.2s;
        user-select: none;
      }
      .minimized-btn:hover { transform: scale(1.1); }
      .minimized-btn:active { cursor: grabbing; }

      :host(.minimized) .toolbar { display: none; }
      :host(.minimized) .minimized-btn { display: flex; }
    </style>

    <div class="toolbar">
      <!-- Drag handle / Logo -->
      <img src="${chrome.runtime.getURL('assets/logosnap.png')}" alt="SNAP" class="drag-handle" id="drag-handle" title="Drag to move" style="width: 32px; height: 32px; object-fit: contain;" />

      <div class="divider"></div>

      <!-- Smart Tools group -->
      <button class="group-btn" id="grp-smart" data-tip="Smart Tools">
        <span>Smart Tools</span>
        <span class="dot-indicator"></span>
      </button>
      <div class="expand-panel" id="panel-smart">
        <button class="icon-btn" id="btn-simplify" data-tip="Simplify">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2L19 5"/><path d="M11 6.2L9.7 5"/><path d="M11 11.8L9.7 13"/><path d="M8 15h2c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2v-2c0-1.1.9-2 2-2z"/></svg>
        </button>
        <button class="icon-btn" id="btn-explain" data-tip="Explain">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </button>
        <button class="icon-btn" id="btn-expand" data-tip="Expand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
        </button>
        <div class="divider"></div>
        <div style="position:relative">
          <button class="icon-btn" id="btn-translate" data-tip="Translate">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-8"/><path d="M2 5h12"/><path d="M7 2v3"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
          </button>
          <div class="lang-picker" id="lang-picker">
            <button class="lang-opt selected" data-lang="hi">Hindi</button>
            <button class="lang-opt" data-lang="kn">Kannada</button>
            <button class="lang-opt" data-lang="es">Spanish</button>
            <button class="lang-opt" data-lang="fr">French</button>
          </div>
        </div>
        <div class="divider"></div>
        <button class="icon-btn" id="btn-read" data-tip="Read Aloud">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        </button>
        <button class="icon-btn" id="btn-stop" data-tip="Stop">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
        </button>
      </div>

      <!-- Accessibility group -->
      <button class="group-btn" id="grp-a11y" data-tip="Accessibility">
        <span>Accessibility</span>
        <span class="dot-indicator"></span>
      </button>
      <div class="expand-panel" id="panel-a11y">
        <button class="icon-btn" id="tog-easy" data-tip="Easy Read">
          <span class="toggle-dot"></span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </button>
        <button class="icon-btn" id="tog-dys" data-tip="Dyslexia Font">
          <span class="toggle-dot"></span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        </button>
        <button class="icon-btn" id="tog-contrast" data-tip="High Contrast">
          <span class="toggle-dot"></span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>
        </button>
        <button class="icon-btn" id="tog-focus" data-tip="Focus Mode">
          <span class="toggle-dot"></span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>
        </button>
      </div>

      <div class="divider"></div>

      <!-- Minimize & Close -->
      <button class="icon-btn" id="btn-minimize" data-tip="Minimize">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="icon-btn close-btn" id="btn-close" data-tip="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Minimized bubble -->
    <img src="${chrome.runtime.getURL('assets/logosnap.png')}" alt="SNAP" class="minimized-btn" id="minimized-handle" title="Expand SNAP" style="width: 48px; height: 48px; object-fit: contain;" />
  `;

    overlayRoot.appendChild(toolbarEl);
    document.documentElement.appendChild(host);
    overlayHostEl = host;

    restoreOverlayState();
    initDragAndDock(host);
    initEvents();

    // Sync settings
    sendMessage({ type: 'getSettings' }).then(res => {
      if (res?.settings) syncOverlayControls(res.settings);
    });
  }

  function destroyOverlay() {
    overlayHostEl?.remove();
    overlayHostEl = null;
    overlayRoot = null;
  }

  function toggleOverlay() {
    if (overlayHostEl) destroyOverlay();
    else createOverlay();
  }

  function restoreOverlayState() {
    if (overlayState.minimized) {
      overlayHostEl.classList.add('minimized');
    } else {
      overlayHostEl.classList.remove('minimized');
    }
    const p = clampToViewport(overlayState.position);
    overlayHostEl.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }

  function saveOverlayState() {
    localStorage.setItem('snap.overlayState', JSON.stringify(overlayState));
  }

  function clampToViewport(pos) {
    if (!overlayHostEl) return pos;
    const toolbar = overlayRoot?.querySelector('.toolbar');
    const w = overlayState.minimized ? 60 : (toolbar?.offsetWidth || 600);
    const h = overlayState.minimized ? 60 : (toolbar?.offsetHeight || 48);
    const maxX = window.innerWidth - w;
    const maxY = window.innerHeight - h;
    return {
      x: Math.min(Math.max(0, pos.x), maxX),
      y: Math.min(Math.max(0, pos.y), maxY)
    };
  }

  function initDragAndDock(host) {
    const header = overlayRoot.getElementById('drag-handle');
    const minBtn = overlayRoot.getElementById('minimized-handle');

    let dragging = false;
    let offsets = { x: 0, y: 0 };

    const onDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, input, label')) return;

      dragging = true;
      const rect = host.getBoundingClientRect();
      offsets = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      e.preventDefault();
      document.body.style.userSelect = 'none';
    };

    const onMove = (e) => {
      if (!dragging) return;
      const nx = e.clientX - offsets.x;
      const ny = e.clientY - offsets.y;
      overlayState.position = { x: nx, y: ny };
      host.style.transform = `translate(${nx}px, ${ny}px)`;
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      const p = clampToViewport(overlayState.position);
      overlayState.position = p;
      host.style.transform = `translate(${p.x}px, ${p.y}px)`;
      saveOverlayState();
    };

    if (header) header.addEventListener('mousedown', onDown);
    if (minBtn) minBtn.addEventListener('mousedown', onDown);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    // Minimize/Maximize
    overlayRoot.getElementById('btn-minimize')?.addEventListener('click', () => {
      overlayState.minimized = true;
      host.classList.add('minimized');
      saveOverlayState();
    });

    minBtn?.addEventListener('click', (e) => {
      if (dragging) return;
      overlayState.minimized = false;
      host.classList.remove('minimized');
      saveOverlayState();
    });

    overlayRoot.getElementById('btn-close')?.addEventListener('click', destroyOverlay);
  }

  function initEvents() {
    const q = (sel) => overlayRoot.querySelector(sel);
    let selectedLang = 'hi';

    // --- Expandable group toggle logic ---
    const grpSmart = q('#grp-smart');
    const grpA11y = q('#grp-a11y');
    const panelSmart = q('#panel-smart');
    const panelA11y = q('#panel-a11y');

    function togglePanel(grpBtn, panel, otherGrp, otherPanel) {
      const isOpen = panel.classList.contains('open');
      // Close the other panel first
      otherPanel.classList.remove('open');
      otherGrp.classList.remove('expanded');
      // Toggle this panel
      if (isOpen) {
        panel.classList.remove('open');
        grpBtn.classList.remove('expanded');
      } else {
        panel.classList.add('open');
        grpBtn.classList.add('expanded');
      }
    }

    grpSmart?.addEventListener('click', () => togglePanel(grpSmart, panelSmart, grpA11y, panelA11y));
    grpA11y?.addEventListener('click', () => togglePanel(grpA11y, panelA11y, grpSmart, panelSmart));

    // AI Action Buttons
    ['simplify', 'explain', 'expand'].forEach(action => {
      const btn = q('#btn-' + action);
      if (!btn) return;

      btn.addEventListener('click', async () => {
        let text = window.getSelection().toString().trim();

        if (!text) {
           if (confirm('No text selected. Process the entire page?')) {
               text = document.body.innerText.trim();
               if (text.length > 15000) text = text.substring(0, 15000) + '... [Truncated]';
           } else return;
        }
        if (!text) { alert('Page is empty.'); return; }

        btn.classList.add('active');
        try {
          const res = await sendMessage({ type: 'aiRequest', actionType: action, payload: { text, lang: selectedLang } });
          if (res.ok) showResultWindow(res.output, action);
          else alert('Error: ' + (res.error || 'Unknown error'));
        } catch (e) {
          alert('Failed: ' + e.message);
        } finally {
          btn.classList.remove('active');
        }
      });
    });

    // Translate button — right-click opens lang picker, left click translates
    const translateBtn = q('#btn-translate');
    const langPicker = q('#lang-picker');
    if (translateBtn && langPicker) {
      translateBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        langPicker.classList.toggle('open');
      });
      translateBtn.addEventListener('click', async () => {
        langPicker.classList.remove('open');
        let text = window.getSelection().toString().trim();
        if (!text) {
          if (confirm('No text selected. Process the entire page?')) {
            text = document.body.innerText.trim();
            if (text.length > 15000) text = text.substring(0, 15000) + '... [Truncated]';
          } else return;
        }
        if (!text) { alert('Page is empty.'); return; }
        translateBtn.classList.add('active');
        try {
          const res = await sendMessage({ type: 'aiRequest', actionType: 'translate', payload: { text, lang: selectedLang } });
          if (res.ok) showResultWindow(res.output, 'translate');
          else alert('Error: ' + (res.error || 'Unknown error'));
        } catch (e) {
          alert('Failed: ' + e.message);
        } finally {
          translateBtn.classList.remove('active');
        }
      });

      // Lang options
      langPicker.querySelectorAll('.lang-opt').forEach(opt => {
        opt.addEventListener('click', () => {
          langPicker.querySelectorAll('.lang-opt').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          selectedLang = opt.dataset.lang;
          langPicker.classList.remove('open');
        });
      });

      // Close lang picker on outside click
      document.addEventListener('mousedown', (e) => {
        if (!langPicker.contains(e.target) && e.target !== translateBtn) {
          langPicker.classList.remove('open');
        }
      });
    }

    // Read Aloud / Stop
    q('#btn-read')?.addEventListener('click', () => {
      const text = window.getSelection().toString().trim() || document.body.innerText.substring(0, 5000);
      if (!text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(u);
      q('#btn-read')?.classList.add('active');
      u.onend = () => q('#btn-read')?.classList.remove('active');
    });
    q('#btn-stop')?.addEventListener('click', () => {
      window.speechSynthesis.cancel();
      q('#btn-read')?.classList.remove('active');
    });

    // Accessibility toggle buttons (no checkboxes — click to toggle)
    const toggles = [
      { id: 'tog-easy', key: 'easyRead' },
      { id: 'tog-dys', key: 'dyslexiaFont' },
      { id: 'tog-contrast', key: 'highContrast' },
      { id: 'tog-focus', key: 'focusMode' },
    ];

    const toggleState = {};
    toggles.forEach(t => {
      toggleState[t.key] = false;
      const btn = q('#' + t.id);
      if (!btn) return;
      btn.addEventListener('click', () => {
        toggleState[t.key] = !toggleState[t.key];
        btn.classList.toggle('on', toggleState[t.key]);
        sendMessage({ type: 'setSettings', patch: { [t.key]: toggleState[t.key] } });
        applyAccessibility({ [t.key]: toggleState[t.key] });
        // Update dot indicator on accessibility group button
        updateA11yDot();
      });
    });

    function updateA11yDot() {
      const anyOn = Object.values(toggleState).some(v => v);
      grpA11y?.classList.toggle('has-active', anyOn);
    }
  }

  function syncOverlayControls(settings) {
    const q = (sel) => overlayRoot.querySelector(sel);
    const map = [
      { id: 'tog-easy', key: 'easyRead' },
      { id: 'tog-dys', key: 'dyslexiaFont' },
      { id: 'tog-contrast', key: 'highContrast' },
      { id: 'tog-focus', key: 'focusMode' },
    ];
    map.forEach(t => {
      const btn = q('#' + t.id);
      if (btn) btn.classList.toggle('on', !!settings[t.key]);
    });
    // Update dot indicator on accessibility group button
    const anyOn = map.some(t => !!settings[t.key]);
    const grpA11y = q('#grp-a11y');
    grpA11y?.classList.toggle('has-active', anyOn);
  }

  function applyAccessibility(settings) {
    const html = document.documentElement;
    html.classList.toggle('snap-easy-read', !!settings.easyRead);
    html.classList.toggle('snap-dyslexia', !!settings.dyslexiaFont);
    html.classList.toggle('snap-contrast', !!settings.highContrast);
    html.classList.toggle('snap-focus', !!settings.focusMode);
    html.classList.toggle('snap-ruler', !!settings.readingRuler);
  }

  // Listen for messages
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'toggleOverlay') {
      toggleOverlay();
    }
    if (msg.type === 'closeOverlay') {
      if (overlayHostEl) destroyOverlay();
    }
    if (msg.type === 'aiProxy') {
       // From Popup -> trigger action in content script context
       const { actionType, payload } = msg;
       handleContentAction(actionType, payload);
    }
    if (msg.type === 'snapA11yThemeChange') {
      applyWebpageA11yTheme(msg.theme);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'ping') sendResponse('pong');
  });

  async function handleContentAction(action, payload) {
      let text = window.getSelection().toString().trim();
      
      // Fallback to full page text
      if (!text) {
          if (confirm("No text selected. Do you want to process the entire page?")) {
              text = document.body.innerText.trim();
              if (text.length > 15000) {
                 text = text.substring(0, 15000) + "... [Truncated]";
              }
          } else {
              return;
          }
      }

      if (!text) { 
          alert('SNAP: Content is empty.'); 
          return; 
      }
      
      // If overlay exists, show loading state there? Or just use alert for now.
      // We'll reuse the sendMessage logic
      const lang = payload?.lang || 'hi';
      
      try {
          // Show a temporary toast/status?
          const res = await sendMessage({
            type: 'aiRequest',
            actionType: action,
            payload: { text, lang }
          });

          if (res.ok) {
            showResultWindow(res.output, action);
          } else {
            alert('Error: ' + (res.error || 'Unknown error'));
          }
      } catch (e) {
          alert('Failed: ' + e.message);
      }
  }

  // New Result Window Function
  function showResultWindow(content, title) {
    // Create a separate shadow root for results if it doesn't exist
    let resultHost = document.getElementById('snap-result-host');
    if (!resultHost) {
      resultHost = document.createElement('div');
      resultHost.id = 'snap-result-host';
      resultHost.style.position = 'fixed';
      resultHost.style.zIndex = '2147483648'; // Higher than overlay
      resultHost.style.top = '0px';
      resultHost.style.left = '0px';
      resultHost.style.pointerEvents = 'none'; // Let clicks pass through container
      document.documentElement.appendChild(resultHost);
    }

    let resultRoot = resultHost.shadowRoot;
    if (!resultRoot) {
      resultRoot = resultHost.attachShadow({ mode: 'open' });
    }

    // Remove existing result window
    resultRoot.querySelector('.result-window')?.remove();

    const win = document.createElement('div');
    win.className = 'result-window';
    win.style.pointerEvents = 'auto'; // Re-enable clicks for the window itself
    
    // Calculate position: Right side of the screen, vertically centered or top-right?
    // User asked for "right side of the shadow dom window". 
    // Assuming they mean a fixed sidebar-like/notification position on the right.
    
    win.innerHTML = `
      <style>
        .result-window {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 350px;
          max-height: 85vh;
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          font-family: 'Inter', system-ui, sans-serif;
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 999999;
        }

        @keyframes slideInRight {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        .res-header {
          padding: 14px 16px;
          border-bottom: 1px solid #F4F4F5;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #FFFFFF;
          border-radius: 12px 12px 0 0;
        }
        .res-title {
          font-size: 13px;
          font-weight: 700;
          color: #18181B;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .res-title::before {
          content: '';
          display: block;
          width: 8px;
          height: 8px;
          background: #10B981;
          border-radius: 50%;
        }

        .res-close {
          background: transparent;
          border: none;
          cursor: pointer;
          color: #A1A1AA;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          transition: all 0.2s;
        }
        .res-close:hover { background: #F4F4F5; color: #EF4444; }
        
        .res-body {
          padding: 16px;
          font-size: 13px;
          line-height: 1.6;
          color: #3F3F46;
          overflow-y: auto;
          flex: 1;
        }

        .res-actions {
          padding: 12px 16px;
          border-top: 1px solid #F4F4F5;
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          background: #FAFAFA;
          border-radius: 0 0 12px 12px;
        }

        .res-btn {
          font-size: 11px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          border: 1px solid #E4E4E7;
          background: #FFFFFF;
          color: #52525B;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .res-btn:hover { background: #FFFFFF; border-color: #D4D4D8; color: #18181B; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .res-btn.primary { background: #18181B; color: white; border-color: #18181B; }
        .res-btn.primary:hover { background: #27272A; }
      </style>

      <div class="res-header">
        <span class="res-title">${title || 'Snap Result'}</span>
        <button class="res-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      
      <div class="res-body">
        ${content}
      </div>

      <div class="res-actions">
        <button class="res-btn" id="res-copy">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Copy
        </button>
        <button class="res-btn" id="res-pdf">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Export PDF
        </button>
      </div>    
    `;

    resultRoot.appendChild(win);

    // Event Listeners
    win.querySelector('.res-close').addEventListener('click', () => {
        win.style.animation = 'slideInRight 0.2s reverse forwards';
        setTimeout(() => win.remove(), 200);
    });
    
    win.querySelector('#res-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(content);
      const btn = win.querySelector('#res-copy');
      const original = btn.innerHTML;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
      btn.style.color = '#10B981';
      btn.style.borderColor = '#10B981';
      setTimeout(() => {
          btn.innerHTML = original;
          btn.style.color = '';
          btn.style.borderColor = '';
      }, 2000);
    });

    win.querySelector('#res-pdf').addEventListener('click', () => {
      const pdfContent = `
        <html>
          <head><title>Llama-SNAP Export</title></head>
          <body style="font-family: sans-serif; padding: 40px; line-height: 1.6;">
            <h2 style="color: #10B981;">Llama-SNAP Assistant Result</h2>
            <div style="background: #FAFAFA; padding: 20px; border-radius: 8px; border: 1px solid #EEE;">
              ${content.replace(/\n/g, '<br/>')}
            </div>
            <p style="margin-top: 20px; font-size: 12px; color: #888;">Generated by Llama-SNAP Extension</p>
          </body>
        </html>
      `;
      const blob = new Blob([pdfContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snap-result-${Date.now()}.html`;
      a.click();
    });
  }

  console.log('[SNAP] Content script loaded');

  // ═══════════════════════════════════════════════════════════════════
  // COLOR BLINDNESS FILTERS — applied to the entire webpage
  // Uses SVG <feColorMatrix> for scientifically-accurate color
  // correction similar to GitHub's accessibility theme system.
  // ═══════════════════════════════════════════════════════════════════

  const SNAP_FILTER_ID = 'snap-a11y-filter';
  const SNAP_FILTER_STYLE_ID = 'snap-a11y-filter-style';
  const SNAP_HC_STYLE_ID = 'snap-a11y-hc-style';

  /**
   * SVG color matrices for each color-vision deficiency correction.
   * These shift the color channels to bring problem colors into
   * distinguishable ranges for each deficiency type.
   *
   * Protanopia  – Red-blind: shift reds toward blue/orange
   * Deuteranopia – Green-blind: shift greens toward yellow/amber
   * Tritanopia  – Blue-yellow blind: shift blues toward teal/cyan
   */
  const COLOR_MATRICES = {
    protanopia: [
      0.567, 0.433, 0.000, 0, 0,
      0.558, 0.442, 0.000, 0, 0,
      0.000, 0.242, 0.758, 0, 0,
      0,     0,     0,     1, 0
    ].join(' '),
    deuteranopia: [
      0.625, 0.375, 0.000, 0, 0,
      0.700, 0.300, 0.000, 0, 0,
      0.000, 0.300, 0.700, 0, 0,
      0,     0,     0,     1, 0
    ].join(' '),
    tritanopia: [
      0.950, 0.050, 0.000, 0, 0,
      0.000, 0.433, 0.567, 0, 0,
      0.000, 0.475, 0.525, 0, 0,
      0,     0,     0,     1, 0
    ].join(' '),
  };

  /**
   * High-contrast mode CSS applied directly to the page
   * (no SVG filter needed — it's a CSS-based approach).
   */
  const HIGH_CONTRAST_CSS = `
    html[data-snap-a11y="high-contrast"] {
      filter: contrast(1.4) !important;
    }
    html[data-snap-a11y="high-contrast"] img,
    html[data-snap-a11y="high-contrast"] video,
    html[data-snap-a11y="high-contrast"] canvas,
    html[data-snap-a11y="high-contrast"] svg:not(#${SNAP_FILTER_ID}-svg) {
      filter: contrast(0.85) brightness(1.1) !important;
    }
    html[data-snap-a11y="high-contrast"] a {
      text-decoration: underline !important;
      text-underline-offset: 3px !important;
    }
    html[data-snap-a11y="high-contrast"] button,
    html[data-snap-a11y="high-contrast"] [role="button"],
    html[data-snap-a11y="high-contrast"] input,
    html[data-snap-a11y="high-contrast"] select,
    html[data-snap-a11y="high-contrast"] textarea {
      outline: 2px solid currentColor !important;
      outline-offset: 1px !important;
    }
  `;

  function injectSVGFilter(matrixValues) {
    removeSVGFilter(); // clean previous

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('id', SNAP_FILTER_ID + '-svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';

    const defs = document.createElementNS(svgNS, 'defs');
    const filter = document.createElementNS(svgNS, 'filter');
    filter.setAttribute('id', SNAP_FILTER_ID);
    filter.setAttribute('color-interpolation-filters', 'linearRGB');

    const matrix = document.createElementNS(svgNS, 'feColorMatrix');
    matrix.setAttribute('type', 'matrix');
    matrix.setAttribute('values', matrixValues);

    filter.appendChild(matrix);
    defs.appendChild(filter);
    svg.appendChild(defs);
    document.body.appendChild(svg);

    // Add CSS that references the SVG filter
    const style = document.createElement('style');
    style.id = SNAP_FILTER_STYLE_ID;
    style.textContent = `
      html[data-snap-a11y] {
        filter: url(#${SNAP_FILTER_ID}) !important;
      }
      /* Don't double-filter the extension overlay */
      #snap-overlay-host {
        filter: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function injectHighContrast() {
    removeHighContrast();
    const style = document.createElement('style');
    style.id = SNAP_HC_STYLE_ID;
    style.textContent = HIGH_CONTRAST_CSS;
    document.head.appendChild(style);
  }

  function removeSVGFilter() {
    const svg = document.getElementById(SNAP_FILTER_ID + '-svg');
    if (svg) svg.remove();
    const style = document.getElementById(SNAP_FILTER_STYLE_ID);
    if (style) style.remove();
  }

  function removeHighContrast() {
    const style = document.getElementById(SNAP_HC_STYLE_ID);
    if (style) style.remove();
  }

  function removeAllFilters() {
    removeSVGFilter();
    removeHighContrast();
    document.documentElement.removeAttribute('data-snap-a11y');
  }

  /**
   * Apply a color blindness mode to the current webpage.
   * @param {'default'|'protanopia'|'deuteranopia'|'tritanopia'|'high-contrast'} mode
   */
  function applyWebpageA11yTheme(mode) {
    removeAllFilters();

    if (!mode || mode === 'default') {
      console.log('[SNAP] Color filter removed (default mode)');
      return;
    }

    document.documentElement.setAttribute('data-snap-a11y', mode);

    if (mode === 'high-contrast') {
      injectHighContrast();
      console.log('[SNAP] High contrast mode applied to webpage');
      return;
    }

    const matrix = COLOR_MATRICES[mode];
    if (matrix) {
      injectSVGFilter(matrix);
      console.log(`[SNAP] ${mode} color filter applied to webpage`);
    }
  }

  // Listen for theme change messages from the extension
  // (Handled in the main onMessage listener above)

  // On load: check storage for persisted theme and apply immediately
  try {
    chrome.storage.sync.get({ snapA11yTheme: 'default' }, (result) => {
      if (result.snapA11yTheme && result.snapA11yTheme !== 'default') {
        applyWebpageA11yTheme(result.snapA11yTheme);
      }
    });
  } catch (e) {
    console.log('[SNAP] Could not read a11y theme from storage:', e);
  }

})();
} 