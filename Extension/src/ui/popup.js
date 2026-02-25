// SNAP Popup Script
function sendMessage(msg){return new Promise(r=>chrome.runtime.sendMessage(msg,res=>r(res)))}
async function getSettings(){const res=await sendMessage({type:'getSettings'});return res?.settings}
async function setSettings(patch){await sendMessage({type:'setSettings',patch});}

function withActiveTab(fn){chrome.tabs.query({active:true,currentWindow:true},tabs=>{const tab=tabs[0]; if(tab?.id) fn(tab.id);});}

// Ensure content script is available on the page, then send a message
function sendToContent(tabId, msg){
  try {
    chrome.tabs.sendMessage(tabId, msg, () => {
      if (chrome.runtime.lastError) {
        // Likely the content script isn't injected yet (existing tab before install)
        chrome.scripting.executeScript({ target: { tabId }, files: ['content/content-script.js'] }, () => {
          chrome.tabs.sendMessage(tabId, msg);
        });
      }
    });
  } catch (e) {
    // Fallback attempt injection then send
    chrome.scripting.executeScript({ target: { tabId }, files: ['content/content-script.js'] }, () => {
      chrome.tabs.sendMessage(tabId, msg);
    });
  }
}

document.addEventListener('DOMContentLoaded', async ()=>{
  // Proactively ensure content script is present on the active tab
  withActiveTab(tabId=> sendToContent(tabId, { type: 'ping' }));

  const s = await getSettings();
  document.getElementById('lang').value = s.language;
  [...document.querySelectorAll('input[name=uimode]')].forEach(r=>{r.checked = (r.value === s.uiMode)});
  document.getElementById('easy').checked = s.easyRead;
  document.getElementById('dys').checked = s.dyslexiaFont;
  document.getElementById('contrast').checked = s.highContrast;
  document.getElementById('focus').checked = s.focusMode;
  document.getElementById('ruler').checked = s.readingRuler;
  document.getElementById('size').value = s.fontScale;

  document.getElementById('lang').addEventListener('change', e=> setSettings({language:e.target.value}));
  document.querySelectorAll('input[name=uimode]').forEach(el=> el.addEventListener('change', e=> setSettings({uiMode:e.target.value})));
  document.getElementById('easy').addEventListener('change', e=> setSettings({easyRead:e.target.checked}));
  document.getElementById('dys').addEventListener('change', e=> setSettings({dyslexiaFont:e.target.checked}));
  document.getElementById('contrast').addEventListener('change', e=> setSettings({highContrast:e.target.checked}));
  document.getElementById('focus').addEventListener('change', e=> setSettings({focusMode:e.target.checked}));
  document.getElementById('ruler').addEventListener('change', e=> setSettings({readingRuler:e.target.checked}));
  document.getElementById('size').addEventListener('input', e=> setSettings({fontScale:parseFloat(e.target.value)}));

  function ai(actionType, payload={}){
    withActiveTab(tabId=> sendToContent(tabId, {type:'aiProxy', actionType, payload}));
    // Also route via background so popup UI can use the result if needed later
    sendMessage({type:'aiRequest', actionType, payload});
  }

  document.getElementById('open-overlay').addEventListener('click', ()=>{
    withActiveTab(tabId=> {
      // Always re-inject latest content script before toggling overlay
      chrome.scripting.executeScript({ target: { tabId }, files: ['content/content-script.js'] }, () => {
        sendToContent(tabId, { type: 'toggleOverlay' });
      });
    });
  });
  document.getElementById('simplify').addEventListener('click', ()=> ai('simplify'));
  document.getElementById('explain').addEventListener('click', ()=> ai('explain'));
  document.getElementById('summarize').addEventListener('click', ()=> ai('summarize'));
  document.getElementById('expand').addEventListener('click', ()=> ai('expand'));
  document.getElementById('translate').addEventListener('click', ()=>{
    const lang = document.getElementById('translate-lang').value; ai('translate', {lang});
  });

  document.getElementById('read').addEventListener('click', ()=>{
    const rate = parseFloat(document.getElementById('rate').value);
    const pitch = parseFloat(document.getElementById('pitch').value);
    withActiveTab(tabId=> sendToContent(tabId, { type:'tts', cmd:'start', rate, pitch }));
  });
  document.getElementById('stop').addEventListener('click', ()=>{
    withActiveTab(tabId=> sendToContent(tabId, { type:'tts', cmd:'stop' }));
  });

  // --- Tab Switching Logic ---
  const expandBtn = document.getElementById('expand-chat-btn');
  const speakBtn = document.getElementById('speak-chat-btn');
  const popupWrap = document.getElementById('popup-wrap');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => {c.classList.remove('active'); c.style.display='none';});
      
      btn.classList.add('active');
      const tabId = `tab-${btn.dataset.tab}`;
      const content = document.getElementById(tabId);
      content.classList.add('active');
      content.style.display = 'flex'; // Changed from block to flex for correct layout

      // Toggle Chat Buttons
      if (btn.dataset.tab === 'chat') {
        expandBtn.classList.remove('hidden');
        speakBtn.classList.remove('hidden');
      } else {
        expandBtn.classList.add('hidden');
        speakBtn.classList.add('hidden');
        // Auto-collapse if switching away
        popupWrap.classList.remove('expanded');
        expandBtn.textContent = '+';
      }
    });
  });

  // Expand Logic
  expandBtn.addEventListener('click', () => {
    popupWrap.classList.toggle('expanded');
    expandBtn.textContent = popupWrap.classList.contains('expanded') ? '−' : '+';
  });

  // Speak Logic (Read last answer)
  speakBtn.addEventListener('click', () => {
      const msgs = document.querySelectorAll('.chat-msg.bot');
      if (msgs.length > 0) {
          const lastMsg = msgs[msgs.length - 1];
          speakText(lastMsg.textContent);
      }
  });

  // --- Chat Logic ---
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  const chatMic = document.getElementById('chat-mic');
  const chatHistory = document.getElementById('chat-history');

  function appendMsg(text, sender) {
    const div = document.createElement('div');
    div.className = `chat-msg ${sender}`;
    div.textContent = text;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  async function handleChat(text) {
    if (!text.trim()) return;
    appendMsg(text, 'user');
    chatInput.value = '';

    // Placeholder for loading state
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-msg bot';
    loadingDiv.textContent = '...';
    chatHistory.appendChild(loadingDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    try {
        // Here we call the Local Gateway directly via fetch since popup has network access
        // (Or route through background/content script if CORS is an issue, but usually localhost is fine)
        const res = await fetch('http://localhost:8000/v1/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                actionType: 'QA', // Generic QA action
                prompt: text,
                forceProvider: 'local'
            })
        });
        const data = await res.json();
        chatHistory.removeChild(loadingDiv);
        
        if (data.ok) {
            appendMsg(data.output, 'bot');
            // Auto-speak disabled per user request
            // speakText(data.output);
        } else {
            appendMsg(`Error: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (e) {
        chatHistory.removeChild(loadingDiv);
        appendMsg(`Connection Failed. Is Gateway running?`, 'error');
    }
  }
  
  chatSend.addEventListener('click', () => handleChat(chatInput.value));
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChat(chatInput.value);
  });

  // --- Voice Command Logic (STT) ---
  if ('webkitSpeechRecognition' in window) {
      const recognition = new webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US'; // Default to English, can be made dynamic

      recognition.onstart = function() {
          chatMic.classList.add('listening');
      };
      
      recognition.onend = function() {
          chatMic.classList.remove('listening');
      };

      recognition.onresult = function(event) {
          const transcript = event.results[0][0].transcript;
          chatInput.value = transcript;
          setTimeout(() => handleChat(transcript), 500); // Auto-send after 0.5s
      };

      chatMic.addEventListener('click', () => {
          recognition.start();
      });
  } else {
      chatMic.style.display = 'none'; // Hide if browser doesn't support
      console.log("Web Speech API not supported.");
  }

  function speakText(text) {
      // Use browser built-in TTS
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.0; 
      window.speechSynthesis.speak(u);
  }

});
