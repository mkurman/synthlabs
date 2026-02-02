import { useState } from 'react';
import SessionItem from './SessionItem';
import { Search } from 'lucide-react';
import { SessionData } from '../interfaces';
import { Environment } from '../interfaces/enums';

interface SessionsListProps {
    sessions: SessionData[];
    environment: Environment;
    activeSessionId: string | null;
    onSessionSelect: (id: string) => void;
    onSessionRename: (id: string, newName: string) => void;
    onSessionDelete: (id: string) => void;
}

export default function SessionsList({
    sessions,
    environment,
    activeSessionId,
    onSessionSelect,
    onSessionRename,
    onSessionDelete
}: SessionsListProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredSessions = sessions
        .filter(session =>
            (session.name || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => new Date(b.timestamp || b.createdAt).getTime() - new Date(a.timestamp || a.createdAt).getTime());

    return (
        <div className="flex flex-col h-full">
            {/* Search Bar */}
            <div className="px-4 pb-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search sessions..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 placeholder-slate-600"
                    />
                </div>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 custom-scrollbar">
                {filteredSessions.length === 0 ? (
                    <div className="px-4 py-8 text-center text-slate-500 text-sm">
                        {searchTerm ? 'No matching sessions' : 'No sessions history'}
                    </div>
                ) : (
                    filteredSessions.map(session => (
                        <SessionItem
                            key={session.id}
                            session={session}
                            environment={environment}
                            isActive={session.id === activeSessionId}
                            onSelect={onSessionSelect}
                            onRename={onSessionRename}
                            onDelete={onSessionDelete}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
