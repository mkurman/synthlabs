// import { SessionData } from '../interfaces/services/SessionConfig';
import NewSessionButton from './NewSessionButton';
import SessionsList from './SessionsList';
import { Settings } from 'lucide-react';
// import { SidebarSection } from '../interfaces/enums/SidebarSection';

import { Environment } from '../interfaces/enums';
import { SessionData } from '../interfaces';

interface LeftSidebarProps {
    sessions: SessionData[];
    environment: Environment;
    activeSessionId: string;
    onNewSession: () => void;
    onSessionSelect: (id: string) => void;
    onSessionRename: (id: string, newName: string) => void;
    onSessionDelete: (id: string) => void;
    onOpenSettings: () => void;
    currentEnvironment: Environment;
    onEnvironmentChange: (env: Environment) => void;
}

export default function LeftSidebar({
    sessions,
    environment,
    activeSessionId,
    onNewSession,
    onSessionSelect,
    onSessionRename,
    onSessionDelete,
    onOpenSettings,
    currentEnvironment,
    onEnvironmentChange
}: LeftSidebarProps) {
    return (
        <div className="flex flex-col h-full">
            {/* Header / Environment Switch & New Session */}
            <div className="p-4 pt-5 pb-2 space-y-3">
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                        onClick={() => onEnvironmentChange(Environment.Development)}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${currentEnvironment === Environment.Development
                            ? 'bg-slate-800 text-teal-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        Dev (Local)
                    </button>
                    <button
                        onClick={() => onEnvironmentChange(Environment.Production)}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${currentEnvironment === Environment.Production
                            ? 'bg-slate-800 text-sky-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        Prod (Cloud)
                    </button>
                </div>
                <NewSessionButton onClick={onNewSession} />
            </div>

            {/* Divider */}
            <div className="px-4 py-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">Sessions</h3>
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
                />
            </div>

            {/* Footer / Settings */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/20">
                <button
                    onClick={onOpenSettings}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                    <Settings className="w-5 h-5" />
                    <span className="text-sm font-medium">Settings</span>
                </button>
            </div>
        </div>
    );
}
