import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ApiType, ExternalProvider, OllamaStatus, ProviderType } from '../../interfaces/enums';
import { ModelListProvider } from '../../types';
import { OllamaModel, fetchOllamaVersion } from '../../services/externalApiService';
import { formatOllamaModelSize } from '../../services/ollamaService';
import ModelSelector from '../ModelSelector';
import { ApiType as ApiTypeEnum, ExternalProvider as ExternalProviderEnum, ProviderType as ProviderTypeEnum } from '../../interfaces/enums';

type GpuAdapterLike = {
    name?: string;
};

type NavigatorWithGpu = Navigator & {
    gpu?: {
        requestAdapter: () => Promise<GpuAdapterLike | null>;
    };
};

type NavigatorWithDeviceMemory = Navigator & {
    deviceMemory?: number;
    hardwareConcurrency?: number;
};

type PerformanceWithMemory = Performance & {
    memory?: {
        usedJSHeapSize: number;
        jsHeapSizeLimit: number;
    };
};

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
    const [ollamaVersion, setOllamaVersion] = useState<string | null>(null);
    const [gpuName, setGpuName] = useState('Detecting...');
    const [gpuStatus, setGpuStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
    const [memoryUsagePercent, setMemoryUsagePercent] = useState<number | null>(null);
    const [deviceMemoryGb, setDeviceMemoryGb] = useState<number | null>(null);
    const [cpuCores, setCpuCores] = useState<number | null>(null);

    useEffect(() => {
        let active = true;

        const loadOllamaInfo = async () => {
            if (externalProvider !== ExternalProviderEnum.Ollama) {
                if (!active) return;
                setOllamaVersion(null);
                setGpuName('Not available');
                setGpuStatus('unavailable');
                return;
            }

            setGpuName('Detecting...');
            setGpuStatus('checking');

            const version = await fetchOllamaVersion();
            if (active) {
                setOllamaVersion(version);
            }

            const navigatorWithGpu = navigator as NavigatorWithGpu;
            if (!navigatorWithGpu.gpu?.requestAdapter) {
                if (!active) return;
                setGpuName('WebGPU not available');
                setGpuStatus('unavailable');
                return;
            }

            const adapter = await navigatorWithGpu.gpu.requestAdapter();
            if (!active) return;
            if (!adapter) {
                setGpuName('No adapter');
                setGpuStatus('unavailable');
                return;
            }

            setGpuName(adapter.name || 'GPU');
            setGpuStatus('available');
        };

        loadOllamaInfo();

        return () => {
            active = false;
        };
    }, [externalProvider]);

    useEffect(() => {
        if (externalProvider !== ExternalProviderEnum.Ollama) {
            setMemoryUsagePercent(null);
            setDeviceMemoryGb(null);
            setCpuCores(null);
            return;
        }

        const navigatorWithMemory = navigator as NavigatorWithDeviceMemory;
        setDeviceMemoryGb(navigatorWithMemory.deviceMemory ?? null);
        setCpuCores(navigatorWithMemory.hardwareConcurrency ?? null);

        const updateMemoryUsage = () => {
            const perf = performance as PerformanceWithMemory;
            if (!perf.memory?.jsHeapSizeLimit) {
                setMemoryUsagePercent(null);
                return;
            }

            const percent = Math.min(100, Math.max(0, (perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit) * 100));
            setMemoryUsagePercent(Math.round(percent));
        };

        updateMemoryUsage();
        const intervalId = window.setInterval(updateMemoryUsage, 2000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [externalProvider]);

    return (
        <div className="animate-in fade-in slide-in-from-left-2 duration-300 space-y-4">
            <div className="bg-slate-950 p-1 rounded-lg border border-slate-800">
                <select
                    value={providerSelectValue}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onProviderSelect(e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-white outline-none px-2 py-1 cursor-pointer"
                >
                    <option value={ProviderTypeEnum.Gemini} className="bg-slate-950 text-indigo-400 font-bold">Native Gemini</option>
                    {externalProviders.map(ep => (
                        <option key={ep} value={ep} className="bg-slate-950 text-slate-200">
                            {ep === ExternalProviderEnum.Other ? 'Custom Endpoint (other)' : ep.charAt(0).toUpperCase() + ep.slice(1)}
                        </option>
                    ))}
                </select>
            </div>

            {provider === ProviderTypeEnum.External && (
                <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">API Type</label>
                    <select
                        value={apiType}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onApiTypeChange(e.target.value as ApiType)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
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
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Model ID</label>
                        {externalProvider === ExternalProviderEnum.Ollama && (
                            <div className="flex items-center gap-2">
                                <span className={`text-[9px] ${ollamaStatus === OllamaStatus.Online ? 'text-emerald-400' : ollamaStatus === OllamaStatus.Offline ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {ollamaStatus === OllamaStatus.Online ? `● ${ollamaModels.length} models` : ollamaStatus === OllamaStatus.Offline ? '● Not Found' : '● Checking...'}
                                </span>
                                <button
                                    onClick={onRefreshOllamaModels}
                                    disabled={ollamaLoading}
                                    className="p-0.5 text-slate-400 hover:text-emerald-400 disabled:opacity-50"
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
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onExternalModelChange(e.target.value)}
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
                                                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover-border-emerald-600 hover:text-emerald-400'
                                                }`}
                                        >
                                            {model.name.includes(':') ? model.name.split(':')[0] : model.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {ollamaStatus === OllamaStatus.Offline && (
                                <div className="rounded border border-red-900/50 bg-red-950/20 p-2 space-y-1">
                                    <div className="flex items-center gap-1.5 text-red-400">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                                        <span className="text-[10px] font-bold">Ollama Not Found</span>
                                    </div>
                                    <p className="text-[9px] text-red-300/70 leading-relaxed">
                                        Ollama could not be reached. Ensure it's installed and running.
                                    </p>
                                    <div className="mt-1 pt-1 border-t border-red-900/30">
                                        <code className="text-[9px] bg-black/40 px-1.5 py-0.5 rounded text-red-200 block w-full text-center font-mono">ollama serve</code>
                                    </div>
                                </div>
                            )}
                            <div className="rounded border border-slate-800 bg-slate-950/40 p-2 space-y-1">
                                <div className="text-[10px] font-bold text-slate-300">Ollama Runtime</div>
                                <div className="flex items-center justify-between text-[9px] text-slate-400">
                                    <span>Ollama Version</span>
                                    <span className="text-slate-200">{ollamaVersion || 'Unknown'}</span>
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-slate-400">
                                    <span>GPU</span>
                                    <span className={`${gpuStatus === 'available' ? 'text-emerald-300' : gpuStatus === 'checking' ? 'text-yellow-300' : 'text-slate-400'}`}>
                                        {gpuStatus === 'checking' ? 'Detecting...' : gpuName}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-slate-400">
                                    <span>Memory Usage</span>
                                    <span className="text-slate-200">{memoryUsagePercent !== null ? `${memoryUsagePercent}%` : 'Unavailable'}</span>
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-slate-400">
                                    <span>Device Memory</span>
                                    <span className="text-slate-200">{deviceMemoryGb !== null ? `${deviceMemoryGb} GB` : 'Unknown'}</span>
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-slate-400">
                                    <span>CPU Cores</span>
                                    <span className="text-slate-200">{cpuCores !== null ? cpuCores : 'Unknown'}</span>
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
                                <label className="text-[10px] text-slate-500 font-bold uppercase">API Key</label>
                                <input type="password" value={externalApiKey || ''} placeholder="Required here unless a main key is set in Settings" onChange={(e: React.ChangeEvent<HTMLInputElement>) => onExternalApiKeyChange(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none" />
                            </div>
                        )}
                        {externalProvider === ExternalProviderEnum.Other && (
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold uppercase">Base URL</label>
                                <input type="text" value={customBaseUrl || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onCustomBaseUrlChange(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none" placeholder={defaultCustomBaseUrl || "https://api.example.com/v1"} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
