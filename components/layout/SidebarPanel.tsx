import type { Dispatch, RefObject, SetStateAction } from 'react';
import { DeepConfig, DetectedColumns, GenerationParams, HuggingFaceConfig, ProgressStats, UserAgentConfig } from '../../types';
import { ApiType, AppMode, DataSource, DeepPhase, EngineMode, Environment, ExternalProvider, OllamaStatus, ProviderType } from '../../interfaces/enums';
import { OutputField } from '../../interfaces/types/PromptSchema';
import { OutputFieldName } from '../../interfaces/enums/OutputFieldName';
import { PrefetchState } from '../../services/hfPrefetchService';
import { TaskType } from '../../interfaces/enums';
import SidebarSessionPanel from './SidebarSessionPanel';
import SidebarEnginePanel from './SidebarEnginePanel';
import SidebarDataSourcePanel from './SidebarDataSourcePanel';
import { OllamaModel } from '../../services/externalApiService';
import { ModelListProvider } from '../../types';

export interface SidebarPanelProps {
    sessionName: string | null;
    environment: Environment;
    onLoadSession: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSaveSession: () => void;
    onCloudLoadOpen: () => void;
    onCloudSave: () => void;
    appMode: AppMode;
    onAppModeChange: (mode: AppMode) => void;
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
    fileInputRef: RefObject<HTMLInputElement | null>;
    hfConfig: HuggingFaceConfig;
    onHfConfigChange: Dispatch<SetStateAction<HuggingFaceConfig>>;
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
    onConverterInputChange: (value: string) => void;
    sourceFileInputRef: RefObject<HTMLInputElement | null>;
    onLoadSourceFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onDataSourceModeChange: (mode: DataSource) => void;
}

export default function SidebarPanel(props: SidebarPanelProps) {
    const {
        sessionName,
        environment,
        onLoadSession,
        onSaveSession,
        onCloudLoadOpen,
        onCloudSave,
        appMode,
        onAppModeChange,
        isRunning,
        isPaused,
        progress,
        dataSourceMode,
        prefetchState,
        error,
        isStreamingEnabled,
        onStreamingChange,
        onStart,
        onPause,
        onResume,
        onStop,
        totalLogCount,
        invalidLogCount,
        detectedTaskType,
        autoRoutedPromptSet,
        showMiniDbPanel,
        dbStats,
        sparklineHistory,
        unsavedCount,
        onSyncAll,
        onRetryAllFailed,
        onStartNewSession,
        engineMode,
        onEngineModeChange,
        sessionPromptSet,
        onSessionPromptSetChange,
        availablePromptSets,
        provider,
        externalProvider,
        externalModel,
        apiType,
        externalApiKey,
        customBaseUrl,
        externalProviders,
        onProviderSelect,
        onApiTypeChange,
        onExternalModelChange,
        onExternalApiKeyChange,
        onCustomBaseUrlChange,
        ollamaStatus,
        ollamaModels,
        ollamaLoading,
        onRefreshOllamaModels,
        modelSelectorProvider,
        modelSelectorApiKey,
        modelSelectorPlaceholder,
        defaultCustomBaseUrl,
        generationParams,
        onGenerationParamsChange,
        systemPrompt,
        converterPrompt,
        onSystemPromptChange,
        onConverterPromptChange,
        outputFields,
        selectedFields,
        onFieldToggle,
        onResetFieldSelection,
        onSelectAllFields,
        onDeselectAllFields,
        useNativeOutput,
        onToggleNativeOutput,
        onLoadRubric,
        onSaveRubric,
        onOptimizePrompt,
        isOptimizing,
        fileInputRef,
        hfConfig,
        onHfConfigChange,
        activeDeepTab,
        onActiveDeepTabChange,
        deepConfig,
        onUpdatePhase,
        onCopyToAll,
        conversationRewriteMode,
        onConversationRewriteModeChange,
        onDisableUserAgent,
        userAgentConfig,
        onUserAgentConfigChange,
        concurrency,
        onConcurrencyChange,
        sleepTime,
        onSleepTimeChange,
        maxRetries,
        onMaxRetriesChange,
        retryDelay,
        onRetryDelayChange,
        topicCategory,
        onTopicCategoryChange,
        isGeneratingTopic,
        onGenerateRandomTopic,
        geminiTopic,
        onGeminiTopicChange,
        rowsToFetch,
        onRowsToFetchChange,
        skipRows,
        onSkipRowsChange,
        hfStructure,
        hfSearchResults,
        isSearchingHF,
        showHFResults,
        setShowHFResults,
        onHFSearch,
        onSelectHFDataset,
        onConfigChange,
        onSplitChange,
        prefetchColumns,
        isPrefetching,
        availableColumns,
        detectedColumns,
        hfTotalRows,
        hfPreviewData,
        isLoadingHfPreview,
        onClearHfPreview,
        converterInputText,
        onConverterInputChange,
        sourceFileInputRef,
        onLoadSourceFile
    } = props;

    return (
        <div className="lg:col-span-4 space-y-6">
            <SidebarSessionPanel
                sessionName={sessionName}
                environment={environment}
                onLoadSession={onLoadSession}
                onSaveSession={onSaveSession}
                onCloudLoadOpen={onCloudLoadOpen}
                onCloudSave={onCloudSave}
                appMode={appMode}
                onAppModeChange={onAppModeChange}
                isRunning={isRunning}
                isPaused={isPaused}
                progress={progress}
                dataSourceMode={dataSourceMode}
                prefetchState={prefetchState}
                error={error}
                isStreamingEnabled={isStreamingEnabled}
                onStreamingChange={onStreamingChange}
                onStart={onStart}
                onPause={onPause}
                onResume={onResume}
                onStop={onStop}
                totalLogCount={totalLogCount}
                invalidLogCount={invalidLogCount}
                detectedTaskType={detectedTaskType}
                autoRoutedPromptSet={autoRoutedPromptSet}
                showMiniDbPanel={showMiniDbPanel}
                dbStats={dbStats}
                sparklineHistory={sparklineHistory}
                unsavedCount={unsavedCount}
                onSyncAll={onSyncAll}
                onRetryAllFailed={onRetryAllFailed}
                onStartNewSession={onStartNewSession}
            />

            <SidebarEnginePanel
                engineMode={engineMode}
                onEngineModeChange={onEngineModeChange}
                sessionPromptSet={sessionPromptSet}
                onSessionPromptSetChange={onSessionPromptSetChange}
                availablePromptSets={availablePromptSets}
                provider={provider}
                externalProvider={externalProvider}
                externalModel={externalModel}
                apiType={apiType}
                externalApiKey={externalApiKey}
                customBaseUrl={customBaseUrl}
                externalProviders={externalProviders}
                onProviderSelect={onProviderSelect}
                onApiTypeChange={onApiTypeChange}
                onExternalModelChange={onExternalModelChange}
                onExternalApiKeyChange={onExternalApiKeyChange}
                onCustomBaseUrlChange={onCustomBaseUrlChange}
                ollamaStatus={ollamaStatus}
                ollamaModels={ollamaModels}
                ollamaLoading={ollamaLoading}
                onRefreshOllamaModels={onRefreshOllamaModels}
                modelSelectorProvider={modelSelectorProvider}
                modelSelectorApiKey={modelSelectorApiKey}
                modelSelectorPlaceholder={modelSelectorPlaceholder}
                defaultCustomBaseUrl={defaultCustomBaseUrl}
                generationParams={generationParams}
                onGenerationParamsChange={onGenerationParamsChange}
                appMode={appMode}
                systemPrompt={systemPrompt}
                converterPrompt={converterPrompt}
                onSystemPromptChange={onSystemPromptChange}
                onConverterPromptChange={onConverterPromptChange}
                onLoadRubric={onLoadRubric}
                onSaveRubric={onSaveRubric}
                onOptimizePrompt={onOptimizePrompt}
                isOptimizing={isOptimizing}
                fileInputRef={fileInputRef}
                dataSourceMode={dataSourceMode}
                hfConfig={hfConfig}
                onHfConfigChange={onHfConfigChange}
                activeDeepTab={activeDeepTab}
                onActiveDeepTabChange={onActiveDeepTabChange}
                deepConfig={deepConfig}
                onUpdatePhase={onUpdatePhase}
                onCopyToAll={onCopyToAll}
                conversationRewriteMode={conversationRewriteMode}
                onConversationRewriteModeChange={onConversationRewriteModeChange}
                onDisableUserAgent={onDisableUserAgent}
                userAgentConfig={userAgentConfig}
                onUserAgentConfigChange={onUserAgentConfigChange}
                outputFields={outputFields}
                selectedFields={selectedFields}
                onFieldToggle={onFieldToggle}
                onResetFieldSelection={onResetFieldSelection}
                onSelectAllFields={onSelectAllFields}
                onDeselectAllFields={onDeselectAllFields}
                useNativeOutput={useNativeOutput}
                onToggleNativeOutput={onToggleNativeOutput}
                concurrency={concurrency}
                onConcurrencyChange={onConcurrencyChange}
                sleepTime={sleepTime}
                onSleepTimeChange={onSleepTimeChange}
                maxRetries={maxRetries}
                onMaxRetriesChange={onMaxRetriesChange}
                retryDelay={retryDelay}
                onRetryDelayChange={onRetryDelayChange}
            />

            <SidebarDataSourcePanel
                dataSourceMode={dataSourceMode}
                onDataSourceModeChange={props.onDataSourceModeChange}
                topicCategory={topicCategory}
                onTopicCategoryChange={onTopicCategoryChange}
                isGeneratingTopic={isGeneratingTopic}
                onGenerateRandomTopic={onGenerateRandomTopic}
                geminiTopic={geminiTopic}
                onGeminiTopicChange={onGeminiTopicChange}
                rowsToFetch={rowsToFetch}
                onRowsToFetchChange={onRowsToFetchChange}
                skipRows={skipRows}
                onSkipRowsChange={onSkipRowsChange}
                hfConfig={hfConfig}
                setHfConfig={onHfConfigChange}
                hfStructure={hfStructure}
                hfSearchResults={hfSearchResults}
                isSearchingHF={isSearchingHF}
                showHFResults={showHFResults}
                setShowHFResults={setShowHFResults}
                onHFSearch={onHFSearch}
                onSelectHFDataset={onSelectHFDataset}
                onConfigChange={onConfigChange}
                onSplitChange={onSplitChange}
                prefetchColumns={prefetchColumns}
                isPrefetching={isPrefetching}
                availableColumns={availableColumns}
                detectedColumns={detectedColumns}
                concurrency={concurrency}
                hfTotalRows={hfTotalRows}
                hfPreviewData={hfPreviewData}
                isLoadingHfPreview={isLoadingHfPreview}
                onClearHfPreview={onClearHfPreview}
                converterInputText={converterInputText}
                onConverterInputChange={onConverterInputChange}
                sourceFileInputRef={sourceFileInputRef}
                onLoadSourceFile={onLoadSourceFile}
            />
        </div>
    );
}
