import { useState } from 'react';
import { ChevronDown, ChevronRight, Gauge } from 'lucide-react';

interface RetryConfigPanelProps {
    concurrency: number;
    onConcurrencyChange: (value: number) => void;
    sleepTime: number;
    onSleepTimeChange: (value: number) => void;
    maxRetries: number;
    onMaxRetriesChange: (value: number) => void;
    retryDelay: number;
    onRetryDelayChange: (value: number) => void;
}

export default function RetryConfigPanel({
    concurrency,
    onConcurrencyChange,
    sleepTime,
    onSleepTimeChange,
    maxRetries,
    onMaxRetriesChange,
    retryDelay,
    onRetryDelayChange
}: RetryConfigPanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="bg-slate-950/70 rounded-lg border border-slate-800/70 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 hover:bg-slate-900/60 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Gauge className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-xs font-bold text-slate-200">Advanced: Retry & Rate Limits</span>
                    {!isExpanded && (
                        <span className="text-[10px] text-slate-400 ml-2">
                            Concurrency {concurrency} · Retries {maxRetries}
                        </span>
                    )}
                </div>
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-300" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
            </button>

            {isExpanded && (
                <div className="p-3 pt-0 border-t border-slate-800/70 mt-1 grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Concurrency</label>
                        <input
                            type="number"
                            min="1"
                            max="50"
                            value={concurrency}
                            onChange={e => onConcurrencyChange(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Sleep (ms)</label>
                        <input
                            type="number"
                            min="0"
                            step="100"
                            value={sleepTime}
                            onChange={e => onSleepTimeChange(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Max Retries</label>
                        <input
                            type="number"
                            min="0"
                            max="10"
                            value={maxRetries}
                            onChange={e => onMaxRetriesChange(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Retry Delay</label>
                        <input
                            type="number"
                            min="500"
                            step="500"
                            value={retryDelay}
                            onChange={e => onRetryDelayChange(Math.max(500, parseInt(e.target.value) || 500))}
                            className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
