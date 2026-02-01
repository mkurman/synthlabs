
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

// ============================================================================
// Model Lists - Hardcoded and Fallback Models
// ============================================================================

import { ExternalProvider, ProviderType, ProviderModel, ModelListProvider } from './types';

/**
 * Hardcoded models for providers without API endpoint
 */
export const HARDCODED_MODELS: Partial<Record<ModelListProvider, ProviderModel[]>> = {
    [ProviderType.Gemini]: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: ExternalProvider.OpenAI },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Exp)', provider: ExternalProvider.OpenAI },
        { id: 'gemini-2.0-pro-exp', name: 'Gemini 2.0 Pro (Exp)', provider: ExternalProvider.OpenAI },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: ExternalProvider.OpenAI },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: ExternalProvider.OpenAI },
    ],
    [ExternalProvider.Anthropic]: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: ExternalProvider.Anthropic },
        { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: ExternalProvider.Anthropic },
        { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', provider: ExternalProvider.Anthropic },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', provider: ExternalProvider.Anthropic },
        { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', provider: ExternalProvider.Anthropic },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: ExternalProvider.Anthropic },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: ExternalProvider.Anthropic },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: ExternalProvider.Anthropic },
    ],
    [ExternalProvider.HuggingFace]: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', provider: ExternalProvider.HuggingFace },
        { id: 'meta-llama/Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B', provider: ExternalProvider.HuggingFace },
        { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', provider: ExternalProvider.HuggingFace },
        { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', provider: ExternalProvider.HuggingFace },
        { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B v0.3', provider: ExternalProvider.HuggingFace },
        { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', provider: ExternalProvider.HuggingFace },
        { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 7B', provider: ExternalProvider.HuggingFace },
        { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B', provider: ExternalProvider.HuggingFace },
        { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', provider: ExternalProvider.HuggingFace },
    ],
    [ExternalProvider.Kimi]: [
        { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', provider: ExternalProvider.Kimi, context_length: 8192 },
        { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', provider: ExternalProvider.Kimi, context_length: 32768 },
        { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', provider: ExternalProvider.Kimi, context_length: 131072 },
    ],
    [ExternalProvider.ZAi]: [
        { id: 'glm-4-plus', name: 'GLM-4 Plus', provider: ExternalProvider.ZAi },
        { id: 'glm-4-0520', name: 'GLM-4 0520', provider: ExternalProvider.ZAi },
        { id: 'glm-4-air', name: 'GLM-4 Air', provider: ExternalProvider.ZAi },
        { id: 'glm-4-airx', name: 'GLM-4 AirX', provider: ExternalProvider.ZAi },
        { id: 'glm-4-flash', name: 'GLM-4 Flash', provider: ExternalProvider.ZAi },
    ],
    [ExternalProvider.Qwen]: [
        { id: 'qwen-turbo', name: 'Qwen Turbo', provider: ExternalProvider.Qwen },
        { id: 'qwen-plus', name: 'Qwen Plus', provider: ExternalProvider.Qwen },
        { id: 'qwen-max', name: 'Qwen Max', provider: ExternalProvider.Qwen },
        { id: 'qwen-max-longcontext', name: 'Qwen Max Long Context', provider: ExternalProvider.Qwen },
    ],
};

/**
 * Default fallback models for providers with /models endpoint (used when API call fails)
 */
export const DEFAULT_FALLBACK_MODELS: Partial<Record<ModelListProvider, ProviderModel[]>> = {
    [ExternalProvider.OpenAI]: [
        { id: 'gpt-4o', name: 'GPT-4o', provider: ExternalProvider.OpenAI, context_length: 128000 },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: ExternalProvider.OpenAI, context_length: 128000 },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: ExternalProvider.OpenAI, context_length: 128000 },
        { id: 'gpt-4', name: 'GPT-4', provider: ExternalProvider.OpenAI, context_length: 8192 },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: ExternalProvider.OpenAI, context_length: 16385 },
        { id: 'o1', name: 'o1', provider: ExternalProvider.OpenAI, context_length: 200000 },
        { id: 'o1-mini', name: 'o1 Mini', provider: ExternalProvider.OpenAI, context_length: 128000 },
        { id: 'o1-preview', name: 'o1 Preview', provider: ExternalProvider.OpenAI, context_length: 128000 },
    ],
    [ExternalProvider.Groq]: [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: ExternalProvider.Groq, context_length: 128000 },
        { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', provider: ExternalProvider.Groq, context_length: 128000 },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', provider: ExternalProvider.Groq, context_length: 128000 },
        { id: 'llama3-70b-8192', name: 'Llama 3 70B', provider: ExternalProvider.Groq, context_length: 8192 },
        { id: 'llama3-8b-8192', name: 'Llama 3 8B', provider: ExternalProvider.Groq, context_length: 8192 },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', provider: ExternalProvider.Groq, context_length: 32768 },
        { id: 'gemma2-9b-it', name: 'Gemma 2 9B', provider: ExternalProvider.Groq, context_length: 8192 },
    ],
    [ExternalProvider.Together]: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', provider: ExternalProvider.Together, context_length: 128000 },
        { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B Turbo', provider: ExternalProvider.Together, context_length: 128000 },
        { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B Turbo', provider: ExternalProvider.Together, context_length: 128000 },
        { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B Turbo', provider: ExternalProvider.Together, context_length: 128000 },
        { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Turbo', provider: ExternalProvider.Together, context_length: 32768 },
        { id: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B', name: 'DeepSeek R1 Distill 70B', provider: ExternalProvider.Together },
        { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', provider: ExternalProvider.Together },
        { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B', provider: ExternalProvider.Together, context_length: 65536 },
    ],
    [ExternalProvider.Cerebras]: [
        { id: 'llama3.1-70b', name: 'Llama 3.1 70B', provider: ExternalProvider.Cerebras, context_length: 128000 },
        { id: 'llama3.1-8b', name: 'Llama 3.1 8B', provider: ExternalProvider.Cerebras, context_length: 128000 },
        { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', provider: ExternalProvider.Cerebras, context_length: 128000 },
    ],
    [ExternalProvider.Featherless]: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', provider: ExternalProvider.Featherless },
        { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', provider: ExternalProvider.Featherless },
        { id: 'Qwen/QwQ-32B-Preview', name: 'QwQ 32B', provider: ExternalProvider.Featherless },
        { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', name: 'DeepSeek R1 Distill 32B', provider: ExternalProvider.Featherless },
        { id: 'mistralai/Mistral-Nemo-Instruct-2407', name: 'Mistral Nemo', provider: ExternalProvider.Featherless },
    ],
    [ExternalProvider.QwenDeepInfra]: [
        { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', provider: ExternalProvider.QwenDeepInfra },
        { id: 'Qwen/QwQ-32B-Preview', name: 'QwQ 32B', provider: ExternalProvider.QwenDeepInfra },
        { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', provider: ExternalProvider.QwenDeepInfra },
        { id: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B', name: 'DeepSeek R1 Distill 70B', provider: ExternalProvider.QwenDeepInfra },
    ],
    [ExternalProvider.OpenRouter]: [
        { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: ExternalProvider.OpenRouter },
        { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', provider: ExternalProvider.OpenRouter },
        { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', provider: ExternalProvider.OpenRouter },
        { id: 'openai/gpt-4o', name: 'GPT-4o', provider: ExternalProvider.OpenRouter },
        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: ExternalProvider.OpenRouter },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: ExternalProvider.OpenRouter },
        { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: ExternalProvider.OpenRouter },
    ],
    [ExternalProvider.Ollama]: [
        { id: 'llama3.2', name: 'Llama 3.2', provider: ExternalProvider.Ollama },
        { id: 'llama3.1', name: 'Llama 3.1', provider: ExternalProvider.Ollama },
        { id: 'llama3', name: 'Llama 3', provider: ExternalProvider.Ollama },
        { id: 'mistral', name: 'Mistral', provider: ExternalProvider.Ollama },
        { id: 'mixtral', name: 'Mixtral', provider: ExternalProvider.Ollama },
        { id: 'qwen2.5', name: 'Qwen 2.5', provider: ExternalProvider.Ollama },
        { id: 'phi4', name: 'Phi-4', provider: ExternalProvider.Ollama },
        { id: 'deepseek-r1', name: 'DeepSeek R1', provider: ExternalProvider.Ollama },
    ],
    [ExternalProvider.Other]: [
        { id: 'custom-model', name: 'Custom Model', provider: ExternalProvider.Other },
    ],
};
