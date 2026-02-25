function sendMessage(msg){return new Promise(r=>chrome.runtime.sendMessage(msg,res=>r(res)))}
async function getSettings(){const res=await sendMessage({type:'getSettings'});return res?.settings}
async function setSettings(patch){const res=await sendMessage({type:'setSettings',patch});return res?.settings}

document.addEventListener('DOMContentLoaded', async ()=>{
  const s = await getSettings();
  const provider = document.getElementById('provider');
  const apiKey = document.getElementById('apiKey');
  const model = document.getElementById('model');
  const maxTokens = document.getElementById('maxTokens');
  const privacy = document.getElementById('privacy');
  const status = document.getElementById('status');

  provider.value = s.aiProvider;
  apiKey.value = s.geminiApiKey || '';
  model.value = s.geminiModel || 'gemini-1.5-flash';
  maxTokens.value = s.maxTokens || 512;
  privacy.checked = !!s.privacyOnlySelectedText;

  document.getElementById('save').addEventListener('click', async ()=>{
    await setSettings({
      aiProvider: provider.value,
      geminiApiKey: apiKey.value,
      geminiModel: model.value,
      maxTokens: parseInt(maxTokens.value, 10),
      privacyOnlySelectedText: privacy.checked
    });
    status.textContent = 'Saved';
    setTimeout(()=> status.textContent='', 1500);
  });
});
