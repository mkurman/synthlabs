import { ApiType, CreatorMode, EngineMode, ExternalProvider, ProviderType } from '../enums';
import type { GenerationParams } from '../config/GenerationParams';
import type { DeepConfig } from '../config/DeepConfig';
import type { UserAgentConfig } from '../config/UserAgentConfig';

export interface ReplayConfig {
    appMode: CreatorMode;
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
