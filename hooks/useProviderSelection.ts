import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ExternalProvider, ProviderType } from '../interfaces/enums';
import { SettingsService } from '../services/settingsService';

interface UseProviderSelectionOptions {
    setProvider: Dispatch<SetStateAction<ProviderType>>;
    setExternalProvider: Dispatch<SetStateAction<ExternalProvider>>;
    setExternalApiKey: Dispatch<SetStateAction<string>>;
    setExternalModel: Dispatch<SetStateAction<string>>;
    setCustomBaseUrl: Dispatch<SetStateAction<string>>;
}

export function useProviderSelection({
    setProvider,
    setExternalProvider,
    setExternalApiKey,
    setExternalModel,
    setCustomBaseUrl
}: UseProviderSelectionOptions) {
    const handleProviderSelect = useCallback((value: string) => {
        const settings = SettingsService.getSettings();

        if (value === ProviderType.Gemini) {
            setProvider(ProviderType.Gemini);
            setExternalModel('gemini-2.0-flash-exp');
            return;
        }

        const newProvider = value as ExternalProvider;
        setProvider(ProviderType.External);
        setExternalProvider(newProvider);

        const savedKey = SettingsService.getApiKey(newProvider);
        setExternalApiKey(savedKey || '');

        const defaultModel = settings.providerDefaultModels?.[newProvider] || '';
        setExternalModel(defaultModel);

        if (newProvider === ExternalProvider.Other) {
            const savedBaseUrl = SettingsService.getCustomBaseUrl();
            setCustomBaseUrl(savedBaseUrl || '');
        }
    }, [setCustomBaseUrl, setExternalApiKey, setExternalModel, setExternalProvider, setProvider]);

    return { handleProviderSelect };
}

export default useProviderSelection;
