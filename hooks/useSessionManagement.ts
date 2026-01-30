import { useState, useCallback } from 'react';
import { SessionService } from '../services/sessionService';
import * as FirebaseService from '../services/firebaseService';
import { confirmService } from '../services/confirmService';
import { logger } from '../utils/logger';
import { 
    AppMode, 
    EngineMode, 
    Environment, 
    ProviderType, 
    ExternalProvider,
    DataSource 
} from '../interfaces/enums';
import { 
    DeepConfig, 
    UserAgentConfig, 
    HuggingFaceConfig, 
    GenerationParams,
    SynthLogItem 
} from '../types';

export interface SessionSetters {
    setAppMode: (mode: AppMode) => void;
    setEngineMode: (mode: EngineMode) => void;
    setEnvironment: (env: Environment) => void;
    setProvider: (provider: ProviderType) => void;
    setExternalProvider: (provider: ExternalProvider) => void;
    setExternalApiKey: (key: string) => void;
    setExternalModel: (model: string) => void;
    setCustomBaseUrl: (url: string) => void;
    setDeepConfig: (config: DeepConfig) => void;
    setUserAgentConfig: (config: UserAgentConfig) => void;
    setConcurrency: (value: number) => void;
    setRowsToFetch: (value: number) => void;
    setSkipRows: (value: number) => void;
    setSleepTime: (value: number) => void;
    setMaxRetries: (value: number) => void;
    setRetryDelay: (value: number) => void;
    setFeedPageSize: (value: number) => void;
    setDataSourceMode: (mode: DataSource) => void;
    setHfConfig: (config: HuggingFaceConfig) => void;
    setGeminiTopic: (topic: string) => void;
    setTopicCategory: (category: string) => void;
    setSystemPrompt: (prompt: string) => void;
    setConverterPrompt: (prompt: string) => void;
    setConversationRewriteMode: (enabled: boolean) => void;
    setConverterInputText: (text: string) => void;
    setGenerationParams: (params: GenerationParams) => void;
}

export interface SessionStateSetters {
    setSessionUid: (uid: string) => void;
    setSessionName: (name: string | null) => void;
    setError: (error: string | null) => void;
    setVisibleLogs: (logs: SynthLogItem[]) => void;
    setTotalLogCount: (count: number) => void;
    setFilteredLogCount: (count: number) => void;
    setSparklineHistory: (history: number[]) => void;
    setDbStats: (stats: { total: number; session: number }) => void;
}

export interface CloudSessionState {
    showCloudLoadModal: boolean;
    setShowCloudLoadModal: (show: boolean) => void;
    cloudSessions: import('../services/firebaseService').SavedSession[];
    setCloudSessions: (sessions: import('../services/firebaseService').SavedSession[]) => void;
    isCloudLoading: boolean;
    setIsCloudLoading: (loading: boolean) => void;
}

export interface UseSessionManagementReturn {
    // Cloud session state
    cloudState: CloudSessionState;
    
    // Actions
    buildSessionConfig: () => import('../interfaces/services/SessionConfig').SessionConfig;
    getSessionData: () => any;
    restoreSession: (session: any, savedSessionUid?: string) => void;
    handleSaveSession: () => void;
    handleLoadSession: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    handleCloudSave: () => Promise<void>;
    handleCloudLoadOpen: () => Promise<void>;
    handleCloudSessionSelect: (session: import('../services/firebaseService').SavedSession) => Promise<void>;
    handleCloudSessionDelete: (id: string, e: React.MouseEvent) => Promise<void>;
    startNewSession: () => Promise<void>;
}

export function useSessionManagement(
    // Current state values needed for building session config
    state: {
        appMode: AppMode;
        engineMode: EngineMode;
        environment: Environment;
        provider: ProviderType;
        externalProvider: ExternalProvider;
        externalApiKey: string;
        externalModel: string;
        customBaseUrl: string;
        deepConfig: DeepConfig;
        userAgentConfig: UserAgentConfig;
        concurrency: number;
        rowsToFetch: number;
        skipRows: number;
        sleepTime: number;
        maxRetries: number;
        retryDelay: number;
        feedPageSize: number;
        dataSourceMode: DataSource;
        hfConfig: HuggingFaceConfig;
        geminiTopic: string;
        topicCategory: string;
        systemPrompt: string;
        converterPrompt: string;
        conversationRewriteMode: boolean;
        converterInputText: string;
        generationParams: GenerationParams;
        sessionUid: string;
    },
    // Setters for restoring session
    setters: SessionSetters,
    // State setters for session management
    stateSetters: SessionStateSetters
): UseSessionManagementReturn {
    // Cloud session state
    const [showCloudLoadModal, setShowCloudLoadModal] = useState(false);
    const [cloudSessions, setCloudSessions] = useState<import('../services/firebaseService').SavedSession[]>([]);
    const [isCloudLoading, setIsCloudLoading] = useState(false);

    const cloudState: CloudSessionState = {
        showCloudLoadModal,
        setShowCloudLoadModal,
        cloudSessions,
        setCloudSessions,
        isCloudLoading,
        setIsCloudLoading
    };

    // Helper to build SessionConfig from current state
    const buildSessionConfig = useCallback((): import('../interfaces/services/SessionConfig').SessionConfig => {
        return {
            appMode: state.appMode,
            engineMode: state.engineMode,
            environment: state.environment,
            provider: state.provider,
            externalProvider: state.externalProvider,
            externalApiKey: state.externalApiKey,
            externalModel: state.externalModel,
            customBaseUrl: state.customBaseUrl,
            deepConfig: state.deepConfig,
            userAgentConfig: state.userAgentConfig,
            concurrency: state.concurrency,
            rowsToFetch: state.rowsToFetch,
            skipRows: state.skipRows,
            sleepTime: state.sleepTime,
            maxRetries: state.maxRetries,
            retryDelay: state.retryDelay,
            feedPageSize: state.feedPageSize,
            dataSourceMode: state.dataSourceMode,
            hfConfig: state.hfConfig,
            geminiTopic: state.geminiTopic,
            topicCategory: state.topicCategory,
            systemPrompt: state.systemPrompt,
            converterPrompt: state.converterPrompt,
            conversationRewriteMode: state.conversationRewriteMode,
            converterInputText: state.converterInputText,
            generationParams: state.generationParams
        };
    }, [state]);

    const getSessionData = useCallback(() => {
        return SessionService.getSessionData(buildSessionConfig(), state.sessionUid);
    }, [buildSessionConfig, state.sessionUid]);

    const restoreSession = useCallback((session: any, savedSessionUid?: string) => {
        SessionService.restoreSession(
            session,
            savedSessionUid,
            setters,
            { setSessionUid: stateSetters.setSessionUid, setError: stateSetters.setError }
        );
    }, [setters, stateSetters]);

    const handleSaveSession = useCallback(() => {
        const sessionData = getSessionData();
        SessionService.saveToFile(sessionData);
    }, [getSessionData]);

    const handleLoadSession = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const session = await SessionService.loadFromFile(file);
            restoreSession(session);
            stateSetters.setSessionName("Local File Session");
        } catch (err) {
            console.error("Failed to load session", err);
            stateSetters.setError("Failed to load session file. Invalid JSON.");
        }
        e.target.value = '';
    }, [restoreSession, stateSetters]);

    const handleCloudSave = useCallback(async () => {
        if (!SessionService.isCloudAvailable()) {
            await confirmService.alert({
                title: 'Firebase not configured',
                message: 'Please configure Firebase in Settings to enable cloud sync.',
                variant: 'warning'
            });
            return;
        }
        const name = prompt("Enter a name for this session snapshot:");
        if (!name) return;
        try {
            const sessionData = getSessionData();
            await SessionService.saveToCloud(sessionData, name);
            stateSetters.setSessionName(name);
            await confirmService.alert({
                title: 'Saved',
                message: 'Session saved to cloud!',
                variant: 'info'
            });
        } catch (e: any) {
            await confirmService.alert({
                title: 'Save failed',
                message: `Failed to save to cloud: ${e.message}`,
                variant: 'danger'
            });
        }
    }, [getSessionData, stateSetters]);

    const handleCloudLoadOpen = useCallback(async () => {
        if (!SessionService.isCloudAvailable()) {
            await confirmService.alert({
                title: 'Firebase not configured',
                message: 'Please configure Firebase in Settings to enable cloud sync.',
                variant: 'warning'
            });
            return;
        }
        setIsCloudLoading(true);
        setShowCloudLoadModal(true);
        try {
            const sessions = await SessionService.listCloudSessions();
            setCloudSessions(sessions);
        } catch (e: any) {
            await confirmService.alert({
                title: 'Fetch failed',
                message: `Failed to fetch sessions: ${e.message}`,
                variant: 'danger'
            });
            setShowCloudLoadModal(false);
        } finally {
            setIsCloudLoading(false);
        }
    }, []);

    const handleCloudSessionSelect = useCallback(async (session: FirebaseService.SavedSession) => {
        stateSetters.setSessionName(session.name);
        const savedSessionUid = (session as any).sessionUid;
        restoreSession(session.config || {}, savedSessionUid);
        setShowCloudLoadModal(false);

        // Sync existing log count from Firestore for this session
        if (savedSessionUid) {
            try {
                const stats = await FirebaseService.getDbStats(savedSessionUid);
                stateSetters.setDbStats(stats);
            } catch (e) {
                logger.warn("Failed to fetch session stats on load", e);
            }
        }
    }, [restoreSession, stateSetters]);

    const handleCloudSessionDelete = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const confirmDelete = await confirmService.confirm({
            title: 'Delete session?',
            message: 'Are you sure you want to delete this session? This cannot be undone.',
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'danger'
        });
        if (!confirmDelete) return;
        try {
            await SessionService.deleteFromCloud(id);
            setCloudSessions(prev => prev.filter(s => s.id !== id));
        } catch (e: any) {
            await confirmService.alert({
                title: 'Delete failed',
                message: `Failed to delete session: ${e.message}`,
                variant: 'danger'
            });
        }
    }, []);

    const startNewSession = useCallback(async () => {
        const newSessionConfig = {
            dataSourceMode: state.dataSourceMode,
            hfConfig: state.hfConfig,
            manualFileName: '', // This would need to be passed in or managed elsewhere
            environment: state.environment,
            appMode: state.appMode
        };

        const newUid = await SessionService.startNewSession(newSessionConfig, getSessionData);

        stateSetters.setSessionUid(newUid);
        stateSetters.setSessionName(null);
        stateSetters.setVisibleLogs([]);
        stateSetters.setTotalLogCount(0);
        stateSetters.setFilteredLogCount(0);
        stateSetters.setSparklineHistory([]);
        stateSetters.setDbStats({ total: 0, session: 0 });
    }, [state, getSessionData, stateSetters]);

    return {
        cloudState,
        buildSessionConfig,
        getSessionData,
        restoreSession,
        handleSaveSession,
        handleLoadSession,
        handleCloudSave,
        handleCloudLoadOpen,
        handleCloudSessionSelect,
        handleCloudSessionDelete,
        startNewSession
    };
}
