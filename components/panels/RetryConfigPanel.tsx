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
    return (
        <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-3">
            <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase">Concurrency</label>
                <input
                    type="number"
                    min="1"
                    max="50"
                    value={concurrency}
                    onChange={e => onConcurrencyChange(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase">Sleep (ms)</label>
                <input
                    type="number"
                    min="0"
                    step="100"
                    value={sleepTime}
                    onChange={e => onSleepTimeChange(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase">Max Retries</label>
                <input
                    type="number"
                    min="0"
                    max="10"
                    value={maxRetries}
                    onChange={e => onMaxRetriesChange(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase">Retry Delay</label>
                <input
                    type="number"
                    min="500"
                    step="500"
                    value={retryDelay}
                    onChange={e => onRetryDelayChange(Math.max(500, parseInt(e.target.value) || 500))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                />
            </div>
        </div>
    );
}
