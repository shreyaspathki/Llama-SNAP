export async function callOllama({ prompt, model }) {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,

      system: `
You are a stateless language model.
Ignore all prior conversations and context.
Follow ONLY the instructions in the user prompt.
Do not assume the task type.
`.trim(),


      prompt,

      options: {
        temperature: 0.0,
        num_ctx: 2048,
        num_predict: 256
      }
    })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama ${res.status}: ${t}`);
  }

  const data = await res.json();
  return data.response;
}


export async function callGateway({ url, actionType, prompt, forceProvider, modelOverride, targetLanguage }) {
  const bodyData = { actionType, prompt };
  if (forceProvider) bodyData.forceProvider = forceProvider;
  if (modelOverride) bodyData.modelOverride = modelOverride;
  if (targetLanguage) bodyData.targetLanguage = targetLanguage;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyData)
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gateway ${res.status}: ${t}`);
  }

  const data = await res.json();
  if (!data?.ok) {
    throw new Error(data?.error || "Gateway returned ok=false");
  }
  return data.output;
}
