import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import SessionItem from './SessionItem';
import { Search, Filter } from 'lucide-react';
import { SessionData } from '../interfaces';
import { Environment, CreatorMode, EngineMode } from '../interfaces/enums';
import type { SessionListFilters } from '../types';

interface SessionsListProps {
    sessions: SessionData[];
    environment: Environment;
    activeSessionId: string | null;
    onSessionSelect: (id: string) => void;
    onSessionRename: (id: string, newName: string) => void;
    onSessionDelete: (id: string) => void;
    filters: SessionListFilters;
    onFiltersChange: (filters: SessionListFilters) => void;
    onLoadMore?: () => void;
    hasMore?: boolean;
    isLoadingMore?: boolean;
}

export default function SessionsList({
    sessions,
    environment,
    activeSessionId,
    onSessionSelect,
    onSessionRename,
    onSessionDelete,
    filters,
    onFiltersChange,
    onLoadMore,
    hasMore = false,
    isLoadingMore = false
}: SessionsListProps) {
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [draftFilters, setDraftFilters] = useState<SessionListFilters>(filters);

    useEffect(() => {
        setDraftFilters(filters);
    }, [filters]);

    const maxRowsBound = useMemo(() => {
        const maxVal = sessions.reduce((max, session) => {
            const rows = session.logCount ?? session.itemCount ?? 0;
            return rows > max ? rows : max;
        }, 0);
        return Math.max(1, maxVal);
    }, [sessions]);

    const sessionsToRender = useMemo(() => {
        return [...sessions].sort((a, b) => new Date(b.timestamp || b.createdAt).getTime() - new Date(a.timestamp || a.createdAt).getTime());
    }, [sessions]);

    const showManualLoadMore = hasMore && sessionsToRender.length > 0 && sessionsToRender.length < 20;

    const listRef = useRef<HTMLDivElement>(null);
    const isFetchingRef = useRef(false);

    const maybeLoadMore = useCallback(() => {
        if (!onLoadMore || !hasMore || isLoadingMore || isFetchingRef.current) return;
        isFetchingRef.current = true;
        onLoadMore();
        setTimeout(() => {
            isFetchingRef.current = false;
        }, 300);
    }, [hasMore, isLoadingMore, onLoadMore]);

    const applyFilters = () => {
        onFiltersChange(draftFilters);
        setIsFiltersOpen(true);
    };

    const resetFilters = () => {
        const reset: SessionListFilters = {
            search: '',
            onlyWithLogs: false,
            minRows: null,
            maxRows: null,
            appMode: null,
            engineMode: null,
            model: ''
        };
        setDraftFilters(reset);
        onFiltersChange(reset);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Search Bar */}
            <div className="px-4 pb-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-300" />
                    <input
                        type="text"
                        placeholder="Search sessions..."
                        value={draftFilters.search}
                        onChange={(e) => setDraftFilters(prev => ({ ...prev, search: e.target.value }))}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                applyFilters();
                            }
                        }}
                        className="w-full bg-slate-950/60 border border-slate-800/70 rounded-lg pl-9 pr-10 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/40 placeholder-slate-500"
                    />
                    <button
                        type="button"
                        onClick={() => setIsFiltersOpen(prev => !prev)}
                        className={`absolute right-2.5 top-2.5 ${isFiltersOpen ? 'text-sky-300' : 'text-slate-400'} hover:text-slate-200`}
                        title="Toggle filters"
                    >
                        <Filter className="w-4 h-4" />
                    </button>
                </div>
                {isFiltersOpen && (
                    <div className="mt-3 bg-slate-950/60 border border-slate-800/70 rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <label className="text-[10px] text-slate-300 font-bold uppercase">Only with logs</label>
                            <input
                                type="checkbox"
                                checked={draftFilters.onlyWithLogs}
                                onChange={(e) => setDraftFilters(prev => ({ ...prev, onlyWithLogs: e.target.checked }))}
                                className="accent-sky-500"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-300 font-bold uppercase">App Mode</label>
                                <select
                                    value={draftFilters.appMode || ''}
                                    onChange={(e) => setDraftFilters(prev => ({
                                        ...prev,
                                        appMode: e.target.value ? (e.target.value as CreatorMode) : null
                                    }))}
                                    className="w-full bg-slate-950 border border-slate-800/70 rounded px-2 py-1 text-xs text-slate-100"
                                >
                                    <option value="">Any</option>
                                    <option value={CreatorMode.Generator}>Generator</option>
                                    <option value={CreatorMode.Converter}>Converter</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-300 font-bold uppercase">Engine Mode</label>
                                <select
                                    value={draftFilters.engineMode || ''}
                                    onChange={(e) => setDraftFilters(prev => ({
                                        ...prev,
                                        engineMode: e.target.value ? (e.target.value as EngineMode) : null
                                    }))}
                                    className="w-full bg-slate-950 border border-slate-800/70 rounded px-2 py-1 text-xs text-slate-100"
                                >
                                    <option value="">Any</option>
                                    <option value={EngineMode.Regular}>Regular</option>
                                    <option value={EngineMode.Deep}>Deep</option>
                                </select>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-slate-300 font-bold uppercase">Model contains</label>
                            <input
                                type="text"
                                value={draftFilters.model}
                                onChange={(e) => setDraftFilters(prev => ({ ...prev, model: e.target.value }))}
                                placeholder="e.g. gpt, claude, gemini"
                                className="w-full bg-slate-950 border border-slate-800/70 rounded px-2 py-1 text-xs text-slate-100"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] text-slate-300 font-bold uppercase">Rows</label>
                                <span className="text-[10px] text-slate-400">
                                    {draftFilters.minRows ?? 0} - {draftFilters.maxRows ?? maxRowsBound}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min={0}
                                    max={maxRowsBound}
                                    value={draftFilters.minRows ?? 0}
                                    onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setDraftFilters(prev => ({
                                            ...prev,
                                            minRows: value,
                                            maxRows: prev.maxRows !== null && prev.maxRows < value ? value : prev.maxRows
                                        }));
                                    }}
                                    className="w-full accent-sky-500"
                                />
                                <input
                                    type="range"
                                    min={0}
                                    max={maxRowsBound}
                                    value={draftFilters.maxRows ?? maxRowsBound}
                                    onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setDraftFilters(prev => ({
                                            ...prev,
                                            maxRows: value,
                                            minRows: prev.minRows !== null && prev.minRows > value ? value : prev.minRows
                                        }));
                                    }}
                                    className="w-full accent-sky-500"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <button
                                onClick={applyFilters}
                                className="flex-1 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold py-1.5 rounded"
                            >
                                Apply
                            </button>
                            <button
                                onClick={resetFilters}
                                className="flex-1 bg-slate-900/70 hover:bg-slate-800/80 text-slate-200 text-xs font-bold py-1.5 rounded"
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Sessions List */}
            <div
                ref={listRef}
                onScroll={() => {
                    const el = listRef.current;
                    if (!el) return;
                    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                    if (distanceToBottom < 120) {
                        maybeLoadMore();
                    }
                }}
                className="flex-1 overflow-y-auto px-2 py-2 space-y-1 custom-scrollbar"
            >
                {sessionsToRender.length === 0 ? (
                    <div className="px-4 py-8 text-center text-slate-400 text-sm">
                        {filters.search ? 'No matching sessions' : 'No sessions history'}
                    </div>
                ) : (
                    sessionsToRender.map(session => (
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
                {hasMore && (
                    <div className="flex flex-col items-center py-3 text-[10px] text-slate-400 gap-2">
                        {showManualLoadMore && (
                            <button
                                onClick={() => onLoadMore?.()}
                                disabled={isLoadingMore}
                                className="px-3 py-1.5 rounded-md border border-slate-700/70 bg-slate-900/60 hover:bg-slate-800/70 text-slate-200 text-[10px] font-semibold disabled:opacity-50"
                            >
                                {isLoadingMore ? 'Loading…' : 'Get previous sessions'}
                            </button>
                        )}
                        {!showManualLoadMore && (
                            <span>{isLoadingMore ? 'Loading more…' : 'Scroll to load more'}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
