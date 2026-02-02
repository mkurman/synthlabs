import React, { useEffect } from 'react';
import { Settings, X, Key, Cloud, Trash2, Save, Eye, EyeOff, AlertTriangle, Check, Database, Cpu, FileText, ChevronDown, ChevronRight, Layers, Zap, Bot, Sliders, RefreshCw, Server, Timer, Maximize2, Minimize2 } from 'lucide-react';
import { SettingsService, AVAILABLE_PROVIDERS, EMPTY_STEP_CONFIG } from '../services/settingsService';
import { ApiType, ExternalProvider, ProviderType, EngineMode, SettingsPanelTab, ApiSubTab } from '../interfaces/enums';
import GenerationParamsInput from './GenerationParamsInput';
import { PromptService } from '../services/promptService';
import { TaskClassifierService, TASK_PROMPT_MAPPING } from '../services/taskClassifierService';
import { PROVIDERS } from '../constants';
import { formatOllamaModelSize } from '../services/externalApiService';
import ModelSelector from './ModelSelector';
import { ModelListProvider } from '../types';
import { OllamaStatus } from '../interfaces/enums';
import { useSettingsState } from '../hooks/useSettingsState';
import { useSettingsOllama } from '../hooks/useSettingsOllama';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onSettingsChanged?: () => void;
}



export default function SettingsPanel({ isOpen, onClose, onSettingsChanged }: SettingsPanelProps) {
    const {
        settings,
        showKeys,
        saved,
        isFullscreen,
        setIsFullscreen,
        confirmClear,
        setConfirmClear,
        activeTab,
        setActiveTab,
        apiSubTab,
        setApiSubTab,
        expandedSections,
        availablePromptSets,
        setAvailablePromptSets,
        promptMetadata,
        setPromptMetadata,
        toggleShowKey,
        updateSetting,
        updateProviderKey,
        updateDefaultModel,
        updateWorkflowDefault,
        toggleSection,
        handleSave,
        handleClearAll,
        loadSettings
    } = useSettingsState(onSettingsChanged);

    const {
        ollamaModels,
        ollamaStatus,
        ollamaLoading,
        refreshOllamaModels
    } = useSettingsOllama();

    // Load settings and prompt sets when panel opens
    useEffect(() => {
        if (isOpen) {
            loadSettings();
            setAvailablePromptSets(PromptService.getAvailableSets());
            setPromptMetadata(PromptService.getAllMetadata());
            refreshOllamaModels();
        } else {
            setIsFullscreen(false);
        }
        // ESLint disable: we only want this to run when isOpen changes, not when function references change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // All providers including Gemini for unified dropdowns (Gemini first)
    const allProviders = [ProviderType.Gemini, ...AVAILABLE_PROVIDERS];
    const allProvidersForKeys = [ProviderType.Gemini, ...AVAILABLE_PROVIDERS.filter(p => p !== ExternalProvider.Other), ExternalProvider.Other];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className={`bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full overflow-hidden flex flex-col ${isFullscreen ? 'max-w-[90vw] h-[90vh]' : 'max-w-2xl h-[80vh]'}`}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Settings className="w-5 h-5 text-indigo-400" />
                        Settings
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsFullscreen(prev => !prev)}
                            className="text-slate-400 hover:text-white"
                            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                        >
                            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-white" title="Close">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-800">
                    {[
                        { id: SettingsPanelTab.Providers, label: 'API Keys', icon: Key },
                        { id: SettingsPanelTab.Generation, label: 'Generation', icon: Sliders },
                        { id: SettingsPanelTab.Prompts, label: 'Prompts', icon: FileText },
                        { id: SettingsPanelTab.HuggingFace, label: 'HuggingFace', icon: Cloud },
                        { id: SettingsPanelTab.Firebase, label: 'Firebase', icon: Database },
                        { id: SettingsPanelTab.Storage, label: 'Storage', icon: Cpu },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === tab.id
                                ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/50'
                                : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === SettingsPanelTab.Providers && (
                        <div className="space-y-4">
                            {/* Sub-tabs: API Keys | Default Models */}
                            <div className="flex gap-2 p-1 bg-slate-800/50 rounded-lg">
                                <button
                                    onClick={() => setApiSubTab(ApiSubTab.Keys)}
                                    className={`flex-1 py-2 px-4 rounded-md text-xs font-bold transition-colors flex items-center justify-center gap-2 ${apiSubTab === ApiSubTab.Keys
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                                        }`}
                                >
                                    <Key className="w-3.5 h-3.5" />
                                    API Keys
                                </button>
                                <button
                                    onClick={() => setApiSubTab(ApiSubTab.Defaults)}
                                    className={`flex-1 py-2 px-4 rounded-md text-xs font-bold transition-colors flex items-center justify-center gap-2 ${apiSubTab === ApiSubTab.Defaults
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                                        }`}
                                >
                                    <Layers className="w-3.5 h-3.5" />
                                    Default Models
                                </button>
                            </div>

                            {/* API Keys Sub-tab */}
                            {apiSubTab === ApiSubTab.Keys && (
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500">
                                        Configure API keys. Leave empty to use .env values.
                                    </p>
                                    <div className="space-y-2 h-full overflow-y-auto pr-1">
                                        {allProvidersForKeys.map(provider => {
                                            const providerConfig = PROVIDERS[provider];
                                            const info = providerConfig || { name: provider, description: '' };
                                            const envVarMap: Record<string, string | undefined> = {
                                                'gemini': import.meta.env.VITE_GEMINI_API_KEY,
                                                'openai': import.meta.env.VITE_OPENAI_API_KEY,
                                                'anthropic': import.meta.env.VITE_ANTHROPIC_API_KEY,
                                                'openrouter': import.meta.env.VITE_OPENROUTER_API_KEY,
                                                'together': import.meta.env.VITE_TOGETHER_API_KEY,
                                                'groq': import.meta.env.VITE_GROQ_API_KEY,
                                                'cerebras': import.meta.env.VITE_CEREBRAS_API_KEY,
                                                'featherless': import.meta.env.VITE_FEATHERLESS_API_KEY,
                                                'qwen': import.meta.env.VITE_QWEN_API_KEY,
                                                'qwen-deepinfra': import.meta.env.VITE_QWEN_API_KEY,
                                                'kimi': import.meta.env.VITE_KIMI_API_KEY,
                                                'z.ai': import.meta.env.VITE_ZAI_API_KEY,
                                                'chutes': import.meta.env.VITE_CHUTES_API_KEY,
                                                'huggingface': import.meta.env.VITE_HF_TOKEN,
                                            };
                                            const keyValue = provider === ProviderType.Gemini
                                                ? settings.geminiApiKey
                                                : settings.providerKeys[provider];
                                            const hasEnvVar = envVarMap[provider] && !keyValue;
                                            const isCustom = provider === ExternalProvider.Other;
                                            const isOllama = provider === ExternalProvider.Ollama;

                                            return (
                                                <div key={provider} className={`flex flex-col gap-2 py-1.5 px-2 bg-slate-900/50 rounded border ${isOllama ? 'border-emerald-800/50' : 'border-slate-800'} hover:border-slate-700`}>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-28 flex-shrink-0">
                                                            <span className="text-xs font-semibold text-slate-200">{info.name}</span>
                                                            {hasEnvVar && (
                                                                <span className="text-emerald-400 text-[8px] ml-1">✓</span>
                                                            )}
                                                            {isOllama && (
                                                                <span className={`text-[8px] ml-1 ${ollamaStatus === OllamaStatus.Online ? 'text-emerald-400' : ollamaStatus === OllamaStatus.Offline ? 'text-red-400' : 'text-yellow-400'}`}>
                                                                    {ollamaStatus === OllamaStatus.Online ? '● Online' : ollamaStatus === OllamaStatus.Offline ? '● Offline' : '● ...'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {!isOllama && (
                                                            <div className="relative w-48 shrink-0">
                                                                <input
                                                                    type={showKeys[provider] ? 'text' : 'password'}
                                                                    value={keyValue || ''}
                                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                                                        if (provider === ProviderType.Gemini) {
                                                                            updateSetting('geminiApiKey', e.target.value);
                                                                        } else {
                                                                            updateProviderKey(provider, e.target.value);
                                                                        }
                                                                    }}
                                                                    placeholder={hasEnvVar ? '(env)' : 'API Key'}
                                                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 focus:border-indigo-500 outline-none pr-6"
                                                                />
                                                                <button
                                                                    onClick={() => toggleShowKey(provider)}
                                                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                                                >
                                                                    {showKeys[provider] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                                </button>
                                                            </div>
                                                        )}
                                                        {/* Ollama: Show model dropdown instead of API key */}
                                                        {isOllama && (
                                                            <div className="flex-1 flex items-center gap-2">
                                                                <Server className="w-3.5 h-3.5 text-emerald-500" />
                                                                <span className="text-[10px] text-slate-400">No API key needed</span>
                                                            </div>
                                                        )}
                                                        {/* Default Model - Show dropdown for Ollama */}
                                                        {isOllama ? (
                                                            <div className="flex items-center gap-1">
                                                                <select
                                                                    value={settings.providerDefaultModels?.[provider] || ''}
                                                                    onChange={(e) => updateDefaultModel(provider, e.target.value)}
                                                                    className="w-36 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 focus:border-emerald-500 outline-none"
                                                                    disabled={ollamaStatus !== OllamaStatus.Online || ollamaModels.length === 0}
                                                                >
                                                                    <option value="">
                                                                        {ollamaStatus === OllamaStatus.Checking ? 'Loading...' :
                                                                            ollamaStatus === OllamaStatus.Offline ? 'Ollama offline' :
                                                                                ollamaModels.length === 0 ? 'No models' : 'Select model'}
                                                                    </option>
                                                                    {ollamaModels.map(model => (
                                                                        <option key={model.name} value={model.name}>
                                                                            {model.name} ({formatOllamaModelSize(model.size)})
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <button
                                                                    onClick={refreshOllamaModels}
                                                                    disabled={ollamaLoading}
                                                                    className="p-1 text-slate-400 hover:text-emerald-400 disabled:opacity-50"
                                                                    title="Refresh Ollama models"
                                                                >
                                                                    <RefreshCw className={`w-3 h-3 ${ollamaLoading ? 'animate-spin' : ''}`} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <ModelSelector
                                                                provider={provider as ModelListProvider}
                                                                value={settings.providerDefaultModels?.[provider] || ''}
                                                                onChange={(model) => updateDefaultModel(provider, model)}
                                                                apiKey={provider === ProviderType.Gemini
                                                                    ? (settings.geminiApiKey || '')
                                                                    : (settings.providerKeys?.[provider] || '')}
                                                                customBaseUrl={provider === ExternalProvider.Other ? settings.customEndpointUrl : undefined}
                                                                placeholder="Default Model"
                                                                className="flex-1 min-w-[220px]"
                                                            />
                                                        )}
                                                    </div>
                                                    {isCustom && (
                                                        <div className="mt-2">
                                                            <input
                                                                type="text"
                                                                value={settings.customEndpointUrl || ''}
                                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSetting('customEndpointUrl', e.target.value)}
                                                                placeholder="Base URL"
                                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 focus:border-indigo-500 outline-none font-mono"
                                                            />
                                                        </div>
                                                    )}
                                                    {/* Ollama: Show loaded models list */}
                                                    {isOllama && ollamaStatus === OllamaStatus.Online && ollamaModels.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 pl-28">
                                                            {ollamaModels.slice(0, 6).map(model => {
                                                                // Ollama model names are typically in the form "family:size" (e.g., "llama2:7b").
                                                                // If no colon is present, fall back to showing the full model name.
                                                                const displayName = model.name.includes(':')
                                                                    ? model.name.split(':', 1)[0]
                                                                    : model.name;

                                                                return (
                                                                    <button
                                                                        key={model.name}
                                                                        onClick={() => updateDefaultModel('ollama', model.name)}
                                                                        className={`px-2 py-0.5 text-[9px] rounded border transition-colors ${settings.providerDefaultModels?.['ollama'] === model.name
                                                                            ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                                                                            : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-emerald-600 hover:text-emerald-400'
                                                                            }`}
                                                                    >
                                                                        {displayName}
                                                                    </button>
                                                                );
                                                            })}
                                                            {ollamaModels.length > 6 && (
                                                                <span className="text-[9px] text-slate-500 px-2 py-0.5">+{ollamaModels.length - 6} more</span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {isOllama && ollamaStatus === OllamaStatus.Offline && (
                                                        <div className="text-[9px] text-red-400/80 pl-28">
                                                            Start Ollama with: <code className="bg-slate-800 px-1 rounded">ollama serve</code>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Default Models Sub-tab */}
                            {apiSubTab === ApiSubTab.Defaults && (
                                <div className="space-y-4">
                                    <p className="text-xs text-slate-500">
                                        Configure default provider and model for each workflow step.
                                    </p>

                                    {/* General Purpose Model Section */}
                                    <div className="bg-slate-900/50 rounded-lg border border-slate-800">
                                        <button
                                            onClick={() => toggleSection('generalPurpose')}
                                            className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 rounded-t-lg"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Bot className="w-4 h-4 text-emerald-400" />
                                                <span className="text-sm font-bold text-white">General purpose model</span>
                                            </div>
                                            {expandedSections['generalPurpose'] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                        </button>
                                        {expandedSections['generalPurpose'] && (
                                            <div className="p-3 pt-0 space-y-3">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] text-slate-400 font-bold uppercase">Default Model</label>
                                                    <div className="flex gap-2 flex-wrap">
                                                        <select
                                                            value={settings.generalPurposeModel?.provider === ProviderType.External
                                                                ? settings.generalPurposeModel?.externalProvider || ProviderType.Gemini
                                                                : settings.generalPurposeModel?.provider || ProviderType.Gemini}
                                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                                                const selectedProvider = e.target.value;
                                                                const isExternal = selectedProvider !== ProviderType.Gemini;
                                                                updateSetting('generalPurposeModel', {
                                                                    ...settings.generalPurposeModel,
                                                                    ...EMPTY_STEP_CONFIG,
                                                                    provider: isExternal ? ProviderType.External : ProviderType.Gemini,
                                                                    externalProvider: isExternal ? selectedProvider as ExternalProvider : ExternalProvider.Other,
                                                                    model: settings.generalPurposeModel?.model || ''
                                                                });
                                                            }}
                                                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                                        >
                                                            {allProviders.map(p => (
                                                                <option key={p} value={p}>{p === ProviderType.Gemini ? 'Gemini' : (PROVIDERS[p]?.name || p)}</option>
                                                            ))}
                                                        </select>
                                                        {/* API Type dropdown for external providers */}
                                                        {settings.generalPurposeModel?.provider === ProviderType.External && (
                                                            <select
                                                                value={settings.generalPurposeModel?.apiType || ApiType.Chat}
                                                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateSetting('generalPurposeModel', {
                                                                    ...settings.generalPurposeModel,
                                                                    ...EMPTY_STEP_CONFIG,
                                                                    apiType: e.target.value as ApiType,
                                                                    provider: settings.generalPurposeModel?.provider || ProviderType.External,
                                                                    externalProvider: settings.generalPurposeModel?.externalProvider || ExternalProvider.Other,
                                                                    model: settings.generalPurposeModel?.model || ''
                                                                })}
                                                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                                                title="API Type: chat=completions, responses=responses API"
                                                            >
                                                                <option value="chat">Chat</option>
                                                                <option value="responses">Responses</option>
                                                            </select>
                                                        )}
                                                        <ModelSelector
                                                                provider={(settings.generalPurposeModel?.provider === ProviderType.External
                                                                    ? settings.generalPurposeModel?.externalProvider
                                                                    : ProviderType.Gemini) as ModelListProvider}
                                                            value={settings.generalPurposeModel?.model || ''}
                                                            onChange={(model) => updateSetting('generalPurposeModel', {
                                                                ...settings.generalPurposeModel,
                                                                ...EMPTY_STEP_CONFIG,
                                                                model,
                                                                provider: settings.generalPurposeModel?.provider || ProviderType.Gemini,
                                                                externalProvider: settings.generalPurposeModel?.externalProvider || ExternalProvider.Other
                                                            })}
                                                                apiKey={settings.generalPurposeModel?.provider === ProviderType.External
                                                                    ? (settings.providerKeys?.[settings.generalPurposeModel?.externalProvider || ''] || '')
                                                                    : (settings.geminiApiKey || '')}
                                                                customBaseUrl={settings.generalPurposeModel?.externalProvider === ExternalProvider.Other
                                                                    ? settings.customEndpointUrl
                                                                    : undefined}
                                                            placeholder="Model ID"
                                                            className="flex-1 min-w-[120px]"
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-slate-500">Used for general tasks that don't require specialized prompts (e.g., optimization)</p>
                                                    <div className="mt-2">
                                                        <GenerationParamsInput
                                                            params={settings.generalPurposeModel?.generationParams}
                                                            onChange={(newParams) => {
                                                                updateSetting('generalPurposeModel', {
                                                                    ...settings.generalPurposeModel,
                                                                    ...EMPTY_STEP_CONFIG,
                                                                    generationParams: newParams,
                                                                    provider: settings.generalPurposeModel?.provider || ProviderType.Gemini,
                                                                    externalProvider: settings.generalPurposeModel?.externalProvider || ExternalProvider.Other,
                                                                    model: settings.generalPurposeModel?.model || ''
                                                                });
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Generator Section */}
                                    <div className="bg-slate-900/50 rounded-lg border border-slate-800">
                                        <button
                                            onClick={() => toggleSection('generator')}
                                            className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 rounded-t-lg"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Zap className="w-4 h-4 text-amber-400" />
                                                <span className="text-sm font-bold text-white">Generator</span>
                                            </div>
                                            {expandedSections['generator'] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                        </button>
                                        {expandedSections['generator'] && (
                                            <div className="p-3 pt-0 space-y-3">
                                                {/* Regular Mode */}
                                                <div className="space-y-2">
                                                    <label className="text-[10px] text-slate-400 font-bold uppercase">Regular Mode</label>
                                                    <div className="flex gap-2 flex-wrap">
                                                        <select
                                                            value={settings.workflowDefaults?.generator.regular.provider || ProviderType.Gemini}
                                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateWorkflowDefault('generator', EngineMode.Regular, null, 'provider', e.target.value)}
                                                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                                        >
                                                            {allProviders.map(p => (
                                                                <option key={p} value={p}>{p === ProviderType.Gemini ? 'Gemini' : (PROVIDERS[p]?.name || p)}</option>
                                                            ))}
                                                        </select>
                                                        {/* API Type dropdown for external providers */}
                                                        {settings.workflowDefaults?.generator.regular.provider === ProviderType.External && (
                                                            <select
                                                                value={settings.workflowDefaults?.generator.regular.apiType || ApiType.Chat}
                                                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateWorkflowDefault('generator', EngineMode.Regular, null, 'apiType', e.target.value)}
                                                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                                                title="API Type: chat=completions, responses=responses API"
                                                            >
                                                                <option value="chat">Chat</option>
                                                                <option value="responses">Responses</option>
                                                            </select>
                                                        )}
                                                        <ModelSelector
                                                            provider={(settings.workflowDefaults?.generator.regular.provider === ProviderType.External
                                                                ? settings.workflowDefaults?.generator.regular.externalProvider
                                                                : ProviderType.Gemini) as ModelListProvider}
                                                            value={settings.workflowDefaults?.generator.regular.model || ''}
                                                            onChange={(model) => updateWorkflowDefault('generator', EngineMode.Regular, null, 'model', model)}
                                                            apiKey={settings.workflowDefaults?.generator.regular.provider === ProviderType.External
                                                                ? (settings.providerKeys?.[settings.workflowDefaults?.generator.regular.externalProvider || ''] || '')
                                                                : (settings.geminiApiKey || '')}
                                                            customBaseUrl={settings.workflowDefaults?.generator.regular.externalProvider === ExternalProvider.Other
                                                                ? settings.customEndpointUrl
                                                                : undefined}
                                                            placeholder="Model ID"
                                                            className="flex-1 min-w-[120px]"
                                                        />
                                                    </div>
                                                    <GenerationParamsInput
                                                        params={settings.workflowDefaults?.generator.regular.generationParams}
                                                        onChange={(newParams) => updateWorkflowDefault('generator', EngineMode.Regular, null, 'generationParams', newParams)}
                                                    />
                                                </div>

                                                {/* Deep Mode Steps */}
                                                <div className="space-y-2">
                                                    <label className="text-[10px] text-slate-400 font-bold uppercase">Deep Mode Steps</label>
                                                    {(['meta', 'retrieval', 'derivation', 'writer', 'rewriter', 'userAgent'] as const).map(step => (
                                                        <div key={step} className="space-y-2 p-2 bg-slate-900/30 rounded border border-slate-800">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="w-20 text-[10px] text-slate-500 capitalize">{step === 'userAgent' ? 'User Agent' : step}</span>
                                                                <select
                                                                    value={settings.workflowDefaults?.generator.deep[step]?.provider || ProviderType.Gemini}
                                                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateWorkflowDefault('generator', EngineMode.Deep, step, 'provider', e.target.value)}
                                                                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 focus:border-indigo-500 outline-none"
                                                                >
                                                                    {allProviders.map(p => (
                                                                        <option key={p} value={p}>{p === ProviderType.Gemini ? 'Gemini' : (PROVIDERS[p]?.name || p)}</option>
                                                                    ))}
                                                                </select>
                                                                {/* API Type dropdown for external providers */}
                                                                {settings.workflowDefaults?.generator.deep[step]?.provider === ProviderType.External && (
                                                                    <select
                                                                        value={settings.workflowDefaults?.generator.deep[step]?.apiType || ApiType.Chat}
                                                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateWorkflowDefault('generator', EngineMode.Deep, step, 'apiType', e.target.value)}
                                                                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 focus:border-indigo-500 outline-none"
                                                                        title="API Type: chat=completions, responses=responses API"
                                                                    >
                                                                        <option value="chat">Chat</option>
                                                                        <option value="responses">Responses</option>
                                                                    </select>
                                                                )}
                                                                <ModelSelector
                                                                    provider={(settings.workflowDefaults?.generator.deep[step]?.provider === ProviderType.External
                                                                        ? settings.workflowDefaults?.generator.deep[step]?.externalProvider
                                                                        : ProviderType.Gemini) as ModelListProvider}
                                                                    value={settings.workflowDefaults?.generator.deep[step]?.model || ''}
                                                                    onChange={(model) => updateWorkflowDefault('generator', EngineMode.Deep, step, 'model', model)}
                                                                    apiKey={settings.workflowDefaults?.generator.deep[step]?.provider === ProviderType.External
                                                                        ? (settings.providerKeys?.[settings.workflowDefaults?.generator.deep[step]?.externalProvider || ''] || '')
                                                                        : (settings.geminiApiKey || '')}
                                                                    customBaseUrl={settings.workflowDefaults?.generator.deep[step]?.externalProvider === ExternalProvider.Other
                                                                        ? settings.customEndpointUrl
                                                                        : undefined}
                                                                    placeholder="Model"
                                                                    className="flex-1 min-w-[100px]"
                                                                />
                                                            </div>
                                                            <GenerationParamsInput
                                                                params={settings.workflowDefaults?.generator.deep[step]?.generationParams}
                                                                onChange={(newParams) => updateWorkflowDefault('generator', EngineMode.Deep, step, 'generationParams', newParams)}
                                                                label={`${step === 'userAgent' ? 'User Agent' : step} Parameters`}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Converter Section */}
                                    <div className="bg-slate-900/50 rounded-lg border border-slate-800">
                                        <button
                                            onClick={() => toggleSection('converter')}
                                            className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 rounded-t-lg"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Zap className="w-4 h-4 text-cyan-400" />
                                                <span className="text-sm font-bold text-white">Converter</span>
                                            </div>
                                            {expandedSections['converter'] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                        </button>
                                        {expandedSections['converter'] && (
                                            <div className="p-3 pt-0 space-y-3">
                                                {/* Regular Mode */}
                                                <div className="space-y-2">
                                                    <label className="text-[10px] text-slate-400 font-bold uppercase">Regular Mode</label>
                                                    <div className="flex gap-2 flex-wrap">
                                                        <select
                                                            value={settings.workflowDefaults?.converter.regular.provider || ProviderType.Gemini}
                                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateWorkflowDefault('converter', EngineMode.Regular, null, 'provider', e.target.value)}
                                                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                                        >
                                                            {allProviders.map(p => (
                                                                <option key={p} value={p}>{p === ProviderType.Gemini ? 'Gemini' : (PROVIDERS[p]?.name || p)}</option>
                                                            ))}
                                                        </select>
                                                        {/* API Type dropdown for external providers */}
                                                        {settings.workflowDefaults?.converter.regular.provider === ProviderType.External && (
                                                            <select
                                                                value={settings.workflowDefaults?.converter.regular.apiType || ApiType.Chat}
                                                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateWorkflowDefault('converter', EngineMode.Regular, null, 'apiType', e.target.value)}
                                                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                                                title="API Type: chat=completions, responses=responses API"
                                                            >
                                                                <option value="chat">Chat</option>
                                                                <option value="responses">Responses</option>
                                                            </select>
                                                        )}
                                                        <ModelSelector
                                                            provider={(settings.workflowDefaults?.converter.regular.provider === ProviderType.External
                                                                ? settings.workflowDefaults?.converter.regular.externalProvider
                                                                : ProviderType.Gemini) as ModelListProvider}
                                                            value={settings.workflowDefaults?.converter.regular.model || ''}
                                                            onChange={(model) => updateWorkflowDefault('converter', EngineMode.Regular, null, 'model', model)}
                                                            apiKey={settings.workflowDefaults?.converter.regular.provider === ProviderType.External
                                                                ? (settings.providerKeys?.[settings.workflowDefaults?.converter.regular.externalProvider || ''] || '')
                                                                : (settings.geminiApiKey || '')}
                                                            customBaseUrl={settings.workflowDefaults?.converter.regular.externalProvider === ExternalProvider.Other
                                                                ? settings.customEndpointUrl
                                                                : undefined}
                                                            placeholder="Model ID"
                                                            className="flex-1 min-w-[120px]"
                                                        />
                                                    </div>
                                                    <GenerationParamsInput
                                                        params={settings.workflowDefaults?.converter.regular.generationParams}
                                                        onChange={(newParams) => updateWorkflowDefault('converter', EngineMode.Regular, null, 'generationParams', newParams)}
                                                    />
                                                </div>

                                                {/* Deep Mode Steps */}
                                                <div className="space-y-2">
                                                    <label className="text-[10px] text-slate-400 font-bold uppercase">Deep Mode Steps</label>
                                                    {(['meta', 'retrieval', 'derivation', 'writer', 'rewriter', 'userAgent'] as const).map(step => (
                                                        <div key={step} className="space-y-2 p-2 bg-slate-900/30 rounded border border-slate-800">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="w-20 text-[10px] text-slate-500 capitalize">{step === 'userAgent' ? 'User Agent' : step}</span>
                                                                <select
                                                                    value={settings.workflowDefaults?.converter.deep[step]?.provider || ProviderType.Gemini}
                                                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateWorkflowDefault('converter', EngineMode.Deep, step, 'provider', e.target.value)}
                                                                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 focus:border-indigo-500 outline-none"
                                                                >
                                                                    {allProviders.map(p => (
                                                                        <option key={p} value={p}>{p === ProviderType.Gemini ? 'Gemini' : (PROVIDERS[p]?.name || p)}</option>
                                                                    ))}
                                                                </select>
                                                                {/* API Type dropdown for external providers */}
                                                                {settings.workflowDefaults?.converter.deep[step]?.provider === ProviderType.External && (
                                                                    <select
                                                                        value={settings.workflowDefaults?.converter.deep[step]?.apiType || ApiType.Chat}
                                                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateWorkflowDefault('converter', EngineMode.Deep, step, 'apiType', e.target.value)}
                                                                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 focus:border-indigo-500 outline-none"
                                                                        title="API Type: chat=completions, responses=responses API"
                                                                    >
                                                                        <option value="chat">Chat</option>
                                                                        <option value="responses">Responses</option>
                                                                    </select>
                                                                )}
                                                                <ModelSelector
                                                                    provider={(settings.workflowDefaults?.converter.deep[step]?.provider === ProviderType.External
                                                                        ? settings.workflowDefaults?.converter.deep[step]?.externalProvider
                                                                        : ProviderType.Gemini) as ModelListProvider}
                                                                    value={settings.workflowDefaults?.converter.deep[step]?.model || ''}
                                                                    onChange={(model) => updateWorkflowDefault('converter', EngineMode.Deep, step, 'model', model)}
                                                                    apiKey={settings.workflowDefaults?.converter.deep[step]?.provider === ProviderType.External
                                                                        ? (settings.providerKeys?.[settings.workflowDefaults?.converter.deep[step]?.externalProvider || ''] || '')
                                                                        : (settings.geminiApiKey || '')}
                                                                    customBaseUrl={settings.workflowDefaults?.converter.deep[step]?.externalProvider === ExternalProvider.Other
                                                                        ? settings.customEndpointUrl
                                                                        : undefined}
                                                                    placeholder="Model"
                                                                    className="flex-1 min-w-[100px]"
                                                                />
                                                            </div>
                                                            <GenerationParamsInput
                                                                params={settings.workflowDefaults?.converter.deep[step]?.generationParams}
                                                                onChange={(newParams) => updateWorkflowDefault('converter', EngineMode.Deep, step, 'generationParams', newParams)}
                                                                label={`${step === 'userAgent' ? 'User Agent' : step} Parameters`}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === SettingsPanelTab.Generation && (
                        <div className="space-y-6">
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                                    <Timer className="w-4 h-4 text-indigo-400" />
                                    Generation Timeout
                                </h3>
                                <p className="text-xs text-slate-500 mb-3">
                                    Stop streaming if a response does not arrive within this window.
                                </p>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={settings.generationTimeoutSeconds ?? 300}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                            const nextValue = e.target.value ? Math.max(1, parseInt(e.target.value)) : 300;
                                            updateSetting('generationTimeoutSeconds', nextValue);
                                        }}
                                        className="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                    />
                                    <span className="text-xs text-slate-500">seconds</span>
                                </div>
                            </div>

                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <Sliders className="w-4 h-4 text-purple-400" />
                                    Default Generation Parameters
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Configure default parameters for LLM generation. These can be overridden per-request in the chat interface.
                                </p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label htmlFor="temperature" className="text-[10px] text-slate-400 font-bold uppercase">
                                            Temperature: {((settings.defaultGenerationParams?.temperature ?? 0.8)).toFixed(2)}
                                        </label>
                                        <input
                                            id="temperature"
                                            type="range"
                                            min="0"
                                            max="2"
                                            step="0.01"
                                            value={settings.defaultGenerationParams?.temperature ?? 0.8}
                                            onChange={(e) => updateSetting('defaultGenerationParams', {
                                                ...(settings.defaultGenerationParams || {}),
                                                temperature: parseFloat(e.target.value)
                                            })}
                                            aria-valuetext={`Temperature: ${((settings.defaultGenerationParams?.temperature ?? 0.8)).toFixed(2)}`}
                                            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <p className="text-[9px] text-slate-500">Lower = more focused, Higher = more creative</p>
                                    </div>

                                    <div className="space-y-1">
                                        <label htmlFor="topP" className="text-[10px] text-slate-400 font-bold uppercase">
                                            Top P: {((settings.defaultGenerationParams?.topP ?? 0.9)).toFixed(2)}
                                        </label>
                                        <input
                                            id="topP"
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.01"
                                            value={settings.defaultGenerationParams?.topP ?? 0.9}
                                            onChange={(e) => updateSetting('defaultGenerationParams', {
                                                ...(settings.defaultGenerationParams || {}),
                                                topP: parseFloat(e.target.value)
                                            })}
                                            aria-valuetext={`Top P: ${((settings.defaultGenerationParams?.topP ?? 0.9)).toFixed(2)}`}
                                            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <p className="text-[9px] text-slate-500">Nucleus sampling threshold (0-1)</p>
                                    </div>

                                    <div className="space-y-1">
                                        <label htmlFor="topK" className="text-[10px] text-slate-400 font-bold uppercase">
                                            Top K
                                        </label>
                                        <input
                                            id="topK"
                                            type="number"
                                            min="1"
                                            max="1000"
                                            step="1"
                                            value={settings.defaultGenerationParams?.topK ?? ''}
                                            onChange={(e) => updateSetting('defaultGenerationParams', {
                                                ...(settings.defaultGenerationParams || {}),
                                                topK: e.target.value ? parseInt(e.target.value) : undefined
                                            })}
                                            placeholder="Leave empty for default"
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                        />
                                        <p className="text-[9px] text-slate-500">Sample from top K tokens (optional)</p>
                                    </div>

                                    <div className="space-y-1">
                                        <label htmlFor="presencePenalty" className="text-[10px] text-slate-400 font-bold uppercase">
                                            Presence Penalty: {((settings.defaultGenerationParams?.presencePenalty ?? 0)).toFixed(2)}
                                        </label>
                                        <input
                                            id="presencePenalty"
                                            type="range"
                                            min="-2"
                                            max="2"
                                            step="0.01"
                                            value={settings.defaultGenerationParams?.presencePenalty ?? 0}
                                            onChange={(e) => updateSetting('defaultGenerationParams', {
                                                ...(settings.defaultGenerationParams || {}),
                                                presencePenalty: parseFloat(e.target.value)
                                            })}
                                            aria-valuetext={`Presence Penalty: ${((settings.defaultGenerationParams?.presencePenalty ?? 0)).toFixed(2)}`}
                                            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <p className="text-[9px] text-slate-500">Penalize new topics (-2 to 2)</p>
                                    </div>

                                    <div className="space-y-1">
                                        <label htmlFor="frequencyPenalty" className="text-[10px] text-slate-400 font-bold uppercase">
                                            Frequency Penalty: {((settings.defaultGenerationParams?.frequencyPenalty ?? 0)).toFixed(2)}
                                        </label>
                                        <input
                                            id="frequencyPenalty"
                                            type="range"
                                            min="-2"
                                            max="2"
                                            step="0.01"
                                            value={settings.defaultGenerationParams?.frequencyPenalty ?? 0}
                                            onChange={(e) => updateSetting('defaultGenerationParams', {
                                                ...(settings.defaultGenerationParams || {}),
                                                frequencyPenalty: parseFloat(e.target.value)
                                            })}
                                            aria-valuetext={`Frequency Penalty: ${((settings.defaultGenerationParams?.frequencyPenalty ?? 0)).toFixed(2)}`}
                                            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <p className="text-[9px] text-slate-500">Penalize repetition (-2 to 2)</p>
                                    </div>

                                    <div className="space-y-1">
                                        <label htmlFor="maxTokens" className="text-[10px] text-slate-400 font-bold uppercase">
                                            Max Tokens
                                        </label>
                                        <input
                                            id="maxTokens"
                                            type="number"
                                            min="1"
                                            max="128000"
                                            step="1"
                                            value={settings.defaultGenerationParams?.maxTokens ?? ''}
                                            onChange={(e) => updateSetting('defaultGenerationParams', {
                                                ...(settings.defaultGenerationParams || {}),
                                                maxTokens: e.target.value ? parseInt(e.target.value) : undefined
                                            })}
                                            placeholder="Leave empty for default"
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                        />
                                        <p className="text-[9px] text-slate-500">Maximum tokens per response (optional)</p>
                                    </div>
                                </div>

                                {/* Force Structured Output Toggle */}
                                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <label htmlFor="forceStructuredOutput" className="text-xs text-slate-300">Force Structured Output</label>
                                        <span className="text-[9px] text-slate-500" title="When enabled, requests JSON response format from the model">
                                            (JSON mode)
                                        </span>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            id="forceStructuredOutput"
                                            type="checkbox"
                                            checked={settings.defaultGenerationParams?.forceStructuredOutput ?? true}
                                            onChange={(e) => updateSetting('defaultGenerationParams', {
                                                ...(settings.defaultGenerationParams || {}),
                                                forceStructuredOutput: e.target.checked
                                            })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>

                                <div className="mt-4 pt-4 border-t border-slate-800">
                                    <button
                                        onClick={() => updateSetting('defaultGenerationParams', {
                                            temperature: 0.8,
                                            topP: 0.9,
                                            topK: undefined,
                                            presencePenalty: undefined,
                                            frequencyPenalty: undefined,
                                            maxTokens: undefined,
                                            forceStructuredOutput: true
                                        })}
                                        className="text-[10px] text-purple-400 hover:text-purple-300 underline"
                                    >
                                        Reset to defaults
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === SettingsPanelTab.HuggingFace && (
                        <div className="space-y-6">
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <Cloud className="w-4 h-4 text-amber-400" />
                                    HuggingFace Settings
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Configure your HuggingFace token for uploading datasets to the Hub.
                                </p>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            HuggingFace Token
                                            {import.meta.env.VITE_HF_TOKEN && !settings.huggingFaceToken && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKeys['hf'] ? 'text' : 'password'}
                                                value={settings.huggingFaceToken || ''}
                                                onChange={(e) => updateSetting('huggingFaceToken', e.target.value)}
                                                placeholder={import.meta.env.VITE_HF_TOKEN ? '●●●●●●●● (env configured)' : 'hf_...'}
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none pr-10"
                                            />
                                            <button
                                                onClick={() => toggleShowKey('hf')}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                            >
                                                {showKeys['hf'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">Default Repository</label>
                                        <input
                                            type="text"
                                            value={settings.huggingFaceDefaultRepo || ''}
                                            onChange={(e) => updateSetting('huggingFaceDefaultRepo', e.target.value)}
                                            placeholder="username/dataset-name"
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                                <p className="text-xs text-amber-200">
                                    <strong>Get a token:</strong> Visit{' '}
                                    <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-100">
                                        huggingface.co/settings/tokens
                                    </a>
                                    {' '}and create a token with "write" access.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === SettingsPanelTab.Firebase && (
                        <div className="space-y-6">
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <Database className="w-4 h-4 text-orange-400" />
                                    Firebase Configuration
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Configure Firebase for cloud storage of sessions and logs. All fields are required to connect.
                                </p>
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            API Key
                                            {import.meta.env.VITE_FIREBASE_API_KEY && !settings.firebaseApiKey && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKeys['firebase'] ? 'text' : 'password'}
                                                value={settings.firebaseApiKey || ''}
                                                onChange={(e) => updateSetting('firebaseApiKey', e.target.value)}
                                                placeholder={import.meta.env.VITE_FIREBASE_API_KEY ? '●●●●●●●● (env configured)' : 'AIza...'}
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none pr-10"
                                            />
                                            <button
                                                onClick={() => toggleShowKey('firebase')}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                            >
                                                {showKeys['firebase'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            Auth Domain
                                            {import.meta.env.VITE_FIREBASE_AUTH_DOMAIN && !settings.firebaseAuthDomain && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.firebaseAuthDomain || ''}
                                            onChange={(e) => updateSetting('firebaseAuthDomain', e.target.value)}
                                            placeholder={import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'your-app.firebaseapp.com'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            Project ID
                                            {import.meta.env.VITE_FIREBASE_PROJECT_ID && !settings.firebaseProjectId && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.firebaseProjectId || ''}
                                            onChange={(e) => updateSetting('firebaseProjectId', e.target.value)}
                                            placeholder={import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-project-id'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            Storage Bucket
                                            {import.meta.env.VITE_FIREBASE_STORAGE_BUCKET && !settings.firebaseStorageBucket && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.firebaseStorageBucket || ''}
                                            onChange={(e) => updateSetting('firebaseStorageBucket', e.target.value)}
                                            placeholder={import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'your-app.appspot.com'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            Messaging Sender ID
                                            {import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID && !settings.firebaseMessagingSenderId && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.firebaseMessagingSenderId || ''}
                                            onChange={(e) => updateSetting('firebaseMessagingSenderId', e.target.value)}
                                            placeholder={import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789012'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            App ID
                                            {import.meta.env.VITE_FIREBASE_APP_ID && !settings.firebaseAppId && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.firebaseAppId || ''}
                                            onChange={(e) => updateSetting('firebaseAppId', e.target.value)}
                                            placeholder={import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789012:web:abc123'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-pink-500/10 border border-pink-500/20 rounded-lg p-4">
                                <p className="text-xs text-pink-200">
                                    <strong>Note:</strong> Firebase configuration is saved when you click "Save Settings" and will be used to connect on next app load.
                                    If you have values in <code>.env</code>, those will be used as defaults.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === SettingsPanelTab.Storage && (
                        <div className="space-y-6">
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <Cpu className="w-4 h-4 text-cyan-400" />
                                    Local Storage
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Manage locally stored data including sessions, logs, and settings.
                                </p>

                                <div className="bg-red-950/30 border border-red-500/20 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <h4 className="text-sm font-bold text-red-400 mb-1">Clear All Data</h4>
                                            <p className="text-xs text-slate-400 mb-3">
                                                This will permanently delete all stored settings, API keys, session data, and logs from this browser. This action cannot be undone.
                                            </p>
                                            <button
                                                onClick={handleClearAll}
                                                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-bold transition-colors ${confirmClear
                                                    ? 'bg-red-600 hover:bg-red-500 text-white'
                                                    : 'bg-red-950 hover:bg-red-900 text-red-400 border border-red-500/30'
                                                    }`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                {confirmClear ? 'Click Again to Confirm' : 'Clear All Data'}
                                            </button>
                                            {confirmClear && (
                                                <button
                                                    onClick={() => setConfirmClear(false)}
                                                    className="ml-2 text-xs text-slate-500 hover:text-slate-300"
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === SettingsPanelTab.Prompts && (
                        <div className="space-y-6">
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-emerald-400" />
                                    Prompt Configuration
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Select the prompt set to use for generating reasoning traces. Each set produces different reasoning formats.
                                </p>

                                {/* Prompt set cards */}
                                <div className="space-y-2">
                                    {availablePromptSets.map(setId => {
                                        const meta = promptMetadata[setId];
                                        const isSelected = (settings.promptSet || 'default') === setId;
                                        const completeness = PromptService.getSetCompleteness(setId);

                                        return (
                                            <button
                                                key={setId}
                                                onClick={() => updateSetting('promptSet', setId)}
                                                className={`w-full text-left p-3 rounded-lg border transition-all ${isSelected
                                                    ? 'bg-indigo-500/10 border-indigo-500/50 ring-1 ring-indigo-500/30'
                                                    : 'bg-slate-900/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-sm font-semibold ${isSelected ? 'text-indigo-300' : 'text-slate-200'}`}>
                                                                {meta?.name || setId}
                                                            </span>
                                                            {isSelected && (
                                                                <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-indigo-500/20 text-indigo-300 rounded">
                                                                    Active
                                                                </span>
                                                            )}
                                                            {/* Only show warning for user-created sets without meta.json */}
                                                            {completeness.missing.length > 0 && setId !== 'default' && !PromptService.hasMetaFile(setId) && (
                                                                <span className="px-1.5 py-0.5 text-[9px] font-medium bg-amber-500/20 text-amber-400 rounded" title={`Missing: ${completeness.missing.join(', ')}`}>
                                                                    {completeness.present}/{completeness.total} prompts
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                                                            {meta?.description || `Prompt set: ${setId}`}
                                                        </p>
                                                        {meta?.symbols && meta.symbols.length > 0 && (
                                                            <div className="flex items-center gap-1 mt-2">
                                                                <span className="text-[9px] text-slate-500 uppercase">Symbols:</span>
                                                                <span className="text-[11px] text-slate-400 font-mono">
                                                                    {meta.symbols.slice(0, 8).join(' ')}
                                                                    {meta.symbols.length > 8 && '...'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${isSelected
                                                        ? 'border-indigo-500 bg-indigo-500'
                                                        : 'border-slate-600'
                                                        }`}>
                                                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                                    </div>
                                                </div>
                                                {meta?.features && meta.features.length > 0 && isSelected && (
                                                    <div className="mt-3 pt-2 border-t border-slate-700/50">
                                                        <div className="flex flex-wrap gap-1">
                                                            {meta.features.map((feature, i) => (
                                                                <span key={i} className="px-1.5 py-0.5 text-[9px] bg-slate-800 text-slate-400 rounded">
                                                                    {feature}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>

                                <p className="text-[10px] text-slate-600 mt-4">
                                    Custom prompt sets can be added by creating new folders in the <code className="text-slate-500">prompts/</code> directory with a <code className="text-slate-500">meta.json</code> file.
                                </p>
                            </div>

                            {/* Auto-routing section */}
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                    <Cpu className="w-4 h-4 text-purple-400" />
                                    Auto-Routing (Experimental)
                                </h3>

                                <div className="space-y-3">
                                    {/* Enable toggle */}
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <div>
                                            <span className="text-xs text-slate-300">Enable auto-routing</span>
                                            <p className="text-[10px] text-slate-500">Automatically select prompt set based on query type</p>
                                        </div>
                                        <button
                                            role="switch"
                                            aria-checked={settings.autoRouteEnabled}
                                            aria-label="Enable auto-routing"
                                            onClick={() => updateSetting('autoRouteEnabled', !settings.autoRouteEnabled)}
                                            className={`relative w-10 h-5 rounded-full transition-colors ${settings.autoRouteEnabled ? 'bg-purple-600' : 'bg-slate-700'
                                                }`}
                                        >
                                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.autoRouteEnabled ? 'translate-x-5' : 'translate-x-0.5'
                                                }`} />
                                        </button>
                                    </label>

                                    {/* Method selector */}
                                    {settings.autoRouteEnabled && (
                                        <>
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-slate-400 font-bold uppercase">Classification Method</label>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => updateSetting('autoRouteMethod', 'heuristic')}
                                                        className={`flex-1 px-3 py-2 rounded text-xs transition-colors ${settings.autoRouteMethod === 'heuristic'
                                                            ? 'bg-purple-600 text-white'
                                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                            }`}
                                                    >
                                                        <div className="font-semibold">Heuristic</div>
                                                        <div className="text-[9px] opacity-70">Fast, free, keyword-based</div>
                                                    </button>
                                                    <button
                                                        onClick={() => updateSetting('autoRouteMethod', 'llm')}
                                                        className={`flex-1 px-3 py-2 rounded text-xs transition-colors ${settings.autoRouteMethod === 'llm'
                                                            ? 'bg-purple-600 text-white'
                                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                            }`}
                                                    >
                                                        <div className="font-semibold">LLM</div>
                                                        <div className="text-[9px] opacity-70">Uses model, costs tokens</div>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Confidence threshold - applies to both methods */}
                                            <div className="space-y-1">
                                                <label htmlFor="confidence-threshold" className="text-[10px] text-slate-400 font-bold uppercase">
                                                    Confidence Threshold: {((settings.autoRouteConfidenceThreshold ?? 0.3) * 100).toFixed(0)}%
                                                </label>
                                                <input
                                                    id="confidence-threshold"
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={(settings.autoRouteConfidenceThreshold ?? 0.3) * 100}
                                                    onChange={(e) => updateSetting('autoRouteConfidenceThreshold', parseInt(e.target.value) / 100)}
                                                    aria-valuetext={`${((settings.autoRouteConfidenceThreshold ?? 0.3) * 100).toFixed(0)} percent`}
                                                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                />
                                                <p className="text-[9px] text-slate-500">Routes to recommended prompt set when confidence exceeds this threshold</p>
                                            </div>

                                            {/* LLM-specific options */}
                                            {settings.autoRouteMethod === 'llm' && (
                                                <div className="space-y-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                                                    <h4 className="text-[10px] text-slate-400 font-bold uppercase">LLM Classifier Configuration</h4>

                                                    {/* Provider selector */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-slate-500 font-bold uppercase">Provider</label>
                                                            <select
                                                                value={settings.autoRouteLlmProvider || ProviderType.Gemini}
                                                                onChange={e => updateSetting('autoRouteLlmProvider', e.target.value as ProviderType)}
                                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-purple-500 outline-none"
                                                            >
                                                                <option value={ProviderType.Gemini}>Gemini</option>
                                                                <option value={ProviderType.External}>External</option>
                                                            </select>
                                                        </div>
                                                        {settings.autoRouteLlmProvider === ProviderType.External && (
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] text-slate-500 font-bold uppercase">Service</label>
                                                                <select
                                                                    value={settings.autoRouteLlmExternalProvider || ''}
                                                                    onChange={e => updateSetting('autoRouteLlmExternalProvider', e.target.value)}
                                                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-purple-500 outline-none"
                                                                >
                                                                    <option value="">Select provider...</option>
                                                                    {AVAILABLE_PROVIDERS.map(ep => <option key={ep} value={ep}>{ep}</option>)}
                                                                </select>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* External provider options */}
                                                {settings.autoRouteLlmProvider === ProviderType.External && (
                                                        <>
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] text-slate-500 font-bold uppercase">API Key</label>
                                                                <input
                                                                    type="password"
                                                                    value={settings.autoRouteLlmApiKey || ''}
                                                                    onChange={e => updateSetting('autoRouteLlmApiKey', e.target.value)}
                                                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-purple-500 outline-none"
                                                                    placeholder={settings.autoRouteLlmExternalProvider && SettingsService.getApiKey(settings.autoRouteLlmExternalProvider) ? "Using Global Key (Settings)" : "Enter API Key..."}
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] text-slate-500 font-bold uppercase">Model ID</label>
                                                                <input
                                                                    type="text"
                                                                    value={settings.autoRouteLlmModel || ''}
                                                                    onChange={e => updateSetting('autoRouteLlmModel', e.target.value)}
                                                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-purple-500 outline-none"
                                                                    placeholder="e.g., gpt-4o-mini, claude-3-haiku"
                                                                />
                                                            </div>
                                                    {settings.autoRouteLlmExternalProvider === ExternalProvider.Other && (
                                                                <div className="space-y-1">
                                                                    <label className="text-[10px] text-slate-500 font-bold uppercase">Base URL</label>
                                                                    <input
                                                                        type="text"
                                                                        value={settings.autoRouteLlmCustomBaseUrl || ''}
                                                                        onChange={e => updateSetting('autoRouteLlmCustomBaseUrl', e.target.value)}
                                                                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-purple-500 outline-none"
                                                                        placeholder={SettingsService.getCustomBaseUrl() || "https://api.example.com/v1"}
                                                                    />
                                                                </div>
                                                            )}
                                                        </>
                                                    )}

                                                    {/* Gemini model option */}
                                                {settings.autoRouteLlmProvider !== ProviderType.External && (
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-slate-500 font-bold uppercase">Model (optional)</label>
                                                            <input
                                                                type="text"
                                                                value={settings.autoRouteLlmModel || ''}
                                                                onChange={e => updateSetting('autoRouteLlmModel', e.target.value)}
                                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-purple-500 outline-none"
                                                                placeholder="Leave empty to use default"
                                                            />
                                                        </div>
                                                    )}

                                                    <p className="text-[9px] text-slate-500">Use a fast/cheap model for classification (e.g., gemini-1.5-flash, gpt-4o-mini)</p>
                                                </div>
                                            )}

                                            {/* Task → Prompt mapping (editable) */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-slate-400 font-bold uppercase">Task → Prompt Mapping</label>
                                                <p className="text-[9px] text-slate-500 mb-2">Customize which prompt set handles each task type</p>
                                                <div className="bg-slate-900 rounded p-2 space-y-1.5">
                                                    {TaskClassifierService.getTaskTypes().map(task => {
                                                        const effectiveMapping = TaskClassifierService.getEffectiveMapping(settings.taskPromptMapping);
                                                        const currentValue = effectiveMapping[task as keyof typeof effectiveMapping];
                                                        const defaultValue = TASK_PROMPT_MAPPING[task as keyof typeof TASK_PROMPT_MAPPING];
                                                        const isCustomized = settings.taskPromptMapping?.[task] && settings.taskPromptMapping[task] !== defaultValue;

                                                        return (
                                                            <div key={task} className="flex items-center gap-2">
                                                                <span className="text-[10px] text-slate-400 font-mono w-24">{task}</span>
                                                                <span className="text-slate-600">→</span>
                                                                <select
                                                                    aria-label={`Prompt set for ${task} tasks`}
                                                                    value={currentValue}
                                                                    onChange={(e) => {
                                                                        const newMapping = { ...settings.taskPromptMapping };
                                                                        if (e.target.value === defaultValue) {
                                                                            delete newMapping[task];
                                                                        } else {
                                                                            newMapping[task] = e.target.value;
                                                                        }
                                                                        updateSetting('taskPromptMapping', Object.keys(newMapping).length > 0 ? newMapping : undefined);
                                                                    }}
                                                                    className={`flex-1 bg-slate-950 border rounded px-2 py-1 text-[10px] focus:outline-none ${isCustomized
                                                                        ? 'border-purple-500/50 text-purple-300'
                                                                        : 'border-slate-700 text-slate-300'
                                                                        }`}
                                                                >
                                                                    {availablePromptSets.map(set => (
                                                                        <option key={set} value={set}>
                                                                            {set}{set === defaultValue ? ' (default)' : ''}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                {isCustomized && (
                                                                    <button
                                                                        onClick={() => {
                                                                            const newMapping = { ...settings.taskPromptMapping };
                                                                            delete newMapping[task];
                                                                            updateSetting('taskPromptMapping', Object.keys(newMapping).length > 0 ? newMapping : undefined);
                                                                        }}
                                                                        className="text-slate-500 hover:text-slate-300 text-[10px]"
                                                                        title="Reset to default"
                                                                        aria-label={`Reset ${task} mapping to default`}
                                                                    >
                                                                        ↺
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="flex items-center gap-2 pt-1.5 border-t border-slate-800">
                                                        <span className="text-[10px] text-slate-500 font-mono w-24">unknown</span>
                                                        <span className="text-slate-600">→</span>
                                                        <span className="text-[10px] text-slate-500 flex-1">{settings.promptSet || 'default'} (your default)</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-900">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className={`flex items-center gap-2 px-6 py-2 rounded text-sm font-bold transition-colors ${saved
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            }`}
                    >
                        {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {saved ? 'Saved!' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
}
