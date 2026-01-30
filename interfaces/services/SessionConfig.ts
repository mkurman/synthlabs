/**
 * Session Management Service Interfaces
 * 
 * Provides type definitions for session data, configuration, and operations.
 */

import { 
    AppMode, 
    EngineMode, 
    Environment, 
    ProviderType, 
    ExternalProvider,
    DataSource 
} from '../enums';
import { 
    HuggingFaceConfig, 
    DeepConfig, 
    UserAgentConfig,
    GenerationParams 
} from '../../types';

/**
 * Session data structure for serialization.
 * Contains all session configuration that can be saved/loaded.
 */
export interface SessionData {
    /** Session format version for migration support */
    version: number;
    /** ISO timestamp when session was created */
    createdAt: string;
    /** Unique session identifier for tracking logs */
    sessionUid: string;
    /** Session configuration */
    config: SessionConfig;
}

/**
 * Session configuration containing all user settings and parameters.
 * This is the core data structure that gets saved/loaded.
 */
export interface SessionConfig {
    /** Application mode: Generator or Converter */
    appMode: AppMode;
    /** Engine mode: Regular or Deep reasoning */
    engineMode: EngineMode;
    /** Environment: Development or Production */
    environment: Environment;
    /** Provider type: Gemini or External */
    provider: ProviderType;
    /** External provider identifier */
    externalProvider: ExternalProvider;
    /** External API key (may be empty) */
    externalApiKey: string;
    /** External model identifier */
    externalModel: string;
    /** Custom base URL for external provider */
    customBaseUrl: string;
    /** Deep mode phase configuration */
    deepConfig: DeepConfig;
    /** User agent configuration for multi-turn conversations */
    userAgentConfig: UserAgentConfig;
    /** Number of concurrent generation workers */
    concurrency: number;
    /** Number of rows to fetch from dataset */
    rowsToFetch: number;
    /** Number of rows to skip */
    skipRows: number;
    /** Sleep time between generations (ms) */
    sleepTime: number;
    /** Maximum retry attempts */
    maxRetries: number;
    /** Delay between retries (ms) */
    retryDelay: number;
    /** Number of logs per page in feed */
    feedPageSize: number;
    /** Data source mode */
    dataSourceMode: DataSource;
    /** HuggingFace dataset configuration */
    hfConfig: HuggingFaceConfig;
    /** Topic for synthetic generation */
    geminiTopic: string;
    /** Topic category for synthetic generation */
    topicCategory: string;
    /** System prompt for generator mode */
    systemPrompt: string;
    /** System prompt for converter mode */
    converterPrompt: string;
    /** Whether to use conversation rewrite mode */
    conversationRewriteMode: boolean;
    /** Converter input text (manual file content) */
    converterInputText: string;
    /** Generation parameters (temperature, etc.) */
    generationParams: GenerationParams;
}

/**
 * Configuration for starting a new session.
 */
export interface NewSessionConfig {
    /** Current data source mode */
    dataSourceMode: DataSource;
    /** HuggingFace configuration */
    hfConfig: HuggingFaceConfig;
    /** Manual file name */
    manualFileName: string | null;
    /** Current environment */
    environment: Environment;
    /** Application mode */
    appMode: AppMode;
}

/**
 * Callbacks for session operations that interact with React state.
 */
export interface SessionCallbacks {
    /** Set the session UID */
    setSessionUid: (uid: string) => void;
    /** Set the session name */
    setSessionName: (name: string | null) => void;
    /** Set visible logs */
    setVisibleLogs: (logs: any[]) => void;
    /** Set total log count */
    setTotalLogCount: (count: number) => void;
    /** Set filtered log count */
    setFilteredLogCount: (count: number) => void;
    /** Set sparkline history */
    setSparklineHistory: (history: any[]) => void;
    /** Set database stats */
    setDbStats: (stats: { total: number; session: number }) => void;
    /** Set error message */
    setError: (error: string | null) => void;
}

/**
 * Setters for restoring session configuration.
 * Each setter corresponds to a field in SessionConfig.
 */
export interface SessionSetters {
    setAppMode: (mode: AppMode) => void;
    setEngineMode: (mode: EngineMode) => void;
    setEnvironment: (env: Environment) => void;
    setProvider: (provider: ProviderType) => void;
    setExternalProvider: (provider: ExternalProvider) => void;
    setExternalApiKey: (key: string) => void;
    setExternalModel: (model: string) => void;
    setCustomBaseUrl: (url: string) => void;
    setDeepConfig: (config: DeepConfig) => void;
    setUserAgentConfig: (config: UserAgentConfig) => void;
    setConcurrency: (concurrency: number) => void;
    setRowsToFetch: (rows: number) => void;
    setSkipRows: (rows: number) => void;
    setSleepTime: (time: number) => void;
    setMaxRetries: (retries: number) => void;
    setRetryDelay: (delay: number) => void;
    setFeedPageSize: (size: number) => void;
    setDataSourceMode: (mode: DataSource) => void;
    setHfConfig: (config: HuggingFaceConfig) => void;
    setGeminiTopic: (topic: string) => void;
    setTopicCategory: (category: string) => void;
    setSystemPrompt: (prompt: string) => void;
    setConverterPrompt: (prompt: string) => void;
    setConversationRewriteMode: (enabled: boolean) => void;
    setConverterInputText: (text: string) => void;
    setGenerationParams: (params: GenerationParams) => void;
}

/**
 * Result from loading a session from cloud.
 */
export interface CloudSessionResult {
    /** Session ID */
    id: string;
    /** Session name */
    name: string;
    /** Session data */
    sessionData: SessionData;
    /** Session UID for log tracking */
    sessionUid: string;
}
