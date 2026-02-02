import { useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { SessionData } from '../../types';
import { AppView } from '../../interfaces/enums';
import { SessionStatus } from '../../interfaces/enums/SessionStatus';

interface SessionItemProps {
    session: SessionData;
    isActive: boolean;
    onSelect: () => void;
    onRename?: (sessionId: string, newName: string) => void;
}

export default function SessionItem({
    session,
    isActive,
    onSelect,
    onRename
}: SessionItemProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(session.name);

    const handleRenameClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
        setEditName(session.name);
    };

    const handleSaveRename = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (editName.trim() && editName !== session.name && onRename) {
            onRename(session.id, editName.trim());
        }
        setIsEditing(false);
    };

    const handleCancelRename = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(false);
        setEditName(session.name);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (editName.trim() && editName !== session.name && onRename) {
                onRename(session.id, editName.trim());
            }
            setIsEditing(false);
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditName(session.name);
        }
    };

    const modeColor = session.mode === AppView.Creator ? 'teal' : 'pink';
    const statusColor = {
        [SessionStatus.Active]: 'green',
        [SessionStatus.Paused]: 'yellow',
        [SessionStatus.Completed]: 'blue',
        [SessionStatus.Archived]: 'slate'
    }[session.status];

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <button
            onClick={onSelect}
            className={`
                w-full p-3 rounded-lg text-left transition-all group
                ${isActive
                    ? `bg-${modeColor}-600/20 border border-${modeColor}-500/50`
                    : 'bg-slate-800/50 border border-transparent hover:bg-slate-800 hover:border-slate-700'
                }
            `}
        >
            <div className="flex items-start justify-between gap-2 mb-1">
                {isEditing ? (
                    <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-teal-500 outline-none"
                            autoFocus
                        />
                        <button
                            onClick={handleSaveRename}
                            className="w-6 h-6 rounded bg-teal-600 hover:bg-teal-500 flex items-center justify-center"
                        >
                            <Check className="w-3 h-3 text-white" />
                        </button>
                        <button
                            onClick={handleCancelRename}
                            className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center"
                        >
                            <X className="w-3 h-3 text-white" />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-white truncate">{session.name}</h3>
                        </div>
                        {onRename && (
                            <button
                                onClick={handleRenameClick}
                                className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded hover:bg-slate-700 flex items-center justify-center transition-opacity"
                            >
                                <Edit2 className="w-3 h-3 text-slate-400" />
                            </button>
                        )}
                    </>
                )}
            </div>

            <div className="flex items-center gap-2 text-[10px]">
                <span className={`px-1.5 py-0.5 rounded bg-${modeColor}-600/30 text-${modeColor}-400 font-medium`}>
                    {session.mode}
                </span>
                <span className={`px-1.5 py-0.5 rounded bg-${statusColor}-600/30 text-${statusColor}-400`}>
                    {session.status}
                </span>
                <span className="text-slate-500">{session.itemCount} items</span>
            </div>

            <div className="mt-1 text-[10px] text-slate-500">
                {formatDate(session.updatedAt)}
            </div>
        </button>
    );
}
