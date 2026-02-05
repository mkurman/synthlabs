import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Play, RefreshCw, Trash2 } from 'lucide-react';
import { ApiType, ExternalProvider, OllamaStatus } from '../interfaces/enums';
import { EXTERNAL_PROVIDERS, PROVIDERS } from '../constants';
import { SettingsService } from '../services/settingsService';
import { callExternalApi } from '../services/externalApiService';
import { useSettingsOllama } from '../hooks/useSettingsOllama';
import { formatOllamaModelSize } from '../services/ollamaService';

type BatchConfig = {
    id: string;
    provider: ExternalProvider;
    model: string;
    apiType: ApiType;
    customBaseUrl: string;
};

type BatchResult = {
    status: 'idle' | 'running' | 'success' | 'error';
    output?: string;
    error?: string;
    latencyMs?: number;
};

const defaultPrompt = 'Write a concise summary of the following topic: The fundamentals of quantum mechanics';
const promptExamples = [
    defaultPrompt,
    'Explain the tradeoffs between REST and GraphQL for a public API.',
    'Given a JSON object with user stats, propose three growth experiments.',
    'Summarize the risks of training data leakage in LLMs in 5 bullet points.',
    'Draft a concise product update email for beta users about new performance improvements.'
];

export default function BatchPromptDebugger() {
    const [prompt, setPrompt] = useState(defaultPrompt);
    const [rows, setRows] = useState<BatchConfig[]>([{
        id: crypto.randomUUID(),
        provider: ExternalProvider.Ollama,
        model: 'qwen3:8b',
        apiType: ApiType.Chat,
        customBaseUrl: SettingsService.getCustomBaseUrl()
    }]);
    const [results, setResults] = useState<Record<string, BatchResult>>({});
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { ollamaModels, ollamaStatus, ollamaLoading, refreshOllamaModels } = useSettingsOllama();
    const hasOllamaRow = useMemo(() => rows.some(row => row.provider === ExternalProvider.Ollama), [rows]);

    const canRun = useMemo(() => {
        if (!prompt.trim()) return false;
        return rows.every(row => row.model.trim() && (row.provider !== ExternalProvider.Other || row.customBaseUrl.trim()));
    }, [prompt, rows]);

    useEffect(() => {
        if (hasOllamaRow) {
            refreshOllamaModels();
        }
    }, [hasOllamaRow, refreshOllamaModels]);

    useEffect(() => {
        if (ollamaModels.length === 0) return;
        setRows(prev => {
            let updated = false;
            const next = prev.map(row => {
                if (row.provider !== ExternalProvider.Ollama) return row;
                if (row.model.trim()) return row;
                updated = true;
                return { ...row, model: ollamaModels[0].name };
            });
            return updated ? next : prev;
        });
    }, [ollamaModels]);

    const addRow = () => {
        setRows(prev => ([
            ...prev,
            {
                id: crypto.randomUUID(),
                provider: ExternalProvider.OpenRouter,
                model: '',
                apiType: ApiType.Chat,
                customBaseUrl: SettingsService.getCustomBaseUrl()
            }
        ]));
    };

    const removeRow = (id: string) => {
        setRows(prev => prev.filter(row => row.id !== id));
        setResults(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const updateRow = (id: string, patch: Partial<BatchConfig>) => {
        setRows(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row));
    };

    const runAll = async () => {
        if (!canRun || isRunning) return;
        setIsRunning(true);
        setError(null);
        setResults(prev => {
            const next = { ...prev };
            rows.forEach(row => {
                next[row.id] = { status: 'running' };
            });
            return next;
        });

        await Promise.all(rows.map(async row => {
            const start = performance.now();
            try {
                const output = await callExternalApi({
                    provider: row.provider,
                    apiKey: SettingsService.getApiKey(row.provider),
                    model: row.model,
                    apiType: row.apiType,
                    customBaseUrl: row.provider === ExternalProvider.Other ? row.customBaseUrl : undefined,
                    userPrompt: prompt,
                    structuredOutput: false,
                    generationParams: SettingsService.getDefaultGenerationParams()
                });

                const latencyMs = Math.round(performance.now() - start);
                setResults(prev => ({
                    ...prev,
                    [row.id]: { status: 'success', output: String(output), latencyMs }
                }));
            } catch (err: any) {
                const latencyMs = Math.round(performance.now() - start);
                setResults(prev => ({
                    ...prev,
                    [row.id]: { status: 'error', error: err?.message || 'Unknown error', latencyMs }
                }));
            }
        }));

        setIsRunning(false);
    };

    return (
        <main className="max-w-7xl mx-auto p-4 mt-4 pb-20 space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Batch Prompt Debugger</h2>
                        <p className="text-xs text-slate-400">Run the same prompt across multiple models and compare outputs.</p>
                    </div>
                    <button
                        onClick={runAll}
                        disabled={!canRun || isRunning}
                        className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Play className="w-4 h-4" />
                        {isRunning ? 'Running...' : 'Run All'}
                    </button>
                </div>

                {error && (
                    <div className="bg-red-950/40 border border-red-900/60 text-red-300 text-xs rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">Prompt</label>
                    <textarea
                        value={prompt}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 outline-none min-h-[90px]"
                    />
                    <div className="flex flex-wrap gap-2">
                        {promptExamples.map(example => (
                            <button
                                key={example}
                                onClick={() => setPrompt(example)}
                                className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800 text-[10px] text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
                            >
                                {example}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Model Matrix</h3>
                    <button
                        onClick={addRow}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase flex items-center gap-2"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Model
                    </button>
                </div>

                <div className="space-y-3">
                    {rows.map(row => {
                        const result = results[row.id];
                        return (
                            <div key={row.id} className="border border-slate-800 rounded-lg p-4 bg-slate-950/40 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                                    <div className="md:col-span-3">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase">Provider</label>
                                        <select
                                            value={row.provider}
                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateRow(row.id, { provider: e.target.value as ExternalProvider })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                                        >
                                            {EXTERNAL_PROVIDERS.map(providerId => (
                                                <option key={providerId} value={providerId}>
                                                    {PROVIDERS[providerId]?.name || providerId}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="md:col-span-4">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase">Model</label>
                                        {row.provider === ExternalProvider.Ollama ? (
                                            <select
                                                value={row.model}
                                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateRow(row.id, { model: e.target.value })}
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
                                        ) : (
                                            <input
                                                value={row.model}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(row.id, { model: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                                                placeholder="e.g. gpt-4o, qwen3:8b"
                                            />
                                        )}
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase">API Type</label>
                                        <select
                                            value={row.apiType}
                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateRow(row.id, { apiType: e.target.value as ApiType })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                                        >
                                            <option value={ApiType.Chat}>Chat Completions</option>
                                            <option value={ApiType.Responses}>Responses API</option>
                                        </select>
                                    </div>
                                    <div className="md:col-span-2 flex justify-end">
                                        <button
                                            onClick={() => removeRow(row.id)}
                                            className="text-slate-400 hover:text-red-400 flex items-center gap-1 text-xs"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Remove
                                        </button>
                                    </div>
                                </div>

                                {row.provider === ExternalProvider.Ollama && (
                                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                                        <div className="flex items-center gap-2">
                                            <span className={`${ollamaStatus === OllamaStatus.Online ? 'text-emerald-400' : ollamaStatus === OllamaStatus.Offline ? 'text-red-400' : 'text-yellow-400'}`}>
                                                {ollamaStatus === OllamaStatus.Online ? `● Online (${ollamaModels.length} models)` : ollamaStatus === OllamaStatus.Offline ? '● Offline' : '● Checking...'}
                                            </span>
                                            <button
                                                onClick={refreshOllamaModels}
                                                disabled={ollamaLoading}
                                                className="p-0.5 text-slate-400 hover:text-emerald-400 disabled:opacity-50"
                                                title="Refresh Ollama models"
                                            >
                                                <RefreshCw className={`w-3 h-3 ${ollamaLoading ? 'animate-spin' : ''}`} />
                                            </button>
                                        </div>
                                        <span>Installed models: {ollamaModels.length}</span>
                                    </div>
                                )}

                                {row.provider === ExternalProvider.Other && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase">Custom Base URL</label>
                                        <input
                                            value={row.customBaseUrl}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(row.id, { customBaseUrl: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                                            placeholder="https://api.example.com/v1"
                                        />
                                    </div>
                                )}

                                <div className="flex items-center justify-between text-[10px] text-slate-500">
                                    <span>Status: {result?.status || 'idle'}</span>
                                    <span>Latency: {result?.latencyMs ? `${result.latencyMs} ms` : '--'}</span>
                                </div>

                                {result?.output && (
                                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 whitespace-pre-wrap">
                                        {result.output}
                                    </div>
                                )}
                                {result?.error && (
                                    <div className="bg-red-950/40 border border-red-900/60 text-red-300 text-xs rounded-lg px-3 py-2">
                                        {result.error}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </main>
    );
}
