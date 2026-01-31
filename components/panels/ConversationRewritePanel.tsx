import React from 'react';
import { Layers, RefreshCcw } from 'lucide-react';
import { AppMode, DataSource } from '../../interfaces/enums';
import { HuggingFaceConfig } from '../../types';

interface ConversationRewritePanelProps {
    appMode: AppMode;
    dataSourceMode: DataSource;
    conversationRewriteMode: boolean;
    onConversationRewriteModeChange: (enabled: boolean) => void;
    onDisableUserAgent: () => void;
    hfConfig: HuggingFaceConfig;
    onHfConfigChange: (config: HuggingFaceConfig) => void;
}

export default function ConversationRewritePanel({
    appMode,
    dataSourceMode,
    conversationRewriteMode,
    onConversationRewriteModeChange,
    onDisableUserAgent,
    hfConfig,
    onHfConfigChange
}: ConversationRewritePanelProps) {
    if ((appMode !== AppMode.Converter && appMode !== AppMode.Generator)
        || (dataSourceMode !== DataSource.HuggingFace && dataSourceMode !== DataSource.Manual)) {
        return null;
    }

    return (
        <div className="mt-4 pt-4 border-t border-slate-700">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <RefreshCcw className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium text-white">Generate/Rewrite Conversation Traces</span>
                </div>
                <button
                    onClick={() => {
                        const newValue = !conversationRewriteMode;
                        onConversationRewriteModeChange(newValue);
                        if (newValue) {
                            onDisableUserAgent();
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
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onHfConfigChange({
                                ...hfConfig,
                                maxMultiTurnTraces: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0)
                            })}
                            className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-amber-500 outline-none"
                            placeholder="All"
                        />
                        <span className="text-[10px] text-slate-500">Empty = process all traces</span>
                    </div>
                </div>
            )}
        </div>
    );
}
