
// ============================================================================
// Provider Configuration - Single Source of Truth
// ============================================================================

/**
 * Complete provider configuration including URL, display name, and description.
 * This is the single source of truth for all provider information.
 */
export interface ProviderConfig {
  /** Base API URL for the provider */
  url: string;
  /** Display name for the provider */
  name: string;
  /** Description of the provider */
  description: string;
}

/**
 * All provider configurations in one place.
 * Add new providers here and they will be available throughout the app.
 */
export const PROVIDERS: Record<string, ProviderConfig> = {
  'featherless': {
    url: 'https://api.featherless.ai/v1',
    name: 'Featherless',
    description: 'Serverless inference'
  },
  'openai': {
    url: 'https://api.openai.com/v1',
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5, etc.'
  },
  'anthropic': {
    url: 'https://api.anthropic.com/v1',
    name: 'Anthropic',
    description: 'Claude models'
  },
  'qwen': {
    url: 'https://api.qwen.com/v1',
    name: 'Qwen',
    description: 'Alibaba Qwen models'
  },
  'qwen-deepinfra': {
    url: 'https://api.deepinfra.com/v1/openai',
    name: 'Qwen (DeepInfra)',
    description: 'Qwen via DeepInfra'
  },
  'kimi': {
    url: 'https://api.moonshot.ai/v1',
    name: 'Kimi (Moonshot)',
    description: 'Moonshot AI'
  },
  'z.ai': {
    url: 'https://api.z.ai/api/paas/v4',
    name: 'Z.AI',
    description: 'Z.AI platform'
  },
  'openrouter': {
    url: 'https://openrouter.ai/api/v1',
    name: 'OpenRouter',
    description: 'Multi-model router'
  },
  'cerebras': {
    url: 'https://api.cerebras.ai/v1',
    name: 'Cerebras',
    description: 'High-performance AI'
  },
  'together': {
    url: 'https://api.together.xyz/v1',
    name: 'Together AI',
    description: 'Open-source models'
  },
  'groq': {
    url: 'https://api.groq.com/openai/v1',
    name: 'Groq',
    description: 'Ultra-fast inference'
  },
  'ollama': {
    url: 'http://localhost:11434/v1',
    name: 'Ollama',
    description: 'Local models (no key needed)'
  },
  'chutes': {
    url: 'https://llm.chutes.ai/v1',
    name: 'Chutes',
    description: 'Chutes LLM API'
  },
  'huggingface': {
    url: 'https://api-inference.huggingface.co/v1',
    name: 'HuggingFace Inference',
    description: 'HF Inference API'
  },
  'other': {
    url: '',
    name: 'Custom Endpoint',
    description: 'Your own OpenAI-compatible API'
  },
};

/** @deprecated Use PROVIDERS[provider].url instead */
export const PROVIDER_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(PROVIDERS).map(([k, v]) => [k, v.url])
);

/** @deprecated Use PROVIDERS[provider] instead */
export const PROVIDER_INFO: Record<string, Pick<ProviderConfig, 'name' | 'description'>> = Object.fromEntries(
  Object.entries(PROVIDERS).map(([k, v]) => [k, { name: v.name, description: v.description }])
);

/** List of all external provider IDs (excluding 'other' which is custom) */
export const EXTERNAL_PROVIDERS = Object.keys(PROVIDERS);

// ============================================================================
// Prompt Output Constants
// ============================================================================

/**
 * Prefix for JSON schema output instruction.
 * Appended to system prompts when structured output is enabled.
 */
export const JSON_SCHEMA_INSTRUCTION_PREFIX = 'Output valid JSON matching this schema:';

/**
 * Fallback JSON instruction when no schema is available.
 */
export const JSON_OUTPUT_FALLBACK = 'Output valid JSON only.';
