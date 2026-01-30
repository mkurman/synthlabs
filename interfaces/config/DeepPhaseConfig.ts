import { ProviderType, ExternalProvider, ApiType, DeepPhase } from '../enums';
import { GenerationParams } from './GenerationParams';
import { PromptSchema } from '../types/PromptSchema';

export interface DeepPhaseConfig {
  id: DeepPhase;
  enabled: boolean;
  provider: ProviderType;
  externalProvider: ExternalProvider;
  apiType?: ApiType;
  apiKey: string;
  model: string;
  customBaseUrl: string;
  promptSchema?: PromptSchema;
  structuredOutput: boolean;
  generationParams?: GenerationParams;
  systemPrompt?: string;
}
