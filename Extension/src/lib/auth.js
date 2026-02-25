export function setApiKey(key) {
  return chrome.storage.local.set({ OLLAMA_API_KEY: key });
}

export async function getApiKey() {
  const data = await chrome.storage.local.get("OLLAMA_API_KEY");
  return data.OLLAMA_API_KEY || null;
}
