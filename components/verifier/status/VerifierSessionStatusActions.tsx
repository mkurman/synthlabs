import { Check, CheckCircle2, Flag, RotateCcw, Trash2 } from 'lucide-react';
import { SessionVerificationStatus } from '../../../interfaces/enums/SessionVerificationStatus';

interface VerifierSessionStatusActionsProps {
    activeSessionStatus: SessionVerificationStatus | null;
    isUpdatingSessionStatus: boolean;
    onMarkUnreviewed: () => Promise<void>;
    onMarkVerified: () => Promise<void>;
    onRestoreSession: () => Promise<void>;
    onMarkGarbage: () => Promise<void>;
    onDeleteSession: () => Promise<void>;
}

export default function VerifierSessionStatusActions({
    activeSessionStatus,
    isUpdatingSessionStatus,
    onMarkUnreviewed,
    onMarkVerified,
    onRestoreSession,
    onMarkGarbage,
    onDeleteSession
}: VerifierSessionStatusActionsProps) {
    return (
        <div className="mb-6 bg-slate-950/70 border border-slate-800/70 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                {activeSessionStatus && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full border border-slate-700/70 text-slate-300">
                        {activeSessionStatus === SessionVerificationStatus.Verified && 'Verified'}
                        {activeSessionStatus === SessionVerificationStatus.Garbage && 'Garbage'}
                        {activeSessionStatus === SessionVerificationStatus.Unreviewed && 'Unreviewed'}
                    </span>
                )}
                <span className="text-xs text-slate-400">Session status controls</span>
            </div>
            <div className="flex items-center gap-2">
                {activeSessionStatus === SessionVerificationStatus.Verified ? (
                    <button
                        onClick={onMarkUnreviewed}
                        disabled={isUpdatingSessionStatus}
                        className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-900/60 text-slate-200 hover:bg-slate-800/70 disabled:opacity-50"
                        title="Mark session as unreviewed"
                    >
                        <Check className="w-3.5 h-3.5" />
                        Mark Unreviewed
                    </button>
                ) : (
                    <button
                        onClick={onMarkVerified}
                        disabled={isUpdatingSessionStatus}
                        className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 disabled:opacity-50"
                        title="Mark session as verified"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verify Session
                    </button>
                )}

                {activeSessionStatus === SessionVerificationStatus.Garbage ? (
                    <button
                        onClick={onRestoreSession}
                        disabled={isUpdatingSessionStatus}
                        className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-900/60 text-slate-200 hover:bg-slate-800/70 disabled:opacity-50"
                        title="Restore session"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore Session
                    </button>
                ) : (
                    <button
                        onClick={onMarkGarbage}
                        disabled={isUpdatingSessionStatus}
                        className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-950/20 text-red-300 hover:bg-red-900/40 border border-red-900/50 disabled:opacity-50"
                        title="Mark session as garbage"
                    >
                        <Flag className="w-3.5 h-3.5" />
                        Mark Garbage
                    </button>
                )}
                <button
                    onClick={onDeleteSession}
                    disabled={isUpdatingSessionStatus}
                    className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-900/60 border border-red-900/60 disabled:opacity-50"
                    title="Delete session and logs"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Session
                </button>
            </div>
        </div>
    );
}
