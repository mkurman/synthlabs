import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ApiType, ExternalProvider, OllamaStatus, ProviderType } from '../../interfaces/enums';
import { ModelListProvider } from '../../types';
import { OllamaModel, fetchOllamaVersion } from '../../services/externalApiService';
import { formatOllamaModelSize } from '../../services/ollamaService';
import ModelSelector from '../ModelSelector';
import { ApiType as ApiTypeEnum, ExternalProvider as ExternalProviderEnum, ProviderType as ProviderTypeEnum } from '../../interfaces/enums';
import { PROVIDERS } from '../../constants';

interface ProviderConfigPanelProps {
    provider: ProviderType;
    externalProvider: ExternalProvider;
    externalModel: string;
    apiType: ApiType;
    externalApiKey: string;
    customBaseUrl: string;
    externalProviders: string[];
    providerSelectValue: string;
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
}

export default function ProviderConfigPanel({
    provider,
    externalProvider,
    externalModel,
    apiType,
    externalApiKey,
    customBaseUrl,
    externalProviders,
    providerSelectValue,
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
    defaultCustomBaseUrl
}: ProviderConfigPanelProps) {
    const [gpuName, setGpuName] = useState<string>('Checking...');
    const [ollamaVersion, setOllamaVersion] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const loadOllamaInfo = async () => {
            if (externalProvider !== ExternalProviderEnum.Ollama) {
                setGpuName('Checking...');
                setOllamaVersion(null);
                return;
            }

            const version = await fetchOllamaVersion();
            if (mounted) {
                setOllamaVersion(version);
            }

            if (typeof navigator === 'undefined') {
                if (mounted) setGpuName('Unavailable');
                return;
            }

            const gpuApi = (navigator as Navigator & {
                gpu?: { requestAdapter: () => Promise<{ name?: string } | null> };
            }).gpu;
            if (!gpuApi) {
                if (mounted) setGpuName('WebGPU not available');
                return;
            }

            try {
                const adapter = await gpuApi.requestAdapter();
                if (mounted) {
                    setGpuName(adapter?.name || 'GPU');
                }
            } catch {
                if (mounted) {
                    setGpuName('Unavailable');
                }
            }
        };

        loadOllamaInfo();
        return () => {
            mounted = false;
        };
    }, [externalProvider]);

    return (
        <div className="animate-in fade-in slide-in-from-left-2 duration-300 space-y-4">
            <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Provider</label>
                <select
                    value={providerSelectValue}
                    onChange={(e) => onProviderSelect(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/70 rounded px-3 py-2 text-xs text-white focus:border-sky-500 outline-none"
                >
                    {externalProviders.map((p) => (
                        <option key={p} value={p}>
                            {PROVIDERS[p]?.name || p}
                        </option>
                    ))}
                </select>
            </div>

            {provider === ProviderTypeEnum.External && (
                <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase">API Type</label>
                    <select
                        value={apiType}
                        onChange={(e) => onApiTypeChange(e.target.value as ApiType)}
                        className="w-full bg-slate-950 border border-slate-700/70 rounded px-3 py-2 text-xs text-white focus:border-sky-500 outline-none"
                        title="API Type: chat=completions, responses=responses API"
                    >
                        <option value={ApiTypeEnum.Chat}>Chat Completions (/chat/completions)</option>
                        <option value={ApiTypeEnum.Responses}>Responses API (/responses)</option>
                    </select>
                </div>
            )}

            <div className="space-y-3">
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Model ID</label>
                        {externalProvider === ExternalProviderEnum.Ollama && (
                            <div className="flex items-center gap-2">
                                <span className={`text-[9px] ${ollamaStatus === OllamaStatus.Online ? 'text-emerald-400' : ollamaStatus === OllamaStatus.Offline ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {ollamaStatus === OllamaStatus.Online ? `● ${ollamaModels.length} models` : ollamaStatus === OllamaStatus.Offline ? '● Not Found' : '● Checking...'}
                                </span>
                                <button
                                    onClick={onRefreshOllamaModels}
                                    disabled={ollamaLoading}
                                    className="p-0.5 text-slate-300 hover:text-emerald-400 disabled:opacity-50"
                                    title="Refresh Ollama models"
                                >
                                    <RefreshCw className={`w-3 h-3 ${ollamaLoading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        )}
                    </div>
                    {externalProvider === ExternalProviderEnum.Ollama ? (
                        <div className="space-y-2">
                            <select
                                value={externalModel}
                                onChange={(e) => onExternalModelChange(e.target.value)}
                                className="w-full bg-slate-950 border border-emerald-700/50 rounded px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none"
                                disabled={ollamaStatus !== OllamaStatus.Online || ollamaModels.length === 0}
                            >
                                <option value="">
                                    {ollamaStatus === OllamaStatus.Checking ? 'Loading models...' :
                                        ollamaStatus === OllamaStatus.Offline ? 'Ollama not found' :
                                            ollamaModels.length === 0 ? 'No models found' : 'Select a model'}
                                </option>
                                {ollamaModels.map(model => (
                                    <option key={model.name} value={model.name}>
                                        {model.name} ({formatOllamaModelSize(model.size)})
                                    </option>
                                ))}
                            </select>
                            {ollamaStatus === OllamaStatus.Online && ollamaModels.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {ollamaModels.slice(0, 4).map(model => (
                                        <button
                                            key={model.name}
                                            onClick={() => onExternalModelChange(model.name)}
                                            className={`px-2 py-0.5 text-[9px] rounded border transition-colors ${externalModel === model.name
                                                ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                                                : 'bg-slate-900/60 border-slate-700/70 text-slate-300 hover:border-emerald-600 hover:text-emerald-400'
                                                }`}
                                        >
                                            {model.name.includes(':') ? model.name.split(':')[0] : model.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {ollamaStatus === OllamaStatus.Offline && (
                                <div className="space-y-1 rounded-md border border-red-900/40 bg-red-950/20 px-2 py-1.5">
                                    <p className="text-[10px] text-red-300 font-semibold">Ollama Not Found</p>
                                    <p className="text-[9px] text-red-300/80">
                                        Ollama could not be reached. Ensure it is installed and running.
                                    </p>
                                    <p className="text-[9px] text-red-300/80">
                                        Start Ollama: <code className="bg-slate-900/60 px-1 rounded">ollama serve</code>
                                    </p>
                                </div>
                            )}
                            <div className="space-y-1 rounded-md border border-slate-800/70 bg-slate-950/60 px-2 py-1.5">
                                <div className="text-[10px] font-semibold text-slate-300">Ollama Runtime</div>
                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                    <span>Ollama Version</span>
                                    <span>{ollamaVersion || 'Unknown'}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                    <span>GPU</span>
                                    <span className="truncate max-w-[200px] text-right">{gpuName}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <ModelSelector
                            provider={modelSelectorProvider}
                            value={externalModel}
                            onChange={onExternalModelChange}
                            apiKey={modelSelectorApiKey}
                            customBaseUrl={customBaseUrl}
                            placeholder={modelSelectorPlaceholder}
                        />
                    )}
                </div>

                {provider === ProviderTypeEnum.External && (
                    <>
                        {externalProvider !== ExternalProviderEnum.Ollama && (
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase">API Key</label>
                                <input type="password" value={externalApiKey || ''} placeholder="Required here unless a main key is set in Settings" onChange={(e: React.ChangeEvent<HTMLInputElement>) => onExternalApiKeyChange(e.target.value)} className="w-full bg-slate-950 border border-slate-700/70 rounded px-3 py-2 text-xs text-white focus:border-sky-500 outline-none" />
                            </div>
                        )}
                        {externalProvider === ExternalProviderEnum.Other && (
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase">Base URL</label>
                                <input type="text" value={customBaseUrl || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onCustomBaseUrlChange(e.target.value)} className="w-full bg-slate-950 border border-slate-700/70 rounded px-3 py-2 text-xs text-white focus:border-sky-500 outline-none" placeholder={defaultCustomBaseUrl || "https://api.example.com/v1"} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
