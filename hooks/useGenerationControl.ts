import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

import { createGenerationService, GenerationService } from '../services/generationService';
import { toast } from '../services/toastService';
import type { CompleteGenerationConfig } from '../interfaces';
import type { PrefetchState } from '../services/hfPrefetchService';

interface UseGenerationControlOptions {
    buildGenerationConfig: () => CompleteGenerationConfig;
    generationServiceRef: MutableRefObject<GenerationService | null>;
    abortControllerRef: MutableRefObject<AbortController | null>;
    streamingAbortControllersRef: MutableRefObject<Map<string, AbortController>>;
    streamingConversationsRef: MutableRefObject<Map<string, any>>;
    haltedStreamingIdsRef: MutableRefObject<Set<string>>;
    prefetchManagerRef: MutableRefObject<any>;
    setPrefetchState: (state: PrefetchState | null) => void;
    bumpStreamingConversations: () => void;
    setIsPaused: (paused: boolean) => void;
    setIsRunning: (running: boolean) => void;
    totalLogCount: number;
    setShowOverwriteModal: (show: boolean) => void;
}

export function useGenerationControl({
    buildGenerationConfig,
    generationServiceRef,
    abortControllerRef,
    streamingAbortControllersRef,
    streamingConversationsRef,
    haltedStreamingIdsRef,
    prefetchManagerRef,
    setPrefetchState,
    bumpStreamingConversations,
    setIsPaused,
    setIsRunning,
    totalLogCount,
    setShowOverwriteModal
}: UseGenerationControlOptions) {
    const startGeneration = useCallback(async (append = false) => {
        const config = buildGenerationConfig();
        const service = createGenerationService(config);
        generationServiceRef.current = service;
        await service.startGeneration(append);
    }, [buildGenerationConfig, generationServiceRef]);

    const stopGeneration = useCallback(() => {
        if (generationServiceRef.current) {
            generationServiceRef.current.stopGeneration();
            generationServiceRef.current = null;
            return;
        }

        abortControllerRef.current?.abort();
        streamingAbortControllersRef.current.forEach((controller, generationId) => {
            haltedStreamingIdsRef.current.add(generationId);
            controller.abort();
        });
        streamingAbortControllersRef.current.clear();
        streamingConversationsRef.current.clear();
        bumpStreamingConversations();

        if (prefetchManagerRef.current) {
            prefetchManagerRef.current.abort();
            prefetchManagerRef.current = null;
            setPrefetchState(null);
        }

        setIsPaused(false);
        setIsRunning(false);
        toast.warning('Generation stopped');
    }, [
        abortControllerRef,
        bumpStreamingConversations,
        generationServiceRef,
        haltedStreamingIdsRef,
        prefetchManagerRef,
        setIsPaused,
        setIsRunning,
        setPrefetchState,
        streamingAbortControllersRef,
        streamingConversationsRef
    ]);

    const pauseGeneration = useCallback(() => {
        setIsPaused(true);
        toast.info('Generation paused');
    }, [setIsPaused]);

    const resumeGeneration = useCallback(() => {
        setIsPaused(false);
    }, [setIsPaused]);

    const handleStart = useCallback(() => {
        if (totalLogCount > 0) setShowOverwriteModal(true);
        else void startGeneration(false);
    }, [setShowOverwriteModal, startGeneration, totalLogCount]);

    return {
        startGeneration,
        stopGeneration,
        pauseGeneration,
        resumeGeneration,
        handleStart
    };
}

export default useGenerationControl;
