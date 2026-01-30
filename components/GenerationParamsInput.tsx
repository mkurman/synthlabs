
import { useState } from 'react';
import { Settings, ChevronDown, ChevronRight, RefreshCcw, HelpCircle } from 'lucide-react';
import { GenerationParams } from '../types';

interface GenerationParamsInputProps {
    params?: GenerationParams;
    onChange: (params: GenerationParams) => void;
    label?: string;
    defaultExpanded?: boolean;
}

export default function GenerationParamsInput({ params, onChange, label = "Generation Parameters", defaultExpanded = false }: GenerationParamsInputProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    // If params is undefined, treat it as empty object for display, but keep undefined for "use defaults" logic if needed
    // However, usually we pass in an object.
    const currentParams = params || {};

    const updateParam = (key: keyof GenerationParams, value: number | undefined) => {
        onChange({
            ...currentParams,
            [key]: value
        });
    };

    const updateBoolParam = (key: keyof GenerationParams, value: boolean) => {
        onChange({
            ...currentParams,
            [key]: value
        });
    };

    return (
        <div className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs font-bold text-slate-300">{label}</span>
                    {/* Show summary if collapsed */}
                    {!isExpanded && (
                        <span className="text-[10px] text-slate-500 ml-2">
                            Temp: {currentParams.temperature ?? 'Def'}, TopP: {currentParams.topP ?? 'Def'}
                        </span>
                    )}
                </div>
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isExpanded && (
                <div className="p-3 pt-0 space-y-4 border-t border-slate-800/50 mt-1">
                    <div className="grid grid-cols-2 gap-4 pt-3">
                        {/* Temperature */}
                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-[10px] text-slate-400 font-bold uppercase">Temperature</label>
                                <span className="text-[10px] text-slate-500">{currentParams.temperature ?? 'Default'}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.01"
                                value={currentParams.temperature ?? 0.8}
                                onChange={(e) => updateParam('temperature', parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                        </div>

                        {/* Top P */}
                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-[10px] text-slate-400 font-bold uppercase">Top P</label>
                                <span className="text-[10px] text-slate-500">{currentParams.topP ?? 'Default'}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={currentParams.topP ?? 0.9}
                                onChange={(e) => updateParam('topP', parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                        </div>

                        {/* Top K */}
                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-[10px] text-slate-400 font-bold uppercase">Top K</label>
                            </div>
                            <input
                                type="number"
                                min="1"
                                max="1000"
                                step="1"
                                value={currentParams.topK ?? ''}
                                onChange={(e) => updateParam('topK', e.target.value ? parseInt(e.target.value) : undefined)}
                                placeholder="Default"
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 focus:border-purple-500 outline-none"
                            />
                        </div>

                        {/* Max Tokens */}
                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-[10px] text-slate-400 font-bold uppercase">Max Tokens</label>
                            </div>
                            <input
                                type="number"
                                min="1"
                                max="128000"
                                step="1"
                                value={currentParams.maxTokens ?? ''}
                                onChange={(e) => updateParam('maxTokens', e.target.value ? parseInt(e.target.value) : undefined)}
                                placeholder="Default"
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 focus:border-purple-500 outline-none"
                            />
                        </div>

                        {/* Presence Penalty */}
                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-[10px] text-slate-400 font-bold uppercase">Presence Pen.</label>
                                <span className="text-[10px] text-slate-500">{currentParams.presencePenalty ?? 'Default'}</span>
                            </div>
                            <input
                                type="range"
                                min="-2"
                                max="2"
                                step="0.01"
                                value={currentParams.presencePenalty ?? 0}
                                onChange={(e) => updateParam('presencePenalty', parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                        </div>

                        {/* Frequency Penalty */}
                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-[10px] text-slate-400 font-bold uppercase">Frequency Pen.</label>
                                <span className="text-[10px] text-slate-500">{currentParams.frequencyPenalty ?? 'Default'}</span>
                            </div>
                            <input
                                type="range"
                                min="-2"
                                max="2"
                                step="0.01"
                                value={currentParams.frequencyPenalty ?? 0}
                                onChange={(e) => updateParam('frequencyPenalty', parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                        </div>
                    </div>

                    {/* Structured Output Toggle */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-800/50">
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Force Structured Output</label>
                            <span className="text-[9px] text-slate-500" title="When enabled, requests JSON response format from the model">
                                (JSON mode)
                            </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={currentParams.forceStructuredOutput ?? true}
                                onChange={(e) => updateBoolParam('forceStructuredOutput', e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-800/50 mt-2">
                        <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                            <HelpCircle className="w-3 h-3" />
                            <span>"Default" uses the model provider's native setting.</span>
                        </div>
                        <button
                            onClick={() => onChange({})}
                            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                            title="Reset all to defaults"
                        >
                            <RefreshCcw className="w-3 h-3" />
                            Use Global Defaults
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
