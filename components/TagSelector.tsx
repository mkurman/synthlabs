import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Tag, ChevronDown } from 'lucide-react';
import { SessionTag } from '../interfaces/services/SessionConfig';

interface TagSelectorProps {
    availableTags: SessionTag[];
    selectedTags: SessionTag[];
    onChange: (tags: SessionTag[]) => void;
    onCreateTag?: (name: string) => Promise<SessionTag | null>;
    placeholder?: string;
    disabled?: boolean;
}

export const TagSelector: React.FC<TagSelectorProps> = ({
    availableTags,
    selectedTags,
    onChange,
    onCreateTag,
    placeholder = 'Select tags...',
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const filteredTags = availableTags.filter(tag =>
        tag.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !selectedTags.find(st => st.uid === tag.uid)
    );

    const canCreateNew = searchTerm.trim() && 
        onCreateTag && 
        !availableTags.find(t => t.name.toLowerCase() === searchTerm.trim().toLowerCase());

    const handleSelectTag = (tag: SessionTag) => {
        onChange([...selectedTags, tag]);
        setSearchTerm('');
    };

    const handleRemoveTag = (tagUid: string) => {
        onChange(selectedTags.filter(t => t.uid !== tagUid));
    };

    const handleCreateNew = async () => {
        if (!canCreateNew || !onCreateTag) return;
        setIsCreating(true);
        try {
            const newTag = await onCreateTag(searchTerm.trim());
            if (newTag) {
                onChange([...selectedTags, newTag]);
                setSearchTerm('');
            }
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`
                    min-h-[38px] px-2 py-1.5 bg-slate-950/70 border border-slate-700/70 rounded-lg
                    flex flex-wrap items-center gap-1.5 cursor-pointer
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-600/70'}
                    ${isOpen ? 'border-blue-500/50 ring-1 ring-blue-500/20' : ''}
                `}
            >
                {selectedTags.length === 0 && !isOpen && (
                    <span className="text-slate-500 text-sm">{placeholder}</span>
                )}
                
                {selectedTags.map(tag => (
                    <span
                        key={tag.uid}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-900/40 text-blue-300 text-xs rounded-md border border-blue-800/50"
                    >
                        <Tag className="w-3 h-3" />
                        {tag.name}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveTag(tag.uid);
                            }}
                            className="hover:text-blue-200 ml-0.5"
                            disabled={disabled}
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </span>
                ))}
                
                {isOpen && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && canCreateNew) {
                                handleCreateNew();
                            } else if (e.key === 'Escape') {
                                setIsOpen(false);
                            }
                        }}
                        placeholder="Search or create tag..."
                        className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
                    />
                )}
                
                <ChevronDown className={`w-4 h-4 text-slate-500 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {isOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-950/95 border border-slate-700/70 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {filteredTags.length === 0 && !canCreateNew && (
                        <div className="px-3 py-2 text-sm text-slate-500">
                            {searchTerm ? 'No matching tags' : 'No tags available'}
                        </div>
                    )}
                    
                    {filteredTags.map(tag => (
                        <button
                            key={tag.uid}
                            onClick={() => handleSelectTag(tag)}
                            className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800/70 flex items-center gap-2"
                        >
                            <Tag className="w-3.5 h-3.5 text-slate-500" />
                            {tag.name}
                        </button>
                    ))}
                    
                    {canCreateNew && (
                        <button
                            onClick={handleCreateNew}
                            disabled={isCreating}
                            className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-blue-900/30 flex items-center gap-2 border-t border-slate-800/70"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            {isCreating ? 'Creating...' : `Create "${searchTerm.trim()}"`}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default TagSelector;
