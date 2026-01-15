
export const PROVIDER_URLS: Record<string, string> = {
  "featherless": "https://api.featherless.ai/v1",
  "openai": "https://api.openai.com/v1",
  "anthropic": "https://api.anthropic.com/v1",
  "qwen": "https://api.qwen.com/v1",
  "qwen-deepinfra": "https://api.deepinfra.com/v1/openai",
  "kimi": "https://api.moonshot.ai/v1",
  "z.ai": "https://api.z.ai/api/paas/v4",
  "openrouter": "https://openrouter.ai/api/v1",
  "cerebras": "https://api.cerebras.ai/v1",
  "together": "https://api.together.xyz/v1",
  "groq": "https://api.groq.com/openai/v1",
  "ollama": "http://localhost:11434/v1",
  "chutes": "https://llm.chutes.ai/v1",
  "huggingface": "https://api-inference.huggingface.co/v1",
};

export const EXTERNAL_PROVIDERS = Object.keys(PROVIDER_URLS).concat(['other']);
