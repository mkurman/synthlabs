import { Dispatch, SetStateAction } from 'react';
import { AppMode } from '../interfaces/enums/AppMode';
import { confirmService } from '../services/confirmService';
import { Sparkles, ShieldCheck } from 'lucide-react';

interface ModeNavbarProps {
    currentMode: AppMode;
    onModeChange: (mode: AppMode) => void;
    sessionName: string | null;
    onSessionNameChange: Dispatch<SetStateAction<string | null>>;
    isDirty: boolean;
}

export default function ModeNavbar({
    currentMode,
    onModeChange,
    sessionName,
    onSessionNameChange,
    isDirty
}: ModeNavbarProps) {
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
        <nav className="flex items-center justify-between p-2 bg-slate-900 border-b border-slate-800">
            <div className="flex gap-2">
                <button
                    onClick={() => handleModeChange(AppMode.Creator)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium text-sm ${currentMode === AppMode.Creator
                        ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/20'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                        }`}
                >
                    <Sparkles className="w-4 h-4" />
                    Creator
                </button>
                <button
                    onClick={() => handleModeChange(AppMode.Verifier)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium text-sm ${currentMode === AppMode.Verifier
                        ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/20'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                        }`}
                >
                    <ShieldCheck className="w-4 h-4" />
                    Verifier
                </button>
            </div>

            {/* Session Name Display */}
            <div className="flex items-center px-4">
                <span className="text-slate-400 text-sm mr-2">Session:</span>
                <input
                    type="text"
                    value={sessionName || ''}
                    onChange={(e) => onSessionNameChange(e.target.value)}
                    placeholder="Untitled Session"
                    className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-teal-500 focus:outline-none text-slate-200 text-sm transition-colors py-1 px-1 w-48 truncate"
                />
                {isDirty && (
                    <span className="ml-2 text-xs text-amber-500 font-medium px-2 py-0.5 bg-amber-950/30 rounded-full">
                        Unsaved
                    </span>
                )}
            </div>
        </nav>
    );
}
