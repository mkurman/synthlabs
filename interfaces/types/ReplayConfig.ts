import { ApiType, AppMode, EngineMode, ExternalProvider, ProviderType } from '../enums';
import { GenerationParams } from '../config/GenerationParams';
import { DeepConfig, UserAgentConfig } from '../../types';

export interface ReplayConfig {
    appMode: AppMode;
    engineMode: EngineMode;
    provider: ProviderType;
    externalProvider: ExternalProvider;
    apiType: ApiType;
    model: string;
    externalModel: string;
    customBaseUrl: string;
    systemPrompt: string;
    converterPrompt: string;
    deepConfig: DeepConfig;
    userAgentConfig: UserAgentConfig;
    conversationRewriteMode: boolean;
    generationParams?: GenerationParams;
    sessionPromptSet?: string | null;
    isStreamingEnabled?: boolean;
}
