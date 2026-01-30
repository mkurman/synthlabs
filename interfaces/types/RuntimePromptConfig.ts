import { DeepConfig } from '../../types';

export interface RuntimePromptConfig {
    systemPrompt: string;
    converterPrompt: string;
    deepConfig: DeepConfig;
    promptSet: string;
}
