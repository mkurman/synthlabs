import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Sparkles, Check } from 'lucide-react';

interface ColumnSelectorProps {
    label: string;
    columns: string[];
    selected: string[];
    onSelect: (cols: string[]) => void;
    autoDetected?: string[];
    placeholder?: string;
    previewData?: Record<string, string>; // { columnName: sampleValue }
}

export default function ColumnSelector({
    label,
    columns,
    selected,
    onSelect,
    autoDetected = [],
    placeholder = 'Select columns...',
    previewData
}: ColumnSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Filter columns by search term
    const filteredColumns = columns.filter(col =>
        col.toLowerCase().includes(search.toLowerCase())
    );

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearch(''); // Clear search when closing
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleColumn = (col: string) => {
        if (selected.includes(col)) {
            onSelect(selected.filter(c => c !== col));
        } else {
            onSelect([...selected, col]);
        }
    };

    const selectAutoDetected = () => {
        onSelect([...new Set([...selected, ...autoDetected])]);
    };

    const clearAll = () => {
        onSelect([]);
    };

    const removeColumn = (col: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(selected.filter(c => c !== col));
    };

    return (
        <div className="space-y-1" ref={dropdownRef}>
            <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                {label}
                {autoDetected.length > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-400/70 font-normal">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span className="text-[9px]">{autoDetected.length} detected</span>
                    </span>
                )}
            </label>

            {/* Selected pills display */}
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                    {selected.map(col => (
                        <span
                            key={col}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${autoDetected.includes(col)
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800/70 text-slate-200 border border-slate-600'
                                }`}
                        >
                            {col}
                            <button
                                onClick={(e) => removeColumn(col, e)}
                                className="hover:text-red-400 transition-colors"
                            >
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Dropdown trigger */}
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 hover:border-amber-500/50 focus:border-amber-500 outline-none transition-colors"
                >
                    <span className={selected.length === 0 ? 'text-slate-400' : ''}>
                        {selected.length === 0
                            ? placeholder
                            : `${selected.length} column${selected.length > 1 ? 's' : ''} selected`}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown menu */}
                {isOpen && (
                    <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-slate-950/70 border border-slate-700/70 rounded-lg shadow-xl max-h-64 overflow-hidden flex flex-col">
                        {/* Search input */}
                        {columns.length > 5 && (
                            <div className="px-2 py-1.5 border-b border-slate-800/70 bg-slate-950/70">
                                <input
                                    type="text"
                                    placeholder="Search columns..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full px-2 py-1 text-[10px] bg-slate-950 border border-slate-700/70 rounded focus:border-amber-500/50 focus:outline-none text-slate-100 placeholder-slate-500"
                                    autoFocus
                                />
                            </div>
                        )}

                        {/* Quick actions */}
                        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800/70 bg-slate-950/70">
                            {autoDetected.length > 0 && (
                                <button
                                    onClick={selectAutoDetected}
                                    className="text-[9px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
                                >
                                    <Sparkles className="w-2.5 h-2.5" />
                                    Use detected
                                </button>
                            )}
                            {selected.length > 0 && (
                                <button
                                    onClick={clearAll}
                                    className="text-[9px] text-slate-400 hover:text-red-400"
                                >
                                    Clear all
                                </button>
                            )}
                            {search && (
                                <span className="text-[9px] text-slate-500 ml-auto">
                                    {filteredColumns.length} of {columns.length}
                                </span>
                            )}
                        </div>

                        {/* Column list */}
                        <div className="overflow-y-auto flex-1">
                            {filteredColumns.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-slate-400 text-center">
                                    {columns.length === 0 ? 'No columns available' : 'No matches found'}
                                </div>
                            ) : (
                                filteredColumns.map(col => {
                                    const isSelected = selected.includes(col);
                                    const isAutoDetected = autoDetected.includes(col);
                                    const preview = previewData?.[col];
                                    return (
                                        <button
                                            key={col}
                                            onClick={() => toggleColumn(col)}
                                            title={preview ? `Sample: ${preview.slice(0, 150)}${preview.length > 150 ? '...' : ''}` : undefined}
                                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-900/60 transition-colors ${isSelected ? 'text-white' : 'text-slate-300'
                                                }`}
                                        >
                                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isSelected
                                                ? 'bg-amber-500 border-amber-500'
                                                : 'border-slate-600'
                                                }`}>
                                                {isSelected && <Check className="w-2.5 h-2.5 text-slate-900" />}
                                            </div>
                                            <span className="font-mono truncate">{col}</span>
                                            {isAutoDetected && (
                                                <Sparkles className="w-3 h-3 text-amber-400/50 ml-auto flex-shrink-0" />
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
