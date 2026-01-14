
// ChatML Message Structure for multi-turn conversations
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string; // For assistant messages, store the thinking trace
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
  answer: string;
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
}

export interface VerifierItem extends SynthLogItem {
  score: number; // 0 = unrated, 1-5 rating
  isDuplicate?: boolean;
  duplicateGroupId?: string;
  isDiscarded?: boolean;
  verifiedTimestamp?: string;
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