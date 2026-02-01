import { useEffect } from 'react';

import { SettingsService } from '../services/settingsService';
import { prefetchModels } from '../services/modelService';

interface UseSettingsInitOptions {
    refreshPrompts: () => void;
}

export function useSettingsInit({ refreshPrompts }: UseSettingsInitOptions) {
    useEffect(() => {
        SettingsService.waitForSettingsInit().then(() => {
            refreshPrompts();
            const settings = SettingsService.getSettings();
            prefetchModels(settings.providerKeys || {}, SettingsService.getApiKey);
        });
    }, [refreshPrompts]);
}

export default useSettingsInit;
