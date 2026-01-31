import { useCallback, useEffect, useState } from 'react';

import { ExternalProvider, OllamaStatus } from '../interfaces/enums';
import { OllamaModel } from '../services/externalApiService';
import { refreshOllamaModels as refreshOllamaModelsService, getFirstModelName } from '../services/ollamaService';

interface UseOllamaOptions {
    externalProvider: ExternalProvider;
    externalModel: string;
    setExternalModel: (model: string) => void;
}

export function useOllama({ externalProvider, externalModel, setExternalModel }: UseOllamaOptions) {
    const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
    const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>(OllamaStatus.Checking);
    const [ollamaLoading, setOllamaLoading] = useState(false);

    const refreshOllamaModels = useCallback(async () => {
        setOllamaLoading(true);
        setOllamaStatus(OllamaStatus.Checking);
        try {
            const result = await refreshOllamaModelsService();
            setOllamaStatus(result.status);
            setOllamaModels(result.models);
            if (
                result.models.length > 0 &&
                externalProvider === ExternalProvider.Ollama &&
                (!externalModel || externalModel.includes('/'))
            ) {
                const firstModel = getFirstModelName(result.models);
                if (firstModel) {
                    setExternalModel(firstModel);
                }
            }
        } catch {
            setOllamaStatus(OllamaStatus.Offline);
            setOllamaModels([]);
        }
        setOllamaLoading(false);
    }, [externalModel, externalProvider, setExternalModel]);

    useEffect(() => {
        if (externalProvider === ExternalProvider.Ollama) {
            refreshOllamaModels();
        }
    }, [externalProvider, refreshOllamaModels]);

    return {
        ollamaModels,
        ollamaStatus,
        ollamaLoading,
        refreshOllamaModels
    };
}

export default useOllama;
