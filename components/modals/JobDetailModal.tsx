import { useState } from 'react';
import { X, CheckCircle2, XCircle, Loader2, Clock, Trash2, ChevronDown, ChevronRight, Square, RotateCcw } from 'lucide-react';
import type { BackendJobRecord } from '../../services/jobStorageService';

interface TraceEntry {
    type: string;
    logId?: string;
    score?: number;
    rawResponse?: string;
    reason?: string;
    error?: string;
    message?: string;
    timestamp?: number;
}

/** Job types that support rerun (have stored params with API key) */
const RERUNNABLE_TYPES = new Set(['rewrite', 'autoscore', 'migrate-reasoning']);

/** Job types that support resume (can continue from where they stopped) */
const RESUMABLE_TYPES = new Set(['autoscore', 'migrate-reasoning', 'rewrite']);

interface JobDetailModalProps {
    job: BackendJobRecord | undefined;
    onClose: () => void;
    onDismiss: (id: string) => void;
    onStop?: (id: string) => void;
    onRerun?: (id: string) => void;
    onResume?: (id: string) => void;
}

const JOB_TYPE_LABELS: Record<string, string> = {
    autoscore: 'Auto-Score',
    rewrite: 'Rewrite',
    'remove-items': 'Remove Items',
    'migrate-reasoning': 'Migrate Reasoning',
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

const formatTimestamp = (ts: number): string => {
    return new Date(ts).toLocaleString();
};

const getProgressPercent = (job: BackendJobRecord): number | null => {
    const p = job.progress;
    if (!p) return null;
    const current = (p.current as number) || 0;
    const total = (p.total as number) || 0;
    if (total === 0) return null;
    return Math.round((current / total) * 100);
};

function StatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'completed':
            return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
        case 'failed':
            return <XCircle className="w-5 h-5 text-rose-400" />;
        case 'running':
            return <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />;
        default:
            return <Clock className="w-5 h-5 text-slate-400" />;
    }
}

function StatusLabel({ status }: { status: string }) {
    const styles: Record<string, string> = {
        pending: 'bg-slate-800/60 text-slate-300 border-slate-600/50',
        running: 'bg-sky-950/60 text-sky-300 border-sky-800/50',
        completed: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50',
        failed: 'bg-rose-950/60 text-rose-300 border-rose-800/50',
    };
    return (
        <span className={`text-xs font-semibold px-2 py-1 rounded border ${styles[status] || styles.pending}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
}

function DetailRow({ label, value }: { label: string; value: string | number | undefined | null }) {
    if (value === undefined || value === null) return null;
    return (
        <div className="flex justify-between py-1.5 border-b border-slate-800/40 last:border-b-0">
            <span className="text-xs text-slate-400">{label}</span>
            <span className="text-xs text-slate-200 font-medium">{String(value)}</span>
        </div>
    );
}

const TRACE_TYPE_STYLES: Record<string, string> = {
    scored: 'text-emerald-400',
    skipped: 'text-amber-400',
    error: 'text-rose-400',
    warn: 'text-amber-400',
    info: 'text-sky-400',
};

function TraceRow({ entry }: { entry: TraceEntry }) {
    const typeStyle = TRACE_TYPE_STYLES[entry.type] || 'text-slate-400';
    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';

    return (
        <div className="flex items-start gap-2 py-1 border-b border-slate-800/30 last:border-b-0">
            <span className={`text-[10px] font-bold uppercase w-12 flex-shrink-0 ${typeStyle}`}>{entry.type}</span>
            <div className="flex-1 min-w-0">
                {entry.logId && (
                    <span className="text-[10px] font-mono text-slate-500 mr-2">{entry.logId}</span>
                )}
                {entry.score !== undefined && (
                    <span className="text-[10px] text-emerald-300 mr-2">score: {entry.score}</span>
                )}
                {entry.message && (
                    <span className="text-[10px] text-slate-300">{entry.message}</span>
                )}
                {entry.reason && (
                    <span className="text-[10px] text-amber-300">{entry.reason}</span>
                )}
                {entry.error && (
                    <span className="text-[10px] text-rose-300 break-all">{entry.error}</span>
                )}
                {entry.rawResponse && (
                    <span className="text-[10px] text-slate-600 ml-1">raw: &quot;{entry.rawResponse}&quot;</span>
                )}
            </div>
            {time && <span className="text-[9px] text-slate-600 flex-shrink-0">{time}</span>}
        </div>
    );
}

export default function JobDetailModal({ job, onClose, onDismiss, onStop, onRerun, onResume }: JobDetailModalProps) {
    const [traceExpanded, setTraceExpanded] = useState(false);

    if (!job) return null;

    const percent = getProgressPercent(job);
    const isRunning = job.status === 'running' || job.status === 'pending';
    const isTerminal = job.status === 'completed' || job.status === 'failed';
    const isFailed = job.status === 'failed';
    const canRerun = isTerminal && RERUNNABLE_TYPES.has(typeof job.type === 'string' ? job.type : '');
    const canResume = isFailed && RESUMABLE_TYPES.has(typeof job.type === 'string' ? job.type : '');
    const progress = job.progress || {};
    const result = job.result || {};
    const trace: TraceEntry[] = (result.trace as TraceEntry[]) || [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800/70 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/70">
                    <div className="flex items-center gap-3">
                        <StatusIcon status={job.status} />
                        <div>
                            <h2 className="text-sm font-semibold text-slate-100">{getJobLabel(job.type)} Job</h2>
                            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{typeof job.id === 'string' ? job.id : 'Unknown ID'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    {/* Status */}
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">Status:</span>
                        <StatusLabel status={job.status} />
                    </div>

                    {/* Timestamps */}
                    <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/40">
                        <DetailRow label="Created" value={formatTimestamp(job.createdAt)} />
                        <DetailRow label="Updated" value={formatTimestamp(job.updatedAt)} />
                        {(job as any).sessionId && <DetailRow label="Session" value={(job as any).sessionId} />}
                    </div>

                    {/* Progress */}
                    {job.status === 'running' && Object.keys(progress).length > 0 && (
                        <div>
                            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Progress</h3>
                            {percent !== null && (
                                <div className="mb-2">
                                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                                        <span>{percent}%</span>
                                        <span>{(progress.current as number) || 0} / {(progress.total as number) || 0}</span>
                                    </div>
                                    <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="bg-sky-500 h-full rounded-full transition-all duration-300"
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                            <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/40">
                                {Object.entries(progress)
                                    .filter(([key]) => key !== 'current' && key !== 'total')
                                    .map(([key, value]) => (
                                        <DetailRow key={key} label={key} value={typeof value === 'object' ? JSON.stringify(value) : String(value)} />
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Result */}
                    {isTerminal && Object.keys(result).length > 0 && (
                        <div>
                            <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${job.status === 'completed' ? 'text-emerald-400' : 'text-slate-400'}`}>Result</h3>
                            <div className={`bg-slate-950/50 rounded-lg p-3 border ${job.status === 'completed' ? 'border-emerald-900/30' : 'border-slate-800/40'}`}>
                                {Object.entries(result)
                                    .filter(([key]) => key !== 'trace')
                                    .map(([key, value]) => (
                                        <DetailRow key={key} label={key} value={typeof value === 'object' ? JSON.stringify(value) : String(value)} />
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {job.status === 'failed' && job.error && (
                        <div>
                            <h3 className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Error</h3>
                            <div className="bg-rose-950/20 rounded-lg p-3 border border-rose-900/30">
                                <p className="text-xs text-rose-300 font-mono whitespace-pre-wrap break-all">{job.error}</p>
                            </div>
                        </div>
                    )}

                    {/* Trace Log */}
                    {trace.length > 0 && (
                        <div>
                            <button
                                onClick={() => setTraceExpanded(!traceExpanded)}
                                className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 hover:text-slate-100 transition-colors"
                            >
                                {traceExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                Trace Log ({trace.length} entries)
                            </button>
                            {traceExpanded && (
                                <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/40 max-h-60 overflow-y-auto">
                                    {trace.map((entry, i) => (
                                        <TraceRow key={i} entry={entry} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800/70">
                    <div className="flex items-center gap-2">
                        {isRunning && onStop && (
                            <button
                                onClick={() => onStop(job.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-amber-300 hover:bg-amber-950/30 border border-amber-900/30 transition-colors"
                            >
                                <Square className="w-3 h-3" />
                                Stop
                            </button>
                        )}
                        {canResume && onResume && (
                            <button
                                onClick={() => onResume(job.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-emerald-300 hover:bg-emerald-950/30 border border-emerald-900/30 transition-colors"
                                title="Resume from where it stopped"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Resume
                            </button>
                        )}
                        {isTerminal && canRerun && onRerun && !canResume && (
                            <button
                                onClick={() => onRerun(job.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-sky-300 hover:bg-sky-950/30 border border-sky-900/30 transition-colors"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Rerun
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {isTerminal && (
                            <button
                                onClick={() => onDismiss(job.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-rose-300 hover:bg-rose-950/30 border border-rose-900/30 transition-colors"
                            >
                                <Trash2 className="w-3 h-3" />
                                Dismiss
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="px-4 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800/60 border border-slate-700/50 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
