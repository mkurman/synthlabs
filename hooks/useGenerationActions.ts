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
import type { CompleteGenerationConfig, RuntimePromptConfig } from '../interfaces';
import type { SynthLogItem } from '../types';
import type { Environment, DataSource, CreatorMode } from '../interfaces/enums';
import type { HuggingFaceConfig } from '../types';

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
            isInvalidLog,
            refreshLogs,
            updateDbStats
        );
    }, [isInvalidLog, refreshLogs, sessionUid, updateDbStats]);

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
        startNewSession
    };
}

export default useGenerationActions;
