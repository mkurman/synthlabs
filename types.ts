
// ChatML Message Structure for multi-turn conversations
// ChatML Message Structure for multi-turn conversations
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'model' | 'tool'; // Added model/tool for agentic chat
  content: string;
  reasoning?: string; // For assistant messages, store the thinking trace
  toolCalls?: any[]; // For tool usage history
  toolCallId?: string; // For tool results
}

export interface SynthLogItem {
  id: string;
  sessionUid?: string; // New: track which session generated this
  sessionName?: string; // New: human readable session name
  source?: string; // Data source: HuggingFace dataset name, 'manual', 'synthetic', etc.
  seed_preview: string;
  full_seed: string;
  query: string;
  reasoning: string;
  original_reasoning?: string;
  answer: string;
  original_answer?: string;
  timestamp: string;
  duration?: number; // New: generation time in ms
  tokenCount?: number; // New: estimated output tokens
  modelUsed: string;
  isError?: boolean;
  error?: string;
  provider?: string;
  // Multi-turn conversation support
  messages?: ChatMessage[]; // ChatML conversation history
  isMultiTurn?: boolean;    // Flag for UI rendering
  deepMetadata?: {
    meta: string;
    retrieval: string;
    derivation: string;
    writer: string;
    rewriter?: string;
  };
  deepTrace?: Record<string, {
    model: string;
    input: string;
    output: any;
    timestamp: string;
    duration: number;
  }>;
  storageError?: string;
  savedToDb?: boolean; // Track if this item has been synced to Firebase
  // Verifier fields (optional in base log, required in VerifierItem)
  score?: number;
  isDuplicate?: boolean;
  duplicateGroupId?: string;
  isDiscarded?: boolean;
  verifiedTimestamp?: string;
}

export interface VerifierItem extends SynthLogItem {
  score: number; // 0 = unrated, 1-5 rating
  isDuplicate?: boolean;
  duplicateGroupId?: string;
  isDiscarded?: boolean;
  verifiedTimestamp?: string;
  _doc?: any; // Firestore QueryDocumentSnapshot for cursor-based pagination
  hasUnsavedChanges?: boolean; // UI-only flag
}

export type ProviderType = 'gemini' | 'external';
export type EngineMode = 'regular' | 'deep';

export type ExternalProvider =
  | 'featherless'
  | 'openai'
  | 'anthropic'
  | 'qwen'
  | 'qwen-deepinfra'
  | 'kimi'
  | 'z.ai'
  | 'openrouter'
  | 'cerebras'
  | 'together'
  | 'groq'
  | 'ollama'
  | 'chutes'
  | 'huggingface'
  | 'other';

export type AppMode = 'generator' | 'converter';

export interface GenerationParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

export interface GenerationConfig {
  provider: ProviderType;
  externalProvider?: ExternalProvider;
  customBaseUrl?: string; // For 'other' provider
  apiKey: string;
  model: string;
  concurrency: number;
  rowsToFetch: number;
  skipRows: number;
  // Rate Limiting & Retries
  sleepTime: number; // ms to wait between requests
  maxRetries: number;
  retryDelay: number; // ms base delay for retries
  // UI Config
  feedPageSize: number;
  // Generation Params
  generationParams?: GenerationParams;
}

export interface DeepPhaseConfig {
  id: 'meta' | 'retrieval' | 'derivation' | 'writer' | 'rewriter';
  enabled: boolean;
  provider: ProviderType;
  externalProvider: ExternalProvider;
  apiKey: string;
  model: string;
  customBaseUrl: string;
  systemPrompt: string;
  structuredOutput: boolean;
  generationParams?: GenerationParams;
}

export interface DeepConfig {
  phases: {
    meta: DeepPhaseConfig;
    retrieval: DeepPhaseConfig;
    derivation: DeepPhaseConfig;
    writer: DeepPhaseConfig;
    rewriter: DeepPhaseConfig;
  };
}

// User Agent Configuration for multi-turn conversations
export interface UserAgentConfig {
  enabled: boolean;
  followUpCount: number;           // How many follow-up questions to generate (1-10)
  responderPhase: 'writer' | 'rewriter' | 'responder'; // Which agent responds after User Agent
  provider: ProviderType;
  externalProvider: ExternalProvider;
  apiKey: string;
  model: string;
  customBaseUrl: string;
  systemPrompt: string;
  structuredOutput: boolean;
  generationParams?: GenerationParams;
}

export interface StepModelConfig {
  provider: 'gemini' | 'external' | 'other';
  externalProvider: string;
  model: string;
}

export interface AutoscoreConfig {
  provider: ProviderType;
  externalProvider: ExternalProvider;
  apiKey: string;
  model: string;
  customBaseUrl: string;
  systemPrompt: string;
  concurrency: number;
  sleepTime: number;
  maxRetries: number;
  retryDelay: number;
}

export interface HuggingFaceConfig {
  dataset: string;
  config: string;
  split: string;
  columnName?: string;       // DEPRECATED: kept for backward compatibility
  inputColumns?: string[];   // Columns to combine for input (question)
  outputColumns?: string[];  // Columns to combine for output (answer)
  reasoningColumns?: string[]; // Columns to combine for reasoning (optional)
  mcqColumn?: string;        // Optional column containing MCQ options (dict or list)
  messageTurnIndex?: number; // If the target is a list/chat, which index to pick
  maxMultiTurnTraces?: number; // Max number of multi-turn traces to process (empty = all)
}

export interface DetectedColumns {
  input: string[];   // Auto-detected input columns
  output: string[];  // Auto-detected output columns
  reasoning: string[]; // Auto-detected reasoning columns
  all: string[];     // All available columns
}

export interface ProgressStats {
  current: number;
  total: number;
  activeWorkers: number;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Streaming callback for real-time generation updates
export type StreamPhase = 'writer' | 'rewriter' | 'user_followup' | 'regular';

export interface UsageData {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
}

export type StreamChunkCallback = (
  chunk: string,
  accumulated: string,
  phase?: StreamPhase,
  usage?: UsageData
) => void;

// Progressive conversation streaming state
export type StreamingConversationPhase =
  | 'idle'
  | 'waiting_for_response'  // Spinner while waiting for first content  
  | 'extracting_reasoning'  // Streaming reasoning field from JSON
  | 'extracting_answer'     // Streaming answer field from JSON
  | 'message_complete';     // Current message done, ready for next

export interface StreamingConversationState {
  id: string;
  phase: StreamingConversationPhase;
  currentMessageIndex: number;
  totalMessages: number;
  // Completed messages with full content
  completedMessages: ChatMessage[];
  // Current message being processed
  currentUserMessage?: string;
  currentReasoning: string;
  currentAnswer: string;
  // Config
  useOriginalAnswer: boolean;
  originalAnswer?: string;
  // Raw accumulated JSON for parsing
  rawAccumulated: string;
  // Flag to indicate single-prompt mode (not multi-turn conversation)
  isSinglePrompt?: boolean;
}

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

// Electron API types for renderer process
export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  platform: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}