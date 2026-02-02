import { GenerationParams, HuggingFaceConfig, UserAgentConfig, DeepConfig } from '../../types';
import { ApiType, CreatorMode, DataSource, DeepPhase, EngineMode, ExternalProvider, OllamaStatus, ProviderType } from '../../interfaces/enums';
import { OutputField } from '../../interfaces/types/PromptSchema';
import { OutputFieldName } from '../../interfaces/enums/OutputFieldName';
import { OllamaModel } from '../../services/externalApiService';
import { ModelListProvider } from '../../types';
import EngineHeaderPanel from '../panels/EngineHeaderPanel';
import ProviderConfigPanel from '../panels/ProviderConfigPanel';
import GenerationPromptPanel from '../panels/GenerationPromptPanel';
import DeepPhaseTabsPanel from '../panels/DeepPhaseTabsPanel';
import ConversationRewritePanel from '../panels/ConversationRewritePanel';
import UserAgentConfigPanel from '../panels/UserAgentConfigPanel';
import RetryConfigPanel from '../panels/RetryConfigPanel';

interface SidebarEnginePanelProps {
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
    appMode: CreatorMode;
    systemPrompt: string;
    converterPrompt: string;
    onSystemPromptChange: (value: string) => void;
    onConverterPromptChange: (value: string) => void;
    onLoadRubric: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSaveRubric: () => void;
    onOptimizePrompt: () => void;
    isOptimizing: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    dataSourceMode: DataSource;
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
    // Field selection props
    outputFields: OutputField[];
    selectedFields: OutputFieldName[];
    onFieldToggle: (fieldName: OutputFieldName) => void;
    onResetFieldSelection: () => void;
    onSelectAllFields: () => void;
    onDeselectAllFields: () => void;
    useNativeOutput: boolean;
    onToggleNativeOutput: (value: boolean) => void;
}

export default function SidebarEnginePanel({
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
    appMode,
    systemPrompt,
    converterPrompt,
    onSystemPromptChange,
    onConverterPromptChange,
    onLoadRubric,
    onSaveRubric,
    onOptimizePrompt,
    isOptimizing,
    fileInputRef,
    dataSourceMode,
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
    outputFields,
    selectedFields: _selectedFields,
    onFieldToggle,
    onResetFieldSelection,
    onSelectAllFields,
    onDeselectAllFields,
    useNativeOutput,
    onToggleNativeOutput
}: SidebarEnginePanelProps) {
    return (
        <div className="space-y-4">
            <EngineHeaderPanel
                engineMode={engineMode}
                onEngineModeChange={onEngineModeChange}
                sessionPromptSet={sessionPromptSet}
                onSessionPromptSetChange={onSessionPromptSetChange}
                availablePromptSets={availablePromptSets}
            />

            {engineMode === EngineMode.Regular ? (
                <div className="animate-in fade-in slide-in-from-left-2 duration-300 space-y-4">
                    <ProviderConfigPanel
                        provider={provider}
                        externalProvider={externalProvider}
                        externalModel={externalModel}
                        apiType={apiType}
                        externalApiKey={externalApiKey}
                        customBaseUrl={customBaseUrl}
                        externalProviders={externalProviders}
                        providerSelectValue={provider === ProviderType.Gemini ? 'gemini' : externalProvider}
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
                    />
                    <GenerationPromptPanel
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
                        outputFields={outputFields}
                        onFieldToggle={onFieldToggle}
                        onResetFieldSelection={onResetFieldSelection}
                        onSelectAllFields={onSelectAllFields}
                        onDeselectAllFields={onDeselectAllFields}
                        useNativeOutput={useNativeOutput}
                        onToggleNativeOutput={onToggleNativeOutput}
                    />
                </div>
            ) : (
                <div className="space-y-4">
                    <DeepPhaseTabsPanel
                        activeDeepTab={activeDeepTab}
                        onActiveDeepTabChange={onActiveDeepTabChange}
                        deepConfig={deepConfig}
                        onUpdatePhase={onUpdatePhase}
                        onCopyToAll={onCopyToAll}
                    />
                    <ConversationRewritePanel
                        appMode={appMode}
                        dataSourceMode={dataSourceMode}
                        conversationRewriteMode={conversationRewriteMode}
                        onConversationRewriteModeChange={onConversationRewriteModeChange}
                        onDisableUserAgent={onDisableUserAgent}
                        hfConfig={hfConfig}
                        onHfConfigChange={onHfConfigChange}
                    />
                    <UserAgentConfigPanel
                        userAgentConfig={userAgentConfig}
                        onUserAgentConfigChange={onUserAgentConfigChange}
                        onDisableConversationRewrite={() => onConversationRewriteModeChange(false)}
                    />
                </div>
            )}

            <RetryConfigPanel
                concurrency={concurrency}
                onConcurrencyChange={onConcurrencyChange}
                sleepTime={sleepTime}
                onSleepTimeChange={onSleepTimeChange}
                maxRetries={maxRetries}
                onMaxRetriesChange={onMaxRetriesChange}
                retryDelay={retryDelay}
                onRetryDelayChange={onRetryDelayChange}
            />
        </div>
    );
}
