import { ProviderType, ExternalProvider, ApiType, DataSource, EngineMode, CreatorMode, Environment } from '../enums';
import { GenerationParams } from './GenerationParams';
import { HuggingFaceConfig, DeepConfig, UserAgentConfig } from '../../types';

export interface GenerationConfig {
  // Mode settings
  appMode: CreatorMode;
  engineMode: EngineMode;
  environment: Environment;

  // Data source
  dataSourceMode: DataSource;
  hfConfig: HuggingFaceConfig;
  converterInputText: string;
  manualFileName?: string;
  geminiTopic: string;

  // Provider settings
  provider: ProviderType;
  externalProvider: ExternalProvider;
  apiType: ApiType;
  customBaseUrl: string;
  apiKey: string;
  externalApiKey: string;
  model: string;
  externalModel: string;

  // Generation params
  rowsToFetch: number;
  skipRows: number;
  concurrency: number;
  sleepTime: number;
  maxRetries: number;
  retryDelay: number;

  // Session
  sessionUid: string;
  sessionName: string | null;
  sessionPromptSet: string | null;

  // Prompts
  systemPrompt: string;
  converterPrompt: string;

  // Deep config
  deepConfig: DeepConfig;

  // User agent config for multi-turn
  userAgentConfig: UserAgentConfig;

  // Conversation rewrite mode
  conversationRewriteMode: boolean;

  // Streaming mode toggle
  isStreamingEnabled: boolean;

  // Generation params
  generationParams?: GenerationParams;
}
