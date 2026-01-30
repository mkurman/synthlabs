import { AlertCircle, ArrowLeftRight, Database, FileJson, Pause, Play, Plus, RefreshCcw, RefreshCw, ShieldCheck, Square, Terminal } from 'lucide-react';
import { ProgressStats } from '../../types';
import { DataSource, Environment, AppMode } from '../../interfaces/enums';
import { confirmService } from '../../services/confirmService';
import { PrefetchState } from '../../services/hfPrefetchService';
import { TaskType } from '../../services/taskClassifierService';
import MiniDbPanel from '../MiniDbPanel';

interface ControlPanelProps {
    appMode: AppMode;
    environment: Environment;
    isRunning: boolean;
    isPaused: boolean;
    progress: ProgressStats;
    dataSourceMode: DataSource;
    prefetchState: PrefetchState | null;
    error: string | null;
    isStreamingEnabled: boolean;
    onStreamingChange: (enabled: boolean) => void;
    onAppModeChange: (mode: AppMode) => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    totalLogCount: number;
    invalidLogCount: number;
    detectedTaskType: TaskType | null;
    autoRoutedPromptSet: string | null;
    showMiniDbPanel: boolean;
    dbStats: { total: number; session: number };
    sparklineHistory: number[];
    unsavedCount: number;
    onSyncAll?: () => void;
    onRetryAllFailed: () => void;
    onStartNewSession: () => void;
}

export default function ControlPanel({
    appMode,
    environment,
    isRunning,
    isPaused,
    progress,
    dataSourceMode,
    prefetchState,
    error,
    isStreamingEnabled,
    onStreamingChange,
    onAppModeChange,
    onStart,
    onPause,
    onResume,
    onStop,
    totalLogCount,
    invalidLogCount,
    detectedTaskType,
    autoRoutedPromptSet,
    showMiniDbPanel,
    dbStats,
    sparklineHistory,
    unsavedCount,
    onSyncAll,
    onRetryAllFailed,
    onStartNewSession
}: ControlPanelProps) {
    return (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5 shadow-sm relative overflow-hidden group">
            {/* Mode Switcher */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 mb-6">
                <button
                    onClick={() => onAppModeChange(AppMode.Generator)}
                    className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-all uppercase tracking-wide ${appMode === AppMode.Generator ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                    <FileJson className="w-3.5 h-3.5" /> Generator
                </button>
                <button
                    onClick={() => onAppModeChange(AppMode.Converter)}
                    className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-all uppercase tracking-wide ${appMode === AppMode.Converter ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                    <ArrowLeftRight className="w-3.5 h-3.5" /> Converter
                </button>
            </div>

            {environment === Environment.Production && (
                <div className="mb-4 p-2 bg-pink-950/30 border border-pink-500/20 rounded-lg text-[10px] text-pink-300 flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3 text-pink-500" />
                    Production Mode: Data will be synced to Firebase.
                </div>
            )}

            {isRunning && (
                <div
                    className="absolute top-0 left-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 z-10"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
            )}

            {/* Prefetch Status Indicator */}
            {isRunning && dataSourceMode === DataSource.HuggingFace && prefetchState && (
                <div className="mb-2 p-2 bg-amber-950/30 border border-amber-500/20 rounded-lg text-[10px] text-amber-300 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="w-3 h-3 text-amber-500" />
                        <span>Buffer: {prefetchState.buffer.length} samples</span>
                        {prefetchState.isFetching && (
                            <span className="flex items-center gap-1 text-amber-400">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                Fetching...
                            </span>
                        )}
                    </div>
                    <span className="text-amber-400/70">
                        {prefetchState.totalDelivered}/{prefetchState.totalRequested} delivered
                    </span>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" /> CONTROLS
                </h2>
                <div className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${isRunning ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-indigo-400 animate-pulse' : 'bg-slate-500'}`} />
                    {isRunning ? `Processing (${progress.activeWorkers})` : 'Idle'}
                </div>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-950/30 border border-red-500/20 rounded-lg text-xs text-red-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {error}
                </div>
            )}

            {/* Streaming Toggle */}
            <div className="flex justify-end items-center mb-3">
                <label className="flex items-center gap-2 cursor-pointer group">
                    <span className="text-xs font-medium text-slate-400 group-hover:text-slate-300 transition-colors">
                        Streaming
                    </span>
                    <div className="relative">
                        <input
                            type="checkbox"
                            checked={isStreamingEnabled}
                            onChange={(e) => onStreamingChange(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </div>
                </label>
            </div>

            <div className="flex gap-2">
                {!isRunning ? (
                    <button onClick={onStart} className={`flex-1 hover:brightness-110 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${environment === Environment.Production ? 'bg-pink-600 shadow-pink-500/20' : 'bg-indigo-600 shadow-indigo-500/20'}`}>
                        {totalLogCount > 0 ? (
                            <>
                                <Play className="w-4 h-4 fill-current" /> Continue
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4 fill-current" /> Start
                            </>
                        )}
                    </button>
                ) : (
                    <div className="flex-1 flex gap-2">
                        {isPaused ? (
                            <button onClick={onResume} className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all">
                                <Play className="w-4 h-4 fill-current" /> Resume
                            </button>
                        ) : (
                            <button onClick={onPause} className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all">
                                <Pause className="w-4 h-4 fill-current" /> Pause
                            </button>
                        )}
                        <button
                            onClick={() => {
                                confirmService.confirm({
                                    title: 'Stop generation?',
                                    message: 'Are you sure you want to stop generation? In-flight items may be lost.',
                                    confirmLabel: 'Stop',
                                    cancelLabel: 'Cancel',
                                    variant: 'warning'
                                }).then((confirmStop) => {
                                    if (confirmStop) onStop();
                                });
                            }}
                            className="w-12 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-3 rounded-lg font-bold text-sm flex items-center justify-center transition-all"
                            title="Stop"
                        >
                            <Square className="w-4 h-4 fill-current" />
                        </button>
                    </div>
                )}
            </div>

            {/* Retry All Button */}
            {!isRunning && invalidLogCount > 0 && (
                <button onClick={onRetryAllFailed} className="w-full mt-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-600/30 py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all">
                    <RefreshCcw className="w-3.5 h-3.5" /> Retry {invalidLogCount} Failed Items
                </button>
            )}

            {/* New Session Button - visible when items exist */}
            {!isRunning && totalLogCount > 0 && (
                <button onClick={() => {
                    confirmService.confirm({
                        title: 'Start new session?',
                        message: 'This will clear the feed and analytics, and start a new session. Continue?',
                        confirmLabel: 'Start',
                        cancelLabel: 'Cancel',
                        variant: 'warning'
                    }).then((confirmStart) => {
                        if (confirmStart) onStartNewSession();
                    });
                }} className="w-full mt-2 bg-pink-600/20 hover:bg-pink-600/30 text-pink-400 border border-pink-600/30 py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all">
                    <Plus className="w-3.5 h-3.5" />New Session
                </button>
            )}

            <div className="mt-4 flex justify-between text-xs text-slate-500 font-mono">
                <span>Completed: {progress.current}</span>
                <span>Target: {progress.total}</span>
            </div>

            {/* Auto-routing status indicator */}
            {(detectedTaskType || autoRoutedPromptSet) && (
                <div className="mt-2 px-2 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded text-[10px] text-purple-300">
                    <span className="opacity-70">Auto-routed:</span>{' '}
                    {detectedTaskType && <span className="font-semibold">{detectedTaskType}</span>}
                    {autoRoutedPromptSet && <span className="text-purple-400"> → {autoRoutedPromptSet}</span>}
                </div>
            )}

            {/* Mini DB Panel (Only in Prod) */}
            {showMiniDbPanel && (
                <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                    <MiniDbPanel
                        totalRecords={dbStats.total}
                        sessionRecords={dbStats.session}
                        recentHistory={sparklineHistory}
                        unsavedCount={unsavedCount}
                        onSyncAll={onSyncAll}
                    />
                </div>
            )}
        </div>
    );
}
