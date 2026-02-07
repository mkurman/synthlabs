import { Dispatch, ReactNode, SetStateAction, useEffect, useState } from 'react';
import { AppMode } from '../interfaces/enums/AppMode';
import { confirmService } from '../services/confirmService';
import { Sparkles, ShieldCheck } from 'lucide-react';

interface ModeNavbarProps {
    currentMode: AppMode;
    onModeChange: (mode: AppMode) => void;
    sessionName: string | null;
    onSessionNameChange: Dispatch<SetStateAction<string | null>>;
    isDirty: boolean;
    jobMonitorBadge?: ReactNode;
}

export default function ModeNavbar({
    currentMode,
    onModeChange,
    sessionName,
    onSessionNameChange,
    isDirty,
    jobMonitorBadge
}: ModeNavbarProps) {
    const [draftSessionName, setDraftSessionName] = useState<string>(sessionName || '');

    useEffect(() => {
        setDraftSessionName(sessionName || '');
    }, [sessionName]);

    const handleModeChange = async (newMode: AppMode) => {
        if (currentMode === newMode) return;

        if (isDirty) {
            const confirmed = await confirmService.confirm({
                title: 'Switch Mode?',
                message: 'You have unsaved changes. Switch anyway?',
                confirmLabel: 'Switch',
                cancelLabel: 'Stay'
            });
            if (!confirmed) return;
        }
        onModeChange(newMode);
    };

    return (
        <nav className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800/70 backdrop-blur-xl">
            <div className="flex gap-2 rounded-lg bg-slate-950/70 border border-slate-800/70 p-1">
                <button
                    onClick={() => handleModeChange(AppMode.Creator)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all font-semibold text-sm ${currentMode === AppMode.Creator
                        ? 'bg-slate-100 text-slate-900 shadow-sm'
                        : 'text-slate-300 hover:text-slate-100 hover:bg-slate-900/60'
                        }`}
                >
                    <Sparkles className="w-4 h-4" />
                    Creator
                </button>
                <button
                    onClick={() => handleModeChange(AppMode.Verifier)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all font-semibold text-sm ${currentMode === AppMode.Verifier
                        ? 'bg-slate-100 text-slate-900 shadow-sm'
                        : 'text-slate-300 hover:text-slate-100 hover:bg-slate-900/60'
                        }`}
                >
                    <ShieldCheck className="w-4 h-4" />
                    Verifier
                </button>
            </div>

            {/* Session Name Display */}
            <div className="flex items-center px-2">
                <span className="text-slate-300 text-xs uppercase tracking-wider mr-2">Session</span>
                <input
                    type="text"
                    value={draftSessionName}
                    onChange={(e) => {
                        const nextName = e.target.value;
                        setDraftSessionName(nextName);
                        onSessionNameChange(nextName);
                    }}
                    placeholder="Untitled Session"
                    className="bg-transparent border-b border-transparent hover:border-slate-700/70 focus:border-sky-500 focus:outline-none text-slate-100 text-sm transition-colors py-1 px-1 w-56"
                    disabled={false}
                />
                {isDirty && (
                    <span className="ml-2 text-[10px] text-amber-300 font-semibold px-2 py-0.5 bg-amber-950/40 rounded-full border border-amber-900/40">
                        Unsaved
                    </span>
                )}
                {jobMonitorBadge && (
                    <div className="relative ml-3">
                        {jobMonitorBadge}
                    </div>
                )}
            </div>
        </nav>
    );
}
