import { useState, useRef, useMemo, useEffect } from 'react';

import {
    SynthLogItem, ProviderType, AppMode, ExternalProvider, ApiType,
    ProgressStats, HuggingFaceConfig, DetectedColumns, DEFAULT_HF_PREFETCH_CONFIG,
    EngineMode, DeepConfig, GenerationParams, UserAgentConfig,
    StreamingConversationState
} from './types';
import { EXTERNAL_PROVIDERS } from './constants';
import { PromptService } from './services/promptService';
import * as FirebaseService from './services/firebaseService';
import { LogStorageService } from './services/logStorageService';
import { SettingsService } from './services/settingsService';
import { TaskType } from './interfaces/enums';
import { HFPrefetchManager, PrefetchState } from './services/hfPrefetchService';
import { buildGenerationConfig as buildGenerationConfigService, GenerationService } from './services/generationService';
import { DataTransformService } from './services/dataTransformService';
import { SessionService } from './services/sessionService';
import { FileService } from './services/fileService';
import { useLogManagement } from './hooks/useLogManagement';
import { DataSource, Environment, ProviderType as ProviderTypeEnum, ExternalProvider as ExternalProviderEnum, ApiType as ApiTypeEnum, AppView, ViewMode, DeepPhase, ResponderPhase, PromptCategory, PromptRole } from './interfaces/enums';
import type { CompleteGenerationConfig } from './interfaces';
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
import AppOverlays from './components/layout/AppOverlays';
import AppMainContent from './components/layout/AppMainContent';
import AppHeader from './components/layout/AppHeader';
import { useAppViewProps } from './hooks/useAppViewProps';

export default function App() {
    // --- State: Modes ---
    const [appView, setAppView] = useState<AppView>(AppView.Creator); // Top Level View
    const [appMode, setAppMode] = useState<AppMode>(AppMode.Generator);
    const [engineMode, setEngineMode] = useState<EngineMode>(EngineMode.Regular);
    const [environment, setEnvironment] = useState<Environment>(Environment.Development);
    const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Feed);

    // --- State: Session & DB ---
    const [sessionUid, setSessionUid] = useState<string>(crypto.randomUUID());
    const sessionUidRef = useSyncedRef(sessionUid);

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
    const [dataSourceMode, setDataSourceMode] = useState<DataSource>(DataSource.Synthetic);

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
    const [cloudSessions, setCloudSessions] = useState<FirebaseService.SavedSession[]>([]);
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
        setLogFilter,
        setShowLatestOnly,
        setFeedPageSize,
        refreshLogs,
        handlePageChange,
        handleDeleteLog: handleDeleteLogFromLogs,
        isInvalidLog,
        getUnsavedCount,
        setVisibleLogs,
        setTotalLogCount,
        setFilteredLogCount,
        setLogsTrigger
    } = logManagement;

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

    const sessionSetters = {
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
    };

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
        setters: sessionSetters
    });

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
        resumeGeneration,
        handleStart
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

    const { handleDeleteLog } = useLogActions({
        environment,
        visibleLogs,
        streamingConversationsRef,
        bumpStreamingConversations,
        handleDeleteLogFromLogs,
        updateDbStats
    });

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

    const { sidebarProps, feedProps, verifierProps } = useAppViewProps({
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
        onStart: handleStart,
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
        onStartNewSession: startNewSession,
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
        onViewModeChange: setViewMode,
        onLogFilterChange: setLogFilter,
        onShowLatestOnlyChange: setShowLatestOnly,
        onFeedPageSizeChange: setFeedPageSize,
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
        sessionUid
    });

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
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
                        startGeneration(true);
                    }, 500);
                }}
                onOverwriteContinue={() => {
                    setShowOverwriteModal(false);
                    startGeneration(true);
                }}
                onOverwriteStartNew={() => {
                    setShowOverwriteModal(false);
                    startGeneration(false);
                }}
                onOverwriteCancel={() => setShowOverwriteModal(false)}
                showSettings={showSettings}
                onSettingsClose={() => setShowSettings(false)}
                onSettingsChanged={async () => {
                    refreshPrompts();
                    await refreshLogs();
                }}
            />

            <AppHeader
                appView={appView}
                environment={environment}
                totalLogCount={totalLogCount}
                onViewChange={setAppView}
                onEnvironmentChange={setEnvironment}
                onExport={exportJsonl}
                onSettingsOpen={() => setShowSettings(true)}
            />

            <AppMainContent
                appView={appView}
                verifierProps={verifierProps}
                sidebarProps={sidebarProps}
                feedProps={feedProps}
            />

        </div>
    );
}
