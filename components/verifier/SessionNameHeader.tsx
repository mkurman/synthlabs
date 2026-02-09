import { useState, useRef, useEffect } from 'react';
import { Edit2, Check, X, Plus } from 'lucide-react';
import { SessionTag } from '../../interfaces/services/SessionConfig';
import TagSelector from '../../components/TagSelector';

interface SessionNameHeaderProps {
    sessionName: string | null;
    isAllSessionsMode?: boolean;
    itemCount?: number;
    onRename?: (newName: string) => void;
    onCreateSession?: () => void;
    tags?: SessionTag[];
    availableTags?: SessionTag[];
    onTagsChange?: (tags: SessionTag[]) => void;
    onCreateTag?: (name: string) => Promise<SessionTag | null>;
}

export default function SessionNameHeader({
    sessionName,
    isAllSessionsMode = false,
    itemCount = 0,
    onRename,
    onCreateSession,
    tags = [],
    availableTags = [],
    onTagsChange,
    onCreateTag
}: SessionNameHeaderProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(sessionName || '');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    useEffect(() => {
        setEditName(sessionName || '');
    }, [sessionName]);

    const handleSave = () => {
        const trimmed = editName.trim();
        if (trimmed && trimmed !== sessionName && onRename) {
            onRename(trimmed);
        }
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditName(sessionName || '');
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    if (!sessionName && !isAllSessionsMode) {
        return null;
    }

    return (
        <div className="bg-slate-900/60 border border-slate-800/70 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        Session
                    </span>
                    
                    {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                            <input
                                ref={inputRef}
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="flex-1 bg-slate-950 border border-slate-700/70 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none min-w-0"
                            />
                            <button
                                onClick={handleSave}
                                className="w-6 h-6 rounded bg-sky-600 hover:bg-sky-500 flex items-center justify-center flex-shrink-0"
                            >
                                <Check className="w-3.5 h-3.5 text-white" />
                            </button>
                            <button
                                onClick={handleCancel}
                                className="w-6 h-6 rounded bg-slate-800/70 hover:bg-slate-700/70 flex items-center justify-center flex-shrink-0"
                            >
                                <X className="w-3.5 h-3.5 text-white" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-sm font-medium text-white truncate">
                                {sessionName || (isAllSessionsMode ? 'All Sessions' : 'Untitled Session')}
                            </span>
                            {isAllSessionsMode && itemCount > 0 && onCreateSession && (
                                <button
                                    onClick={onCreateSession}
                                    className="flex items-center gap-1 px-2 py-0.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 text-[10px] rounded border border-sky-600/30 transition-colors"
                                >
                                    <Plus className="w-3 h-3" />
                                    Save as New Session
                                </button>
                            )}
                            {onRename && (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="opacity-0 hover:opacity-100 w-6 h-6 rounded hover:bg-slate-800/70 flex items-center justify-center transition-opacity"
                                    title="Rename session"
                                >
                                    <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
                
                {itemCount > 0 && (
                    <span className="text-xs text-slate-400 ml-4 flex-shrink-0">
                        {itemCount} items
                    </span>
                )}
            </div>
            
            {isAllSessionsMode && !sessionName && (
                <div className="mt-2 text-[10px] text-amber-400/80">
                    Items are loaded from multiple sessions.
                    {onCreateSession && ' Click "Save as New Session" to create a unified session.'}
                </div>
            )}

            {!isAllSessionsMode && onTagsChange && (
                <div className="mt-3 pt-3 border-t border-slate-800/50">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold shrink-0">
                            Tags
                        </span>
                        <div className="flex-1">
                            <TagSelector
                                availableTags={availableTags}
                                selectedTags={tags}
                                onChange={onTagsChange}
                                onCreateTag={onCreateTag}
                                placeholder="Add tags..."
                            />
                        </div>
                    </div>
                </div>
            )}

            {isAllSessionsMode && (
                <div className="mt-3 pt-3 border-t border-slate-800/50">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span className="uppercase tracking-wider font-semibold">Tags</span>
                        <span>Save as new session to enable tagging</span>
                    </div>
                </div>
            )}
        </div>
    );
}
