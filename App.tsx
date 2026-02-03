import { useState, useRef, useMemo, useEffect, useCallback } from 'react';

import {
    SynthLogItem, ProviderType, AppMode, ExternalProvider, ApiType,
    ProgressStats, HuggingFaceConfig, DetectedColumns, DEFAULT_HF_PREFETCH_CONFIG,
    EngineMode, DeepConfig, GenerationParams, UserAgentConfig,
    StreamingConversationState, SessionListFilters
} from './types';
import { EXTERNAL_PROVIDERS } from './constants';
import { PromptService } from './services/promptService';
import { LogStorageService } from './services/logStorageService';
import { SettingsService } from './services/settingsService';
import { TaskType } from './interfaces/enums';
import { HFPrefetchManager, PrefetchState } from './services/hfPrefetchService';
import { buildGenerationConfig as buildGenerationConfigService, GenerationService } from './services/generationService';
import { DataTransformService } from './services/dataTransformService';
import { SessionService } from './services/sessionService';
import { FileService } from './services/fileService';
import * as backendClient from './services/backendClient';
import { useLogManagement } from './hooks/useLogManagement';
import { DataSource, Environment, ProviderType as ProviderTypeEnum, ExternalProvider as ExternalProviderEnum, ApiType as ApiTypeEnum, AppView, ViewMode, DeepPhase, ResponderPhase, PromptCategory, PromptRole, FeedDisplayMode, ThemeMode } from './interfaces/enums';
import type { CompleteGenerationConfig, SessionData } from './interfaces';
import { SessionStatus, StorageMode } from './interfaces';
import { toast } from './services/toastService';
import { confirmService } from './services/confirmService';
import { useHuggingFace } from './hooks/useHuggingFace';
import { useOllama } from './hooks/useOllama';
import { useProviderSelection } from './hooks/useProviderSelection';
import { useSessionManagement } from './hooks/useSessionManagement';
import { useGenerationControl } from './hooks/useGenerationControl';
import { useFileHandlers } from './hooks/useFileHandlers';
import { useTopicGenerator } from './hooks/useTopicGenerator';
import { useGenerationActions } from './hooks/useGenerationActions';
import { useLogActions } from './hooks/useLogActions';
import { useDeepConfigActions } from './hooks/useDeepConfigActions';
import { useStreamingHandlers } from './hooks/useStreamingHandlers';
import { useDbStats } from './hooks/useDbStats';
import { usePromptLifecycle } from './hooks/usePromptLifecycle';
import { useFirebaseConfigInit } from './hooks/useFirebaseConfigInit';
import { useSettingsInit } from './hooks/useSettingsInit';
import { usePromptOptimization } from './hooks/usePromptOptimization';
import { usePauseRef } from './hooks/usePauseRef';
import { useVerboseLogging } from './hooks/useVerboseLogging';
import { useSparklineHistory } from './hooks/useSparklineHistory';
import { useRowContent } from './hooks/useRowContent';
import { useSyncedRef } from './hooks/useSyncedRef';
import { useFieldSelection } from './hooks/useFieldSelection';
import { useLogFeedRewriter } from './hooks/useLogFeedRewriter';
import AppOverlays from './components/layout/AppOverlays';
import FeedAnalyticsPanel from './components/layout/FeedAnalyticsPanel';
import VerifierPanel from './components/VerifierPanel';
import { useAppViewProps } from './hooks/useAppViewProps';
import { getInitialAppView, getInitialEnvironment, useAppRouting } from './hooks/useAppRouting';

// New Layout Components
import LayoutContainer from './components/LayoutContainer';
import LeftSidebar from './components/LeftSidebar';
import RightSidebar from './components/RightSidebar';
import ModeNavbar from './components/ModeNavbar';
import CreatorControls from './components/creator/CreatorControls';
import { sessionLoadService, SessionSummary } from './services/sessionLoadService';

// Session Management
import { useSessionManager } from './hooks/useSessionManager';
import { useSessionAutoSave } from './hooks/useSessionAutoSave';
import { useSessionAnalytics } from './hooks/useSessionAnalytics';

export default function App() {
    // --- State: Modes ---
    const [appView, setAppView] = useState<AppView>(getInitialAppView); // Top Level View
    const [appMode, setAppMode] = useState<AppMode>(AppMode.Generator);
    const [engineMode, setEngineMode] = useState<EngineMode>(EngineMode.Regular);
    const [environment, setEnvironment] = useState<Environment>(getInitialEnvironment);
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
        const settings = SettingsService.getSettings();
        return settings.theme ?? ThemeMode.Dark;
    });
    const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Feed);
    const [feedDisplayMode, setFeedDisplayMode] = useState<FeedDisplayMode>(FeedDisplayMode.Default);
    const [hasSessionStarted, setHasSessionStarted] = useState(false);

    const applyThemeMode = useCallback((mode: ThemeMode) => {
        const root = document.documentElement;
        const isDark = mode === ThemeMode.Dark;
        root.classList.toggle(ThemeMode.Dark, isDark);
        root.classList.toggle(ThemeMode.Light, !isDark);
        root.setAttribute('data-theme', mode);
    }, []);

    useEffect(() => {
        applyThemeMode(themeMode);
    }, [applyThemeMode, themeMode]);

    useEffect(() => {
        SettingsService.waitForSettingsInit().then(() => {
            const settings = SettingsService.getSettings();
            if (settings.theme && settings.theme !== themeMode) {
                setThemeMode(settings.theme);
            }
        });
    }, []);

    const handleThemeModeChange = useCallback((mode: ThemeMode) => {
        setThemeMode(mode);
        SettingsService.updateSettings({ theme: mode });
    }, []);

    // --- State: Session & DB ---
    const [sessionUid, setSessionUid] = useState<string>('');
    const sessionUidRef = useSyncedRef(sessionUid);
    const [pendingRouteSessionId, setPendingRouteSessionId] = useState<string | null>(null);
    const loadingRouteSessionRef = useRef<string | null>(null);

    // Memoize routing callbacks to prevent unnecessary re-renders
    const handleSessionNavigate = useCallback((sessionId: string) => {
        setPendingRouteSessionId(sessionId);
    }, []);

    const handleSessionRouteClear = useCallback(() => {
        setPendingRouteSessionId(null);
    }, []);

    useAppRouting({
        appView,
        environment,
        sessionUid,
        includeSessionUid: hasSessionStarted,
        setAppView,
        setEnvironment,
        onSessionNavigate: handleSessionNavigate,
        onSessionRouteClear: handleSessionRouteClear
    });

    // --- State: Layout & Sessions ---
    const [isLeftSidebarOpen, setLeftSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setRightSidebarOpen] = useState(true);
    const [isVerifierAssistantOpen, setVerifierAssistantOpen] = useState(true);
    const [sessionsList, setSessionsList] = useState<SessionData[]>([]);
    const [sessionFilters, setSessionFilters] = useState<SessionListFilters>({
        search: '',
        onlyWithLogs: false,
        minRows: null,
        maxRows: null,
        appMode: null,
        engineMode: null,
        model: ''
    });
    const [hasMoreSessions, setHasMoreSessions] = useState(false);
    const [isLoadingMoreSessions, setIsLoadingMoreSessions] = useState(false);

    const refreshSessionsList = useCallback(async () => {
        sessionLoadService.clearCache();
        const list = await sessionLoadService.loadSessionList(true, environment, sessionFilters);
        setSessionsList(list);
        setHasMoreSessions(sessionLoadService.hasMoreSessions());
    }, [environment, sessionFilters]);

    const handleSessionFiltersChange = useCallback((next: SessionListFilters) => {
        setSessionFilters(next);
    }, []);

    const handleLoadMoreSessions = useCallback(async () => {
        if (isLoadingMoreSessions) return;
        setIsLoadingMoreSessions(true);
        try {
            const more = await sessionLoadService.loadMoreSessions(environment, sessionFilters);
            if (more.length > 0) {
                setSessionsList(prev => [...prev, ...more]);
            }
            setHasMoreSessions(sessionLoadService.hasMoreSessions());
        } finally {
            setIsLoadingMoreSessions(false);
        }
    }, [environment, isLoadingMoreSessions, sessionFilters]);

    const maxSessionTextLength = Number(import.meta.env.VITE_SESSION_MAX_TEXT_LEN || 10000);
    const sanitizeSessionForBackend = useCallback((session: SessionData): SessionData => {
        const sanitized: SessionData = { ...session };
        delete (sanitized as unknown as { logs?: unknown }).logs;
        delete (sanitized as unknown as { items?: unknown }).items;
        delete (sanitized as unknown as { rows?: unknown }).rows;
        delete (sanitized as unknown as { data?: unknown }).data;
        delete (sanitized as unknown as { messages?: unknown }).messages;
        delete (sanitized as unknown as { visibleLogs?: unknown }).visibleLogs;

        if (sanitized.config) {
            const configCopy = { ...sanitized.config };
            if (configCopy.converterInputText && configCopy.converterInputText.length > maxSessionTextLength) {
                delete configCopy.converterInputText;
            }
            sanitized.config = configCopy;
        }
        if (sanitized.dataset) {
            if (sanitized.dataset.type === DataSource.Manual) {
                sanitized.dataset = {
                    type: sanitized.dataset.type,
                    path: sanitized.dataset.path
                };
            } else {
                const datasetCopy: SessionData['dataset'] = {
                    type: sanitized.dataset.type,
                    hfConfig: sanitized.dataset.hfConfig ? {
                        dataset: sanitized.dataset.hfConfig.dataset,
                        config: sanitized.dataset.hfConfig.config,
                        split: sanitized.dataset.hfConfig.split,
                        columnName: sanitized.dataset.hfConfig.columnName,
                        inputColumns: sanitized.dataset.hfConfig.inputColumns,
                        outputColumns: sanitized.dataset.hfConfig.outputColumns,
                        reasoningColumns: sanitized.dataset.hfConfig.reasoningColumns,
                        mcqColumn: sanitized.dataset.hfConfig.mcqColumn,
                        messageTurnIndex: sanitized.dataset.hfConfig.messageTurnIndex,
                        maxMultiTurnTraces: sanitized.dataset.hfConfig.maxMultiTurnTraces
                    } : undefined
                };
                sanitized.dataset = datasetCopy;
            }
        }
        return sanitized;
    }, [maxSessionTextLength]);

    useEffect(() => {
        refreshSessionsList();
    }, [refreshSessionsList]);

    const [sessionName, setSessionName] = useState<string | null>(null);
    const sessionNameRef = useSyncedRef(sessionName);

    const [dbStats, setDbStats] = useState<{ total: number, session: number }>({ total: 0, session: 0 });
    const [sparklineHistory, setSparklineHistory] = useState<number[]>([]);

    // ... (Rest of state declarations identical to previous file, omitted for brevity but conceptually present) ...
    // --- State: Regular Config ---
    const [provider, setProvider] = useState<ProviderType>(ProviderTypeEnum.Gemini);
    const [externalProvider, setExternalProvider] = useState<ExternalProvider>(ExternalProviderEnum.OpenRouter);
    const [apiType, setApiType] = useState<ApiType>(ApiTypeEnum.Chat); // 'chat' or 'responses'
    const [externalApiKey, setExternalApiKey] = useState('');
    const [externalModel, setExternalModel] = useState('anthropic/claude-3.5-sonnet');
    const [customBaseUrl, setCustomBaseUrl] = useState('');

    const {
        ollamaModels,
        ollamaStatus,
        ollamaLoading,
        refreshOllamaModels
    } = useOllama({ externalProvider, externalModel, setExternalModel });

    // --- State: Generation Params ---
    const [generationParams, setGenerationParams] = useState<GenerationParams>({});

    // --- State: Deep Config ---
    const [deepConfig, setDeepConfig] = useState<DeepConfig>({
        phases: {
            meta: {
                id: DeepPhase.Meta, enabled: true, provider: ProviderTypeEnum.Gemini, externalProvider: ExternalProviderEnum.OpenRouter, apiType: ApiTypeEnum.Chat, apiKey: '', model: 'gemini-3-flash-preview', customBaseUrl: '', systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Meta), structuredOutput: true
            },
            retrieval: {
                id: DeepPhase.Retrieval, enabled: true, provider: ProviderTypeEnum.Gemini, externalProvider: ExternalProviderEnum.OpenRouter, apiType: ApiTypeEnum.Chat, apiKey: '', model: 'gemini-3-flash-preview', customBaseUrl: '', systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Retrieval), structuredOutput: true
            },
            derivation: {
                id: DeepPhase.Derivation, enabled: true, provider: ProviderTypeEnum.Gemini, externalProvider: ExternalProviderEnum.OpenRouter, apiType: ApiTypeEnum.Chat, apiKey: '', model: 'gemini-3-flash-preview', customBaseUrl: '', systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Derivation), structuredOutput: true
            },
            writer: {
                id: DeepPhase.Writer, enabled: true, provider: ProviderTypeEnum.Gemini, externalProvider: ExternalProviderEnum.OpenRouter, apiType: ApiTypeEnum.Chat, apiKey: '', model: 'gemini-3-flash-preview', customBaseUrl: '', systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Writer), structuredOutput: true
            },
            rewriter: {
                id: DeepPhase.Rewriter, enabled: false, provider: ProviderTypeEnum.Gemini, externalProvider: ExternalProviderEnum.OpenRouter, apiType: ApiTypeEnum.Chat, apiKey: '', model: 'gemini-3-flash-preview', customBaseUrl: '', systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Rewriter), structuredOutput: true
            }
        }
    });

    const [concurrency, setConcurrency] = useState(1);
    const [rowsToFetch, setRowsToFetch] = useState(10);
    const [skipRows, setSkipRows] = useState(0);

    // Rate Limits & Retry Config
    const [sleepTime, setSleepTime] = useState(500); // ms
    const [maxRetries, setMaxRetries] = useState(5);
    const [retryDelay, setRetryDelay] = useState(2000); // ms


    // --- State: Multi-Turn Conversation ---
    const [userAgentConfig, setUserAgentConfig] = useState<UserAgentConfig>({
        enabled: false,
        followUpCount: 2,
        responderPhase: ResponderPhase.Responder,
        provider: ProviderTypeEnum.Gemini,
        externalProvider: ExternalProviderEnum.OpenRouter,
        apiKey: '',
        model: 'gemini-3-flash-preview',
        customBaseUrl: '',
        systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.UserAgent),
        structuredOutput: true
    });

    // --- State: Conversation Trace Rewriting ---
    // When enabled, processes existing conversation columns and rewrites <think> content
    const [conversationRewriteMode, setConversationRewriteMode] = useState(false);


    // --- State: Data Source ---
    const [dataSourceMode, setDataSourceMode] = useState<DataSource>(DataSource.HuggingFace);

    // 1. Synthetic
    const [geminiTopic, setGeminiTopic] = useState('Advanced Quantum Mechanics');
    const [topicCategory, setTopicCategory] = useState('Random (Any)');
    const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);

    // 2. Hugging Face
    const [hfConfig, setHfConfig] = useState<HuggingFaceConfig>({
        dataset: 'fka/awesome-chatgpt-prompts',
        config: 'default',
        split: 'train',
        columnName: '',
        inputColumns: [],
        outputColumns: [],
        messageTurnIndex: 0,
        prefetchConfig: { ...DEFAULT_HF_PREFETCH_CONFIG }
    });

    // Prefetch manager for HF data
    const prefetchManagerRef = useRef<HFPrefetchManager | null>(null);
    const [prefetchState, setPrefetchState] = useState<PrefetchState | null>(null);


    // 3. Manual Input
    const [converterInputText, setConverterInputText] = useState('');
    const [manualFileName, setManualFileName] = useState('');

    // --- State: Cloud Session Management ---
    const [showCloudLoadModal, setShowCloudLoadModal] = useState(false);
    const [cloudSessions, setCloudSessions] = useState<SessionData[]>([]);
    const [isCloudLoading, setIsCloudLoading] = useState(false);

    // --- State: Task Classification / Auto-routing ---
    const [detectedTaskType, setDetectedTaskType] = useState<TaskType | null>(null);
    const [autoRoutedPromptSet, setAutoRoutedPromptSet] = useState<string | null>(null);

    // --- State: Session-level Prompt Set (overrides user preferences for this session only) ---
    const [sessionPromptSet, setSessionPromptSet] = useState<string | null>(null);
    const [availablePromptSets, setAvailablePromptSets] = useState<string[]>([]);

    // --- State: Hugging Face Prefetch ---
    const [availableColumns, setAvailableColumns] = useState<string[]>([]);
    const [detectedColumns, setDetectedColumns] = useState<DetectedColumns>({ input: [], output: [], all: [], reasoning: [] });
    const [hfPreviewData, setHfPreviewData] = useState<any[]>([]);
    const [hfTotalRows, setHfTotalRows] = useState<number>(0);

    // --- State: Progressive conversation streaming (supports concurrent requests) ---
    const [streamingConversationsVersion, setStreamingConversationsVersion] = useState(0);
    const streamingConversationsRef = useRef<Map<string, StreamingConversationState>>(new Map());
    const streamingAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
    const haltedStreamingIdsRef = useRef<Set<string>>(new Set());
    const streamUpdateThrottleRef = useRef<number>(0);

    // --- State: Streaming mode toggle ---
    const [isStreamingEnabled, setIsStreamingEnabled] = useState<boolean>(true);

    const [isRunning, setIsRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [progress, setProgress] = useState<ProgressStats>({ current: 0, total: 0, activeWorkers: 0 });
    const [error, setError] = useState<string | null>(null);
    const [showOverwriteModal, setShowOverwriteModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Retry State
    const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
    // DB save tracking state
    const [savingToDbIds, setSavingToDbIds] = useState<Set<string>>(new Set());

    // UI State for Deep Config
    const [activeDeepTab, setActiveDeepTab] = useState<DeepPhase>(DeepPhase.Meta);

    const abortControllerRef = useRef<AbortController | null>(null);
    const isPausedRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sourceFileInputRef = useRef<HTMLInputElement>(null);
    const environmentRef = useRef(environment);
    const generationServiceRef = useRef<GenerationService | null>(null);

    // Column detection - delegated to DataTransformService
    const detectColumns = DataTransformService.detectColumns;

    const {
        hfSearchResults,
        isSearchingHF,
        hfStructure,
        showHFResults,
        setShowHFResults,
        isPrefetching,
        isLoadingHfPreview,
        prefetchColumns,
        handleHFSearch,
        handleSelectHFDataset,
        handleConfigChange,
        handleSplitChange,
        handleDataSourceModeChange
    } = useHuggingFace({
        hfConfig,
        setHfConfig,
        setError,
        setAvailableColumns,
        setDetectedColumns,
        setDataSourceMode,
        setHfPreviewData,
        setHfTotalRows,
        detectColumns
    });

    // --- State: Runtime ---
    const [systemPrompt, setSystemPrompt] = useState(PromptService.getPrompt(PromptCategory.Generator, PromptRole.System));
    const [converterPrompt, setConverterPrompt] = useState(PromptService.getPrompt(PromptCategory.Converter, PromptRole.System));

    // --- State: Field Selection ---
    // Get schema for current prompt to determine available fields
    const currentPromptSchema = PromptService.getPromptSchema(
        appMode === AppMode.Generator ? PromptCategory.Generator : PromptCategory.Converter,
        PromptRole.System,
        sessionPromptSet || undefined
    );

    const fieldSelection = useFieldSelection({
        promptSetId: sessionPromptSet || 'default',
        category: appMode === AppMode.Generator ? PromptCategory.Generator : PromptCategory.Converter,
        role: PromptRole.System,
        outputFields: currentPromptSchema.output || [],
        resetOnPromptChange: true
    });

    const handleToggleNativeOutput = (value: boolean) => {
        setGenerationParams(prev => ({
            ...prev,
            useNativeOutput: value
        }));
    };

    // Update generationParams when field selection changes
    const handleGenerationParamsChange = (params: GenerationParams) => {
        setGenerationParams(prev => ({
            ...prev,
            ...params,
            selectedFields: fieldSelection.selectedFields
        }));
    };

    // Sync field selection changes to generationParams
    useEffect(() => {
        // Always update generationParams when fieldSelection changes
        // This handles both initial setup and when user checks/unchecks fields
        const currentSelected = generationParams.selectedFields || [];
        const newSelected = fieldSelection.selectedFields;

        // Only update if arrays are different
        const hasChanged = currentSelected.length !== newSelected.length ||
            !currentSelected.every((field, idx) => field === newSelected[idx]);

        if (hasChanged) {
            setGenerationParams(prev => ({
                ...prev,
                selectedFields: newSelected
            }));
        }
    }, [fieldSelection.selectedFields]);

    // Log Management Hook
    const logManagement = useLogManagement({ sessionUid, environment });

    const {
        visibleLogs,
        totalLogCount,
        filteredLogCount,
        hasInvalidLogs,
        currentPage,
        logFilter,
        showLatestOnly,
        feedPageSize,
        isLoading: isLoadingLogs,
        setLogFilter,
        setShowLatestOnly,
        setFeedPageSize,
        refreshLogs,
        handlePageChange,
        handleDeleteLog: handleDeleteLogFromLogs,
        updateLog,
        isInvalidLog,
        getUnsavedCount,
        setVisibleLogs,
        setTotalLogCount,
        setFilteredLogCount,
        setLogsTrigger
    } = logManagement;

    // Feed Rewriter Hook
    const feedRewriter = useLogFeedRewriter({ onUpdateLog: updateLog });

    const resetSessionState = useCallback(() => {
        setSessionUid('');
        setSessionName(null);
        setHasSessionStarted(false);
        setDbStats({ total: 0, session: 0 });
        setVisibleLogs([]);
        setTotalLogCount(0);
        setFilteredLogCount(0);
        setSparklineHistory([]);
    }, [
        setSessionUid,
        setSessionName,
        setHasSessionStarted,
        setDbStats,
        setVisibleLogs,
        setTotalLogCount,
        setFilteredLogCount,
        setSparklineHistory
    ]);

    const handleAppViewChange = useCallback((mode: AppView) => {
        if (mode === appView) {
            return;
        }
        setAppView(mode);
        resetSessionState();
    }, [appView, resetSessionState]);

    const previousEnvironmentRef = useRef(environment);
    useEffect(() => {
        if (previousEnvironmentRef.current !== environment) {
            resetSessionState();
            setSessionsList([]);
            previousEnvironmentRef.current = environment;
        }
    }, [environment, resetSessionState]);

    // Session Management
    const sessionManager = useSessionManager({
        environment,
        onSessionChange: (session) => {
            if (session) {
                if (!sessionUid) {
                    setSessionUid(session.sessionUid || session.id);
                    setSessionName(session.name);
                }
            }
        }
    });

    // Live session data for auto-save
    const currentFullSession = useMemo(() => {
        const config = SessionService.buildSessionConfig({
            appMode,
            engineMode,
            environment,
            provider,
            externalProvider,
            externalApiKey,
            externalModel,
            customBaseUrl,
            deepConfig,
            userAgentConfig,
            concurrency,
            rowsToFetch,
            skipRows,
            sleepTime,
            maxRetries,
            retryDelay,
            feedPageSize,
            dataSourceMode,
            hfConfig,
            geminiTopic,
            topicCategory,
            systemPrompt,
            converterPrompt,
            conversationRewriteMode,
            converterInputText,
            generationParams
        });
        return SessionService.getSessionData(config, sessionUid);
    }, [
        appMode, engineMode, environment, provider, externalProvider, externalApiKey, externalModel, customBaseUrl,
        deepConfig, userAgentConfig, concurrency, rowsToFetch, skipRows, sleepTime, maxRetries, retryDelay,
        feedPageSize, dataSourceMode, hfConfig, geminiTopic, topicCategory, systemPrompt, converterPrompt,
        conversationRewriteMode, converterInputText, generationParams, sessionUid
    ]);

    // Memoized auto-save callback to prevent timeout cancellation from re-renders
    const handleAutoSave = useCallback(async (savedSession: SessionData) => {
        // Create full SessionData with consistent id (sessionUid is the storage key)
        const fullSessionData: SessionData = {
            ...savedSession,
            id: sessionUid, // Use sessionUid as the storage key
            sessionUid: sessionUid,
            name: sessionName || savedSession.name || 'Untitled Session',
            updatedAt: Date.now(),
            createdAt: savedSession.createdAt || new Date().toISOString(),
            itemCount: savedSession.itemCount || 0,
            analytics: savedSession.analytics || {
                totalItems: 0,
                completedItems: 0,
                errorCount: 0,
                totalTokens: 0,
                totalCost: 0,
                avgResponseTime: 0,
                successRate: 0,
                lastUpdated: Date.now()
            },
            dataset: savedSession.dataset || (hfConfig?.dataset ? {
                type: dataSourceMode,
                hfConfig: hfConfig
            } : undefined),
            storageMode: environment === Environment.Production ? StorageMode.Cloud : StorageMode.Local,
            status: savedSession.status || SessionStatus.Idle,
            version: savedSession.version || 2
        };

        // Handle cloud save or local save
        if (environment === Environment.Production) {
            // Prefer backend API if enabled
            if (backendClient.isBackendEnabled() && sessionUid) {
                try {
                    const payload = sanitizeSessionForBackend(fullSessionData);
                    await backendClient.updateSession(sessionUid, payload as unknown as Record<string, unknown>);
                } catch (e) {
                    console.error("Auto-save to backend failed", e);
                }
            } else if (SessionService.isCloudAvailable()) {
                // Fall back to direct Firebase if backend not available
                try {
                    await SessionService.saveToCloud(fullSessionData, fullSessionData.name);
                } catch (e) {
                    console.error("Auto-save to cloud failed", e);
                }
            }
        } else {
            // Handle local save via IndexedDBUtils - save full SessionData directly
            try {
                const IndexedDBUtils = await import('./services/session/indexedDBUtils');
                await IndexedDBUtils.saveSession(fullSessionData);
            } catch (e) {
                console.error("Auto-save to local DB failed", e);
            }
        }

        // Refresh session list to show updated timestamp/name
        try {
            const list = await sessionLoadService.loadSessionList(true, environment, sessionFilters);
            setSessionsList(list);
        } catch (e) {
            console.error("Failed to refresh session list", e);
        }
    }, [environment, sessionUid, sessionName, appMode, hfConfig, sessionFilters]);

    // Auto-save current session
    useSessionAutoSave({
        session: currentFullSession as any, // Cast to avoid legacy type conflict if any
        enabled: hasSessionStarted,
        debounceMs: 2000,
        disableDefaultPersistence: true,
        onSave: handleAutoSave
    });

    // --- Session Analytics ---
    useSessionAnalytics({
        session: sessionManager.currentSession,
        items: visibleLogs,
        enabled: true,
        cacheTTL: 5 * 60 * 1000, // 5 minutes
        autoUpdate: true
    });

    const invalidLogCount = useMemo(() => {
        return visibleLogs.filter((log: SynthLogItem) => isInvalidLog(log)).length;
    }, [visibleLogs, isInvalidLog]);

    const { handleProviderSelect } = useProviderSelection({
        setProvider,
        setExternalProvider,
        setExternalApiKey,
        setExternalModel,
        setCustomBaseUrl
    });

    const { handleOptimizePrompt } = usePromptOptimization({
        appMode,
        systemPrompt,
        converterPrompt,
        setSystemPrompt,
        setConverterPrompt,
        setError,
        setIsOptimizing
    });

    usePauseRef({ isPaused, isPausedRef });

    const { refreshPrompts } = usePromptLifecycle({
        sessionPromptSet,
        setAvailablePromptSets,
        setSystemPrompt,
        setConverterPrompt,
        setDeepConfig,
        setUserAgentConfig
    });

    const {
        bumpStreamingConversations,
        scheduleStreamingUpdate,
        haltStreamingItem
    } = useStreamingHandlers({
        setStreamingConversationsVersion,
        streamUpdateThrottleRef,
        haltedStreamingIdsRef,
        streamingAbortControllersRef,
        streamingConversationsRef
    });

    useVerboseLogging({ environment, environmentRef });

    const { updateDbStats } = useDbStats({
        environment,
        sessionUid,
        setDbStats
    });

    useFirebaseConfigInit({ updateDbStats });

    useSparklineHistory({
        isRunning,
        progress,
        setSparklineHistory
    });

    const getRowContent = useRowContent({ hfConfig, appMode });



    const { generateRandomTopic } = useTopicGenerator({
        topicCategory,
        setGeminiTopic,
        setIsGeneratingTopic,
        setError
    });

    const {
        handleLoadRubric,
        handleLoadSourceFile,
        handleSaveRubric
    } = useFileHandlers({
        appMode,
        systemPrompt,
        converterPrompt,
        setSystemPrompt,
        setConverterPrompt,
        setError,
        setManualFileName,
        setConverterInputText,
        setRowsToFetch,
        setAvailableColumns,
        setDetectedColumns,
        setHfConfig,
        hfConfig,
        detectColumns
    });

    const { updateDeepPhase, copyDeepConfigToAll } = useDeepConfigActions({
        deepConfig,
        setDeepConfig,
        setUserAgentConfig
    });

    // Helper to build SessionConfig from current state
    const getSessionData = () => {
        const sessionConfig = SessionService.buildSessionConfig({
            appMode,
            engineMode,
            environment,
            provider,
            externalProvider,
            externalApiKey,
            externalModel,
            customBaseUrl,
            deepConfig,
            userAgentConfig,
            concurrency,
            rowsToFetch,
            skipRows,
            sleepTime,
            maxRetries,
            retryDelay,
            feedPageSize,
            dataSourceMode,
            hfConfig,
            geminiTopic,
            topicCategory,
            systemPrompt,
            converterPrompt,
            conversationRewriteMode,
            converterInputText,
            generationParams
        });

        return SessionService.getSessionData(sessionConfig, sessionUid);
    };

    const sessionSetters = useMemo(() => ({
        setAppMode,
        setEngineMode,
        setEnvironment,
        setProvider,
        setExternalProvider,
        setExternalApiKey,
        setExternalModel,
        setCustomBaseUrl,
        setDeepConfig,
        setUserAgentConfig,
        setConcurrency,
        setRowsToFetch,
        setSkipRows,
        setSleepTime,
        setMaxRetries,
        setRetryDelay,
        setFeedPageSize,
        setDataSourceMode,
        setHfConfig,
        setGeminiTopic,
        setTopicCategory,
        setSystemPrompt,
        setConverterPrompt,
        setConversationRewriteMode,
        setConverterInputText,
        setGenerationParams
    }), []);

    const handleSessionLoaded = useCallback(() => {
        setHasSessionStarted(true);
    }, []);

    const {
        handleSaveSession,
        handleLoadSession,
        handleCloudSave,
        handleCloudLoadOpen,
        handleCloudSessionSelect,
        handleCloudSessionDelete
    } = useSessionManagement({
        setSessionUid,
        setSessionName,
        setError,
        setShowCloudLoadModal,
        setIsCloudLoading,
        setCloudSessions,
        setDbStats,
        getSessionData,
        setters: sessionSetters,
        onSessionLoaded: handleSessionLoaded
    });

    useEffect(() => {
        if (!pendingRouteSessionId) {
            return;
        }

        // Prevent duplicate loads for the same session
        if (loadingRouteSessionRef.current === pendingRouteSessionId) {
            return;
        }
        loadingRouteSessionRef.current = pendingRouteSessionId;

        let isActive = true;
        const resolveSessionFromRoute = async () => {
            try {
                const session = sessionsList.find(
                    (item) => item.id === pendingRouteSessionId || item.sessionUid === pendingRouteSessionId
                );
                if (session) {
                    await handleCloudSessionSelect(session as any, { preserveEnvironment: true });
                    return;
                }

                const loadedSession = await sessionLoadService.loadSessionDetails(pendingRouteSessionId);
                if (loadedSession) {
                    await handleCloudSessionSelect(loadedSession as any, { preserveEnvironment: true });
                    return;
                }

                toast.warning('Session not found for the current route.');
            } finally {
                if (isActive) {
                    setPendingRouteSessionId(null);
                    loadingRouteSessionRef.current = null;
                }
            }
        };

        resolveSessionFromRoute();

        return () => {
            isActive = false;
        };
    }, [handleCloudSessionSelect, pendingRouteSessionId, sessionsList]);

    // --- Core Generation Logic ---
    // Build configuration for GenerationService
    const buildGenerationConfig = (): CompleteGenerationConfig => {
        const dataSourceModeValue = dataSourceMode;

        const engineModeValue = engineMode;
        const appModeValue = appMode;
        const environmentValue = environment;
        const providerValue = provider;
        const externalProviderValue = externalProvider;
        const apiTypeValue = apiType;

        return buildGenerationConfigService({
            // Mode settings
            appMode: appModeValue,
            engineMode: engineModeValue,
            environment: environmentValue,

            // Data source
            dataSourceMode: dataSourceModeValue,
            hfConfig,
            converterInputText,
            manualFileName,
            geminiTopic,

            // Provider settings
            provider: providerValue,
            externalProvider: externalProviderValue,
            apiType: apiTypeValue,
            customBaseUrl,
            apiKey: externalApiKey,
            externalApiKey,
            model: externalModel,
            externalModel,

            // Generation params
            rowsToFetch,
            skipRows,
            concurrency,
            sleepTime,
            maxRetries,
            retryDelay,

            // Session
            sessionUid,
            sessionName,
            sessionPromptSet,

            // Prompts
            systemPrompt,
            converterPrompt,

            // Deep config
            deepConfig,

            // User agent config
            userAgentConfig,

            // Modes
            conversationRewriteMode,
            isStreamingEnabled,

            // Generation params
            generationParams,

            // Callbacks
            setError,
            setIsRunning,
            setProgress,
            setSessionUid,
            setSessionName,
            setVisibleLogs,
            setTotalLogCount,
            setFilteredLogCount,
            setSparklineHistory,
            setPrefetchState,
            setDetectedTaskType,
            setAutoRoutedPromptSet,
            setSystemPrompt,
            setConverterPrompt,
            setDeepConfig,
            refreshLogs,
            updateDbStats,
            scheduleStreamingUpdate,
            bumpStreamingConversations,
            setLogsTrigger,

            // Refs
            abortControllerRef,
            prefetchManagerRef,
            sessionUidRef,
            sessionNameRef,
            environmentRef,
            isPausedRef,
            streamingConversationsRef,
            streamingAbortControllersRef,
            haltedStreamingIdsRef,

            // Functions
            currentPage,
            getRowContent,
            getSessionData
        });
    };

    const {
        retryItem,
        retrySave,
        retryAllFailed,
        syncAllUnsavedToDb,
        saveItemToDb,
        startNewSession
    } = useGenerationActions({
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
    });

    const {
        startGeneration,
        stopGeneration,
        pauseGeneration,
        resumeGeneration
    } = useGenerationControl({
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
    });

    const handleStartGeneration = useCallback((append: boolean) => {
        setHasSessionStarted(true);
        startGeneration(append);
    }, [startGeneration]);

    const handleStartSession = useCallback(() => {
        if (totalLogCount > 0) {
            setShowOverwriteModal(true);
            return;
        }
        handleStartGeneration(false);
    }, [handleStartGeneration, setShowOverwriteModal, totalLogCount]);

    const handleStartNewSession = useCallback(async () => {
        setHasSessionStarted(false);
        await startNewSession();
    }, [startNewSession]);

    const { handleDeleteLog } = useLogActions({
        environment,
        visibleLogs,
        streamingConversationsRef,
        bumpStreamingConversations,
        handleDeleteLogFromLogs,
        updateDbStats
    });

    useEffect(() => {
        if (hasSessionStarted) return;
        const matchesExisting = sessionsList.some(session => session.id === sessionUid || session.sessionUid === sessionUid);
        if (matchesExisting) {
            setHasSessionStarted(true);
        }
    }, [hasSessionStarted, sessionUid, sessionsList]);

    const exportJsonl = async () => {
        await FileService.exportJsonl({
            totalLogCount,
            sessionUid,
            confirmService,
            toast,
            logStorageService: LogStorageService
        });
    };

    useSettingsInit({ refreshPrompts });

    const {
        sidebarProps,
        feedProps
    } = useAppViewProps({
        sessionName,
        environment,
        onLoadSession: handleLoadSession,
        onSaveSession: handleSaveSession,
        onCloudLoadOpen: handleCloudLoadOpen,
        onCloudSave: handleCloudSave,
        appMode,
        onAppModeChange: setAppMode,
        isRunning,
        isPaused,
        progress,
        dataSourceMode,
        prefetchState,
        error,
        isStreamingEnabled,
        onStreamingChange: setIsStreamingEnabled,
        onStart: handleStartSession,
        onPause: pauseGeneration,
        onResume: resumeGeneration,
        onStop: stopGeneration,
        totalLogCount,
        invalidLogCount,
        detectedTaskType,
        autoRoutedPromptSet,
        showMiniDbPanel: environment === Environment.Production,
        dbStats,
        sparklineHistory,
        unsavedCount: getUnsavedCount(),
        onSyncAll: syncAllUnsavedToDb,
        onRetryAllFailed: retryAllFailed,
        onStartNewSession: handleStartNewSession,
        engineMode,
        onEngineModeChange: setEngineMode,
        sessionPromptSet,
        onSessionPromptSetChange: setSessionPromptSet,
        availablePromptSets,
        provider,
        externalProvider,
        externalModel,
        apiType,
        externalApiKey,
        customBaseUrl,
        externalProviders: EXTERNAL_PROVIDERS,
        onProviderSelect: handleProviderSelect,
        onApiTypeChange: setApiType,
        onExternalModelChange: setExternalModel,
        onExternalApiKeyChange: setExternalApiKey,
        onCustomBaseUrlChange: setCustomBaseUrl,
        ollamaStatus,
        ollamaModels,
        ollamaLoading,
        onRefreshOllamaModels: refreshOllamaModels,
        modelSelectorProvider: provider === ProviderTypeEnum.Gemini ? ProviderTypeEnum.Gemini : externalProvider,
        modelSelectorApiKey: provider === ProviderTypeEnum.Gemini
            ? SettingsService.getApiKey('gemini')
            : (externalApiKey || SettingsService.getApiKey(externalProvider)),
        modelSelectorPlaceholder: provider === ProviderTypeEnum.Gemini ? 'gemini-2.0-flash-exp' : 'Select or enter model',
        defaultCustomBaseUrl: SettingsService.getCustomBaseUrl(),
        generationParams: {
            ...generationParams,
            selectedFields: fieldSelection.selectedFields
        },
        onGenerationParamsChange: handleGenerationParamsChange,
        systemPrompt,
        converterPrompt,
        onSystemPromptChange: setSystemPrompt,
        onConverterPromptChange: setConverterPrompt,
        outputFields: fieldSelection.availableFields,
        selectedFields: fieldSelection.selectedFields,
        onFieldToggle: fieldSelection.toggleField,
        onResetFieldSelection: fieldSelection.resetToDefault,
        onSelectAllFields: fieldSelection.selectAll,
        onDeselectAllFields: fieldSelection.deselectAll,
        useNativeOutput: generationParams.useNativeOutput ?? false,
        onToggleNativeOutput: handleToggleNativeOutput,
        onLoadRubric: handleLoadRubric,
        onSaveRubric: handleSaveRubric,
        onOptimizePrompt: handleOptimizePrompt,
        isOptimizing,
        fileInputRef,
        hfConfig,
        onHfConfigChange: setHfConfig,
        activeDeepTab,
        onActiveDeepTabChange: setActiveDeepTab,
        deepConfig,
        onUpdatePhase: updateDeepPhase,
        onCopyToAll: copyDeepConfigToAll,
        conversationRewriteMode,
        onConversationRewriteModeChange: setConversationRewriteMode,
        onDisableUserAgent: () => setUserAgentConfig(prev => ({ ...prev, enabled: false })),
        userAgentConfig,
        onUserAgentConfigChange: setUserAgentConfig,
        concurrency,
        onConcurrencyChange: setConcurrency,
        sleepTime,
        onSleepTimeChange: setSleepTime,
        maxRetries,
        onMaxRetriesChange: setMaxRetries,
        retryDelay,
        onRetryDelayChange: setRetryDelay,
        topicCategory,
        onTopicCategoryChange: setTopicCategory,
        isGeneratingTopic,
        onGenerateRandomTopic: generateRandomTopic,
        geminiTopic,
        onGeminiTopicChange: setGeminiTopic,
        rowsToFetch,
        onRowsToFetchChange: setRowsToFetch,
        skipRows,
        onSkipRowsChange: setSkipRows,
        hfStructure,
        hfSearchResults,
        isSearchingHF,
        showHFResults,
        setShowHFResults,
        onHFSearch: handleHFSearch,
        onSelectHFDataset: handleSelectHFDataset,
        onConfigChange: handleConfigChange,
        onSplitChange: handleSplitChange,
        prefetchColumns,
        isPrefetching,
        availableColumns,
        detectedColumns,
        hfTotalRows,
        hfPreviewData,
        isLoadingHfPreview,
        onClearHfPreview: () => setHfPreviewData([]),
        converterInputText,
        setConverterInputText,
        setRowsToFetch,
        sourceFileInputRef,
        onLoadSourceFile: handleLoadSourceFile,
        onDataSourceModeChange: handleDataSourceModeChange,
        viewMode,
        logFilter,
        hasInvalidLogs,
        showLatestOnly,
        feedPageSize,
        feedDisplayMode,
        onViewModeChange: setViewMode,
        onLogFilterChange: setLogFilter,
        onShowLatestOnlyChange: setShowLatestOnly,
        onFeedPageSizeChange: setFeedPageSize,
        onFeedDisplayModeChange: setFeedDisplayMode,
        visibleLogs,
        filteredLogCount,
        currentPage,
        onPageChange: handlePageChange,
        onRetry: retryItem,
        onRetrySave: retrySave,
        onSaveToDb: saveItemToDb,
        onDelete: handleDeleteLog,
        onHalt: haltStreamingItem,
        retryingIds,
        savingIds: savingToDbIds,
        streamingConversations: streamingConversationsRef.current,
        streamingVersion: streamingConversationsVersion,
        sessionUid,
        isLoadingLogs,
        // Feed editing props
        editingField: feedRewriter.editingField,
        editValue: feedRewriter.editValue,
        onStartEditing: feedRewriter.startEditing,
        onSaveEditing: feedRewriter.saveEditing,
        onCancelEditing: feedRewriter.cancelEditing,
        onEditValueChange: feedRewriter.setEditValue,
        rewritingField: feedRewriter.rewritingField,
        streamingContent: feedRewriter.streamingContent,
        onRewrite: (itemId: string, field: any) => {
            const log = visibleLogs.find(l => l.id === itemId);
            if (log) {
                const currentValue = field === 'query' ? log.query :
                    field === 'reasoning' ? log.reasoning :
                        log.answer;
                feedRewriter.handleRewrite(itemId, field, currentValue || '');
            }
        }
    });

    return (
        <div className="h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
            <AppOverlays
                showCloudLoadModal={showCloudLoadModal}
                cloudSessions={cloudSessions}
                isCloudLoading={isCloudLoading}
                onCloudSelect={handleCloudSessionSelect}
                onCloudDelete={handleCloudSessionDelete}
                onCloudClose={() => setShowCloudLoadModal(false)}
                showOverwriteModal={showOverwriteModal}
                totalLogCount={totalLogCount}
                onOverwriteDownloadAndContinue={() => {
                    exportJsonl();
                    setTimeout(() => {
                        setShowOverwriteModal(false);
                        handleStartGeneration(true);
                    }, 500);
                }}
                onOverwriteContinue={() => {
                    setShowOverwriteModal(false);
                    handleStartGeneration(true);
                }}
                onOverwriteStartNew={() => {
                    setShowOverwriteModal(false);
                    handleStartGeneration(false);
                }}
                onOverwriteCancel={() => setShowOverwriteModal(false)}
                showSettings={showSettings}
                onSettingsClose={() => setShowSettings(false)}
                onSettingsChanged={async () => {
                    refreshPrompts();
                    await refreshLogs();
                }}
            />

            <LayoutContainer
                isLeftSidebarOpen={isLeftSidebarOpen}
                isRightSidebarOpen={appView === AppView.Verifier ? isVerifierAssistantOpen : isRightSidebarOpen}
                onLeftSidebarToggle={() => setLeftSidebarOpen(!isLeftSidebarOpen)}
                onRightSidebarToggle={() => {
                    if (appView === AppView.Verifier) {
                        setVerifierAssistantOpen(prev => !prev);
                    } else {
                        setRightSidebarOpen(!isRightSidebarOpen);
                    }
                }}
                leftSidebar={
                    <LeftSidebar
                        sessions={sessionsList}
                        environment={environment}
                        activeSessionId={sessionUid}
                        onNewSession={() => {
                            confirmService.confirm({
                                title: 'Start new session?',
                                message: 'This will clear the current session. Continue?',
                                confirmLabel: 'Start New',
                                cancelLabel: 'Cancel'
                            }).then((confirmed) => {
                                if (confirmed) handleStartNewSession();
                            });
                        }}
                        onSessionSelect={async (id) => {
                            const session = sessionsList.find(s => s.id === id);
                            if (session) {
                                // Both cloud and local sessions use the same handler now due to Service unification
                                handleCloudSessionSelect(session as any);
                                setAppView(AppView.Creator);
                            }
                        }}
                        onSessionRename={async (id, name) => {
                            if (sessionManager && sessionManager.renameSession) {
                                sessionManager.renameSession(id, name);
                                await refreshSessionsList();
                            }
                        }}
                        onSessionDelete={async (id) => {
                            if (sessionManager && sessionManager.deleteSession) {
                                await sessionManager.deleteSession(id);
                                await refreshSessionsList();
                            } else {
                                await handleCloudSessionDelete(id, { stopPropagation: () => { } } as any);
                                await refreshSessionsList();
                            }
                        }}
                        onRefreshSessions={refreshSessionsList}
                        onOpenSettings={() => setShowSettings(true)}
                        currentEnvironment={environment}
                        onEnvironmentChange={(env) => {
                            setEnvironment(env);
                        }}
                        sessionFilters={sessionFilters}
                        onSessionFiltersChange={handleSessionFiltersChange}
                        onLoadMoreSessions={handleLoadMoreSessions}
                        hasMoreSessions={hasMoreSessions}
                        isLoadingMoreSessions={isLoadingMoreSessions}
                        themeMode={themeMode}
                        onThemeModeChange={handleThemeModeChange}
                    />
                }
                mainContent={
                    <div className="flex flex-col h-full w-full">
                        <div className="flex-shrink-0 z-20">
                            <ModeNavbar
                                currentMode={appView as any}
                                onModeChange={(mode: any) => handleAppViewChange(mode)}
                                sessionName={sessionName}
                                onSessionNameChange={setSessionName}
                                isDirty={environment === Environment.Production && getUnsavedCount() > 0} // Only show 'Unsaved' for cloud needing sync
                            />
                        </div>
                        <div className="flex-1 min-h-0 relative">
                            {appView === AppView.Verifier ? (
                                <div className="h-full overflow-hidden">
                                    <VerifierPanel
                                        currentSessionUid={sessionUid}
                                        modelConfig={{
                                            provider,
                                            externalProvider,
                                            externalModel,
                                            apiKey: externalApiKey,
                                            externalApiKey
                                        }}
                                        chatOpen={isVerifierAssistantOpen}
                                        onChatToggle={setVerifierAssistantOpen}
                                        onSessionSelect={handleCloudSessionSelect}
                                    />
                                </div>
                            ) : (
                                <div className="h-full overflow-y-auto">
                                    <FeedAnalyticsPanel {...feedProps} />
                                </div>
                            )}
                        </div>
                    </div>
                }
                rightSidebar={
                    appView === AppView.Verifier ? (
                        <RightSidebar>
                            {isVerifierAssistantOpen ? (
                                <div id="verifier-assistant" className="h-full" />
                            ) : (
                                <div className="h-full flex items-center justify-center">
                                    <button
                                        onClick={() => setVerifierAssistantOpen(true)}
                                        className="flex flex-col items-center gap-2 text-slate-300 hover:text-white transition-colors"
                                        title="Open assistant"
                                    >
                                        <div className="w-8 h-24 rounded-full bg-slate-900/60 border border-slate-800/70 flex items-center justify-center">
                                            <span className="text-[10px] font-bold rotate-90">AI</span>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </RightSidebar>
                    ) : (
                        <RightSidebar>
                            <CreatorControls
                                {...sidebarProps}
                                setHfConfig={sidebarProps.onHfConfigChange}
                                feedRewriterConfig={feedRewriter.rewriterConfig}
                                onFeedRewriterConfigChange={feedRewriter.setRewriterConfig}
                            />
                        </RightSidebar>
                    )
                }
            />
        </div>
    );
}
