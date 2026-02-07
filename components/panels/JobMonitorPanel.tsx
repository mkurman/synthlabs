import { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Loader2, Clock, Trash2, X, Square, RefreshCw } from 'lucide-react';
import type { BackendJobRecord } from '../../services/jobStorageService';

interface JobMonitorPanelProps {
    jobs: BackendJobRecord[];
    onJobSelect: (id: string) => void;
    onDismiss: (id: string) => void;
    onStop: (id: string) => void;
    onClearCompleted: () => void;
    onRefresh: () => void;
    onClose: () => void;
}

const JOB_TYPE_LABELS: Record<string, string> = {
    autoscore: 'Auto-Score',
    rewrite: 'Rewrite',
    'remove-items': 'Remove Items',
    orphan_check: 'Orphan Check',
    orphan_sync: 'Orphan Sync',
};

const getJobLabel = (type: unknown): string => {
    // Handle case where type might be an object (from corrupted job data)
    if (typeof type !== 'string') {
        if (type && typeof type === 'object' && 'type' in type) {
            return getJobLabel((type as { type: string }).type);
        }
        return 'Unknown Job';
    }
    return JOB_TYPE_LABELS[type] || type;
};

const getRelativeTime = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

const getProgressPercent = (job: BackendJobRecord): number | null => {
    const p = job.progress;
    if (!p) return null;
    const current = (p.current as number) || 0;
    const total = (p.total as number) || 0;
    if (total === 0) return null;
    return Math.round((current / total) * 100);
};

const getProgressText = (job: BackendJobRecord): string | null => {
    const p = job.progress;
    if (!p) return null;
    const current = (p.current as number) || 0;
    const total = (p.total as number) || 0;
    const scored = (p.scored as number) || 0;
    const skipped = (p.skipped as number) || 0;
    const errors = (p.errors as number) || 0;

    const parts: string[] = [];
    if (total > 0) parts.push(`${current}/${total}`);
    if (scored > 0) parts.push(`${scored} scored`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (errors > 0) parts.push(`${errors} errors`);
    return parts.length > 0 ? parts.join(', ') : null;
};

function StatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'completed':
            return <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
        case 'failed':
            return <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />;
        case 'running':
            return <Loader2 className="w-4 h-4 text-sky-400 animate-spin flex-shrink-0" />;
        default:
            return <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />;
    }
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        pending: 'bg-slate-700/60 text-slate-300 border-slate-600/50',
        running: 'bg-sky-950/60 text-sky-300 border-sky-800/50',
        completed: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50',
        failed: 'bg-rose-950/60 text-rose-300 border-rose-800/50',
    };
    return (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${styles[status] || styles.pending}`}>
            {status}
        </span>
    );
}

function JobItem({ job, onSelect, onDismiss, onStop }: { job: BackendJobRecord; onSelect: () => void; onDismiss: () => void; onStop: () => void }) {
    const percent = getProgressPercent(job);
    const progressText = getProgressText(job);
    const isTerminal = job.status === 'completed' || job.status === 'failed';
    const isActive = job.status === 'pending' || job.status === 'running';

    return (
        <div
            className="group px-3 py-2.5 hover:bg-slate-800/60 cursor-pointer transition-colors border-b border-slate-800/40 last:border-b-0"
            onClick={onSelect}
        >
            <div className="flex items-center gap-2">
                <StatusIcon status={job.status} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200 truncate">
                            {getJobLabel(job.type)}
                        </span>
                        <StatusBadge status={job.status} />
                    </div>
                    {progressText && (
                        <p className="text-[11px] text-slate-400 mt-0.5">{progressText}</p>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">{getRelativeTime(job.updatedAt || job.createdAt)}</span>
                    {isActive && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onStop();
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-rose-900/40 text-slate-500 hover:text-rose-400 transition-all"
                            title="Stop job"
                        >
                            <Square className="w-3 h-3" />
                        </button>
                    )}
                    {isTerminal && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDismiss();
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-700/60 text-slate-500 hover:text-slate-300 transition-all"
                            title="Dismiss"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* Progress bar for running jobs */}
            {job.status === 'running' && percent !== null && (
                <div className="mt-1.5 w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                    <div
                        className="bg-sky-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${percent}%` }}
                    />
                </div>
            )}
        </div>
    );
}

export default function JobMonitorPanel({ jobs, onJobSelect, onDismiss, onStop, onClearCompleted, onRefresh, onClose }: JobMonitorPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    // Filter out corrupted jobs (missing valid id)
    const validJobs = jobs.filter(j => typeof j.id === 'string' && j.id.length > 0);
    const hasCompleted = validJobs.some(j => j.status === 'completed' || j.status === 'failed');

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                // Check if the click target is the badge button (parent)
                const badge = panelRef.current.parentElement?.querySelector('button');
                if (badge && badge.contains(e.target as Node)) return;
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            ref={panelRef}
            className="absolute right-0 top-full mt-2 w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-800/70 rounded-lg shadow-2xl shadow-black/40 z-50 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/70">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Jobs</h3>
                <div className="flex items-center gap-1">
                    {hasCompleted && (
                        <button
                            onClick={onClearCompleted}
                            className="text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-800/60 transition-colors"
                        >
                            Clear completed
                        </button>
                    )}
                    <button
                        onClick={onRefresh}
                        className="p-1 rounded hover:bg-slate-800/60 text-slate-500 hover:text-slate-300 transition-colors"
                        title="Refresh jobs"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-slate-800/60 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Job list */}
            <div className="max-h-[400px] overflow-y-auto">
                {validJobs.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-500">
                        No recent jobs
                    </div>
                ) : (
                    validJobs.map(job => (
                        <JobItem
                            key={job.id}
                            job={job}
                            onSelect={() => onJobSelect(job.id)}
                            onDismiss={() => onDismiss(job.id)}
                            onStop={() => onStop(job.id)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
