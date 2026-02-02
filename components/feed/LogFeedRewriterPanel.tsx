import { ExternalProvider } from '../../types';
import { RewriterConfig } from '../../services/verifierRewriterService';
import { SettingsService, AVAILABLE_PROVIDERS } from '../../services/settingsService';
import GenerationParamsInput from '../GenerationParamsInput';

interface LogFeedRewriterPanelProps {
    rewriterConfig: RewriterConfig;
    onRewriterConfigChange: (config: RewriterConfig) => void;
}

export default function LogFeedRewriterPanel({
    rewriterConfig,
    onRewriterConfigChange
}: LogFeedRewriterPanelProps) {
    return (
        <div className="animate-in fade-in slide-in-from-left-2 duration-300 space-y-4">
            {/* Provider Selection */}
            <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase">Provider</label>
                <div className="bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <select
                        value={rewriterConfig.externalProvider}
                        onChange={e => {
                            const newProvider = e.target.value as ExternalProvider;
                            onRewriterConfigChange({
                                ...rewriterConfig,
                                externalProvider: newProvider,
                                model: SettingsService.getDefaultModel(newProvider) || rewriterConfig.model
                            });
                        }}
                        className="w-full bg-transparent text-xs font-bold text-white outline-none px-2 py-1 cursor-pointer"
                    >
                        {AVAILABLE_PROVIDERS.map(p => (
                            <option key={p} value={p} className="bg-slate-950 text-slate-200">
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Model ID */}
            <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase">Model ID</label>
                <input
                    type="text"
                    value={rewriterConfig.model}
                    onChange={e => onRewriterConfigChange({ ...rewriterConfig, model: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                    placeholder="e.g., gpt-4o-mini, claude-3-haiku..."
                />
            </div>

            {/* Custom Base URL */}
            <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase">Custom Base URL</label>
                <input
                    type="text"
                    value={rewriterConfig.customBaseUrl || ''}
                    onChange={e => onRewriterConfigChange({ ...rewriterConfig, customBaseUrl: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                    placeholder="https://api.example.com/v1 (optional)"
                />
            </div>

            {/* Generation Parameters */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="text-[10px] text-slate-500 font-bold uppercase">Generation Parameters</label>
                <GenerationParamsInput
                    params={rewriterConfig.generationParams || SettingsService.getDefaultGenerationParams()}
                    onChange={(params) => onRewriterConfigChange({ ...rewriterConfig, generationParams: params })}
                />
            </div>
        </div>
    );
}
