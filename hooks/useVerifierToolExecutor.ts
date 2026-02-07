import { useEffect, useRef } from 'react';

import { ToolExecutor } from '../services/toolService';
import { SettingsService } from '../services/settingsService';
import type { AutoscoreConfig, AutoscoreToolParams, AutoscoreToolResult, VerifierItem } from '../types';
import type { SessionData } from '../interfaces';
import type { RewriterConfig } from '../services/verifierRewriterService';

interface UseVerifierToolExecutorOptions {
    data: VerifierItem[];
    setData: (data: VerifierItem[]) => void;
    currentSessionUid: string;
    autoSaveEnabled: boolean;
    handleFetchMore: (start: number, end: number) => Promise<void>;
    handleDbUpdate: (item: VerifierItem) => Promise<void>;
    refreshRowsFromDb: (startIndex: number, endIndex: number) => Promise<VerifierItem[]>;
    sessions: SessionData[];
    refreshSessions: () => Promise<SessionData[]>;
    renameSession: (sessionId: string, newName: string) => Promise<void>;
    autoscoreItems: (params: AutoscoreToolParams) => Promise<AutoscoreToolResult>;
    loadSessionById: (sessionId: string) => Promise<void>;
    loadSessionRows: (sessionId: string, offset: number, limit: number) => Promise<VerifierItem[]>;
    autoscoreConfig: AutoscoreConfig;
    rewriterConfig: RewriterConfig;
    toolExecutorRef: React.MutableRefObject<ToolExecutor | null>;
}

export function useVerifierToolExecutor({
    data,
    setData,
    currentSessionUid,
    autoSaveEnabled,
    handleFetchMore,
    handleDbUpdate,
    refreshRowsFromDb,
    sessions,
    refreshSessions,
    renameSession,
    autoscoreItems,
    loadSessionById,
    loadSessionRows,
    autoscoreConfig,
    rewriterConfig,
    toolExecutorRef
}: UseVerifierToolExecutorOptions): void {
    const dataRef = useRef(data);
    const setDataRef = useRef(setData);
    const currentSessionUidRef = useRef(currentSessionUid);
    const fetchMoreRef = useRef(handleFetchMore);
    const refreshRowsFromDbRef = useRef(refreshRowsFromDb);
    const autoSaveEnabledRef = useRef(autoSaveEnabled);
    const handleDbUpdateRef = useRef(handleDbUpdate);
    const sessionsRef = useRef(sessions);
    const refreshSessionsRef = useRef(refreshSessions);
    const renameSessionRef = useRef(renameSession);
    const autoscoreItemsRef = useRef(autoscoreItems);
    const loadSessionByIdRef = useRef(loadSessionById);
    const loadSessionRowsRef = useRef(loadSessionRows);
    const autoscoreConfigRef = useRef(autoscoreConfig);
    const rewriterConfigRef = useRef(rewriterConfig);

    useEffect(() => {
        dataRef.current = data;
        setDataRef.current = setData;
        currentSessionUidRef.current = currentSessionUid;
    }, [data, setData, currentSessionUid]);

    useEffect(() => {
        fetchMoreRef.current = handleFetchMore;
        refreshRowsFromDbRef.current = refreshRowsFromDb;
        autoSaveEnabledRef.current = autoSaveEnabled;
        handleDbUpdateRef.current = handleDbUpdate;
    }, [autoSaveEnabled, handleDbUpdate, handleFetchMore, refreshRowsFromDb]);

    useEffect(() => {
        sessionsRef.current = sessions;
        refreshSessionsRef.current = refreshSessions;
        renameSessionRef.current = renameSession;
        autoscoreItemsRef.current = autoscoreItems;
        loadSessionByIdRef.current = loadSessionById;
        loadSessionRowsRef.current = loadSessionRows;
        autoscoreConfigRef.current = autoscoreConfig;
        rewriterConfigRef.current = rewriterConfig;
    }, [autoscoreItems, refreshSessions, renameSession, sessions, loadSessionById, loadSessionRows, autoscoreConfig, rewriterConfig]);

    useEffect(() => {
        if (!toolExecutorRef.current) {
            toolExecutorRef.current = new ToolExecutor(() => ({
                data: dataRef.current,
                setData: setDataRef.current,
                currentSessionUid: currentSessionUidRef.current,
                autoSaveEnabled: autoSaveEnabledRef.current,
                handleDbUpdate: handleDbUpdateRef.current,
                fetchMoreFromDb: async (start: number, end: number) => {
                    if (fetchMoreRef.current) {
                        return fetchMoreRef.current(start, end);
                    }
                    throw new Error('Fetch handler not ready');
                },
                refreshRowsFromDb: async (startIndex: number, endIndex: number) => {
                    if (refreshRowsFromDbRef.current) {
                        return refreshRowsFromDbRef.current(startIndex, endIndex);
                    }
                    throw new Error('Refresh rows handler not ready');
                },
                sessions: sessionsRef.current,
                refreshSessions: async () => {
                    if (refreshSessionsRef.current) {
                        return refreshSessionsRef.current();
                    }
                    return [];
                },
                renameSession: async (sessionId: string, newName: string) => {
                    if (renameSessionRef.current) {
                        return renameSessionRef.current(sessionId, newName);
                    }
                    throw new Error('Rename session handler not ready');
                },
                autoscoreItems: async (params: AutoscoreToolParams) => {
                    if (autoscoreItemsRef.current) {
                        return autoscoreItemsRef.current(params);
                    }
                    return { scored: 0, skipped: 0, errors: 1 };
                },
                loadSessionById: async (sessionId: string) => {
                    if (loadSessionByIdRef.current) {
                        return loadSessionByIdRef.current(sessionId);
                    }
                    throw new Error('Load session handler not ready');
                },
                loadSessionRows: async (sessionId: string, offset: number, limit: number) => {
                    if (loadSessionRowsRef.current) {
                        return loadSessionRowsRef.current(sessionId, offset, limit);
                    }
                    throw new Error('Load session rows handler not ready');
                },
                getApiKey: (provider: string) => SettingsService.getApiKey(provider),
                getExternalProvider: () => SettingsService.getSettings().defaultProvider || '',
                getCustomBaseUrl: () => {
                    const provider = SettingsService.getSettings().defaultProvider || '';
                    return SettingsService.getProviderUrl(provider);
                },
                getModel: () => {
                    const provider = SettingsService.getSettings().defaultProvider || '';
                    return SettingsService.getDefaultModel(provider);
                },
                getAutoscoreConfig: () => autoscoreConfigRef.current || null,
                getRewriterConfig: () => rewriterConfigRef.current || null,
            }));
        }
    }, [toolExecutorRef]);
}

export default useVerifierToolExecutor;
