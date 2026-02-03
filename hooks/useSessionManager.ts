import { useState, useCallback, useEffect } from 'react';
import { AppView, CreatorMode } from '../interfaces/enums';
import { SessionStatus } from '../interfaces/enums/SessionStatus';
import { StorageMode } from '../interfaces/enums/StorageMode';
import { SessionSort } from '../interfaces/enums/SessionSort';
import { Environment } from '../interfaces/enums';
import * as IndexedDBUtils from '../services/session/indexedDBUtils';
import { generateSessionName, autoNameSessionBeforeGeneration } from '../services/session/SessionNamingService';
import { ExternalProvider } from '../interfaces/enums';
import { GenerationParams } from '../interfaces/config/GenerationParams';
import { sessionLoadService } from '../services/sessionLoadService';
import { SessionData, SessionDataSource } from '../interfaces/services/SessionConfig';

interface UseSessionManagerOptions {
    environment: Environment;
    defaultMode?: AppView;
    onSessionChange?: (session: SessionData | null) => void;
}

interface AIModelConfig {
    provider: ExternalProvider;
    model: string;
    apiKey: string;
    customBaseUrl?: string;
    generationParams?: GenerationParams;
}

export function useSessionManager(options: UseSessionManagerOptions) {
    const { environment, onSessionChange } = options;

    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [currentSession, setCurrentSession] = useState<SessionData | null>(null);
    const [sortBy, setSortBy] = useState<SessionSort>(SessionSort.DateDesc);
    const [isLoading, setIsLoading] = useState(true);

    // Determine storage mode based on environment
    const storageMode = environment === Environment.Production ? StorageMode.Cloud : StorageMode.Local;

    // Load sessions on mount
    useEffect(() => {
        loadSessions();
    }, [environment]);

    // Notify parent when session changes
    useEffect(() => {
        if (onSessionChange) {
            onSessionChange(currentSession);
        }
    }, [currentSession, onSessionChange]);

    /**
     * Load all sessions from storage
     */
    const loadSessions = useCallback(async () => {
        setIsLoading(true);
        try {
            let loadedSessions: SessionData[] = [];

            loadedSessions = await sessionLoadService.loadSessionList(false, environment);

            setSessions(loadedSessions);
        } catch (error) {
            console.error('Failed to load sessions:', error);
        } finally {
            setIsLoading(false);
        }
    }, [environment]);

    /**
     * Create a new session
     */
    const createSession = useCallback(async (
        dataset?: SessionDataSource,
        modelConfig?: AIModelConfig
    ): Promise<SessionData> => {
        // Generate session name (AI-powered with fallback)
        const { header } = await generateSessionName(
            { dataset: dataset?.hfConfig?.dataset, mode: CreatorMode.Generator },
            modelConfig
        );

        const name = header; // Use AI-generated or template name

        // Create session object
        const newSession = IndexedDBUtils.createNewSession(
            name,
            storageMode,
            dataset
        );

        // Save to storage
        if (storageMode === StorageMode.Local) {
            await IndexedDBUtils.saveSession(newSession);
        } else {
            // Save to Firebase (to be implemented)
            await IndexedDBUtils.saveSession(newSession); // Fallback to local for now
        }

            // Update state
        setSessions(prev => [newSession, ...prev]);
        setCurrentSession(newSession);
        return newSession;
    }, [storageMode]);

    /**
     * Select a session
     */
    const selectSession = useCallback(async (sessionId: string) => {
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            setCurrentSession(session);
        } else {
            // Load from storage if not in memory
            if (storageMode === StorageMode.Local) {
                const loadedSession = await IndexedDBUtils.loadSession(sessionId);
                if (loadedSession) {
                    setCurrentSession(loadedSession);
                }
            }
        }
    }, [sessions, storageMode]);

    /**
     * Rename a session
     */
    const renameSession = useCallback(async (sessionId: string, newName: string) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        const updatedSession: SessionData = {
            ...session,
            name: newName,
            updatedAt: Date.now()
        };

        // Save to storage
        if (storageMode === StorageMode.Local) {
            await IndexedDBUtils.saveSession(updatedSession);
        }

        // Update state
        setSessions(prev => prev.map(s => s.id === sessionId ? updatedSession : s));
        if (currentSession?.id === sessionId) {
            setCurrentSession(updatedSession);
        }
    }, [sessions, currentSession, storageMode]);

    /**
     * Update session status
     */
    const updateSessionStatus = useCallback(async (sessionId: string, status: SessionStatus) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        const updatedSession: SessionData = {
            ...session,
            status,
            updatedAt: Date.now()
        };

        // Save to storage
        if (storageMode === StorageMode.Local) {
            await IndexedDBUtils.saveSession(updatedSession);
        }

        // Update state
        setSessions(prev => prev.map(s => s.id === sessionId ? updatedSession : s));
        if (currentSession?.id === sessionId) {
            setCurrentSession(updatedSession);
        }
    }, [sessions, currentSession, storageMode]);

    /**
     * Delete a session
     */
    const deleteSession = useCallback(async (sessionId: string) => {
        // Delete from storage
        if (storageMode === StorageMode.Local) {
            await IndexedDBUtils.deleteSession(sessionId);
        }

        // Update state
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (currentSession?.id === sessionId) {
            setCurrentSession(null);
        }
    }, [currentSession, storageMode]);

    /**
     * Update session item count
     */
    const updateSessionItemCount = useCallback(async (sessionId: string, itemCount: number) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        const updatedSession: SessionData = {
            ...session,
            itemCount,
            updatedAt: Date.now()
        };

        // Save to storage
        if (storageMode === StorageMode.Local) {
            await IndexedDBUtils.saveSession(updatedSession);
        }

        // Update state
        setSessions(prev => prev.map(s => s.id === sessionId ? updatedSession : s));
        if (currentSession?.id === sessionId) {
            setCurrentSession(updatedSession);
        }
    }, [sessions, currentSession, storageMode]);

    /**
     * Auto-name session before first generation
     */
    const autoNameSession = useCallback(async (
        sessionId: string,
        dataset?: string,
        modelConfig?: AIModelConfig
    ) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        const { header } = await autoNameSessionBeforeGeneration(
            sessionId,
            { dataset, mode: session?.config?.appMode ?? CreatorMode.Generator },
            modelConfig
        );

        await renameSession(sessionId, header);
    }, [sessions, renameSession]);

    return {
        // State
        sessions,
        currentSession,
        sortBy,
        isLoading,
        storageMode,

        // Actions
        createSession,
        selectSession,
        renameSession,
        updateSessionStatus,
        deleteSession,
        updateSessionItemCount,
        autoNameSession,
        setSortBy,
        loadSessions
    };
}
