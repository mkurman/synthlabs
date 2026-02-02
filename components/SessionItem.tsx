import { useRef, useState, useEffect } from 'react';
import { Trash2, Edit2, Cloud, HardDrive } from 'lucide-react';
import { confirmService } from '../services/confirmService';
import { SessionData, StorageMode } from '../interfaces';
import { Environment } from '../interfaces/enums';

interface SessionItemProps {
    session: SessionData;
    environment: Environment;
    isActive: boolean;
    onSelect: (id: string) => void;
    onRename: (id: string, newName: string) => void;
    onDelete: (id: string) => void;
}

export default function SessionItem({
    session,
    environment,
    isActive,
    onSelect,
    onRename,
    onDelete
}: SessionItemProps) {
    const [isRenaming, setIsRenaming] = useState(false);
    const [newName, setNewName] = useState(session.name || '');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isRenaming && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isRenaming]);

    const handleRenameSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (newName.trim() && newName !== session.name) {
            onRename(session.id, newName.trim());
        }
        setIsRenaming(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleRenameSubmit();
        if (e.key === 'Escape') {
            setNewName(session.name || '');
            setIsRenaming(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const confirmed = await confirmService.confirm({
            title: 'Delete Session?',
            message: `Are you sure you want to delete "${session.name}"? This cannot be undone.`,
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'danger'
        });

        if (confirmed) {
            onDelete(session.id);
        }
    };

    return (
        <div
            onClick={() => onSelect(session.id)}
            className={`
        group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all mb-1
        ${isActive
                    ? 'bg-teal-900/40 border-l-4 border-teal-500'
                    : 'hover:bg-slate-800 border-l-4 border-transparent'
                }
      `}
        >
            <div className="flex-1 min-w-0">
                {isRenaming ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onBlur={() => handleRenameSubmit()}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-teal-500"
                    />
                ) : (
                    <div className="flex flex-col">
                        <h3 className={`text-sm font-medium truncate ${isActive ? 'text-teal-50' : 'text-slate-300'}`}>
                            {session.name || 'Untitled Session'}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${session.storageMode === StorageMode.Cloud ? 'border-sky-800 bg-sky-950/50 text-sky-400' : 'border-slate-700 bg-slate-800/50 text-slate-400'}`}>
                                {environment === Environment.Production ? <Cloud className="w-2.5 h-2.5" /> : <HardDrive className="w-2.5 h-2.5" />}
                                <span>{session.logCount ?? session.itemCount ?? 0}</span>
                            </div>
                            <span className="text-xs text-slate-500 truncate">
                                {new Date(session.timestamp || session.updatedAt || session.createdAt || Date.now()).toLocaleDateString()} {new Date(session.timestamp || session.updatedAt || session.createdAt || Date.now()).toLocaleTimeString()}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {!isRenaming && (
                <div className="hidden group-hover:flex items-center gap-1 pointer-events-none group-hover:pointer-events-auto transition">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setNewName(session.name || '');
                            setIsRenaming(true);
                        }}
                        className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                        title="Rename"
                    >
                        <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                        onClick={handleDelete}
                        className="p-1.5 hover:bg-red-900/50 rounded text-slate-400 hover:text-red-400"
                        title="Delete"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
}
