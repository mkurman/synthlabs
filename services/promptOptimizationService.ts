import { AppMode, ProviderType, ExternalProvider } from '../interfaces/enums';
import * as GeminiService from './geminiService';
import { SettingsService } from './settingsService';

export interface OptimizePromptOptions {
    appMode: AppMode;
    systemPrompt: string;
    converterPrompt: string;
    setSystemPrompt: (prompt: string) => void;
    setConverterPrompt: (prompt: string) => void;
    setError: (error: string | null) => void;
    setIsOptimizing: (optimizing: boolean) => void;
}

export async function optimizePrompt({
    appMode,
    systemPrompt,
    converterPrompt,
    setSystemPrompt,
    setConverterPrompt,
    setError,
    setIsOptimizing
}: OptimizePromptOptions): Promise<void> {
    setIsOptimizing(true);
    try {
        const activePrompt = appMode === AppMode.Generator ? systemPrompt : converterPrompt;
        const settings = SettingsService.getSettings();
        const generalPurposeModel = settings.generalPurposeModel;

        console.log('[Optimize] General purpose model:', generalPurposeModel);
        console.log('[Optimize] Provider keys:', settings.providerKeys);
        console.log('[Optimize] Custom endpoint URL:', settings.customEndpointUrl);

        let config: GeminiService.OptimizePromptConfig | undefined;

        if (generalPurposeModel && generalPurposeModel.model) {
            const isExternal = generalPurposeModel.provider === ProviderType.External;
            const isOther = generalPurposeModel.externalProvider === ExternalProvider.Other;
            let apiKey = '';

            console.log('[Optimize] provider:', generalPurposeModel.provider, 'isExternal:', isExternal, 'isOther:', isOther, 'externalProvider:', generalPurposeModel.externalProvider);

            let externalProvider = generalPurposeModel.externalProvider;

            if (isOther) {
                externalProvider = ExternalProvider.Other;
            }

            if (isExternal || isOther) {
                apiKey = SettingsService.getApiKey(externalProvider);
                console.log('[Optimize] API key for', externalProvider, ':', apiKey ? '***' : '(empty)');
            } else {
                apiKey = SettingsService.getApiKey('gemini');
                console.log('[Optimize] Gemini API key:', apiKey ? '***' : '(empty)');
            }

            const customBaseUrl = SettingsService.getCustomBaseUrl();
            console.log('[Optimize] Custom base URL:', customBaseUrl);

            if ((isExternal || isOther) && externalProvider && generalPurposeModel.model && apiKey) {
                config = {
                    provider: ProviderType.External,
                    externalProvider: externalProvider,
                    model: generalPurposeModel.model,
                    customBaseUrl: customBaseUrl,
                    apiKey
                };
                console.log('[Optimize] Config built for external provider:', config);
            } else if (!isExternal && !isOther && apiKey) {
                config = {
                    provider: ProviderType.Gemini,
                    model: generalPurposeModel.model
                };
                console.log('[Optimize] Config built for Gemini:', config);
            }
        }

            if (!config) {
                console.error('[Optimize] No config built! generalPurposeModel:', generalPurposeModel);
            throw new Error(generalPurposeModel?.provider === ProviderType.External
                ? 'General purpose model is incomplete. Please set: Provider, Model, and API Key in Settings → API Keys.'
                : 'No model configured. Please set a model in Settings → Default Models → General purpose model.');
            }

        config.structuredOutput = false;

        const refined = await GeminiService.optimizeSystemPrompt(activePrompt, config);
        if (appMode === AppMode.Generator) setSystemPrompt(refined);
        else setConverterPrompt(refined);
    } catch (e) {
        setError(`Prompt optimization failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        setIsOptimizing(false);
    }
}

export default optimizePrompt;
