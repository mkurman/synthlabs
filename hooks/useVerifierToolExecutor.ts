import { useEffect, useRef } from 'react';

import { ToolExecutor } from '../services/toolService';
import type { AutoscoreToolParams, AutoscoreToolResult, VerifierItem } from '../types';
import type { SessionData } from '../interfaces';

interface UseVerifierToolExecutorOptions {
    data: VerifierItem[];
    setData: (data: VerifierItem[]) => void;
    autoSaveEnabled: boolean;
    handleFetchMore: (start: number, end: number) => Promise<void>;
    handleDbUpdate: (item: VerifierItem) => Promise<void>;
    sessions: SessionData[];
    refreshSessions: () => Promise<SessionData[]>;
    renameSession: (sessionId: string, newName: string) => Promise<void>;
    autoscoreItems: (params: AutoscoreToolParams) => Promise<AutoscoreToolResult>;
    loadSessionById: (sessionId: string) => Promise<void>;
    loadSessionRows: (sessionId: string, offset: number, limit: number) => Promise<VerifierItem[]>;
    toolExecutorRef: React.MutableRefObject<ToolExecutor | null>;
}

export function useVerifierToolExecutor({
    data,
    setData,
    autoSaveEnabled,
    handleFetchMore,
    handleDbUpdate,
    sessions,
    refreshSessions,
    renameSession,
    autoscoreItems,
    loadSessionById,
    loadSessionRows,
    toolExecutorRef
}: UseVerifierToolExecutorOptions): void {
    const dataRef = useRef(data);
    const setDataRef = useRef(setData);
    const fetchMoreRef = useRef(handleFetchMore);
    const autoSaveEnabledRef = useRef(autoSaveEnabled);
    const handleDbUpdateRef = useRef(handleDbUpdate);
    const sessionsRef = useRef(sessions);
    const refreshSessionsRef = useRef(refreshSessions);
    const renameSessionRef = useRef(renameSession);
    const autoscoreItemsRef = useRef(autoscoreItems);
    const loadSessionByIdRef = useRef(loadSessionById);
    const loadSessionRowsRef = useRef(loadSessionRows);

    useEffect(() => {
        dataRef.current = data;
        setDataRef.current = setData;
    }, [data, setData]);

    useEffect(() => {
        fetchMoreRef.current = handleFetchMore;
        autoSaveEnabledRef.current = autoSaveEnabled;
        handleDbUpdateRef.current = handleDbUpdate;
    }, [autoSaveEnabled, handleDbUpdate, handleFetchMore]);

    useEffect(() => {
        sessionsRef.current = sessions;
        refreshSessionsRef.current = refreshSessions;
        renameSessionRef.current = renameSession;
        autoscoreItemsRef.current = autoscoreItems;
        loadSessionByIdRef.current = loadSessionById;
        loadSessionRowsRef.current = loadSessionRows;
    }, [autoscoreItems, refreshSessions, renameSession, sessions, loadSessionById, loadSessionRows]);

    useEffect(() => {
        if (!toolExecutorRef.current) {
            toolExecutorRef.current = new ToolExecutor(() => ({
                data: dataRef.current,
                setData: setDataRef.current,
                autoSaveEnabled: autoSaveEnabledRef.current,
                handleDbUpdate: handleDbUpdateRef.current,
                fetchMoreFromDb: async (start: number, end: number) => {
                    if (fetchMoreRef.current) {
                        return fetchMoreRef.current(start, end);
                    }
                    throw new Error('Fetch handler not ready');
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
                }
            }));
        }
    }, [toolExecutorRef]);
}

export default useVerifierToolExecutor;
