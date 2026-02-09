// import { SessionData } from '../interfaces/services/SessionConfig';
import NewSessionButton from './NewSessionButton';
import SessionsList from './SessionsList';
import { Cpu, Settings, Sun, Moon } from 'lucide-react';
// import { SidebarSection } from '../interfaces/enums/SidebarSection';

import { Environment, ThemeMode } from '../interfaces/enums';
import { SessionData } from '../interfaces';
import type { SessionListFilters } from '../types';

interface LeftSidebarProps {
    sessions: SessionData[];
    environment: Environment;
    activeSessionId: string;
    onNewSession: () => void;
    onSessionSelect: (id: string) => void;
    onSessionRename: (id: string, newName: string) => void;
    onSessionDelete: (id: string) => void;
    onOpenInVerifier?: (id: string) => void;
    onRefreshSessions: () => void;
    onOpenSettings: () => void;
    currentEnvironment: Environment;
    onEnvironmentChange: (env: Environment) => void;
    sessionFilters: SessionListFilters;
    onSessionFiltersChange: (filters: SessionListFilters) => void;
    onLoadMoreSessions: () => void;
    hasMoreSessions: boolean;
    isLoadingMoreSessions: boolean;
    themeMode: ThemeMode;
    onThemeModeChange: (mode: ThemeMode) => void;
}

export default function LeftSidebar({
    sessions,
    environment,
    activeSessionId,
    onNewSession,
    onSessionSelect,
    onSessionRename,
    onSessionDelete,
    onOpenInVerifier,
    onRefreshSessions,
    onOpenSettings,
    currentEnvironment,
    onEnvironmentChange,
    sessionFilters,
    onSessionFiltersChange,
    onLoadMoreSessions,
    hasMoreSessions,
    isLoadingMoreSessions,
    themeMode,
    onThemeModeChange
}: LeftSidebarProps) {
    const isDarkMode = themeMode === ThemeMode.Dark;
    const nextThemeMode = isDarkMode ? ThemeMode.Light : ThemeMode.Dark;

    return (
        <div className="flex flex-col h-full bg-slate-950/70">
            {/* Logo */}
            <div className="p-4 flex items-center gap-3">
                <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.4)] bg-sky-600`}>
                    <Cpu className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="font-bold text-lg text-white tracking-tight">
                        SYNTH<span className="text-slate-500 font-light">LABS</span>
                    </h1>
                </div>
            </div>
            {/* Header / Environment Switch & New Session */}
            <div className="p-4 pt-5 pb-2 space-y-3">
                <div className="flex bg-slate-950/70 p-1 rounded-lg border border-slate-800/70">
                    <button
                        onClick={() => onEnvironmentChange(Environment.Development)}
                        className={`flex-1 text-[10px] font-semibold py-1.5 rounded-md transition-all ${currentEnvironment === Environment.Development
                            ? 'bg-slate-100 text-slate-900 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        Dev (Local)
                    </button>
                    <button
                        onClick={() => onEnvironmentChange(Environment.Production)}
                        className={`flex-1 text-[10px] font-semibold py-1.5 rounded-md transition-all ${currentEnvironment === Environment.Production
                            ? 'bg-slate-100 text-slate-900 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        Prod (Cloud)
                    </button>
                </div>
                <NewSessionButton onClick={onNewSession} />
            </div>

            {/* Divider */}
            <div className="px-4 py-2 flex items-center justify-between">
                <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider pl-1">Sessions</h3>
                <button
                    onClick={onRefreshSessions}
                    className="text-[10px] font-semibold text-slate-400 hover:text-slate-200 transition-colors"
                >
                    Refresh
                </button>
            </div>

            {/* List */}
            <div className="flex-1 min-h-0">
                <SessionsList
                    sessions={sessions}
                    environment={environment}
                    activeSessionId={activeSessionId}
                    onSessionSelect={onSessionSelect}
                    onSessionRename={onSessionRename}
                    onSessionDelete={onSessionDelete}
                    onOpenInVerifier={onOpenInVerifier}
                    filters={sessionFilters}
                    onFiltersChange={onSessionFiltersChange}
                    onLoadMore={onLoadMoreSessions}
                    hasMore={hasMoreSessions}
                    isLoadingMore={isLoadingMoreSessions}
                />
            </div>

            {/* Footer / Settings */}
            <div className="p-3 border-t border-slate-800/70 bg-slate-950/60">
                <div className="space-y-2">
                    <button
                        onClick={onOpenSettings}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900/60 transition-colors"
                    >
                        <Settings className="w-5 h-5" />
                        <span className="text-sm font-medium">Settings</span>
                    </button>
                    <button
                        onClick={() => onThemeModeChange(nextThemeMode)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900/60 transition-colors"
                        title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        {isDarkMode ? (
                            <Sun className="w-5 h-5" />
                        ) : (
                            <Moon className="w-5 h-5" />
                        )}
                        <span className="text-sm font-medium">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
