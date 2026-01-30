import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
    RefreshCcw, FileEdit,
    Settings, Cpu, RefreshCw,
    Wand2, Upload, Save, FileText, BrainCircuit,
    MessageSquare, Layers, Search, PenTool, GitBranch
} from 'lucide-react';

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
import LogFeed from './components/LogFeed';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import VerifierPanel from './components/VerifierPanel';
import SettingsPanel from './components/SettingsPanel';
import CloudLoadModal from './components/modals/CloudLoadModal';
import OverwriteModal from './components/modals/OverwriteModal';
import SessionConfigPanel from './components/panels/SessionConfigPanel';
import ControlPanel from './components/panels/ControlPanel';
import DataSourcePanel from './components/panels/DataSourcePanel';
import ProviderConfigPanel from './components/panels/ProviderConfigPanel';
import AppNavbar from './components/layout/AppNavbar';
import FeedControlBar from './components/layout/FeedControlBar';
import GenerationParamsInput from './components/GenerationParamsInput';
import ModelSelector from './components/ModelSelector';
import { ToastContainer } from './components/Toast';
import { ConfirmModalContainer } from './components/ConfirmModal';
import DeepPhaseConfigPanel from './components/DeepPhaseConfigPanel';

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

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
            {/* Modals */}
            <CloudLoadModal
                isOpen={showCloudLoadModal}
                sessions={cloudSessions}
                isLoading={isCloudLoading}
                onSelect={handleCloudSessionSelect}
                onDelete={handleCloudSessionDelete}
                onClose={() => setShowCloudLoadModal(false)}
            />

            <OverwriteModal
                isOpen={showOverwriteModal}
                totalLogCount={totalLogCount}
                onDownloadAndContinue={() => { exportJsonl(); setTimeout(() => { setShowOverwriteModal(false); startGeneration(true); }, 500); }}
                onContinue={() => { setShowOverwriteModal(false); startGeneration(true); }}
                onStartNew={() => { setShowOverwriteModal(false); startGeneration(false); }}
                onCancel={() => setShowOverwriteModal(false)}
            />

            {/* Navbar */}
            <AppNavbar
                appView={appView}
                environment={environment}
                totalLogCount={totalLogCount}
                onViewChange={setAppView}
                onEnvironmentChange={(env) => setEnvironment(env as Environment)}
                onExport={exportJsonl}
                onSettingsOpen={() => setShowSettings(true)}
            />

            {/* Main Content Area */}
            {appView === 'verifier' ? (
                <main className="max-w-7xl mx-auto p-4 mt-4 pb-20">
                    <VerifierPanel
                        currentSessionUid={sessionUid}
                        modelConfig={{
                            provider: provider,
                            externalProvider: externalProvider,
                            externalModel: externalModel,
                            apiKey: provider === 'external' ? externalApiKey : '', // Or handle appropriately
                            externalApiKey: externalApiKey
                        }}
                    />
                </main>
            ) : (
                <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4 pb-20">

                    {/* Sidebar Controls (CREATOR MODE) */}
                    <div className="lg:col-span-4 space-y-6">

                        {/* Session Manager */}
                        <SessionConfigPanel
                            sessionName={sessionName}
                            environment={environment}
                            onLoadSession={handleLoadSession}
                            onSaveSession={handleSaveSession}
                            onCloudLoadOpen={handleCloudLoadOpen}
                            onCloudSave={handleCloudSave}
                        />

                        <ControlPanel
                            appMode={appMode}
                            environment={environment}
                            isRunning={isRunning}
                            isPaused={isPaused}
                            progress={progress}
                            dataSourceMode={dataSourceMode}
                            prefetchState={prefetchState}
                            error={error}
                            isStreamingEnabled={isStreamingEnabled}
                            onStreamingChange={setIsStreamingEnabled}
                            onAppModeChange={setAppMode}
                            onStart={handleStart}
                            onPause={pauseGeneration}
                            onResume={resumeGeneration}
                            onStop={stopGeneration}
                            totalLogCount={totalLogCount}
                            invalidLogCount={invalidLogCount}
                            detectedTaskType={detectedTaskType}
                            autoRoutedPromptSet={autoRoutedPromptSet}
                            showMiniDbPanel={environment === Environment.Production}
                            dbStats={dbStats}
                            sparklineHistory={sparklineHistory}
                            unsavedCount={getUnsavedCount()}
                            onSyncAll={syncAllUnsavedToDb}
                            onRetryAllFailed={retryAllFailed}
                            onStartNewSession={startNewSession}
                        />

                        {/* Model Config, Source Config, Prompt Editor... (Same as before) */}
                        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5 space-y-4">
                            {/* ... (Engine, Deep Config, Gen Params logic same as before, simplified for brevity in this update) ... */}
                            {/* Re-injecting previous render logic for brevity since it didn't change materially other than being in the sidebar */}
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <Cpu className="w-4 h-4 text-slate-400" /> ENGINE
                                </h3>
                                <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                                    <button onClick={() => setEngineMode(EngineModeEnum.Regular)} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${engineMode === 'regular' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>REGULAR</button>
                                    <button onClick={() => setEngineMode(EngineModeEnum.Deep)} className={`px-2 py-1 text-[10px] font-bold rounded transition-all flex items-center gap-1 ${engineMode === 'deep' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>
                                        <Layers className="w-3 h-3" /> DEEP
                                    </button>
                                </div>
                            </div>

                            {/* Session-level Prompt Set Override */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                    <FileText className="w-3 h-3" /> Prompts (Session)
                                </label>
                                <div className="flex gap-1">
                                    <select
                                        value={sessionPromptSet || ''}
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSessionPromptSet(e.target.value || null)}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                    >
                                        <option value="">{SettingsService.getSettings().promptSet || 'default'} (your default)</option>
                                        {availablePromptSets.filter((s: string) => s !== (SettingsService.getSettings().promptSet || 'default')).map((setId: string) => (
                                            <option key={setId} value={setId}>{setId}</option>
                                        ))}
                                    </select>
                                    {sessionPromptSet && (
                                        <button
                                            onClick={() => setSessionPromptSet(null)}
                                            className="px-2 py-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 transition-colors"
                                            title="Reset to your default prompt set"
                                        >
                                            Reset
                                        </button>
                                    )}
                                </div>
                                {sessionPromptSet && (
                                    <p className="text-[9px] text-amber-400/70">
                                        Session override active — will not persist after reload
                                    </p>
                                )}
                            </div>
                            {engineMode === 'regular' ? (
                                <div className="animate-in fade-in slide-in-from-left-2 duration-300 space-y-4">
                                    <ProviderConfigPanel
                                        provider={provider}
                                        externalProvider={externalProvider}
                                        externalModel={externalModel}
                                        apiType={apiType}
                                        externalApiKey={externalApiKey}
                                        customBaseUrl={customBaseUrl}
                                        externalProviders={EXTERNAL_PROVIDERS}
                                        providerSelectValue={provider === ProviderTypeEnum.Gemini ? 'gemini' : externalProvider}
                                        onProviderSelect={handleProviderSelect}
                                        onApiTypeChange={setApiType}
                                        onExternalModelChange={setExternalModel}
                                        onExternalApiKeyChange={setExternalApiKey}
                                        onCustomBaseUrlChange={setCustomBaseUrl}
                                        ollamaStatus={ollamaStatus}
                                        ollamaModels={ollamaModels}
                                        ollamaLoading={ollamaLoading}
                                        onRefreshOllamaModels={refreshOllamaModels}
                                        modelSelectorProvider={provider === ProviderTypeEnum.Gemini ? ProviderTypeEnum.Gemini : externalProvider}
                                        modelSelectorApiKey={provider === ProviderTypeEnum.Gemini
                                            ? SettingsService.getApiKey('gemini')
                                            : (externalApiKey || SettingsService.getApiKey(externalProvider))}
                                        modelSelectorPlaceholder={provider === ProviderTypeEnum.Gemini ? 'gemini-2.0-flash-exp' : 'Select or enter model'}
                                        defaultCustomBaseUrl={SettingsService.getCustomBaseUrl()}
                                    />
                                    {/* Generation Parameters */}
                                    <div className="pt-2 border-t border-slate-800/50">
                                        <GenerationParamsInput
                                            params={generationParams}
                                            onChange={setGenerationParams}
                                            label="Generation Parameters"
                                        />
                                    </div>

                                    {/* System Prompt */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                                <Settings className="w-3 h-3" /> System Prompt
                                            </label>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-[9px] px-1.5 py-1 rounded transition-colors">
                                                    <Upload className="w-2.5 h-2.5" /> Load
                                                </button>
                                                <input type="file" ref={fileInputRef} onChange={handleLoadRubric} className="hidden" accept=".txt,.md,.json" />
                                                <button onClick={handleSaveRubric} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-[9px] px-1.5 py-1 rounded transition-colors">
                                                    <Save className="w-2.5 h-2.5" /> Save
                                                </button>
                                                <button onClick={optimizePrompt} disabled={isOptimizing} className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-[9px] px-1.5 py-1 rounded flex items-center gap-1 transition-all">
                                                    {isOptimizing ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />} Optimize
                                                </button>
                                            </div>
                                        </div>
                                        <textarea
                                            value={appMode === 'generator' ? systemPrompt : converterPrompt}
                                            onChange={e => appMode === 'generator' ? setSystemPrompt(e.target.value) : setConverterPrompt(e.target.value)}
                                            className="w-full h-40 bg-slate-950 border border-slate-700 rounded-lg p-2 text-[9px] font-mono text-slate-400 focus:border-indigo-500 outline-none resize-y leading-relaxed"
                                            spellCheck={false}
                                            placeholder={appMode === 'generator' ? "# ROLE..." : "# CONVERTER ROLE..."}
                                        />
                                    </div>

                                    {/* Max Traces for messages columns - visible in regular mode for HF/manual sources */}
                                    {(dataSourceMode === DataSource.HuggingFace || dataSourceMode === DataSource.Manual) && (
                                        <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg space-y-2">
                                            <p className="text-[10px] text-slate-400">
                                                When processing messages/conversation columns, limit the number of turns to rewrite:
                                            </p>
                                            <div className="flex items-center gap-3">
                                                <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                                    <Layers className="w-3 h-3" /> Max Traces
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={hfConfig.maxMultiTurnTraces || ''}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHfConfig({ ...hfConfig, maxMultiTurnTraces: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0) })}
                                                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                                    placeholder="All"
                                                />
                                                <span className="text-[10px] text-slate-500">Empty = process all traces</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                                    <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 mb-4 overflow-x-auto no-scrollbar">
                                        <button onClick={() => setActiveDeepTab(DeepPhase.Meta)} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === DeepPhase.Meta ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-white'}`}><BrainCircuit className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => setActiveDeepTab(DeepPhase.Retrieval)} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === DeepPhase.Retrieval ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-white'}`}><Search className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => setActiveDeepTab(DeepPhase.Derivation)} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === DeepPhase.Derivation ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-white'}`}><GitBranch className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => setActiveDeepTab(DeepPhase.Writer)} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === DeepPhase.Writer ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}><PenTool className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => setActiveDeepTab(DeepPhase.Rewriter)} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === DeepPhase.Rewriter ? 'bg-pink-600 text-white' : 'text-slate-500 hover:text-white'}`}><FileEdit className="w-3.5 h-3.5" /></button>
                                    </div>
                                    {activeDeepTab === DeepPhase.Writer && (
                                        <DeepPhaseConfigPanel
                                            title="Step 4: The Writer (Synthesis)"
                                            icon={<PenTool className="w-4 h-4" />}
                                            phase={deepConfig.phases.writer}
                                            onUpdatePhase={(updates) => updateDeepPhase('writer', updates)}
                                            onCopyToAll={() => copyDeepConfigToAll('writer')}
                                        />
                                    )}
                                    {activeDeepTab === DeepPhase.Meta && (
                                        <DeepPhaseConfigPanel
                                            title="Step 1: Meta-Analysis"
                                            icon={<BrainCircuit className="w-4 h-4" />}
                                            phase={deepConfig.phases.meta}
                                            onUpdatePhase={(updates) => updateDeepPhase('meta', updates)}
                                            onCopyToAll={() => copyDeepConfigToAll('meta')}
                                        />
                                    )}
                                    {activeDeepTab === DeepPhase.Retrieval && (
                                        <DeepPhaseConfigPanel
                                            title="Step 2: Retrieval & Constraints"
                                            icon={<Search className="w-4 h-4" />}
                                            phase={deepConfig.phases.retrieval}
                                            onUpdatePhase={(updates) => updateDeepPhase('retrieval', updates)}
                                            onCopyToAll={() => copyDeepConfigToAll('retrieval')}
                                        />
                                    )}
                                    {activeDeepTab === DeepPhase.Derivation && (
                                        <DeepPhaseConfigPanel
                                            title="Step 3: Logical Derivation"
                                            icon={<GitBranch className="w-4 h-4" />}
                                            phase={deepConfig.phases.derivation}
                                            onUpdatePhase={(updates) => updateDeepPhase('derivation', updates)}
                                            onCopyToAll={() => copyDeepConfigToAll('derivation')}
                                        />
                                    )}
                                    {activeDeepTab === DeepPhase.Rewriter && (
                                        <DeepPhaseConfigPanel
                                            title="Step 5: Response Rewriter (Optional)"
                                            icon={<FileEdit className="w-4 h-4" />}
                                            phase={deepConfig.phases.rewriter}
                                            onUpdatePhase={(updates) => updateDeepPhase('rewriter', updates)}
                                            onCopyToAll={() => copyDeepConfigToAll('rewriter')}
                                        />
                                    )}

                                    {/* Conversation Trace Rewriting Section - supported in both converter and generator modes */}
                                    {(appMode === 'converter' || appMode === 'generator') && (dataSourceMode === DataSource.HuggingFace || dataSourceMode === DataSource.Manual) && (
                                        <div className="mt-4 pt-4 border-t border-slate-700">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <RefreshCcw className="w-4 h-4 text-amber-400" />
                                                    <span className="text-sm font-medium text-white">Generate/Rewrite Conversation Traces</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newValue = !conversationRewriteMode;
                                                        setConversationRewriteMode(newValue);
                                                        // Auto-disable multi-turn if enabling conversation rewrite
                                                        if (newValue) {
                                                            setUserAgentConfig(prev => ({ ...prev, enabled: false }));
                                                        }
                                                    }}
                                                    className={`w-10 h-5 rounded-full transition-all relative ${conversationRewriteMode ? 'bg-amber-600' : 'bg-slate-700'}`}
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${conversationRewriteMode ? 'left-5' : 'left-0.5'}`} />
                                                </button>
                                            </div>
                                            {conversationRewriteMode && (
                                                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg animate-in fade-in duration-200 space-y-3">
                                                    <p className="text-[10px] text-amber-300/70">
                                                        Process existing conversation columns (messages/conversation) and rewrite only the {'<think>...</think>'} reasoning traces using symbolic notation.
                                                        User messages and final answers are preserved unchanged.
                                                    </p>
                                                    <div className="flex items-center gap-3">
                                                        <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                                            <Layers className="w-3 h-3" /> Max Traces
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={hfConfig.maxMultiTurnTraces || ''}
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHfConfig({ ...hfConfig, maxMultiTurnTraces: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0) })}
                                                            className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-amber-500 outline-none"
                                                            placeholder="All"
                                                        />
                                                        <span className="text-[10px] text-slate-500">Empty = process all traces</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* User Agent (Multi-Turn) Section */}

                                    <div className="mt-4 pt-4 border-t border-slate-700">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <MessageSquare className="w-4 h-4 text-cyan-400" />
                                                <span className="text-sm font-medium text-white">User Agent (Multi-Turn)</span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const newEnabled = !userAgentConfig.enabled;
                                                    setUserAgentConfig(prev => ({ ...prev, enabled: newEnabled }));
                                                    // Auto-disable conversation rewrite mode if enabling multi-turn
                                                    if (newEnabled) {
                                                        setConversationRewriteMode(false);
                                                    }
                                                }}
                                                className={`w-10 h-5 rounded-full transition-all relative ${userAgentConfig.enabled ? 'bg-cyan-600' : 'bg-slate-700'}`}
                                            >
                                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${userAgentConfig.enabled ? 'left-5' : 'left-0.5'}`} />
                                            </button>

                                        </div>
                                        {userAgentConfig.enabled && (
                                            <div className="space-y-3 p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg animate-in fade-in duration-200">
                                                <p className="text-[10px] text-cyan-300/70">Generates follow-up questions from a simulated user after DEEP reasoning.</p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] text-slate-500 font-bold uppercase flex justify-between">
                                                            <span>Follow-up Turns</span>
                                                            <span className="text-cyan-400">{userAgentConfig.followUpCount}</span>
                                                        </label>
                                                        <input
                                                            type="range"
                                                            min={1}
                                                            max={10}
                                                            value={userAgentConfig.followUpCount}
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserAgentConfig(prev => ({ ...prev, followUpCount: parseInt(e.target.value) }))}
                                                            className="w-full accent-cyan-500"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] text-slate-500 font-bold uppercase">Responder</label>
                                                        <select
                                                            value={userAgentConfig.responderPhase}
                                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUserAgentConfig(prev => ({ ...prev, responderPhase: e.target.value as ResponderPhase }))}
                                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-cyan-500 outline-none"
                                                        >
                                                            <option value={ResponderPhase.Writer}>Writer</option>
                                                            <option value={ResponderPhase.Rewriter}>Rewriter</option>
                                                            <option value={ResponderPhase.Responder}>Custom Responder</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-slate-500 font-bold uppercase">User Agent Provider</label>
                                                    <div className="flex bg-slate-950 p-0.5 rounded border border-slate-700">
                                                        <button onClick={() => setUserAgentConfig(prev => ({ ...prev, provider: ProviderTypeEnum.Gemini }))} className={`flex-1 py-1 text-[10px] font-medium rounded transition-all ${userAgentConfig.provider === ProviderTypeEnum.Gemini ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>Gemini</button>
                                                        <button onClick={() => setUserAgentConfig(prev => ({ ...prev, provider: ProviderTypeEnum.External }))} className={`flex-1 py-1 text-[10px] font-medium rounded transition-all ${userAgentConfig.provider === ProviderTypeEnum.External ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>External</button>
                                                    </div>
                                                </div>
                                                {userAgentConfig.provider === 'external' && (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-slate-500 font-bold uppercase">Provider</label>
                                                            <select
                                                                value={userAgentConfig.externalProvider}
                                                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUserAgentConfig(prev => ({ ...prev, externalProvider: e.target.value as ExternalProvider }))}
                                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                                                            >
                                                                {EXTERNAL_PROVIDERS.map(ep => <option key={ep} value={ep}>{ep}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-slate-500 font-bold uppercase">Model</label>
                                                            <ModelSelector
                                                                provider={userAgentConfig.externalProvider}
                                                                value={userAgentConfig.model}
                                                                onChange={(model) => setUserAgentConfig(prev => ({ ...prev, model }))}
                                                                apiKey={userAgentConfig.apiKey || SettingsService.getApiKey(userAgentConfig.externalProvider)}
                                                                customBaseUrl={userAgentConfig.customBaseUrl}
                                                                placeholder="Select model"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-slate-500 font-bold uppercase">API Type</label>
                                                            <select
                                                                value={userAgentConfig.apiType || 'chat'}
                                                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUserAgentConfig(prev => ({ ...prev, apiType: e.target.value as ApiType }))}
                                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                                                                title="API Type: chat=completions, responses=responses API"
                                                            >
                                                                <option value="chat">Chat</option>
                                                                <option value="responses">Responses</option>
                                                            </select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-slate-500 font-bold uppercase">API Key</label>
                                                            <input
                                                                type="password"
                                                                value={userAgentConfig.apiKey}
                                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserAgentConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                                                            />
                                                        </div>
                                                        {userAgentConfig.externalProvider === 'other' && (
                                                            <div className="col-span-2 space-y-1">
                                                                <label className="text-[10px] text-slate-500 font-bold uppercase">Base URL</label>
                                                                <input
                                                                    type="text"
                                                                    value={userAgentConfig.customBaseUrl}
                                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserAgentConfig(prev => ({ ...prev, customBaseUrl: e.target.value }))}
                                                                    placeholder="https://api.example.com/v1"
                                                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {/* Generation Params & Retry Config */}
                            <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-3">
                                <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Concurrency</label><input type="number" min="1" max="50" value={concurrency} onChange={e => setConcurrency(Math.max(1, parseInt(e.target.value) || 1))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none" /></div>
                                <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Sleep (ms)</label><input type="number" min="0" step="100" value={sleepTime} onChange={e => setSleepTime(Math.max(0, parseInt(e.target.value) || 0))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none" /></div>
                                <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Max Retries</label><input type="number" min="0" max="10" value={maxRetries} onChange={e => setMaxRetries(Math.max(0, parseInt(e.target.value) || 0))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none" /></div>
                                <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Retry Delay</label><input type="number" min="500" step="500" value={retryDelay} onChange={e => setRetryDelay(Math.max(500, parseInt(e.target.value) || 500))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none" /></div>
                            </div>
                        </div>

                        <DataSourcePanel
                            dataSourceMode={dataSourceMode}
                            onDataSourceModeChange={handleDataSourceModeChange}
                            topicCategory={topicCategory}
                            onTopicCategoryChange={setTopicCategory}
                            isGeneratingTopic={isGeneratingTopic}
                            onGenerateRandomTopic={generateRandomTopic}
                            geminiTopic={geminiTopic}
                            onGeminiTopicChange={setGeminiTopic}
                            rowsToFetch={rowsToFetch}
                            onRowsToFetchChange={setRowsToFetch}
                            skipRows={skipRows}
                            onSkipRowsChange={setSkipRows}
                            hfConfig={hfConfig}
                            setHfConfig={setHfConfig}
                            hfStructure={hfStructure}
                            hfSearchResults={hfSearchResults}
                            isSearchingHF={isSearchingHF}
                            showHFResults={showHFResults}
                            setShowHFResults={setShowHFResults}
                            onHFSearch={handleHFSearch}
                            onSelectHFDataset={handleSelectHFDataset}
                            onConfigChange={handleConfigChange}
                            onSplitChange={handleSplitChange}
                            prefetchColumns={prefetchColumns}
                            isPrefetching={isPrefetching}
                            availableColumns={availableColumns}
                            detectedColumns={detectedColumns}
                            concurrency={concurrency}
                            hfTotalRows={hfTotalRows}
                            hfPreviewData={hfPreviewData}
                            isLoadingHfPreview={isLoadingHfPreview}
                            onClearHfPreview={() => setHfPreviewData([])}
                            converterInputText={converterInputText}
                            onConverterInputChange={(value) => {
                                setConverterInputText(value);
                                setRowsToFetch(value.split('\n').filter((l: string) => l.trim()).length);
                            }}
                            sourceFileInputRef={sourceFileInputRef}
                            onLoadSourceFile={handleLoadSourceFile}
                        />

                        {/* Prompt Editor (Same) */}

                    </div>

                    {/* Feed / Analytics (CREATOR MODE) */}
                    <div className="lg:col-span-8">
                        <FeedControlBar
                            viewMode={viewMode}
                            logFilter={logFilter}
                            hasInvalidLogs={hasInvalidLogs}
                            showLatestOnly={showLatestOnly}
                            feedPageSize={feedPageSize}
                            onViewModeChange={setViewMode}
                            onLogFilterChange={setLogFilter}
                            onShowLatestOnlyChange={setShowLatestOnly}
                            onFeedPageSizeChange={setFeedPageSize}
                        />

                        {viewMode === ViewMode.Feed ? (
                            <LogFeed
                                logs={visibleLogs}
                                pageSize={feedPageSize}
                                totalLogCount={filteredLogCount}
                                currentPage={currentPage}
                                onPageChange={handlePageChange}
                                onRetry={retryItem}
                                onRetrySave={retrySave}
                                onSaveToDb={saveItemToDb}
                                onDelete={handleDeleteLog}
                                onHalt={haltStreamingItem}
                                retryingIds={retryingIds}
                                savingIds={savingToDbIds}
                                isProdMode={environment === 'production'}
                                streamingConversations={logFilter === 'live' ? streamingConversationsRef.current : undefined}
                                streamingVersion={streamingConversationsVersion}
                                showLatestOnly={showLatestOnly}
                                onShowLatestOnlyChange={setShowLatestOnly}
                            />
                        ) : (
                            <AnalyticsDashboard logs={visibleLogs} />
                        )}
                    </div>
                </main>
            )}

            {/* Settings Panel */}
            <SettingsPanel
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                onSettingsChanged={async () => {
                    refreshPrompts();
                    // Refresh logs to pick up any storage changes
                    await refreshLogs();
                }}
            />

            {/* Toast Notifications */}
            <ToastContainer />
            <ConfirmModalContainer />
        </div>
    );
}
