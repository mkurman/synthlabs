import { useState, useCallback } from 'react';
import { OllamaModel, fetchOllamaModels, checkOllamaStatus } from '../services/externalApiService';
import { OllamaStatus } from '../interfaces/enums';

export interface UseSettingsOllamaReturn {
    ollamaModels: OllamaModel[];
    ollamaStatus: OllamaStatus;
    ollamaLoading: boolean;
    refreshOllamaModels: () => Promise<void>;
}

export function useSettingsOllama(): UseSettingsOllamaReturn {
    const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
    const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>(OllamaStatus.Checking);
    const [ollamaLoading, setOllamaLoading] = useState(false);

    const refreshOllamaModels = useCallback(async () => {
        setOllamaLoading(true);
        setOllamaStatus(OllamaStatus.Checking);
        try {
            const isOnline = await checkOllamaStatus();
            if (isOnline) {
                setOllamaStatus(OllamaStatus.Online);
                const models = await fetchOllamaModels();
                setOllamaModels(models);
            } else {
                setOllamaStatus(OllamaStatus.Offline);
                setOllamaModels([]);
            }
        } catch {
            setOllamaStatus(OllamaStatus.Offline);
            setOllamaModels([]);
        }
        setOllamaLoading(false);
    }, []);

    return {
        ollamaModels,
        ollamaStatus,
        ollamaLoading,
        refreshOllamaModels
    };
}
