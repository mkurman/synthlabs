import React from 'react';
import { MessageSquare } from 'lucide-react';
import { ApiType, ExternalProvider, ProviderType, ResponderPhase } from '../../interfaces/enums';
import { EXTERNAL_PROVIDERS } from '../../constants';
import { SettingsService } from '../../services/settingsService';
import ModelSelector from '../ModelSelector';
import { UserAgentConfig } from '../../types';

interface UserAgentConfigPanelProps {
    userAgentConfig: UserAgentConfig;
    onUserAgentConfigChange: (updater: (prev: UserAgentConfig) => UserAgentConfig) => void;
    onDisableConversationRewrite: () => void;
}

export default function UserAgentConfigPanel({
    userAgentConfig,
    onUserAgentConfigChange,
    onDisableConversationRewrite
}: UserAgentConfigPanelProps) {
    return (
        <div className="mt-4 pt-4 border-t border-slate-700">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm font-medium text-white">User Agent (Multi-Turn)</span>
                </div>
                <button
                    onClick={() => {
                        const newEnabled = !userAgentConfig.enabled;
                        onUserAgentConfigChange(prev => ({ ...prev, enabled: newEnabled }));
                        if (newEnabled) {
                            onDisableConversationRewrite();
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
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUserAgentConfigChange(prev => ({ ...prev, followUpCount: parseInt(e.target.value) }))}
                                className="w-full accent-cyan-500"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-bold uppercase">Responder</label>
                            <select
                                value={userAgentConfig.responderPhase}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onUserAgentConfigChange(prev => ({ ...prev, responderPhase: e.target.value as ResponderPhase }))}
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
                            <button onClick={() => onUserAgentConfigChange(prev => ({ ...prev, provider: ProviderType.Gemini }))} className={`flex-1 py-1 text-[10px] font-medium rounded transition-all ${userAgentConfig.provider === ProviderType.Gemini ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>Gemini</button>
                            <button onClick={() => onUserAgentConfigChange(prev => ({ ...prev, provider: ProviderType.External }))} className={`flex-1 py-1 text-[10px] font-medium rounded transition-all ${userAgentConfig.provider === ProviderType.External ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>External</button>
                        </div>
                    </div>
                    {userAgentConfig.provider === ProviderType.External && (
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold uppercase">Provider</label>
                                <select
                                    value={userAgentConfig.externalProvider}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onUserAgentConfigChange(prev => ({ ...prev, externalProvider: e.target.value as ExternalProvider }))}
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
                                    onChange={(model) => onUserAgentConfigChange(prev => ({ ...prev, model }))}
                                    apiKey={userAgentConfig.apiKey || SettingsService.getApiKey(userAgentConfig.externalProvider)}
                                    customBaseUrl={userAgentConfig.customBaseUrl}
                                    placeholder="Select model"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold uppercase">API Type</label>
                                <select
                                    value={userAgentConfig.apiType || ApiType.Chat}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onUserAgentConfigChange(prev => ({ ...prev, apiType: e.target.value as ApiType }))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                                    title="API Type: chat=completions, responses=responses API"
                                >
                                    <option value={ApiType.Chat}>Chat</option>
                                    <option value={ApiType.Responses}>Responses</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold uppercase">API Key</label>
                                <input
                                    type="password"
                                    value={userAgentConfig.apiKey}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUserAgentConfigChange(prev => ({ ...prev, apiKey: e.target.value }))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                                />
                            </div>
                            {userAgentConfig.externalProvider === ExternalProvider.Other && (
                                <div className="col-span-2 space-y-1">
                                    <label className="text-[10px] text-slate-500 font-bold uppercase">Base URL</label>
                                    <input
                                        type="text"
                                        value={userAgentConfig.customBaseUrl}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUserAgentConfigChange(prev => ({ ...prev, customBaseUrl: e.target.value }))}
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
    );
}
