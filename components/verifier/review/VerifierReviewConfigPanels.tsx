import type { Dispatch, SetStateAction } from 'react';
import { ChevronDown, ChevronUp, Settings2, Star } from 'lucide-react';
import { ExternalProvider, ModelListProvider, ProviderType, type AutoscoreConfig } from '../../../types';
import * as VerifierRewriterService from '../../../services/verifierRewriterService';
import { AVAILABLE_PROVIDERS, SettingsService } from '../../../services/settingsService';
import { PromptService } from '../../../services/promptService';
import { PromptCategory, PromptRole } from '../../../interfaces/enums';
import { PROVIDERS } from '../../../constants';
import ModelSelector from '../../ModelSelector';
import GenerationParamsInput from '../../GenerationParamsInput';

interface VerifierReviewConfigPanelsProps {
    isRewriterPanelOpen: boolean;
    setIsRewriterPanelOpen: Dispatch<SetStateAction<boolean>>;
    rewriterConfig: VerifierRewriterService.RewriterConfig;
    setRewriterConfig: Dispatch<SetStateAction<VerifierRewriterService.RewriterConfig>>;
    rewriterBaseUrlDraft: string;
    setRewriterBaseUrlDraft: Dispatch<SetStateAction<string>>;
    rewriterModelRefreshTick: number;
    setRewriterModelRefreshTick: Dispatch<SetStateAction<number>>;
    isAutoscorePanelOpen: boolean;
    setIsAutoscorePanelOpen: Dispatch<SetStateAction<boolean>>;
    autoscoreConfig: AutoscoreConfig;
    setAutoscoreConfig: Dispatch<SetStateAction<AutoscoreConfig>>;
    autoscoreBaseUrlDraft: string;
    setAutoscoreBaseUrlDraft: Dispatch<SetStateAction<string>>;
    autoscoreModelRefreshTick: number;
    setAutoscoreModelRefreshTick: Dispatch<SetStateAction<number>>;
}

export default function VerifierReviewConfigPanels({
    isRewriterPanelOpen,
    setIsRewriterPanelOpen,
    rewriterConfig,
    setRewriterConfig,
    rewriterBaseUrlDraft,
    setRewriterBaseUrlDraft,
    rewriterModelRefreshTick,
    setRewriterModelRefreshTick,
    isAutoscorePanelOpen,
    setIsAutoscorePanelOpen,
    autoscoreConfig,
    setAutoscoreConfig,
    autoscoreBaseUrlDraft,
    setAutoscoreBaseUrlDraft,
    autoscoreModelRefreshTick,
    setAutoscoreModelRefreshTick
}: VerifierReviewConfigPanelsProps) {
    return (
        <>
            <div className="bg-slate-950/70 rounded-xl border border-slate-800/70 overflow-visible">
                <button
                    onClick={() => setIsRewriterPanelOpen(!isRewriterPanelOpen)}
                    className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition-colors"
                >
                    <span className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4" />
                        REWRITER SETTINGS
                    </span>
                    {isRewriterPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {isRewriterPanelOpen && (
                    <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-800/70 pt-4">
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Provider</label>
                            <select
                                value={rewriterConfig.externalProvider}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const nextExternalProvider = val as ExternalProvider;
                                    const nextKeyProvider = val as ExternalProvider;
                                    let settingsBaseUrl = null;
                                    if (nextKeyProvider === ExternalProvider.Other) {
                                        settingsBaseUrl = SettingsService.getCustomBaseUrl() || '';
                                    }
                                    const nextBaseUrl = settingsBaseUrl || (PROVIDERS[val]?.url || '');
                                    const nextApiKey = SettingsService.getApiKey(nextKeyProvider) || '';
                                    const nextModel = SettingsService.getDefaultModel(nextKeyProvider) || rewriterConfig.model;
                                    setRewriterBaseUrlDraft(nextBaseUrl);
                                    setRewriterConfig((prev) => ({
                                        ...prev,
                                        provider: ProviderType.External,
                                        externalProvider: nextExternalProvider,
                                        apiKey: nextApiKey,
                                        model: prev.model || nextModel,
                                        customBaseUrl: nextBaseUrl
                                    }));
                                    setRewriterModelRefreshTick((prev) => prev + 1);
                                    e.stopPropagation();
                                }}
                                className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                            >
                                {AVAILABLE_PROVIDERS.map((p) => (
                                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Model</label>
                            <ModelSelector
                                provider={rewriterConfig.externalProvider as ModelListProvider}
                                value={rewriterConfig.model}
                                onChange={(model) => setRewriterConfig((prev) => ({ ...prev, model }))}
                                apiKey={rewriterConfig.apiKey || SettingsService.getApiKey(rewriterConfig.externalProvider)}
                                customBaseUrl={rewriterConfig.customBaseUrl}
                                refreshToken={rewriterModelRefreshTick}
                                placeholder="Select or enter model"
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">API Key</label>
                            <input
                                type="password"
                                value={rewriterConfig.apiKey}
                                onChange={(e) => setRewriterConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                                placeholder="Use default from settings"
                                className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Custom Base URL</label>
                            <input
                                type="text"
                                value={rewriterBaseUrlDraft}
                                onChange={(e) => setRewriterBaseUrlDraft(e.target.value)}
                                onBlur={() => {
                                    const trimmed = rewriterBaseUrlDraft.trim();
                                    if (trimmed === (rewriterConfig.customBaseUrl || '')) {
                                        return;
                                    }
                                    setRewriterConfig((prev) => ({ ...prev, customBaseUrl: trimmed }));
                                    setRewriterModelRefreshTick((prev) => prev + 1);
                                }}
                                placeholder={PROVIDERS[rewriterConfig.externalProvider]?.url || 'Optional'}
                                className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                            />
                        </div>
                        <div className="col-span-1 md:col-span-2 flex gap-4">
                            <div className="flex-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Max Retries</label>
                                <input
                                    type="number"
                                    value={rewriterConfig.maxRetries ?? 3}
                                    onChange={(e) => setRewriterConfig((prev) => ({ ...prev, maxRetries: parseInt(e.target.value, 10) || 0 }))}
                                    className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Retry Delay (ms)</label>
                                <input
                                    type="number"
                                    value={rewriterConfig.retryDelay ?? 2000}
                                    onChange={(e) => setRewriterConfig((prev) => ({ ...prev, retryDelay: parseInt(e.target.value, 10) || 0 }))}
                                    className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                                />
                            </div>
                        </div>
                        <div className="col-span-1 md:col-span-2 flex gap-4">
                            <div className="flex-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Concurrency</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={rewriterConfig.concurrency ?? 1}
                                    onChange={(e) => setRewriterConfig((prev) => ({ ...prev, concurrency: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                                    className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Batch Delay (ms)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="100"
                                    value={rewriterConfig.delayMs ?? 0}
                                    onChange={(e) => setRewriterConfig((prev) => ({ ...prev, delayMs: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                                    className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                                />
                            </div>
                        </div>
                        <div className="col-span-4 mt-2">
                            {(() => {
                                const promptSet = SettingsService.getSettings().promptSet || 'default';
                                const activeSchema = PromptService.getPromptSchema(PromptCategory.Verifier, PromptRole.Rewriter, promptSet);
                                const activePrompt = activeSchema?.prompt || '';
                                const displayValue = rewriterConfig.systemPrompt || activePrompt;
                                const isModified = !!(rewriterConfig.systemPrompt && rewriterConfig.systemPrompt !== activePrompt);
                                return (
                                    <>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-[10px] text-slate-400 font-bold uppercase">System Prompt</label>
                                            <span className="text-[9px] text-slate-500">
                                                Prompt set: <span className="text-sky-400">{promptSet}</span>
                                                {isModified ? ' (modified)' : ' (default)'}
                                            </span>
                                        </div>
                                        <textarea
                                            value={displayValue}
                                            onChange={(e) => setRewriterConfig((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                                            rows={4}
                                            className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500 resize-y"
                                        />
                                        {isModified && (
                                            <button
                                                onClick={() => setRewriterConfig((prev) => ({ ...prev, systemPrompt: '' }))}
                                                className="text-[9px] text-slate-500 hover:text-red-400 mt-1 transition-colors"
                                            >
                                                Reset to prompt set default
                                            </button>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-slate-950/70 rounded-xl border border-slate-800/70 overflow-visible mb-4">
                <button
                    onClick={() => setIsAutoscorePanelOpen(!isAutoscorePanelOpen)}
                    className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition-colors"
                >
                    <span className="flex items-center gap-2 text-emerald-400">
                        <Star className="w-4 h-4" />
                        AUTOSCORE CONFIG
                    </span>
                    {isAutoscorePanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {isAutoscorePanelOpen && (
                    <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-800/70 pt-4">
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Provider</label>
                            <select
                                value={autoscoreConfig.externalProvider}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const nextExternalProvider = val as ExternalProvider;
                                    const nextKeyProvider = val as ExternalProvider;
                                    let settingsBaseUrl = null;
                                    if (nextKeyProvider === ExternalProvider.Other) {
                                        settingsBaseUrl = SettingsService.getCustomBaseUrl() || '';
                                    }
                                    const nextBaseUrl = settingsBaseUrl || (PROVIDERS[val]?.url || '');
                                    const nextApiKey = SettingsService.getApiKey(nextKeyProvider) || '';
                                    const nextModel = SettingsService.getDefaultModel(nextKeyProvider) || autoscoreConfig.model;
                                    setAutoscoreConfig((prev) => ({
                                        ...prev,
                                        provider: ProviderType.External,
                                        externalProvider: nextExternalProvider,
                                        apiKey: nextApiKey,
                                        model: prev.model || nextModel,
                                        customBaseUrl: nextBaseUrl
                                    }));
                                    setAutoscoreModelRefreshTick((prev) => prev + 1);
                                }}
                                className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                            >
                                {AVAILABLE_PROVIDERS.map((p) => (
                                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Model</label>
                            <ModelSelector
                                provider={autoscoreConfig.externalProvider as ModelListProvider}
                                value={autoscoreConfig.model}
                                onChange={(model) => setAutoscoreConfig((prev) => ({ ...prev, model }))}
                                apiKey={autoscoreConfig.apiKey || SettingsService.getApiKey(autoscoreConfig.externalProvider)}
                                customBaseUrl={autoscoreConfig.customBaseUrl || SettingsService.getCustomBaseUrl()}
                                refreshToken={autoscoreModelRefreshTick}
                                placeholder="Select or enter model"
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">API Key</label>
                            <input
                                type="password"
                                value={autoscoreConfig.apiKey || ''}
                                onChange={(e) => setAutoscoreConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                                placeholder={SettingsService.getApiKey(autoscoreConfig.externalProvider)
                                    ? 'Using Global Key (Settings)'
                                    : 'Enter API Key...'}
                                className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Custom Base URL</label>
                            <input
                                type="text"
                                value={autoscoreBaseUrlDraft}
                                onChange={(e) => setAutoscoreBaseUrlDraft(e.target.value)}
                                onBlur={() => {
                                    const trimmed = autoscoreBaseUrlDraft.trim();
                                    if (trimmed === (autoscoreConfig.customBaseUrl || '')) {
                                        return;
                                    }
                                    setAutoscoreConfig((prev) => ({ ...prev, customBaseUrl: trimmed }));
                                    setAutoscoreModelRefreshTick((prev) => prev + 1);
                                }}
                                placeholder={PROVIDERS[autoscoreConfig.externalProvider]?.url || 'Optional'}
                                className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Concurrency</label>
                            <input
                                type="number"
                                min="1"
                                max="50"
                                value={autoscoreConfig.concurrency}
                                onChange={(e) => setAutoscoreConfig((prev) => ({ ...prev, concurrency: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                                className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Sleep (ms)</label>
                            <input
                                type="number"
                                min="0"
                                step="100"
                                value={autoscoreConfig.sleepTime}
                                onChange={(e) => setAutoscoreConfig((prev) => ({ ...prev, sleepTime: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                                className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                            />
                        </div>
                        <div className="col-span-1 md:col-span-2 flex gap-4">
                            <div className="flex-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Max Retries</label>
                                <input
                                    type="number"
                                    value={autoscoreConfig.maxRetries}
                                    onChange={(e) => setAutoscoreConfig((prev) => ({ ...prev, maxRetries: parseInt(e.target.value, 10) || 0 }))}
                                    className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Retry Delay (ms)</label>
                                <input
                                    type="number"
                                    value={autoscoreConfig.retryDelay}
                                    onChange={(e) => setAutoscoreConfig((prev) => ({ ...prev, retryDelay: parseInt(e.target.value, 10) || 0 }))}
                                    className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                />
                            </div>
                        </div>
                        <div className="col-span-1 md:col-span-4 border-t border-slate-800/70 pt-4">
                            <GenerationParamsInput
                                params={autoscoreConfig.generationParams}
                                onChange={(newParams) => setAutoscoreConfig((prev) => ({ ...prev, generationParams: newParams }))}
                            />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
