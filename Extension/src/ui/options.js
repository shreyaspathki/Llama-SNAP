function sendMessage(msg){return new Promise(r=>chrome.runtime.sendMessage(msg,res=>r(res)))}
async function getSettings(){const res=await sendMessage({type:'getSettings'});return res?.settings}
async function setSettings(patch){const res=await sendMessage({type:'setSettings',patch});return res?.settings}

document.addEventListener('DOMContentLoaded', async ()=>{
  const s = await getSettings();
  const provider = document.getElementById('provider');
  
  const gatewayUrl = document.getElementById('gatewayUrl');
  const forceStrategy = document.getElementById('forceStrategy');
  const ollamaModel = document.getElementById('ollamaModel');

  const maxTokens = document.getElementById('maxTokens');
  const privacy = document.getElementById('privacy');
  const status = document.getElementById('status');

  // Load defaults suitable for our new Local Llama setup
  provider.value = s.aiProvider || 'gateway';
  gatewayUrl.value = s.gatewayUrl || 'http://localhost:8000/v1/generate';
  forceStrategy.value = s.forceStrategy || 'local';
  
  ollamaModel.value = s.ollamaModel || 'llama3.2:3b';
  maxTokens.value = s.maxTokens || 512;
  privacy.checked = !!s.privacyOnlySelectedText;

  // Visibility toggles
  function updateVisibility() {
    const v = provider.value;
    document.getElementById('gateway-opts').style.display = (v === 'gateway' || v === 'groq_only' ? 'block' : 'none');
    document.getElementById('ollama-opts').style.display = (v === 'ollama' ? 'block' : 'none');
  }
  provider.addEventListener('change', updateVisibility);
  updateVisibility();

  document.getElementById('save').addEventListener('click', async ()=>{
    const saved = await setSettings({
      aiProvider: provider.value,
      gatewayUrl: gatewayUrl.value.trim() || 'http://localhost:8000/v1/generate',
      forceStrategy: forceStrategy.value,
      ollamaModel: ollamaModel.value.trim() || 'llama3.2:3b',
      maxTokens: parseInt(maxTokens.value, 10),
      privacyOnlySelectedText: privacy.checked
    });
    
    // Refresh UI
    provider.value = saved.aiProvider;
    status.textContent = 'Saved!';
    setTimeout(()=> status.textContent='', 1500);
  });
});
