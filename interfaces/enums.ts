export enum LogItemStatus {
  NEW = 'NEW',
  IN_PROGRESS = 'IN_PROGRESS',
  STREAMING = 'STREAMING',
  DONE = 'DONE',
  TIMEOUT = 'TIMEOUT',
  ERROR = 'ERROR'
}

export enum DataSource {
  HuggingFace = 'huggingface',
  Manual = 'manual',
  Synthetic = 'synthetic'
}

export enum AppMode {
  Generator = 'generator',
  Converter = 'converter'
}

export enum EngineMode {
  Regular = 'regular',
  Deep = 'deep'
}

export enum Environment {
  Development = 'development',
  Production = 'production'
}

export enum ProviderType {
  Gemini = 'gemini',
  External = 'external'
}

export enum ApiType {
  Chat = 'chat',
  Responses = 'responses'
}

export enum ExternalProvider {
  Featherless = 'featherless',
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  Qwen = 'qwen',
  QwenDeepInfra = 'qwen-deepinfra',
  Kimi = 'kimi',
  ZAi = 'z.ai',
  OpenRouter = 'openrouter',
  Cerebras = 'cerebras',
  Together = 'together',
  Groq = 'groq',
  Ollama = 'ollama',
  Chutes = 'chutes',
  HuggingFace = 'huggingface',
  Other = 'other'
}

// New enums for string literal types found in App.tsx
export { AppView } from './enums/AppView';
export { ViewMode } from './enums/ViewMode';
export { OllamaStatus } from './enums/OllamaStatus';
export { LogFilter } from './enums/LogFilter';
export { DeepPhase } from './enums/DeepPhase';
export { ResponderPhase } from './enums/ResponderPhase';
export { ChatRole } from './enums/ChatRole';

// Prompt-related enums
export { PromptCategory } from './enums/PromptCategory';
export { PromptRole } from './enums/PromptRole';

// Settings panel enums
export { SettingsPanelTab } from './enums/SettingsPanelTab';
export { ApiSubTab } from './enums/ApiSubTab';

// Theme and classification enums
export { ThemeMode } from './enums/ThemeMode';
export { ClassificationMethod } from './enums/ClassificationMethod';
