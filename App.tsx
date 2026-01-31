import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

import {
    SynthLogItem, ProviderType, AppMode, ExternalProvider, ApiType,
    ProgressStats, HuggingFaceConfig, DetectedColumns, DEFAULT_HF_PREFETCH_CONFIG,
    CATEGORIES, EngineMode, DeepConfig, DeepPhaseConfig, GenerationParams, UserAgentConfig,
    StreamingConversationState
} from './types';
import { EXTERNAL_PROVIDERS } from './constants';
import { logger, setVerbose } from './utils/logger';
import { PromptService } from './services/promptService';
import * as GeminiService from './services/geminiService';
import * as FirebaseService from './services/firebaseService';
import { OllamaModel } from './services/externalApiService';
import { refreshOllamaModels as refreshOllamaModelsService, getFirstModelName } from './services/ollamaService';
import { LogStorageService } from './services/logStorageService';
import { SettingsService } from './services/settingsService';
import { prefetchModels } from './services/modelService';
import { TaskType } from './services/taskClassifierService';
import { fetchHuggingFaceRows, searchDatasets, getDatasetStructure, getDatasetInfo } from './services/huggingFaceService';
import { HFPrefetchManager, PrefetchState } from './services/hfPrefetchService';
import { createGenerationService, GenerationService } from './services/generationService';
import { DataTransformService } from './services/dataTransformService';
import { SessionService } from './services/sessionService';
import { FileService } from './services/fileService';
import { updateDeepPhase as updateDeepPhaseService, copyDeepConfigToAll as copyDeepConfigToAllService, applyPhaseToUserAgent } from './services/deepConfigService';
import { useLogManagement } from './hooks/useLogManagement';
import { DataSource, Environment, ProviderType as ProviderTypeEnum, ExternalProvider as ExternalProviderEnum, ApiType as ApiTypeEnum, EngineMode as EngineModeEnum, AppMode as AppModeEnum, AppView, ViewMode, OllamaStatus, DeepPhase, ResponderPhase, PromptCategory, PromptRole } from './interfaces/enums';
import type { CompleteGenerationConfig } from './interfaces';
import { toast } from './services/toastService';
import { confirmService } from './services/confirmService';
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
    const sessionUidRef = useRef(sessionUid);

    useEffect(() => {
        sessionUidRef.current = sessionUid;
    }, [sessionUid]);

    const [sessionName, setSessionName] = useState<string | null>(null);
    const sessionNameRef = useRef(sessionName);

    useEffect(() => {
        sessionNameRef.current = sessionName;
    }, [sessionName]);

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

    // --- State: Ollama Integration ---
    const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
    const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>(OllamaStatus.Checking);
    const [ollamaLoading, setOllamaLoading] = useState(false);

    // Fetch Ollama models
    const refreshOllamaModels = useCallback(async () => {
        setOllamaLoading(true);
        setOllamaStatus(OllamaStatus.Checking);
        try {
            const result = await refreshOllamaModelsService();
            setOllamaStatus(result.status);
            setOllamaModels(result.models);
            // If no (valid) model selected for Ollama and models available, select first one
            if (
                result.models.length > 0 &&
                externalProvider === 'ollama' &&
                (!externalModel || externalModel.includes('/'))
            ) {
                const firstModel = getFirstModelName(result.models);
                if (firstModel) {
                    setExternalModel(firstModel);
                }
            }
        } catch {
            setOllamaStatus(OllamaStatus.Offline);
            setOllamaModels([]);
        }
        setOllamaLoading(false);
    }, [externalProvider, externalModel]);

    // Auto-fetch Ollama models when Ollama provider is selected
    useEffect(() => {
        if (externalProvider === 'ollama') {
            refreshOllamaModels();
        }
    }, [externalProvider]);

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

    // HF Search & Structure
    const [hfSearchResults, setHfSearchResults] = useState<string[]>([]);
    const [isSearchingHF, setIsSearchingHF] = useState(false);
    const [hfStructure, setHfStructure] = useState<{ configs: string[], splits: Record<string, string[]> }>({ configs: [], splits: {} });
    const [showHFResults, setShowHFResults] = useState(false);
    const searchTimeoutRef = useRef<number | null>(null);

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
    const [isPrefetching, setIsPrefetching] = useState(false);
    const [hfPreviewData, setHfPreviewData] = useState<any[]>([]);
    const [hfTotalRows, setHfTotalRows] = useState<number>(0);
    const [isLoadingHfPreview, setIsLoadingHfPreview] = useState(false);

    // --- State: Progressive conversation streaming (supports concurrent requests) ---
    const [streamingConversationsVersion, setStreamingConversationsVersion] = useState(0);
    const streamingConversationsRef = useRef<Map<string, StreamingConversationState>>(new Map());
    const streamingAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
    const haltedStreamingIdsRef = useRef<Set<string>>(new Set());
    const streamUpdateThrottleRef = useRef<number>(0);

    // --- State: Streaming mode toggle ---
    const [isStreamingEnabled, setIsStreamingEnabled] = useState<boolean>(true);

    // Column detection - delegated to DataTransformService
    const detectColumns = DataTransformService.detectColumns;

    // --- State: Runtime ---
    const [systemPrompt, setSystemPrompt] = useState(PromptService.getPrompt(PromptCategory.Generator, PromptRole.System));
    const [converterPrompt, setConverterPrompt] = useState(PromptService.getPrompt(PromptCategory.Converter, PromptRole.System));

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

    const handleProviderSelect = useCallback((value: string) => {
        const settings = SettingsService.getSettings();

        if (value === 'gemini') {
            setProvider(ProviderTypeEnum.Gemini);
            setExternalModel('gemini-2.0-flash-exp');
            return;
        }

        const newProvider = value as ExternalProvider;
        setProvider(ProviderTypeEnum.External);
        setExternalProvider(newProvider);

        const savedKey = SettingsService.getApiKey(newProvider);
        setExternalApiKey(savedKey || '');

        const defaultModel = settings.providerDefaultModels?.[newProvider] || '';
        setExternalModel(defaultModel);

        if (newProvider === ExternalProviderEnum.Other) {
            const savedBaseUrl = SettingsService.getCustomBaseUrl();
            setCustomBaseUrl(savedBaseUrl || '');
        }
    }, []);

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



    // --- Effects ---
    useEffect(() => {
        // Attempt to load Firebase Config from local storage on mount
        const savedConfig = localStorage.getItem('synth_firebase_config');
        if (savedConfig) {
            try {
                const parsed = JSON.parse(savedConfig);
                FirebaseService.initializeFirebase(parsed).then(success => {
                    if (success) {
                        logger.log("Restored Firebase config from storage");
                        updateDbStats(); // Initial fetch
                    }
                });
            } catch (e) {
                console.error("Failed to parse saved firebase config");
            }
        }
    }, []);

    useEffect(() => {
        isPausedRef.current = isPaused;
    }, [isPaused]);

    // Load available prompt sets on mount
    useEffect(() => {
        const sets = PromptService.getAvailableSets();
        setAvailablePromptSets(sets);
    }, []);

    // Reload all prompts when session prompt set changes
    useEffect(() => {
        // Determine which prompt set to use (session override or user's default)
        const activeSet = sessionPromptSet || SettingsService.getSettings().promptSet || 'default';

        // Update regular mode prompts (SYSTEM RUBRIC)
        setSystemPrompt(PromptService.getPrompt(PromptCategory.Generator, PromptRole.System, activeSet));
        setConverterPrompt(PromptService.getPrompt(PromptCategory.Converter, PromptRole.System, activeSet));

        // Update deepConfig phases with prompts from the active set
        setDeepConfig((prev: DeepConfig) => ({
            ...prev,
            phases: {
                meta: { ...prev.phases.meta, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Meta, activeSet) },
                retrieval: { ...prev.phases.retrieval, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Retrieval, activeSet) },
                derivation: { ...prev.phases.derivation, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Derivation, activeSet) },
                writer: { ...prev.phases.writer, systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Writer, activeSet) },
                rewriter: { ...prev.phases.rewriter, systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Rewriter, activeSet) }
            }
        }));

        // Update userAgentConfig
        setUserAgentConfig((prev: UserAgentConfig) => ({
            ...prev,
            systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.UserAgent, activeSet)
        }));
    }, [sessionPromptSet]);

    const bumpStreamingConversations = useCallback(() => {
        setStreamingConversationsVersion(prev => prev + 1);
    }, []);

    const scheduleStreamingUpdate = useCallback(() => {
        const now = Date.now();
        if (now - streamUpdateThrottleRef.current > 50) {
            streamUpdateThrottleRef.current = now;
            bumpStreamingConversations();
        }
    }, [bumpStreamingConversations]);

    const haltStreamingItem = useCallback((id: string) => {
        haltedStreamingIdsRef.current.add(id);
        const controller = streamingAbortControllersRef.current.get(id);
        if (controller) {
            controller.abort();
        }
        streamingAbortControllersRef.current.delete(id);
        streamingConversationsRef.current.delete(id);
        bumpStreamingConversations();
    }, [bumpStreamingConversations]);

    // Toggle verbose logging based on environment mode
    // Toggle verbose logging based on environment mode
    useEffect(() => {
        environmentRef.current = environment;
        // In production mode, disable verbose logging
        setVerbose(environment === 'development');
    }, [environment]);

    // Update DB Stats Periodically or when logs change
    const updateDbStats = useCallback(async () => {
        if (environment === 'production' && FirebaseService.isFirebaseConfigured()) {
            const stats = await FirebaseService.getDbStats(sessionUid);
            setDbStats(stats);
        }
    }, [environment, sessionUid]);

    useEffect(() => {
        // Poll stats every 10 seconds in prod
        if (environment === 'production') {
            const interval = setInterval(updateDbStats, 10000);
            return () => clearInterval(interval);
        }
    }, [environment, updateDbStats]);

    // Update sparkline history when progress changes
    useEffect(() => {
        if (isRunning && progress.current > 0) {
            setSparklineHistory(prev => {
                const next = [...prev, progress.current];
                if (next.length > 20) return next.slice(next.length - 20);
                return next;
            });
        }
    }, [progress.current, isRunning]);

    // Row content extraction - delegated to DataTransformService
    // Creates a wrapper that provides the current hfConfig and appMode
    const getRowContent = useCallback((row: Record<string, unknown>): string => {
        return DataTransformService.getRowContent(row, {
            hfConfig,
            appMode: appMode === 'converter' ? AppModeEnum.Converter : AppModeEnum.Generator
        });
    }, [hfConfig, appMode]);

    const prefetchColumns = async (overrideConfig?: HuggingFaceConfig) => {
        const configToUse = overrideConfig || hfConfig;
        if (!configToUse.dataset) {
            setError("Please enter a Dataset ID first.");
            return;
        }
        setIsPrefetching(true);
        setAvailableColumns([]);
        setDetectedColumns({ input: [], output: [], all: [], reasoning: [] });
        setError(null);
        try {
            const rows = await fetchHuggingFaceRows(configToUse, 0, 1);
            if (rows.length > 0 && rows[0]) {
                if (typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
                    const cols = Object.keys(rows[0]);
                    setAvailableColumns(cols);

                    // Detect and auto-populate columns
                    const detected = detectColumns(cols);
                    setDetectedColumns(detected);

                    // Auto-select detected columns if none are already selected
                    if ((!configToUse.inputColumns || configToUse.inputColumns.length === 0) && detected.input.length > 0) {
                        setHfConfig(prev => ({ ...prev, inputColumns: detected.input.slice(0, 1) })); // Select first detected input
                    }
                    if ((!configToUse.outputColumns || configToUse.outputColumns.length === 0) && detected.output.length > 0) {
                        setHfConfig(prev => ({ ...prev, outputColumns: detected.output.slice(0, 1) })); // Select first detected output
                    }
                    if ((!configToUse.reasoningColumns || configToUse.reasoningColumns.length === 0) && detected.reasoning.length > 0) {
                        setHfConfig(prev => ({ ...prev, reasoningColumns: detected.reasoning.slice(0, 1) })); // Select first detected reasoning
                    }
                } else {
                    setError("Row is not an object, cannot detect columns.");
                }
            } else {
                setError("No rows returned from dataset.");
            }
        } catch (e: any) {
            console.error(e);
            setError("Failed to fetch row: " + (e.message || "Unknown error"));
        } finally {
            setIsPrefetching(false);
        }
    };

    const handleHFSearch = (query: string) => {
        setHfConfig(prev => ({ ...prev, dataset: query }));
        if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
        if (query.length < 3) {
            setHfSearchResults([]);
            setShowHFResults(false);
            return;
        }
        setIsSearchingHF(true);
        searchTimeoutRef.current = window.setTimeout(async () => {
            const results = await searchDatasets(query);
            setHfSearchResults(results);
            setShowHFResults(true);
            setIsSearchingHF(false);
        }, 500);
    };

    const handleSelectHFDataset = async (datasetId: string) => {
        setHfConfig(prev => ({ ...prev, dataset: datasetId, config: '', split: '' }));
        setShowHFResults(false);
        setHfPreviewData([]);
        setHfTotalRows(0);

        const structure = await getDatasetStructure(datasetId);
        setHfStructure(structure);
        if (structure.configs.length > 0) {
            const defaultConfig = structure.configs.includes('default') ? 'default' : structure.configs[0];
            const splits = structure.splits[defaultConfig] || [];
            const defaultSplit = splits.includes('train') ? 'train' : (splits[0] || '');
            const newConfig = { ...hfConfig, dataset: datasetId, config: defaultConfig, split: defaultSplit };
            setHfConfig(newConfig);

            // Fetch preview data and row count
            setIsLoadingHfPreview(true);
            try {
                const [previewRows, datasetInfo] = await Promise.all([
                    fetchHuggingFaceRows(newConfig, 0, 5),
                    getDatasetInfo(datasetId, defaultConfig, defaultSplit)
                ]);
                setHfPreviewData(previewRows);
                setHfTotalRows(datasetInfo.totalRows);
            } catch (e) {
                console.error('Failed to fetch HF preview:', e);
            } finally {
                setIsLoadingHfPreview(false);
            }

            prefetchColumns(newConfig);
        }
    };

    const handleConfigChange = async (newConfig: string) => {
        const splits = hfStructure.splits[newConfig] || [];
        const newSplit = splits.includes('train') ? 'train' : (splits[0] || '');
        const updatedConfig = { ...hfConfig, config: newConfig, split: newSplit };
        setHfConfig(updatedConfig);
        setAvailableColumns([]);

        // Refresh preview data and columns for the new config/split
        if (hfConfig.dataset) {
            setIsLoadingHfPreview(true);
            try {
                const [previewRows, datasetInfo] = await Promise.all([
                    fetchHuggingFaceRows(updatedConfig, 0, 5),
                    getDatasetInfo(hfConfig.dataset, newConfig, newSplit)
                ]);
                setHfPreviewData(previewRows);
                setHfTotalRows(datasetInfo.totalRows);
                prefetchColumns(updatedConfig);
            } catch (e) {
                console.error('Failed to refresh HF preview on config change:', e);
            } finally {
                setIsLoadingHfPreview(false);
            }
        }
    };

    const handleSplitChange = async (newSplit: string) => {
        const updatedConfig = { ...hfConfig, split: newSplit };
        setHfConfig(updatedConfig);

        // Refresh preview data and columns for the new split
        if (hfConfig.dataset && hfConfig.config) {
            setIsLoadingHfPreview(true);
            try {
                const [previewRows, datasetInfo] = await Promise.all([
                    fetchHuggingFaceRows(updatedConfig, 0, 5),
                    getDatasetInfo(hfConfig.dataset, hfConfig.config, newSplit)
                ]);
                setHfPreviewData(previewRows);
                setHfTotalRows(datasetInfo.totalRows);
                prefetchColumns(updatedConfig);
            } catch (e) {
                console.error('Failed to refresh HF preview on split change:', e);
            } finally {
                setIsLoadingHfPreview(false);
            }
        }
    };

    const handleDataSourceModeChange = (mode: DataSource) => {
        setDataSourceMode(mode);
        // Clear column selections when switching data sources
        setAvailableColumns([]);
        setDetectedColumns({ input: [], output: [], all: [], reasoning: [] });
        setHfConfig(prev => ({ ...prev, inputColumns: [], outputColumns: [], reasoningColumns: [] }));
    };


    const generateRandomTopic = async () => {
        setIsGeneratingTopic(true);
        try {
            const cat = topicCategory === 'Random (Any)'
                ? CATEGORIES[Math.floor(Math.random() * (CATEGORIES.length - 1)) + 1]
                : topicCategory;
            const topic = await GeminiService.generateGeminiTopic(cat);
            setGeminiTopic(topic);
        } catch (e) {
            setError("Topic generation failed.");
        } finally {
            setIsGeneratingTopic(false);
        }
    };

    const optimizePrompt = async () => {
        setIsOptimizing(true);
        try {
            const activePrompt = appMode === 'generator' ? systemPrompt : converterPrompt;
            const settings = SettingsService.getSettings();
            const generalPurposeModel = settings.generalPurposeModel;

            console.log('[Optimize] General purpose model:', generalPurposeModel);
            console.log('[Optimize] Provider keys:', settings.providerKeys);
            console.log('[Optimize] Custom endpoint URL:', settings.customEndpointUrl);

            let config: GeminiService.OptimizePromptConfig | undefined;

            if (generalPurposeModel && generalPurposeModel.model) {
                const isExternal = generalPurposeModel.provider === 'external';
                const isOther = generalPurposeModel.provider === 'other';
                let apiKey = '';

                console.log('[Optimize] provider:', generalPurposeModel.provider, 'isExternal:', isExternal, 'isOther:', isOther, 'externalProvider:', generalPurposeModel.externalProvider);

                let externalProvider = generalPurposeModel.externalProvider;

                if (isOther) {
                    externalProvider = 'other';
                }

                if (isExternal || isOther) {
                    apiKey = SettingsService.getApiKey(externalProvider);
                    console.log('[Optimize] API key for', externalProvider, ':', apiKey ? '***' : '(empty)');
                } else {
                    apiKey = SettingsService.getApiKey('gemini');
                    console.log('[Optimize] Gemini API key:', apiKey ? '***' : '(empty)');
                }

                const customBaseUrl = SettingsService.getCustomBaseUrl();
                console.log('[Optimize] Custom base URL:', customBaseUrl);

                if ((isExternal || isOther) && externalProvider && generalPurposeModel.model && apiKey) {
                    config = {
                        provider: 'external',
                        externalProvider: externalProvider,
                        model: generalPurposeModel.model,
                        customBaseUrl: customBaseUrl,
                        apiKey
                    };
                    console.log('[Optimize] Config built for external provider:', config);
                } else if (!isExternal && !isOther && apiKey) {
                    config = {
                        provider: 'gemini',
                        model: generalPurposeModel.model
                    };
                    console.log('[Optimize] Config built for Gemini:', config);
                }
            }

            if (!config) {
                console.error('[Optimize] No config built! generalPurposeModel:', generalPurposeModel);
                throw new Error(generalPurposeModel?.provider === 'external' || generalPurposeModel?.provider === 'other'
                    ? 'General purpose model is incomplete. Please set: Provider, Model, and API Key in Settings → API Keys.'
                    : 'No model configured. Please set a model in Settings → Default Models → General purpose model.');
            }


            config.structuredOutput = false

            const refined = await GeminiService.optimizeSystemPrompt(activePrompt, config);
            if (appMode === 'generator') setSystemPrompt(refined);
            else setConverterPrompt(refined);
        } catch (e) {
            setError(`Prompt optimization failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleLoadRubric = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await FileService.loadRubric(file, {
                appMode: appMode === 'generator' ? AppModeEnum.Generator : AppModeEnum.Converter,
                setSystemPrompt,
                setConverterPrompt
            });
        } catch (err) {
            console.error('Failed to load rubric', err);
            setError('Failed to load rubric file');
        }
        e.target.value = '';
    };

    const handleLoadSourceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await FileService.loadSourceFile(file, {
                setManualFileName,
                setConverterInputText,
                setRowsToFetch,
                setAvailableColumns,
                setDetectedColumns,
                setHfConfig,
                hfConfig,
                detectColumns
            });
        } catch (err) {
            console.error('Failed to load source file', err);
            setError('Failed to load source file');
        }
        e.target.value = '';
    };

    const handleSaveRubric = () => {
        FileService.saveRubric({
            appMode: appMode === 'generator' ? AppModeEnum.Generator : AppModeEnum.Converter,
            systemPrompt,
            converterPrompt
        });
    };

    const updateDeepPhase = (phase: keyof DeepConfig['phases'], updates: Partial<DeepPhaseConfig>) => {
        setDeepConfig(prev => updateDeepPhaseService(prev, phase, updates));
    };

    const copyDeepConfigToAll = (sourcePhase: keyof DeepConfig['phases']) => {
        const source = deepConfig.phases[sourcePhase];
        setDeepConfig(prev => copyDeepConfigToAllService(prev, sourcePhase));
        // Also apply to User Agent config
        setUserAgentConfig(prev => applyPhaseToUserAgent(prev, source));
    };

    const getGenerationParams = (): GenerationParams | undefined => {
        return Object.keys(generationParams).length > 0 ? generationParams : undefined;
    };

    // Helper to build SessionConfig from current state
    const buildSessionConfig = (): import('./interfaces/services/SessionConfig').SessionConfig => {
        return {
            appMode: appMode === 'converter' ? AppModeEnum.Converter : AppModeEnum.Generator,
            engineMode: engineMode === 'deep' ? EngineModeEnum.Deep : EngineModeEnum.Regular,
            environment: environment === 'production' ? Environment.Production : Environment.Development,
            provider: provider === 'gemini' ? ProviderTypeEnum.Gemini : ProviderTypeEnum.External,
            externalProvider: ExternalProviderEnum[externalProvider.charAt(0).toUpperCase() + externalProvider.slice(1).replace(/-/g, '') as keyof typeof ExternalProviderEnum] || ExternalProviderEnum.OpenRouter,
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
            dataSourceMode: dataSourceMode,
            hfConfig,
            geminiTopic,
            topicCategory,
            systemPrompt,
            converterPrompt,
            conversationRewriteMode,
            converterInputText,
            generationParams
        };
    };

    const getSessionData = () => {
        return SessionService.getSessionData(buildSessionConfig(), sessionUid);
    };

    const restoreSession = (session: any, savedSessionUid?: string) => {
        // Create setters that convert enum values to string values for React state
        const setters = {
            setAppMode: (mode: AppModeEnum) => setAppMode(mode),
            setEngineMode: (mode: EngineModeEnum) => setEngineMode(mode),
            setEnvironment: (env: Environment) => setEnvironment(env),
            setProvider: (provider: ProviderTypeEnum) => setProvider(provider),
            setExternalProvider: (provider: ExternalProviderEnum) => setExternalProvider(provider),
            setExternalApiKey: setExternalApiKey,
            setExternalModel: setExternalModel,
            setCustomBaseUrl: setCustomBaseUrl,
            setDeepConfig: setDeepConfig,
            setUserAgentConfig: setUserAgentConfig,
            setConcurrency: setConcurrency,
            setRowsToFetch: setRowsToFetch,
            setSkipRows: setSkipRows,
            setSleepTime: setSleepTime,
            setMaxRetries: setMaxRetries,
            setRetryDelay: setRetryDelay,
            setFeedPageSize: setFeedPageSize,
            setDataSourceMode: (mode: DataSource) => setDataSourceMode(mode),
            setHfConfig: setHfConfig,
            setGeminiTopic: setGeminiTopic,
            setTopicCategory: setTopicCategory,
            setSystemPrompt: setSystemPrompt,
            setConverterPrompt: setConverterPrompt,
            setConversationRewriteMode: setConversationRewriteMode,
            setConverterInputText: setConverterInputText,
            setGenerationParams: setGenerationParams
        };

        SessionService.restoreSession(
            session,
            savedSessionUid,
            setters,
            { setSessionUid, setError }
        );
    };

    const handleSaveSession = () => {
        const sessionData = getSessionData();
        SessionService.saveToFile(sessionData);
    };

    const handleLoadSession = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const session = await SessionService.loadFromFile(file);
            restoreSession(session);
            setSessionName("Local File Session");
        } catch (err) {
            console.error("Failed to load session", err);
            setError("Failed to load session file. Invalid JSON.");
        }
        e.target.value = '';
    };

    const handleCloudSave = async () => {
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
            setSessionName(name);
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
    };

    const handleCloudLoadOpen = async () => {
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
    };

    const handleCloudSessionSelect = async (session: FirebaseService.SavedSession) => {
        setSessionName(session.name);
        // Pass sessionUid from the saved session to restore it
        const savedSessionUid = (session as any).sessionUid;
        restoreSession(session.config || {}, savedSessionUid);
        setShowCloudLoadModal(false);

        // Sync existing log count from Firestore for this session
        if (savedSessionUid && SessionService.isCloudAvailable()) {
            try {
                const stats = await FirebaseService.getDbStats(savedSessionUid);
                setDbStats(stats);
            } catch (e) {
                logger.warn("Failed to fetch session stats on load", e);
            }
        }
    };

    const handleCloudSessionDelete = async (id: string, e: React.MouseEvent) => {
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
    };

    // --- Core Generation Logic ---
    // Runtime prompt configuration for auto-routing (avoids React state race condition)
    interface RuntimePromptConfig {
        systemPrompt: string;
        converterPrompt: string;
        deepConfig: DeepConfig;
        promptSet: string;
    }

    // Thin wrapper around GenerationService.generateSingleItem
    const generateSingleItem = async (inputText: string, workerId: number, opts: { retryId?: string, originalQuestion?: string, originalAnswer?: string, originalReasoning?: string, row?: any, runtimeConfig?: RuntimePromptConfig } = {}): Promise<SynthLogItem | null> => {
        const config = buildGenerationConfig();
        const service = createGenerationService(config);
        return service.generateSingleItem(inputText, workerId, opts);
    };

    const retryItem = async (id: string) => {
        await GenerationService.retryItem(
            id,
            sessionUid,
            environment,
            visibleLogs,
            generateSingleItem,
            setRetryingIds,
            refreshLogs,
            updateDbStats
        );
    };

    const retrySave = async (id: string) => {
        await GenerationService.retrySave(
            id,
            sessionUid,
            visibleLogs,
            setRetryingIds,
            refreshLogs,
            updateDbStats
        );
    };

    const retryAllFailed = async () => {
        await GenerationService.retryAllFailed(
            sessionUid,
            environment,
            concurrency,
            visibleLogs,
            isInvalidLog,
            setRetryingIds,
            generateSingleItem,
            refreshLogs
        );
    };

    // Sync all unsaved items from current session to Firebase
    const syncAllUnsavedToDb = async () => {
        await GenerationService.syncAllUnsavedToDb(
            sessionUid,
            isInvalidLog,
            refreshLogs,
            updateDbStats
        );
    };

    // Save a single item to Firebase
    const saveItemToDb = async (id: string) => {
        setSavingToDbIds((prev: Set<string>) => new Set([...prev, id]));
        try {
            await GenerationService.saveItemToDb(
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
    };

    const startNewSession = async () => {
        const newSessionConfig = {
            dataSourceMode: dataSourceMode,
            hfConfig,
            manualFileName,
            environment: environment,
            appMode: appMode
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
    };

    // Build configuration for GenerationService
    const buildGenerationConfig = (): CompleteGenerationConfig => {
        const dataSourceModeValue = dataSourceMode;

        const engineModeValue = engineMode;
        const appModeValue = appMode;
        const environmentValue = environment;
        const providerValue = provider === 'gemini' ? ProviderTypeEnum.Gemini : ProviderTypeEnum.External;
        const externalProviderValue = ExternalProviderEnum[externalProvider.charAt(0).toUpperCase() + externalProvider.slice(1).replace(/-/g, '') as keyof typeof ExternalProviderEnum] || ExternalProviderEnum.OpenRouter;
        const apiTypeValue = apiType === 'responses' ? ApiTypeEnum.Responses : ApiTypeEnum.Chat;

        return {
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
            generationParams: getGenerationParams(),

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
        };
    };

    const startGeneration = async (append = false) => {
        const config = buildGenerationConfig();
        const service = createGenerationService(config);
        generationServiceRef.current = service;
        await service.startGeneration(append);
    };

    const stopGeneration = () => {
        if (generationServiceRef.current) {
            generationServiceRef.current.stopGeneration();
            generationServiceRef.current = null;
        } else {
            // Fallback cleanup if service not available
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
        }
    };

    const pauseGeneration = () => {
        setIsPaused(true);
        toast.info('Generation paused');
    };

    const resumeGeneration = () => {
        setIsPaused(false);
    };

    const handleDeleteLog = useCallback(async (id: string) => {
        if (streamingConversationsRef.current.has(id)) {
            streamingConversationsRef.current.delete(id);
            bumpStreamingConversations();
        }

        const logItem = visibleLogs.find(l => l.id === id);
        await handleDeleteLogFromLogs(id);

        if (environment === Environment.Production && FirebaseService.isFirebaseConfigured() && logItem?.savedToDb) {
            updateDbStats();
        }
    }, [bumpStreamingConversations, handleDeleteLogFromLogs, visibleLogs, environment, updateDbStats]);

    const handleStart = () => {
        if (totalLogCount > 0) setShowOverwriteModal(true);
        else startGeneration(false);
    };

    const exportJsonl = async () => {
        await FileService.exportJsonl({
            totalLogCount,
            sessionUid,
            confirmService,
            toast,
            logStorageService: LogStorageService
        });
    };

    // --- Effect: Load Settings & Prompts on Mount ---
    const refreshPrompts = useCallback(() => {
        setSystemPrompt(PromptService.getPrompt(PromptCategory.Generator, PromptRole.System));
        setConverterPrompt(PromptService.getPrompt(PromptCategory.Converter, PromptRole.System));

        setDeepConfig((prev: DeepConfig) => ({
            ...prev,
            phases: {
                meta: { ...prev.phases.meta, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Meta) },
                retrieval: { ...prev.phases.retrieval, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Retrieval) },
                derivation: { ...prev.phases.derivation, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Derivation) },
                writer: { ...prev.phases.writer, systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Writer) },
                rewriter: { ...prev.phases.rewriter, systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Rewriter) }
            }
        }));

        setUserAgentConfig((prev: UserAgentConfig) => ({
            ...prev,
            systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.UserAgent)
        }));
    }, []);

    useEffect(() => {
        // Wait for settings to load from IndexedDB, then refresh prompts and prefetch models
        SettingsService.waitForSettingsInit().then(() => {
            refreshPrompts();
            // Prefetch models for providers with configured API keys (background, non-blocking)
            const settings = SettingsService.getSettings();
            prefetchModels(settings.providerKeys || {}, SettingsService.getApiKey);
        });
    }, [refreshPrompts]);

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
        generationParams,
        onGenerationParamsChange: setGenerationParams,
        systemPrompt,
        converterPrompt,
        onSystemPromptChange: setSystemPrompt,
        onConverterPromptChange: setConverterPrompt,
        onLoadRubric: handleLoadRubric,
        onSaveRubric: handleSaveRubric,
        onOptimizePrompt: optimizePrompt,
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
                onEnvironmentChange={(env) => setEnvironment(env as Environment)}
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
