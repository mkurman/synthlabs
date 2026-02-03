import { Play, Pause, Square, RefreshCcw, ShieldCheck, Database, Zap } from 'lucide-react';
import { ProgressStats } from '../../types';
import { Environment } from '../../interfaces/enums';
import { confirmService } from '../../services/confirmService';
import MiniDbPanel from '../MiniDbPanel';

interface GeneratorStatusProps {
    environment: Environment;
    isRunning: boolean;
    isPaused: boolean;
    progress: ProgressStats;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onRetryAllFailed: () => void;
    totalLogCount: number;
    invalidLogCount: number;
    dbStats: { total: number; session: number };
    sparklineHistory: number[];
    unsavedCount: number;
    onSyncAll?: () => void;
    showMiniDbPanel: boolean;
}

export default function GeneratorStatus({
    environment,
    isRunning,
    isPaused,
    progress,
    onStart,
    onPause,
    onResume,
    onStop,
    onRetryAllFailed,
    totalLogCount,
    invalidLogCount,
    dbStats,
    sparklineHistory,
    unsavedCount,
    onSyncAll,
    showMiniDbPanel
}: GeneratorStatusProps) {
    return (
        <div className="bg-slate-950/70 border-b border-slate-800/70 p-4 space-y-4">
            {/* Header Status */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                    <span className="text-sm font-semibold text-white">
                        {isRunning ? (isPaused ? 'Paused' : 'Generating') : 'Ready'}
                    </span>
                </div>
                {isRunning && (
                    <span className="text-xs text-slate-300 font-mono">
                        {progress.current} / {progress.total}
                    </span>
                )}
            </div>

            {/* Progress Bar */}
            {isRunning && (
                <div className="h-1.5 bg-slate-900/60 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-sky-500 transition-all duration-300"
                        style={{ width: `${Math.min(100, (progress.current / Math.max(1, progress.total)) * 100)}%` }}
                    />
                </div>
            )}

            {/* Primary Actions */}
            <div className="grid grid-cols-2 gap-2">
                {!isRunning ? (
                    <button
                        onClick={onStart}
                        className={`col-span-2 py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${environment === Environment.Production
                                ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-500/20'
                                : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-500/20'
                            }`}
                    >
                        <Play className="w-4 h-4 fill-current" />
                        {totalLogCount > 0 ? 'Continue Generation' : 'Start Generation'}
                    </button>
                ) : (
                    <>
                        <button
                            onClick={isPaused ? onResume : onPause}
                            className="bg-slate-900/60 hover:bg-slate-800/70 text-slate-100 border border-slate-700/70 py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-slate-950/30 transition-all"
                        >
                            {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
                            {isPaused ? 'Resume' : 'Pause'}
                        </button>
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
                            className="bg-amber-600/15 hover:bg-amber-600/25 text-amber-200 border border-amber-500/30 py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 transition-all"
                        >
                            <Square className="w-4 h-4 fill-current" /> Stop
                        </button>
                    </>
                )}
            </div>

            {/* Secondary Actions */}
            {!isRunning && invalidLogCount > 0 && (
                <button
                    onClick={onRetryAllFailed}
                    className="w-full py-2 px-3 bg-amber-950/30 border border-amber-500/30 hover:bg-amber-950/50 text-amber-300 rounded text-xs font-medium flex items-center justify-center gap-2 transition-colors"
                >
                    <RefreshCcw className="w-3.5 h-3.5" />
                    Retry {invalidLogCount} Failed Items
                </button>
            )}

            {/* Production Indicator */}
            {environment === Environment.Production && (
                <div className="flex items-center gap-2 py-2 px-3 bg-sky-950/20 border border-sky-500/20 rounded text-[10px] text-sky-300">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                    <span>Production Mode: Cloud Sync Active</span>
                </div>
            )}

            {/* Mini DB Stats */}
            {showMiniDbPanel && (
                <MiniDbPanel
                    totalRecords={dbStats.total}
                    sessionRecords={dbStats.session}
                    recentHistory={sparklineHistory}
                    unsavedCount={unsavedCount}
                    onSyncAll={onSyncAll}
                />
            )}
        </div>
    );
}
