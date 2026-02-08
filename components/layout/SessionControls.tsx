import { Play, Pause, Square, Trash2, RotateCcw } from 'lucide-react';
import { SessionData } from '../../types';
import { SessionStatus } from '../../interfaces/enums/SessionStatus';
import { ControlAction } from '../../interfaces/enums/ControlAction';
import { AppView } from '../../interfaces/enums';

interface SessionControlsProps {
    currentSession: SessionData | null;
    isGenerating: boolean;
    onAction: (action: ControlAction) => void;
}

export default function SessionControls({
    currentSession,
    isGenerating,
    onAction
}: SessionControlsProps) {
    if (!currentSession) {
        return null;
    }

    const isPaused = currentSession.status === SessionStatus.Paused;
    const isCompleted = currentSession.status === SessionStatus.Completed;
    const modeColor = currentSession.mode === AppView.Creator ? 'teal' : 'pink';

    return (
        <div className="p-4 border-b border-slate-800/70 space-y-3">
            {/* Session Info */}
            <div>
                <h3 className="text-sm font-medium text-white truncate mb-1">
                    {currentSession.name}
                </h3>
                <div className="flex items-center gap-2 text-[10px]">
                    <span className={`px-1.5 py-0.5 rounded bg-${modeColor}-600/30 text-${modeColor}-400 font-medium`}>
                        {currentSession.mode}
                    </span>
                    <span className="text-slate-400">{currentSession.itemCount} items</span>
                </div>
            </div>

            {/* Control Buttons */}
            <div className="grid grid-cols-2 gap-2">
                {!isGenerating && !isPaused && !isCompleted && (
                    <button
                        onClick={() => onAction(ControlAction.Start)}
                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
                    >
                        <Play className="w-4 h-4" />
                        <span>Start</span>
                    </button>
                )}

                {isGenerating && (
                    <button
                        onClick={() => onAction(ControlAction.Pause)}
                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium transition-all"
                    >
                        <Pause className="w-4 h-4" />
                        <span>Pause</span>
                    </button>
                )}

                {isPaused && (
                    <button
                        onClick={() => onAction(ControlAction.Resume)}
                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
                    >
                        <Play className="w-4 h-4" />
                        <span>Resume</span>
                    </button>
                )}

                {(isGenerating || isPaused) && (
                    <button
                        onClick={() => onAction(ControlAction.Stop)}
                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-all"
                    >
                        <Square className="w-4 h-4" />
                        <span>Stop</span>
                    </button>
                )}

                <button
                    onClick={() => onAction(ControlAction.Clear)}
                    disabled={isGenerating}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/70 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RotateCcw className="w-4 h-4" />
                    <span>Clear</span>
                </button>

                <button
                    onClick={() => onAction(ControlAction.Stop)}
                    disabled={isGenerating}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900/60 hover:bg-red-600 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                </button>
            </div>

            {/* Session Stats */}
            {currentSession.analytics && (
                <div className="pt-3 border-t border-slate-800/70">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <div className="text-slate-400 mb-0.5">Completed</div>
                            <div className="text-white font-medium">
                                {currentSession.analytics.completedItems} / {currentSession.analytics.totalItems}
                            </div>
                        </div>
                        <div>
                            <div className="text-slate-400 mb-0.5">Success Rate</div>
                            <div className="text-white font-medium">
                                {currentSession.analytics.successRate.toFixed(1)}%
                            </div>
                        </div>
                        <div>
                            <div className="text-slate-400 mb-0.5">Total Tokens</div>
                            <div className="text-white font-medium">
                                {currentSession.analytics.totalTokens.toLocaleString()}
                            </div>
                        </div>
                        <div>
                            <div className="text-slate-400 mb-0.5">Total Cost</div>
                            <div className="text-white font-medium">
                                ${currentSession.analytics.totalCost.toFixed(4)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
