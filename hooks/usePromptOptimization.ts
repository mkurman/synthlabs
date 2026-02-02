import { useCallback } from 'react';

import { optimizePrompt } from '../services/promptOptimizationService';
import { CreatorMode } from '../interfaces/enums';

interface UsePromptOptimizationOptions {
    appMode: CreatorMode;
    systemPrompt: string;
    converterPrompt: string;
    setSystemPrompt: (prompt: string) => void;
    setConverterPrompt: (prompt: string) => void;
    setError: (error: string | null) => void;
    setIsOptimizing: (optimizing: boolean) => void;
}

export function usePromptOptimization({
    appMode,
    systemPrompt,
    converterPrompt,
    setSystemPrompt,
    setConverterPrompt,
    setError,
    setIsOptimizing
}: UsePromptOptimizationOptions) {
    const handleOptimizePrompt = useCallback(() => {
        void optimizePrompt({
            appMode,
            systemPrompt,
            converterPrompt,
            setSystemPrompt,
            setConverterPrompt,
            setError,
            setIsOptimizing
        });
    }, [appMode, converterPrompt, setConverterPrompt, setError, setIsOptimizing, setSystemPrompt, systemPrompt]);

    return { handleOptimizePrompt };
}

export default usePromptOptimization;
