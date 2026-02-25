// SNAP Popup Script
function sendMessage(msg){return new Promise(r=>chrome.runtime.sendMessage(msg,res=>r(res)))}
async function getSettings(){const res=await sendMessage({type:'getSettings'});return res?.settings}
async function setSettings(patch){await sendMessage({type:'setSettings',patch});}

function withActiveTab(fn){chrome.tabs.query({active:true,currentWindow:true},tabs=>{const tab=tabs[0]; if(tab) fn(tab);});}
function canMessageTab(tab){try{const url=tab.url||'';return /^https?:/i.test(url)||/^file:/i.test(url);}catch(e){return false}}
function statusMsg(text){const el=document.getElementById('status'); if(!el) return; el.textContent=text; setTimeout(()=>{ if(el.textContent===text) el.textContent=''; },2000)}
function sendToContent(tabId,msg){try{chrome.tabs.sendMessage(tabId,msg,()=>{const err=chrome.runtime.lastError; if(err){console.warn('[SNAP] popup sendMessage error',err.message); statusMsg('Open a normal webpage tab');}})}catch(e){console.warn('[SNAP] popup sendMessage caught',e)}}

document.addEventListener('DOMContentLoaded', async ()=>{
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
    withActiveTab(tab=>{
      if(canMessageTab(tab)){
        sendToContent(tab.id,{type:'aiProxy',actionType,payload});
      } else {
        statusMsg('Actions require a webpage tab');
      }
    });
    // Also route via background for data-only responses (no DOM changes)
    sendMessage({type:'aiRequest', actionType, payload});
  }

  document.getElementById('open-overlay').addEventListener('click', ()=>{
    withActiveTab(tab=>{
      if(canMessageTab(tab)) sendToContent(tab.id,{type:'toggleOverlay'});
      else statusMsg('Open a normal webpage tab');
    });
  });
  document.getElementById('toggle-overlay').addEventListener('click', ()=>{
    withActiveTab(tab=>{
      if(canMessageTab(tab)) sendToContent(tab.id,{type:'toggleOverlay'});
      else statusMsg('Open a normal webpage tab');
    });
  });
  document.getElementById('simplify').addEventListener('click', ()=> ai('simplify'));
  document.getElementById('explain').addEventListener('click', ()=> ai('explain'));
  document.getElementById('expand').addEventListener('click', ()=> ai('expand'));
  document.getElementById('translate').addEventListener('click', ()=>{
    const lang = document.getElementById('translate-lang').value; ai('translate', {lang});
  });

  document.getElementById('read').addEventListener('click', ()=>{
    withActiveTab(tab=>{
      if(canMessageTab(tab)) sendToContent(tab.id,{ type:'tts', cmd:'start', rate:parseFloat(document.getElementById('rate').value), pitch:parseFloat(document.getElementById('pitch').value) });
      else statusMsg('Open a normal webpage tab');
    });
  });
  document.getElementById('stop').addEventListener('click', ()=>{
    withActiveTab(tab=>{
      if(canMessageTab(tab)) sendToContent(tab.id,{ type:'tts', cmd:'stop' });
      else statusMsg('Open a normal webpage tab');
    });
  });
});
