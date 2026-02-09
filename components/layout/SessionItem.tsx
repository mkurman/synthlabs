import { useState } from 'react';
import { Edit2, Check, X, Tag } from 'lucide-react';
import { SessionData } from '../../interfaces';
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

    const statusColor = {
        [SessionStatus.Idle]: 'slate',
        [SessionStatus.Running]: 'green',
        [SessionStatus.Paused]: 'yellow',
        [SessionStatus.Stopped]: 'red',
        [SessionStatus.Error]: 'red'
    }[session.status] || 'slate';

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

    const firstTag = session.tags?.[0];
    const additionalTagsCount = (session.tags?.length || 0) - 1;

    return (
        <button
            onClick={onSelect}
            className={`
                w-full p-3 rounded-lg text-left transition-all group
                ${isActive
                    ? 'bg-slate-900/60 border border-sky-500/40 ring-1 ring-sky-500/20'
                    : 'bg-slate-950/60 border border-transparent hover:bg-slate-950/60 hover:border-slate-800/70'
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
                            className="flex-1 bg-slate-950/60 border border-slate-700/70 rounded px-2 py-1 text-xs text-white focus:border-sky-500/60 outline-none"
                            autoFocus
                        />
                        <button
                            onClick={handleSaveRename}
                            className="w-6 h-6 rounded bg-sky-600 hover:bg-sky-500 flex items-center justify-center"
                        >
                            <Check className="w-3 h-3 text-white" />
                        </button>
                        <button
                            onClick={handleCancelRename}
                            className="w-6 h-6 rounded bg-slate-800/70 hover:bg-slate-800/70 flex items-center justify-center"
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
                                className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded hover:bg-slate-800/70 flex items-center justify-center transition-opacity"
                            >
                                <Edit2 className="w-3 h-3 text-slate-300" />
                            </button>
                        )}
                    </>
                )}
            </div>

            <div className="flex items-center gap-2 text-[10px]">
                <span className={`px-1.5 py-0.5 rounded bg-${statusColor}-600/30 text-${statusColor}-400`}>
                    {session.status}
                </span>
                <span className="text-slate-400">{session.itemCount} items</span>
                {firstTag && (
                    <>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-900/40 text-blue-300 rounded border border-blue-800/50">
                            <Tag className="w-3 h-3" />
                            {firstTag.name}
                        </span>
                        {additionalTagsCount > 0 && (
                            <span className="text-slate-500">
                                +{additionalTagsCount}
                            </span>
                        )}
                    </>
                )}
            </div>

            <div className="mt-1 text-[10px] text-slate-400">
                {formatDate(session.updatedAt)}
            </div>
        </button>
    );
}
