import { useCallback, useEffect, useRef, useState } from 'react';

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
    const externalModelRef = useRef(externalModel);

    useEffect(() => {
        externalModelRef.current = externalModel;
    }, [externalModel]);

    const refreshOllamaModels = useCallback(async () => {
        if (externalProvider !== ExternalProvider.Ollama) return;

        setOllamaLoading(true);
        setOllamaStatus(OllamaStatus.Checking);
        try {
            const result = await refreshOllamaModelsService();
            setOllamaStatus(result.status);
            setOllamaModels(result.models);

            const currentModel = externalModelRef.current;
            if (
                result.models.length > 0 &&
                externalProvider === ExternalProvider.Ollama &&
                (!currentModel || currentModel.includes('/'))
            ) {
                const firstModel = getFirstModelName(result.models);
                if (firstModel) {
                    setExternalModel(firstModel);
                }
            }
        } catch (error) {
            console.error('Failed to refresh Ollama models:', error);
            setOllamaStatus(OllamaStatus.Offline);
            setOllamaModels([]);
        } finally {
            setOllamaLoading(false);
        }
    }, [externalProvider, setExternalModel]);

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
