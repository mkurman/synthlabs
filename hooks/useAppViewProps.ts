import { useCallback, useMemo } from 'react';
import { FeedAnalyticsPanelProps } from '../components/layout/FeedAnalyticsPanel';
import { SidebarPanelProps } from '../components/layout/SidebarPanel';
import { VerifierContentProps } from '../components/layout/VerifierContent';
import { CreatorMode, DataSource, DeepPhase, EngineMode, Environment, ExternalProvider, LogFilter, ProviderType, ApiType, OllamaStatus, ViewMode, FeedDisplayMode, LogFeedRewriteTarget } from '../interfaces/enums';
import { DeepConfig, DetectedColumns, GenerationParams, HuggingFaceConfig, ProgressStats, UserAgentConfig } from '../types';
import { PrefetchState } from '../services/hfPrefetchService';
import { TaskType } from '../interfaces/enums';
import { OllamaModel } from '../services/externalApiService';
import { ModelListProvider, SynthLogItem, StreamingConversationState } from '../types';
import { OutputField } from '../interfaces/types/PromptSchema';
import { OutputFieldName } from '../interfaces/enums/OutputFieldName';

interface UseAppViewPropsInput {
    sessionName: string | null;
    environment: Environment;
    onLoadSession: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSaveSession: () => void;
    onCloudLoadOpen: () => void;
    onCloudSave: () => void;
    appMode: CreatorMode;
    onAppModeChange: (mode: CreatorMode) => void;
    isRunning: boolean;
    isPaused: boolean;
    progress: ProgressStats;
    dataSourceMode: DataSource;
    prefetchState: PrefetchState | null;
    error: string | null;
    isStreamingEnabled: boolean;
    onStreamingChange: (enabled: boolean) => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    totalLogCount: number;
    invalidLogCount: number;
    detectedTaskType: TaskType | null;
    autoRoutedPromptSet: string | null;
    showMiniDbPanel: boolean;
    dbStats: { total: number; session: number };
    sparklineHistory: number[];
    unsavedCount: number;
    onSyncAll: () => void;
    onRetryAllFailed: () => void;
    onStartNewSession: () => void;
    engineMode: EngineMode;
    onEngineModeChange: (mode: EngineMode) => void;
    sessionPromptSet: string | null;
    onSessionPromptSetChange: (value: string | null) => void;
    availablePromptSets: string[];
    provider: ProviderType;
    externalProvider: ExternalProvider;
    externalModel: string;
    apiType: ApiType;
    externalApiKey: string;
    customBaseUrl: string;
    externalProviders: string[];
    onProviderSelect: (value: string) => void;
    onApiTypeChange: (value: ApiType) => void;
    onExternalModelChange: (value: string) => void;
    onExternalApiKeyChange: (value: string) => void;
    onCustomBaseUrlChange: (value: string) => void;
    ollamaStatus: OllamaStatus;
    ollamaModels: OllamaModel[];
    ollamaLoading: boolean;
    onRefreshOllamaModels: () => void;
    modelSelectorProvider: ModelListProvider;
    modelSelectorApiKey: string;
    modelSelectorPlaceholder: string;
    defaultCustomBaseUrl: string;
    generationParams: GenerationParams;
    onGenerationParamsChange: (params: GenerationParams) => void;
    systemPrompt: string;
    converterPrompt: string;
    onSystemPromptChange: (value: string) => void;
    onConverterPromptChange: (value: string) => void;
    // Field selection props
    outputFields: OutputField[];
    selectedFields: OutputFieldName[];
    onFieldToggle: (fieldName: OutputFieldName) => void;
    onResetFieldSelection: () => void;
    onSelectAllFields: () => void;
    onDeselectAllFields: () => void;
    useNativeOutput: boolean;
    onToggleNativeOutput: (value: boolean) => void;
    onLoadRubric: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSaveRubric: () => void;
    onOptimizePrompt: () => void;
    isOptimizing: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    hfConfig: HuggingFaceConfig;
    onHfConfigChange: React.Dispatch<React.SetStateAction<HuggingFaceConfig>>;
    activeDeepTab: DeepPhase;
    onActiveDeepTabChange: (phase: DeepPhase) => void;
    deepConfig: DeepConfig;
    onUpdatePhase: (phase: 'meta' | 'retrieval' | 'derivation' | 'writer' | 'rewriter', updates: Partial<DeepConfig['phases']['meta']>) => void;
    onCopyToAll: (phase: 'meta' | 'retrieval' | 'derivation' | 'writer' | 'rewriter') => void;
    conversationRewriteMode: boolean;
    onConversationRewriteModeChange: (enabled: boolean) => void;
    onDisableUserAgent: () => void;
    userAgentConfig: UserAgentConfig;
    onUserAgentConfigChange: (updater: (prev: UserAgentConfig) => UserAgentConfig) => void;
    concurrency: number;
    onConcurrencyChange: (value: number) => void;
    sleepTime: number;
    onSleepTimeChange: (value: number) => void;
    maxRetries: number;
    onMaxRetriesChange: (value: number) => void;
    retryDelay: number;
    onRetryDelayChange: (value: number) => void;
    topicCategory: string;
    onTopicCategoryChange: (category: string) => void;
    isGeneratingTopic: boolean;
    onGenerateRandomTopic: () => void;
    geminiTopic: string;
    onGeminiTopicChange: (topic: string) => void;
    rowsToFetch: number;
    onRowsToFetchChange: (value: number) => void;
    skipRows: number;
    onSkipRowsChange: (value: number) => void;
    hfStructure: { configs: string[]; splits: Record<string, string[]> };
    hfSearchResults: string[];
    isSearchingHF: boolean;
    showHFResults: boolean;
    setShowHFResults: (show: boolean) => void;
    onHFSearch: (value: string) => void;
    onSelectHFDataset: (dataset: string) => void;
    onConfigChange: (config: string) => void;
    onSplitChange: (split: string) => void;
    prefetchColumns: () => void;
    isPrefetching: boolean;
    availableColumns: string[];
    detectedColumns: DetectedColumns;
    hfTotalRows: number;
    hfPreviewData: any[];
    isLoadingHfPreview: boolean;
    onClearHfPreview: () => void;
    converterInputText: string;
    setConverterInputText: React.Dispatch<React.SetStateAction<string>>;
    setRowsToFetch: React.Dispatch<React.SetStateAction<number>>;
    sourceFileInputRef: React.RefObject<HTMLInputElement | null>;
    onLoadSourceFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onDataSourceModeChange: (mode: DataSource) => void;
    viewMode: ViewMode;
    logFilter: LogFilter;
    hasInvalidLogs: boolean;
    showLatestOnly: boolean;
    feedPageSize: number;
    feedDisplayMode: FeedDisplayMode;
    onViewModeChange: (mode: ViewMode) => void;
    onLogFilterChange: (filter: LogFilter) => void;
    onShowLatestOnlyChange: (value: boolean) => void;
    onFeedPageSizeChange: (size: number) => void;
    onFeedDisplayModeChange: (mode: FeedDisplayMode) => void;
    visibleLogs: SynthLogItem[];
    filteredLogCount: number;
    currentPage: number;
    onPageChange: (page: number) => void;
    onRetry: (id: string) => void;
    onRetrySave: (id: string) => void;
    onSaveToDb: (id: string) => void;
    onDelete: (id: string) => void;
    onHalt: (id: string) => void;
    retryingIds: Set<string>;
    savingIds: Set<string>;
    streamingConversations?: Map<string, StreamingConversationState>;
    streamingVersion: number;
    sessionUid: string;
    isLoadingLogs: boolean;
    // Inline editing props
    editingField?: { itemId: string; field: LogFeedRewriteTarget; originalValue: string } | null;
    editValue?: string;
    onStartEditing?: (itemId: string, field: LogFeedRewriteTarget, currentValue: string) => void;
    onSaveEditing?: () => void;
    onCancelEditing?: () => void;
    onEditValueChange?: (value: string) => void;
    // Rewriting props
    rewritingField?: { itemId: string; field: LogFeedRewriteTarget } | null;
    streamingContent?: string;
    onRewrite?: (itemId: string, field: LogFeedRewriteTarget) => void;
}

export function useAppViewProps(input: UseAppViewPropsInput) {
    const onConverterInputChange = useCallback((value: string) => {
        input.setConverterInputText(value);
        input.setRowsToFetch(value.split('\n').filter((l: string) => l.trim()).length);
    }, [input]);

    const sidebarProps: SidebarPanelProps = useMemo(() => ({
        sessionName: input.sessionName,
        environment: input.environment,
        onLoadSession: input.onLoadSession,
        onSaveSession: input.onSaveSession,
        onCloudLoadOpen: input.onCloudLoadOpen,
        onCloudSave: input.onCloudSave,
        appMode: input.appMode,
        onAppModeChange: input.onAppModeChange,
        isRunning: input.isRunning,
        isPaused: input.isPaused,
        progress: input.progress,
        dataSourceMode: input.dataSourceMode,
        prefetchState: input.prefetchState,
        error: input.error,
        isStreamingEnabled: input.isStreamingEnabled,
        onStreamingChange: input.onStreamingChange,
        onStart: input.onStart,
        onPause: input.onPause,
        onResume: input.onResume,
        onStop: input.onStop,
        totalLogCount: input.totalLogCount,
        invalidLogCount: input.invalidLogCount,
        detectedTaskType: input.detectedTaskType,
        autoRoutedPromptSet: input.autoRoutedPromptSet,
        showMiniDbPanel: input.showMiniDbPanel,
        dbStats: input.dbStats,
        sparklineHistory: input.sparklineHistory,
        unsavedCount: input.unsavedCount,
        onSyncAll: input.onSyncAll,
        onRetryAllFailed: input.onRetryAllFailed,
        onStartNewSession: input.onStartNewSession,
        engineMode: input.engineMode,
        onEngineModeChange: input.onEngineModeChange,
        sessionPromptSet: input.sessionPromptSet,
        onSessionPromptSetChange: input.onSessionPromptSetChange,
        availablePromptSets: input.availablePromptSets,
        provider: input.provider,
        externalProvider: input.externalProvider,
        externalModel: input.externalModel,
        apiType: input.apiType,
        externalApiKey: input.externalApiKey,
        customBaseUrl: input.customBaseUrl,
        externalProviders: input.externalProviders,
        onProviderSelect: input.onProviderSelect,
        onApiTypeChange: input.onApiTypeChange,
        onExternalModelChange: input.onExternalModelChange,
        onExternalApiKeyChange: input.onExternalApiKeyChange,
        onCustomBaseUrlChange: input.onCustomBaseUrlChange,
        ollamaStatus: input.ollamaStatus,
        ollamaModels: input.ollamaModels,
        ollamaLoading: input.ollamaLoading,
        onRefreshOllamaModels: input.onRefreshOllamaModels,
        modelSelectorProvider: input.modelSelectorProvider,
        modelSelectorApiKey: input.modelSelectorApiKey,
        modelSelectorPlaceholder: input.modelSelectorPlaceholder,
        defaultCustomBaseUrl: input.defaultCustomBaseUrl,
        generationParams: input.generationParams,
        onGenerationParamsChange: input.onGenerationParamsChange,
        systemPrompt: input.systemPrompt,
        converterPrompt: input.converterPrompt,
        onSystemPromptChange: input.onSystemPromptChange,
        onConverterPromptChange: input.onConverterPromptChange,
        outputFields: input.outputFields,
        selectedFields: input.selectedFields,
        onFieldToggle: input.onFieldToggle,
        onResetFieldSelection: input.onResetFieldSelection,
        onSelectAllFields: input.onSelectAllFields,
        onDeselectAllFields: input.onDeselectAllFields,
        useNativeOutput: input.useNativeOutput,
        onToggleNativeOutput: input.onToggleNativeOutput,
        onLoadRubric: input.onLoadRubric,
        onSaveRubric: input.onSaveRubric,
        onOptimizePrompt: input.onOptimizePrompt,
        isOptimizing: input.isOptimizing,
        fileInputRef: input.fileInputRef,
        hfConfig: input.hfConfig,
        onHfConfigChange: input.onHfConfigChange,
        activeDeepTab: input.activeDeepTab,
        onActiveDeepTabChange: input.onActiveDeepTabChange,
        deepConfig: input.deepConfig,
        onUpdatePhase: input.onUpdatePhase,
        onCopyToAll: input.onCopyToAll,
        conversationRewriteMode: input.conversationRewriteMode,
        onConversationRewriteModeChange: input.onConversationRewriteModeChange,
        onDisableUserAgent: input.onDisableUserAgent,
        userAgentConfig: input.userAgentConfig,
        onUserAgentConfigChange: input.onUserAgentConfigChange,
        concurrency: input.concurrency,
        onConcurrencyChange: input.onConcurrencyChange,
        sleepTime: input.sleepTime,
        onSleepTimeChange: input.onSleepTimeChange,
        maxRetries: input.maxRetries,
        onMaxRetriesChange: input.onMaxRetriesChange,
        retryDelay: input.retryDelay,
        onRetryDelayChange: input.onRetryDelayChange,
        topicCategory: input.topicCategory,
        onTopicCategoryChange: input.onTopicCategoryChange,
        isGeneratingTopic: input.isGeneratingTopic,
        onGenerateRandomTopic: input.onGenerateRandomTopic,
        geminiTopic: input.geminiTopic,
        onGeminiTopicChange: input.onGeminiTopicChange,
        rowsToFetch: input.rowsToFetch,
        onRowsToFetchChange: input.onRowsToFetchChange,
        skipRows: input.skipRows,
        onSkipRowsChange: input.onSkipRowsChange,
        hfStructure: input.hfStructure,
        hfSearchResults: input.hfSearchResults,
        isSearchingHF: input.isSearchingHF,
        showHFResults: input.showHFResults,
        setShowHFResults: input.setShowHFResults,
        onHFSearch: input.onHFSearch,
        onSelectHFDataset: input.onSelectHFDataset,
        onConfigChange: input.onConfigChange,
        onSplitChange: input.onSplitChange,
        prefetchColumns: input.prefetchColumns,
        isPrefetching: input.isPrefetching,
        availableColumns: input.availableColumns,
        detectedColumns: input.detectedColumns,
        hfTotalRows: input.hfTotalRows,
        hfPreviewData: input.hfPreviewData,
        isLoadingHfPreview: input.isLoadingHfPreview,
        onClearHfPreview: input.onClearHfPreview,
        converterInputText: input.converterInputText,
        onConverterInputChange,
        sourceFileInputRef: input.sourceFileInputRef,
        onLoadSourceFile: input.onLoadSourceFile,
        onDataSourceModeChange: input.onDataSourceModeChange
    }), [input, onConverterInputChange]);

    const feedProps: FeedAnalyticsPanelProps = useMemo(() => ({
        viewMode: input.viewMode,
        logFilter: input.logFilter,
        hasInvalidLogs: input.hasInvalidLogs,
        showLatestOnly: input.showLatestOnly,
        feedPageSize: input.feedPageSize,
        feedDisplayMode: input.feedDisplayMode,
        onViewModeChange: input.onViewModeChange,
        onLogFilterChange: input.onLogFilterChange,
        onShowLatestOnlyChange: input.onShowLatestOnlyChange,
        onFeedPageSizeChange: input.onFeedPageSizeChange,
        onFeedDisplayModeChange: input.onFeedDisplayModeChange,
        logs: input.visibleLogs,
        totalLogCount: input.filteredLogCount,
        currentPage: input.currentPage,
        onPageChange: input.onPageChange,
        onRetry: input.onRetry,
        onRetrySave: input.onRetrySave,
        onSaveToDb: input.onSaveToDb,
        onDelete: input.onDelete,
        onHalt: input.onHalt,
        retryingIds: input.retryingIds,
        savingIds: input.savingIds,
        isProdMode: input.environment === Environment.Production,
        streamingConversations: input.logFilter === LogFilter.Live ? input.streamingConversations : undefined,
        streamingVersion: input.streamingVersion,
        isLoading: input.isLoadingLogs,
        editingField: input.editingField,
        editValue: input.editValue,
        onStartEditing: input.onStartEditing,
        onSaveEditing: input.onSaveEditing,
        onCancelEditing: input.onCancelEditing,
        onEditValueChange: input.onEditValueChange,
        rewritingField: input.rewritingField,
        streamingContent: input.streamingContent,
        onRewrite: input.onRewrite
    }), [input]);

    const verifierProps: VerifierContentProps = useMemo(() => ({
        sessionUid: input.sessionUid,
        provider: input.provider,
        externalProvider: input.externalProvider,
        externalModel: input.externalModel,
        externalApiKey: input.externalApiKey
    }), [input]);

    return { sidebarProps, feedProps, verifierProps };
}
