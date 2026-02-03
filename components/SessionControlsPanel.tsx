import {
    Play, Pause, Square, Download, Activity, Clock, FileText, ChevronDown, ChevronRight, Zap, Target
} from 'lucide-react';
import { GenerationParams } from '../types';
import GenerationParamsInput from './GenerationParamsInput';
import ModelSelector from './ModelSelector';
import { ProviderType, ExternalProvider, ApiType } from '../interfaces/enums';
import { SessionStatus } from '../interfaces/enums/SessionStatus';

interface SessionControlsPanelProps {
    // Session State
    sessionName: string | null;
    status: SessionStatus;
    totalLogs: number;
    elapsedTime?: string;
    generationRate?: string;

    // Actions
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onExport: () => void;

    // Generation Params
    generationParams: GenerationParams;
    onGenerationParamsChange: (params: GenerationParams) => void;

    // Model Selection
    provider: ProviderType;
    externalProvider: ExternalProvider;
    externalModel: string;
    apiKey?: string;
    customBaseUrl?: string;
    modelPlaceholder?: string;

    onProviderSelect: (provider: any) => void; // Using any for now to allow flexible provider types from App
    onExternalModelChange: (model: string) => void;

    // Deep Reasoning (Simplified for now, just enable/phases)
    deepConfig?: any; // To be typed properly
    onDeepConfigChange?: (config: any) => void;

    disabled?: boolean;
}

export default function SessionControlsPanel({
    sessionName,
    status,
    totalLogs,
    elapsedTime,
    generationRate,
    onStart,
    onPause,
    onResume,
    onStop,
    onExport,
    generationParams,
    onGenerationParamsChange,
    provider,
    externalProvider,
    externalModel,
    apiKey,
    customBaseUrl,
    modelPlaceholder,
    onProviderSelect,
    onExternalModelChange,
    disabled
}: SessionControlsPanelProps) {
    const isRunning = status === SessionStatus.Running;
    const isPaused = status === SessionStatus.Paused;

    return (
        <div className="flex flex-col h-full bg-slate-950/70 overflow-y-auto custom-scrollbar">
            {/* 1. Status Panel */}
            <div className="p-4 border-b border-slate-800/70 bg-slate-950/60">
                <div className="mb-4">
                    <h2 className="text-sm font-semibold text-slate-100 truncate" title={sessionName || 'Untitled Session'}>
                        {sessionName || 'Untitled Session'}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' :
                                isPaused ? 'bg-amber-500' :
                                    'bg-slate-500'
                            }`} />
                        <span className="text-xs text-slate-300 capitalize">{status}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/70">
                        <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Logs
                        </div>
                        <div className="text-lg font-mono text-slate-100">{totalLogs}</div>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/70">
                        <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Time
                        </div>
                        <div className="text-lg font-mono text-slate-100">{elapsedTime || '00:00'}</div>
                    </div>
                </div>

                {/* Primary Actions */}
                <div className="grid grid-cols-2 gap-2">
                    {!isRunning && !isPaused ? (
                        <button
                            onClick={onStart}
                            disabled={disabled}
                            className="col-span-2 flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white p-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Play className="w-4 h-4 fill-current" /> Use Generator
                        </button>
                    ) : (
                        <>
                            {isRunning ? (
                                <button
                                    onClick={onPause}
                                    className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white p-2 rounded-lg font-medium transition-colors"
                                >
                                    <Pause className="w-4 h-4 fill-current" /> Pause
                                </button>
                            ) : (
                                <button
                                    onClick={onResume}
                                    className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white p-2 rounded-lg font-medium transition-colors"
                                >
                                    <Play className="w-4 h-4 fill-current" /> Resume
                                </button>
                            )}
                            <button
                                onClick={onStop}
                                className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white p-2 rounded-lg font-medium transition-colors"
                            >
                                <Square className="w-4 h-4 fill-current" /> Stop
                            </button>
                        </>
                    )}
                    <button
                        onClick={onExport}
                        disabled={totalLogs === 0}
                        className="col-span-2 flex items-center justify-center gap-2 bg-slate-900/60 hover:bg-slate-800/70 text-slate-100 hover:text-white p-2 rounded-lg text-sm font-medium transition-colors mt-2 disabled:opacity-50"
                    >
                        <Download className="w-4 h-4" /> Export Results
                    </button>
                </div>
            </div>

            {/* 2. Generation Configuration */}
            <div className="p-4 space-y-6">
                {/* Model Selection */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-slate-200 font-medium text-sm">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <h3>Model Configuration</h3>
                    </div>

                    {/* Provider & Model Selectors would go here - simplified for layout now */}
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-slate-400">Model</label>
                        <ModelSelector
                            provider={provider === ProviderType.External ? externalProvider : ProviderType.Gemini}
                            value={externalModel}
                            onChange={onExternalModelChange}
                            apiKey={apiKey}
                            customBaseUrl={customBaseUrl}
                            placeholder={modelPlaceholder}
                            className="w-full"
                        />
                    </div>
                </div>

                {/* Parameters */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-slate-200 font-medium text-sm">
                        <Target className="w-4 h-4 text-blue-400" />
                        <h3>Parameters</h3>
                    </div>
                    <GenerationParamsInput
                        params={generationParams}
                        onChange={onGenerationParamsChange}
                        defaultExpanded={true}
                        label="Generation Settings"
                    />
                </div>
            </div>
        </div>
    );
}
