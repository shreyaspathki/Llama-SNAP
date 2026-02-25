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

    // Inject Styles & HTML - Zinc Theme
    toolbarEl.innerHTML = `
    <style>
      :host { all: initial; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
      * { box-sizing: border-box; }
      
      .wrapper {
        width: 320px;
        background: #FAFAFA; /* Zinc-50 */
        border: 1px solid #E4E4E7; /* Zinc-200 */
        border-radius: 16px;
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 4px 10px -3px rgba(0, 0, 0, 0.05);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: height 0.3s cubic-bezier(0.16, 1, 0.3, 1), width 0.3s ease, opacity 0.2s;
        animation: scaleIn 0.2s ease-out;
      }

      @keyframes scaleIn {
        from { transform: scale(0.95); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }

      /* Header */
      .header {
        height: 44px;
        padding: 0 16px;
        background: #FFFFFF;
        border-bottom: 1px solid #F4F4F5;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: grab;
        user-select: none;
      }
      .header:active { cursor: grabbing; }

      .brand {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 13px;
        color: #18181B;
      }
      .logo-box {
        width: 24px;
        height: 24px;
        background: #10B981;
        border-radius: 6px;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 14px;
      }

      .controls { display: flex; gap: 4px; }
      /* Cards */
      .card {
        background: #FFFFFF;
        border: 1px solid #E4E4E7;
        border-radius: 12px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }

      .card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }
      .card-icon {
        width: 24px;
        height: 24px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .bg-emerald { background: #ECFDF5; color: #059669; }
      .bg-blue { background: #EFF6FF; color: #2563EB; }

      .card-title {
        font-size: 12px;
        font-weight: 700;
        color: #18181B;
        line-height: 1;
      }
      .card-desc {
         font-size: 9px;
         font-weight: 500;
         color: #A1A1AA;
         margin-top: 2px;
      }

      /* Big Action Button */
      .big-btn {
        width: 100%;
        height: 48px;
        background: linear-gradient(135deg, #10B981, #0D9488);
        border: none;
        border-radius: 10px;
        padding: 0 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: transform 0.1s;
      }
      .big-btn:active { transform: scale(0.98); }
      .big-btn-icon {
        width: 28px;
        height: 28px;
        background: rgba(255,255,255,0.2);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
      }
      .big-btn-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        color: white;
      }
      .big-label { font-size: 12px; font-weight: 700; }
      .big-sub { font-size: 9px; opacity: 0.9; }

      /* Grid Buttons */
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      
      .tool-btn {
        background: #FAFAFA;
        border: 1px solid #F4F4F5;
        border-radius: 10px;
        padding: 10px;
        text-align: left;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .tool-btn:hover { background: #FFFFFF; border-color: #A7F3D0; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.1); }
      
      .tool-icon {
        width: 24px;
        height: 24px;
        background: #FFFFFF;
        border: 1px solid #E4E4E7;
        border-radius: 6px;
        display: flex; 
        align-items: center; 
        justify-content: center;
        color: #52525B;
      }
      .tool-btn:hover .tool-icon { color: #059669; border-color: #D1FAE5; }

      .tool-label { font-size: 11px; font-weight: 700; color: #27272A; }
      .tool-desc { font-size: 9px; color: #A1A1AA; }

      /* Translation Row */
      .trans-row { display: flex; gap: 6px; }
      .select-wrap {
        flex: 1;
        position: relative;
      }
      .lang-select {
        width: 100%;
        height: 36px;
        padding: 0 8px;
        border: 1px solid #E4E4E7;
        border-radius: 8px;
        background: #FAFAFA;
        font-size: 11px;
        font-weight: 500;
        color: #18181B;
        appearance: none;
        cursor: pointer;
      }
      .trans-btn {
        padding: 0 12px;
        height: 36px;
        background: #18181B;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .trans-btn:hover { background: #27272A; }

      .separator {
        height: 1px;
        background: #F4F4F5;
        margin: 8px 0;
      }

    </style>

    <div class="wrapper">
      <div class="header" id="drag-handle">
        <div class="brand">
          <div class="logo-box">S</div>
          <span class="title">SNAP Assistant</span>
        </div>
        <div class="controls">
          <button class="icon-btn" id="btn-minimize" title="Minimize to Bubble">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <button class="icon-btn close" id="btn-close" title="Close Overlay">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      <div class="content">
        
        <!-- Content Intelligence Card -->
        <div class="card">
          <div class="card-header">
            <div class="card-icon bg-emerald">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"></path></svg>
            </div>
            <div>
               <div class="card-title">Content Intelligence</div>
               <div class="card-desc">Simplify & understand content</div>
            </div>
          </div>

          <button class="big-btn" id="btn-simplify">
             <div class="big-btn-icon">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"></path></svg>
             </div>
             <div class="big-btn-text">
               <span class="big-label">Simplify Selection</span>
               <span class="big-sub">Rewrite complex text simply</span>
             </div>
          </button>

          <div class="grid-2">
            <button class="tool-btn" id="btn-explain">
              <div class="tool-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></div>
              <div>
                <span class="tool-label">Explain</span>
                <span class="tool-desc">Detailed analysis</span>
              </div>
            </button>
            <button class="tool-btn" id="btn-expand">
              <div class="tool-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg></div>
              <div>
                <span class="tool-label">Expand</span>
                <span class="tool-desc">Add context</span>
              </div>
            </button>
          </div>
        </div>

        <!-- Translation Card -->
        <div class="card">
          <div class="card-header">
            <div class="card-icon bg-blue">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6"></path><path d="M4 14h16"></path><path d="M2 5h20"></path><path d="M22 22l-5-10-5 10"></path><path d="M14 18h6"></path></svg>
            </div>
            <div>
               <div class="card-title">Rapid Translation</div>
               <div class="card-desc">Instant text localization</div>
            </div>
          </div>
          
          <div class="trans-row">
            <div class="select-wrap">
              <select class="lang-select" id="lang-select">
                <option value="hi">Hindi (हिंदी)</option>
                <option value="kn">Kannada (ಕನ್ನಡ)</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </div>
            <button class="trans-btn" id="btn-translate">
              Translate
            </button>
          </div>
        </div>

        <div class="separator"></div>

        <!-- Legacy Sections (Visuals/Annotate) kept as simple lists for now -->
        <div>
          <div class="section-label">Reading & Access</div>
          <div class="grid-2">
            <button class="action-btn" id="btn-read">Read Aloud</button>
            <button class="action-btn" id="btn-stop">Stop</button>
          </div>
          <div class="toggle-row" style="margin-top: 8px;">
            <label class="chip-toggle"><input type="checkbox" id="tog-easy">Easy Read</label>
            <label class="chip-toggle"><input type="checkbox" id="tog-dys">Dyslexia</label>
            <label class="chip-toggle"><input type="checkbox" id="tog-contrast">Contrast</label>
            <label class="chip-toggle"><input type="checkbox" id="tog-focus">Focus</label>
          </div>
        </div>
      </div>
    </div>

    <!-- Minimized Button (Docked State) -->
    <div class="minimized-btn" id="minimized-handle" title="Expand SNAP">
      S
    </div>
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
    const w = overlayState.minimized ? 60 : 320;
    const h = overlayState.minimized ? 60 : 600;
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

    // Action Buttons
    ['simplify', 'explain', 'summarize', 'expand', 'translate'].forEach(action => {
      // Find the button (handling potential nulls)
      const btn = q('#btn-' + action);
      if (!btn) return;

      btn.addEventListener('click', async () => {
        let text = window.getSelection().toString().trim();
        const lang = q('#lang-select')?.value || 'hi';

        // Fallback to full page text if no selection
        if (!text) {
           if (confirm("No text selected. Do you want to process the entire page?")) {
               text = document.body.innerText.trim();
               if (text.length > 15000) {
                  // Truncate to avoid context limit issues
                  text = text.substring(0, 15000) + "... [Truncated]";
               }
           } else {
               return; // User cancelled
           }
        }

        if (!text) { alert('Page is empty.'); return; }

        // Visual Feedback
        const btn = q('#btn-' + action);
        btn.style.opacity = '0.5';
        btn.style.cursor = 'wait';

        try {
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
        } finally {
          btn.style.opacity = '';
          btn.style.cursor = '';
        }
      });
    });

    // Toggles
    const toggles = [
      { id: 'tog-easy', key: 'easyRead' },
      { id: 'tog-dys', key: 'dyslexiaFont' },
      { id: 'tog-contrast', key: 'highContrast' },
      { id: 'tog-focus', key: 'focusMode' },
      { id: 'tog-ruler', key: 'readingRuler' },
    ];

    toggles.forEach(t => {
      q('#' + t.id)?.addEventListener('change', (e) => {
        const val = e.target.checked;
        sendMessage({ type: 'setSettings', patch: { [t.key]: val } });
        applyAccessibility({ [t.key]: val });
      });
    });
  }

  function syncOverlayControls(settings) {
    const q = (sel) => overlayRoot.querySelector(sel);
    if (q('#tog-easy')) q('#tog-easy').checked = !!settings.easyRead;
    if (q('#tog-dys')) q('#tog-dys').checked = !!settings.dyslexiaFont;
    if (q('#tog-contrast')) q('#tog-contrast').checked = !!settings.highContrast;
    if (q('#tog-focus')) q('#tog-focus').checked = !!settings.focusMode;
    if (q('#tog-ruler')) q('#tog-ruler').checked = !!settings.readingRuler;
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
    if (msg.type === 'aiProxy') {
       // From Popup -> trigger action in content script context
       const { actionType, payload } = msg;
       handleContentAction(actionType, payload);
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
          <head><title>SNAP Export</title></head>
          <body style="font-family: sans-serif; padding: 40px; line-height: 1.6;">
            <h2 style="color: #10B981;">SNAP Assistant Result</h2>
            <div style="background: #FAFAFA; padding: 20px; border-radius: 8px; border: 1px solid #EEE;">
              ${content.replace(/\n/g, '<br/>')}
            </div>
            <p style="margin-top: 20px; font-size: 12px; color: #888;">Generated by SNAP Extension</p>
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

})();
} 