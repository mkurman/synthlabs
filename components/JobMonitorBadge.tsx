import { Activity } from 'lucide-react';

interface JobMonitorBadgeProps {
    activeCount: number;
    totalCount: number;
    isOpen: boolean;
    onClick: () => void;
}

export default function JobMonitorBadge({ activeCount, totalCount, isOpen, onClick }: JobMonitorBadgeProps) {
    const hasActive = activeCount > 0;
    const hasJobs = totalCount > 0;

    return (
        <button
            onClick={onClick}
            className={`relative flex items-center justify-center w-8 h-8 rounded-md transition-all ${
                isOpen
                    ? 'bg-slate-700/80 text-slate-100'
                    : hasActive
                        ? 'text-sky-400 hover:bg-slate-800/60 hover:text-sky-300'
                        : hasJobs
                            ? 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                            : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'
            }`}
            title="Job Monitor"
        >
            <Activity className="w-4 h-4" />

            {/* Active pulsing dot */}
            {hasActive && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-50" />
                    <span className="relative inline-flex items-center justify-center rounded-full h-3.5 w-3.5 bg-sky-500 text-[8px] font-bold text-white">
                        {activeCount > 9 ? '9+' : activeCount}
                    </span>
                </span>
            )}

            {/* Static count badge for completed jobs */}
            {!hasActive && hasJobs && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-3.5 w-3.5 rounded-full bg-slate-600 text-[8px] font-bold text-slate-200">
                    {totalCount > 9 ? '9+' : totalCount}
                </span>
            )}
        </button>
    );
}
