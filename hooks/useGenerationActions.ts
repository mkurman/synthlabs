import { useCallback } from 'react';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';

import { createGenerationService } from '../services/generationService';
import {
    retryItem as retryItemOp,
    retrySave as retrySaveOp,
    retryAllFailed as retryAllFailedOp,
    syncAllUnsavedToDb as syncAllUnsavedToDbOp,
    saveItemToDb as saveItemToDbOp
} from '../services/generation/retryOperations';
import { SessionService } from '../services/sessionService';
import { LogStorageService } from '../services/logStorageService';
import type { CompleteGenerationConfig, RuntimePromptConfig } from '../interfaces';
import type { SynthLogItem } from '../types';
import type { Environment, DataSource, CreatorMode } from '../interfaces/enums';
import type { HuggingFaceConfig } from '../types';
import { LogItemStatus } from '../interfaces/enums';

interface UseGenerationActionsOptions {
    buildGenerationConfig: () => CompleteGenerationConfig;
    sessionUid: string;
    environment: Environment;
    concurrency: number;
    visibleLogs: SynthLogItem[];
    isInvalidLog: (log: SynthLogItem) => boolean;
    refreshLogs: () => Promise<void>;
    updateDbStats: () => void;
    setRetryingIds: Dispatch<SetStateAction<Set<string>>>;
    setSavingToDbIds: Dispatch<SetStateAction<Set<string>>>;
    setReplayingIds: Dispatch<SetStateAction<Set<string>>>;
    dataSourceMode: DataSource;
    hfConfig: HuggingFaceConfig;
    manualFileName: string;
    appMode: CreatorMode;
    getSessionData: () => any;
    setSessionUid: (uid: string) => void;
    sessionUidRef: MutableRefObject<string>;
    setSessionName: (name: string | null) => void;
    setVisibleLogs: (logs: SynthLogItem[] | ((prev: SynthLogItem[]) => SynthLogItem[])) => void;
    setTotalLogCount: (count: number | ((prev: number) => number)) => void;
    setFilteredLogCount: (count: number | ((prev: number) => number)) => void;
    setSparklineHistory: (values: number[]) => void;
    setDbStats: (stats: { total: number; session: number }) => void;
}

export function useGenerationActions({
    buildGenerationConfig,
    sessionUid,
    environment,
    concurrency,
    visibleLogs,
    isInvalidLog,
    refreshLogs,
    updateDbStats,
    setRetryingIds,
    setSavingToDbIds,
    setReplayingIds,
    dataSourceMode,
    hfConfig,
    manualFileName,
    appMode,
    getSessionData,
    setSessionUid,
    sessionUidRef,
    setSessionName,
    setVisibleLogs,
    setTotalLogCount,
    setFilteredLogCount,
    setSparklineHistory,
    setDbStats
}: UseGenerationActionsOptions) {
    const generateSingleItem = useCallback(async (
        inputText: string,
        workerId: number,
        opts: { retryId?: string; originalQuestion?: string; originalAnswer?: string; originalReasoning?: string; row?: any; runtimeConfig?: RuntimePromptConfig } = {}
    ): Promise<SynthLogItem | null> => {
        const config = buildGenerationConfig();
        const service = createGenerationService(config);
        return service.generateSingleItem(inputText, workerId, opts);
    }, [buildGenerationConfig]);

    const retryItem = useCallback(async (id: string) => {
        await retryItemOp(
            id,
            sessionUid,
            environment,
            visibleLogs,
            generateSingleItem,
            setRetryingIds,
            refreshLogs,
            updateDbStats
        );
    }, [environment, generateSingleItem, refreshLogs, sessionUid, setRetryingIds, updateDbStats, visibleLogs]);

    const retrySave = useCallback(async (id: string) => {
        await retrySaveOp(
            id,
            sessionUid,
            visibleLogs,
            setRetryingIds,
            refreshLogs,
            updateDbStats
        );
    }, [refreshLogs, sessionUid, setRetryingIds, updateDbStats, visibleLogs]);

    const retryAllFailed = useCallback(async () => {
        await retryAllFailedOp(
            sessionUid,
            environment,
            concurrency,
            visibleLogs,
            isInvalidLog,
            setRetryingIds,
            generateSingleItem,
            refreshLogs
        );
    }, [concurrency, environment, generateSingleItem, isInvalidLog, refreshLogs, sessionUid, setRetryingIds, visibleLogs]);

    const syncAllUnsavedToDb = useCallback(async () => {
        await syncAllUnsavedToDbOp(
            sessionUid,
            refreshLogs,
            updateDbStats
        );
    }, [refreshLogs, sessionUid, updateDbStats]);

    const saveItemToDb = useCallback(async (id: string) => {
        setSavingToDbIds((prev: Set<string>) => new Set([...prev, id]));
        try {
            await saveItemToDbOp(
                id,
                sessionUid,
                visibleLogs,
                refreshLogs,
                updateDbStats
            );
        } finally {
            setSavingToDbIds((prev: Set<string>) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    }, [refreshLogs, sessionUid, setSavingToDbIds, updateDbStats, visibleLogs]);

    const deterministicReplay = useCallback(async (id: string) => {
        const logItem = visibleLogs.find(l => l.id === id);
        if (!logItem) return;

        setReplayingIds(prev => new Set(prev).add(id));
        try {
            const baseConfig = buildGenerationConfig();
            const replayConfig = logItem.replayConfig;
            const effectiveConfig: CompleteGenerationConfig = {
                ...baseConfig,
                appMode: replayConfig?.appMode ?? baseConfig.appMode,
                engineMode: replayConfig?.engineMode ?? baseConfig.engineMode,
                provider: replayConfig?.provider ?? baseConfig.provider,
                externalProvider: replayConfig?.externalProvider ?? baseConfig.externalProvider,
                apiType: replayConfig?.apiType ?? baseConfig.apiType,
                model: replayConfig?.model ?? baseConfig.model,
                externalModel: replayConfig?.externalModel ?? baseConfig.externalModel,
                customBaseUrl: replayConfig?.customBaseUrl ?? baseConfig.customBaseUrl,
                systemPrompt: replayConfig?.systemPrompt ?? baseConfig.systemPrompt,
                converterPrompt: replayConfig?.converterPrompt ?? baseConfig.converterPrompt,
                deepConfig: replayConfig?.deepConfig ?? baseConfig.deepConfig,
                userAgentConfig: replayConfig?.userAgentConfig ?? baseConfig.userAgentConfig,
                conversationRewriteMode: replayConfig?.conversationRewriteMode ?? baseConfig.conversationRewriteMode,
                generationParams: replayConfig?.generationParams ?? baseConfig.generationParams,
                sessionPromptSet: replayConfig?.sessionPromptSet ?? baseConfig.sessionPromptSet,
                isStreamingEnabled: replayConfig?.isStreamingEnabled ?? baseConfig.isStreamingEnabled
            };
            const service = createGenerationService(effectiveConfig);
            const result = await service.generateSingleItem(logItem.full_seed, 0, {
                originalQuestion: logItem.query,
                originalAnswer: logItem.answer,
                originalReasoning: logItem.reasoning
            });
            if (!result) {
                const updated: SynthLogItem = {
                    ...logItem,
                    replayAnswer: undefined,
                    replayReasoning: undefined,
                    replayTimestamp: new Date().toISOString(),
                    replayModelUsed: undefined,
                    replayError: 'Replay returned no result',
                    replayDuration: undefined
                };
                await LogStorageService.updateLog(sessionUid, updated);
                await refreshLogs();
                return;
            }

            const replayFailed = result.isError || result.status === LogItemStatus.ERROR || result.status === LogItemStatus.TIMEOUT;
            const updated: SynthLogItem = {
                ...logItem,
                replayAnswer: replayFailed ? undefined : result.answer,
                replayReasoning: replayFailed ? undefined : result.reasoning,
                replayTimestamp: new Date().toISOString(),
                replayModelUsed: result.modelUsed,
                replayError: replayFailed ? (result.error || 'Replay failed') : undefined,
                replayDuration: result.duration
            };
            await LogStorageService.updateLog(sessionUid, updated);
            await refreshLogs();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Replay failed';
            const updated: SynthLogItem = {
                ...logItem,
                replayAnswer: undefined,
                replayReasoning: undefined,
                replayTimestamp: new Date().toISOString(),
                replayModelUsed: undefined,
                replayError: message,
                replayDuration: undefined
            };
            await LogStorageService.updateLog(sessionUid, updated);
            await refreshLogs();
        } finally {
            setReplayingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    }, [buildGenerationConfig, refreshLogs, sessionUid, setReplayingIds, visibleLogs]);

    const acceptReplay = useCallback(async (id: string) => {
        const logItem = visibleLogs.find(l => l.id === id);
        if (!logItem || logItem.replayAnswer === undefined) return;

        const updated: SynthLogItem = {
            ...logItem,
            original_answer: logItem.original_answer ?? logItem.answer,
            original_reasoning: logItem.original_reasoning ?? logItem.reasoning,
            answer: logItem.replayAnswer,
            reasoning: logItem.replayReasoning ?? logItem.reasoning,
            reasoning_content: logItem.replayReasoning ?? logItem.reasoning_content,
            replayAnswer: undefined,
            replayReasoning: undefined,
            replayTimestamp: undefined,
            replayModelUsed: undefined,
            replayError: undefined,
            replayDuration: undefined
        };

        await LogStorageService.updateLog(sessionUid, updated);
        refreshLogs();
    }, [refreshLogs, sessionUid, visibleLogs]);

    const dismissReplay = useCallback(async (id: string) => {
        const logItem = visibleLogs.find(l => l.id === id);
        if (!logItem) return;

        const updated: SynthLogItem = {
            ...logItem,
            replayAnswer: undefined,
            replayReasoning: undefined,
            replayTimestamp: undefined,
            replayModelUsed: undefined,
            replayError: undefined,
            replayDuration: undefined
        };

        await LogStorageService.updateLog(sessionUid, updated);
        refreshLogs();
    }, [refreshLogs, sessionUid, visibleLogs]);

    const startNewSession = useCallback(async () => {
        const newSessionConfig = {
            dataSourceMode,
            hfConfig,
            manualFileName,
            environment,
            appMode
        };

        const newUid = await SessionService.startNewSession(newSessionConfig, getSessionData);

        setSessionUid(newUid);
        sessionUidRef.current = newUid;
        setSessionName(null);
        setVisibleLogs([]);
        setTotalLogCount(0);
        setFilteredLogCount(0);
        setSparklineHistory([]);
        setDbStats({ total: 0, session: 0 });
    }, [appMode, dataSourceMode, environment, getSessionData, hfConfig, manualFileName, sessionUidRef, setDbStats, setFilteredLogCount, setSessionName, setSessionUid, setSparklineHistory, setTotalLogCount, setVisibleLogs]);

    return {
        retryItem,
        retrySave,
        retryAllFailed,
        syncAllUnsavedToDb,
        saveItemToDb,
        deterministicReplay,
        acceptReplay,
        dismissReplay,
        startNewSession
    };
}

export default useGenerationActions;
