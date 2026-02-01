import { ProviderType, ExternalProvider, ApiType, ResponderPhase } from '../enums';
import { GenerationParams } from './GenerationParams';
import { PromptSchema } from '../types/PromptSchema';

export interface UserAgentConfig {
  enabled: boolean;
  followUpCount: number;
  responderPhase: ResponderPhase;
  provider: ProviderType;
  externalProvider: ExternalProvider;
  apiType?: ApiType;
  apiKey: string;
  model: string;
  customBaseUrl: string;
  systemPrompt?: string;
  promptSchema?: PromptSchema;
  structuredOutput: boolean;
  generationParams?: GenerationParams;
}
