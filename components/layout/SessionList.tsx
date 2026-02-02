import { useMemo } from 'react';
import { SessionData } from '../../types';
import { SessionSort } from '../../interfaces/enums/SessionSort';
import SessionItem from './SessionItem';

interface SessionListProps {
    sessions: SessionData[];
    currentSessionId: string | null;
    onSessionSelect: (sessionId: string) => void;
    onRename?: (sessionId: string, newName: string) => void;
    sortBy: SessionSort;
}

export default function SessionList({
    sessions,
    currentSessionId,
    onSessionSelect,
    onRename,
    sortBy
}: SessionListProps) {
    const sortedSessions = useMemo(() => {
        const sorted = [...sessions];

        switch (sortBy) {
            case SessionSort.Recent:
                return sorted.sort((a, b) => b.updatedAt - a.updatedAt);
            case SessionSort.Oldest:
                return sorted.sort((a, b) => a.createdAt - b.createdAt);
            case SessionSort.NameAsc:
                return sorted.sort((a, b) => a.name.localeCompare(b.name));
            case SessionSort.NameDesc:
                return sorted.sort((a, b) => b.name.localeCompare(a.name));
            case SessionSort.ItemCount:
                return sorted.sort((a, b) => b.itemCount - a.itemCount);
            default:
                return sorted;
        }
    }, [sessions, sortBy]);

    if (sessions.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
                        <span className="text-2xl">📁</span>
                    </div>
                    <p className="text-sm text-slate-400">No sessions yet</p>
                    <p className="text-xs text-slate-500 mt-1">Create one to get started</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="p-2 space-y-1">
                {sortedSessions.map((session) => (
                    <SessionItem
                        key={session.id}
                        session={session}
                        isActive={session.id === currentSessionId}
                        onSelect={() => onSessionSelect(session.id)}
                        onRename={onRename}
                    />
                ))}
            </div>
        </div>
    );
}
