import type { StreamingPhase } from './interfaces/enums/StreamingPhase';
import type { CreatorMode, EngineMode } from './interfaces/enums';

// Enums
export { LogItemStatus } from './interfaces/enums';
export { DataSource } from './interfaces/enums';
export { CreatorMode as AppMode } from './interfaces/enums';
export { EngineMode } from './interfaces/enums';
export { Environment } from './interfaces/enums';
export { ProviderType } from './interfaces/enums';
export { ApiType } from './interfaces/enums';
export { ExternalProvider } from './interfaces/enums';

// New Enums
export { AppView } from './interfaces/enums';
export { ViewMode } from './interfaces/enums';
export { OllamaStatus } from './interfaces/enums';
export { LogFilter } from './interfaces/enums';
export { DeepPhase } from './interfaces/enums';
export { ResponderPhase } from './interfaces/enums';
export { ChatRole } from './interfaces/enums';

// Models
export type { ChatMessage, ChatUsageSummary } from './interfaces/models/ChatMessage';
export type { SynthLogItem } from './interfaces/models/SynthLogItem';
export type { VerifierItem } from './interfaces/models/VerifierItem';
export type { ProviderModel } from './interfaces/models/ProviderModel';
export type { CachedModelList } from './interfaces/models/CachedModelList';

// Config
export type { GenerationParams } from './interfaces/config/GenerationParams';
export type { GenerationConfig } from './interfaces/config/GenerationConfig';
export type { DeepPhaseConfig } from './interfaces/config/DeepPhaseConfig';
export type { DeepConfig } from './interfaces/config/DeepConfig';
export type { UserAgentConfig } from './interfaces/config/UserAgentConfig';

// Types
export type { OutputField, PromptSchema, ParsedSchemaOutput } from './interfaces/types/PromptSchema';
export type { ReplayConfig } from './interfaces/types/ReplayConfig';

// Re-export enums for use in type definitions
import { ExternalProvider, ProviderType } from './interfaces/enums';

// ModelListProvider type (union of ExternalProvider and ProviderType.Gemini)
export type ModelListProvider = ExternalProvider | ProviderType.Gemini;

// Generation Service Interfaces
export type { GenerationConfig as GenerationServiceConfig } from './interfaces/config/GenerationConfig';
export type { GenerationCallbacks } from './interfaces/callbacks/GenerationCallbacks';
export type { GenerationRefs } from './interfaces/refs/GenerationRefs';
export type { GenerationFunctions } from './interfaces/functions/GenerationFunctions';
export type { RuntimePromptConfig } from './interfaces/types/RuntimePromptConfig';
export type { WorkItem } from './interfaces/types/WorkItem';

// Constants
export const CATEGORIES = [
  "Random (Any)",
  "Medicine & Health",
  "Law & Legal Studies",
  "Computer Science",
  "World History",
  "Quantum Physics",
  "Philosophy & Ethics",
  "Economics & Finance",
  "Literature & Arts",
  "Environmental Science",
  "Psychology & Neuroscience"
];

// Default configs
export interface HuggingFacePrefetchConfig {
  prefetchBatches: number;
  prefetchThreshold: number;
}

export const DEFAULT_HF_PREFETCH_CONFIG: HuggingFacePrefetchConfig = {
  prefetchBatches: 10,
  prefetchThreshold: 0.3
};

export interface HuggingFaceConfig {
  dataset: string;
  config: string;
  split: string;
  columnName?: string;
  inputColumns?: string[];
  outputColumns?: string[];
  reasoningColumns?: string[];
  mcqColumn?: string;
  messageTurnIndex?: number;
  maxMultiTurnTraces?: number;
  prefetchConfig?: HuggingFacePrefetchConfig;
}

export interface DetectedColumns {
  input: string[];
  output: string[];
  reasoning: string[];
  all: string[];
}

export interface ProgressStats {
  current: number;
  total: number;
  activeWorkers: number;
}

export interface SessionListFilters {
  search: string;
  onlyWithLogs: boolean;
  minRows: number | null;
  maxRows: number | null;
  appMode: CreatorMode | null;
  engineMode: EngineMode | null;
  model: string;
}

export type StreamPhase = 'writer' | 'rewriter' | 'user_followup' | 'regular';

export interface UsageData {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  reasoning_tokens?: number;
  cost: number;
}

export type StreamChunkCallback = (
  chunk: string,
  accumulated: string,
  phase?: StreamPhase,
  usage?: UsageData
) => void | false;

export type StreamingConversationPhase = StreamingPhase;

export interface StreamingConversationState {
  id: string;
  phase: StreamingConversationPhase;
  currentMessageIndex: number;
  totalMessages: number;
  completedMessages: import('./interfaces/models/ChatMessage').ChatMessage[];
  currentUserMessage?: string;
  currentReasoning: string;
  currentAnswer: string;
  useOriginalAnswer: boolean;
  originalAnswer?: string;
  rawAccumulated: string;
  isSinglePrompt?: boolean;
}

export interface StepModelConfig {
  provider: import('./interfaces/enums').ProviderType;
  externalProvider: string;
  apiType?: import('./interfaces/enums').ApiType;
  model: string;
  generationParams?: import('./interfaces/config/GenerationParams').GenerationParams;
}

export interface AutoscoreConfig {
  provider: import('./interfaces/enums').ProviderType;
  externalProvider: import('./interfaces/enums').ExternalProvider;
  apiType?: import('./interfaces/enums').ApiType;
  apiKey: string;
  model: string;
  customBaseUrl: string;
  promptSchema?: import('./interfaces/types/PromptSchema').PromptSchema;
  concurrency: number;
  sleepTime: number;
  maxRetries: number;
  retryDelay: number;
  generationParams?: import('./interfaces/config/GenerationParams').GenerationParams;
}

export interface AutoscoreToolParams {
  indices?: number[];
  scores?: number[];
}

export interface AutoscoreToolResult {
  scored: number;
  skipped: number;
  errors: number;
}

export interface SessionListToolParams {
  minRows?: number;
  maxRows?: number;
  limit?: number;
}

export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  openNewWindow: () => Promise<void>;
  saveFirebaseCredentials: (jsonContent: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  getFirebaseStatus: () => Promise<{ configured: boolean; path: string | null }>;
  getBackendPort: () => Promise<number | null>;
  platform: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export interface PaginatedItems<T> {
  items: T[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  hasMore: boolean;
}
