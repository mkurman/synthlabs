import { useState } from 'react';
import { Plus, Menu, X } from 'lucide-react';
import { SessionData } from '../../types';
import { AppView } from '../../interfaces/enums';
import { SessionSort } from '../../interfaces/enums/SessionSort';
import SessionList from './SessionList';

interface SessionSidebarProps {
    sessions: SessionData[];
    currentSessionId: string | null;
    currentMode: AppView;
    onSessionSelect: (sessionId: string) => void;
    onNewSession: (mode: AppView) => void;
    onModeChange: (mode: AppView) => void;
    onRename?: (sessionId: string, newName: string) => void;
    sortBy: SessionSort;
    onSortChange: (sort: SessionSort) => void;
}

export default function SessionSidebar({
    sessions,
    currentSessionId,
    currentMode,
    onSessionSelect,
    onNewSession,
    onModeChange,
    onRename,
    sortBy,
    onSortChange
}: SessionSidebarProps) {
    const [isOpen, setIsOpen] = useState(false);

    const handleNewSession = () => {
        onNewSession(currentMode);
        setIsOpen(false); // Close sidebar on mobile after creating session
    };

    return (
        <>
            {/* Mobile Menu Toggle */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-lg bg-slate-950/70 hover:bg-slate-800/70 border border-slate-800/70 flex items-center justify-center transition-all backdrop-blur"
                aria-label="Toggle session menu"
            >
                {isOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
            </button>

            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed lg:static inset-y-0 left-0 z-40
                    w-72 bg-slate-950/80 border-r border-slate-800/70 backdrop-blur-xl
                    flex flex-col
                    transform transition-transform duration-300 ease-in-out
                    ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}
            >
                {/* Header */}
                <div className="p-4 border-b border-slate-800/70 space-y-3">
                    {/* Title + New Button */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Sessions</h2>
                        <button
                            onClick={handleNewSession}
                            className="w-8 h-8 rounded-lg bg-sky-600 hover:bg-sky-500 flex items-center justify-center transition-all group"
                            aria-label="New session"
                        >
                            <Plus className="w-4 h-4 text-white group-hover:rotate-90 transition-transform" />
                        </button>
                    </div>

                    {/* Mode Toggle Pills */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => onModeChange(AppView.Creator)}
                            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                currentMode === AppView.Creator
                                    ? 'bg-slate-100 text-slate-900'
                                    : 'bg-slate-950/60 text-slate-300 hover:bg-slate-900/60 hover:text-white'
                            }`}
                        >
                            Creator
                        </button>
                        <button
                            onClick={() => onModeChange(AppView.Verifier)}
                            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                currentMode === AppView.Verifier
                                    ? 'bg-slate-100 text-slate-900'
                                    : 'bg-slate-950/60 text-slate-300 hover:bg-slate-900/60 hover:text-white'
                            }`}
                        >
                            Verifier
                        </button>
                    </div>

                    {/* Sort Dropdown */}
                    <select
                        value={sortBy}
                        onChange={(e) => onSortChange(e.target.value as SessionSort)}
                        className="w-full bg-slate-950/60 border border-slate-800/70 rounded-lg px-3 py-2 text-xs text-white focus:border-sky-500/50 outline-none"
                    >
                        <option value={SessionSort.Recent}>Most Recent</option>
                        <option value={SessionSort.Oldest}>Oldest First</option>
                        <option value={SessionSort.NameAsc}>Name (A-Z)</option>
                        <option value={SessionSort.NameDesc}>Name (Z-A)</option>
                        <option value={SessionSort.ItemCount}>Item Count</option>
                    </select>
                </div>

                {/* Session List */}
                <SessionList
                    sessions={sessions}
                    currentSessionId={currentSessionId}
                    onSessionSelect={onSessionSelect}
                    onRename={onRename}
                    sortBy={sortBy}
                />
            </aside>
        </>
    );
}
