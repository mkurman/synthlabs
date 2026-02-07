import {
    AlertCircle,
    ChevronDown,
    Edit3,
    Filter,
    GitBranch,
    LayoutGrid,
    List,
    Loader2,
    RefreshCcw,
    Save,
    Search,
    Settings2,
    Sparkles,
    Star,
    Trash2
} from 'lucide-react';
import CollapsibleSection from '../../layout/CollapsibleSection';
import { VerifierDataSource } from '../../../interfaces/enums/VerifierDataSource';
import { VerifierRewriteTarget } from '../../../interfaces/enums';
import { VerifierViewMode } from '../../../interfaces/enums/VerifierViewMode';

interface VerifierReviewToolbarProps {
    selectedCount: number;
    filteredCount: number;
    dataSource: VerifierDataSource | null;
    autoSaveEnabled: boolean;
    onToggleAutoSave: () => void;
    onSelectAll: () => void;
    isAllSelected: boolean;
    isPartiallySelected: boolean;
    isRewritingAll: boolean;
    rewriteProgress: { current: number; total: number };
    onBulkRewrite: (
        target:
            | VerifierRewriteTarget.Query
            | VerifierRewriteTarget.Reasoning
            | VerifierRewriteTarget.Answer
            | VerifierRewriteTarget.Both
    ) => void;
    isAutoscoring: boolean;
    autoscoreProgress: { current: number; total: number };
    onAutoscoreSelected: () => void;
    isBulkUpdating: boolean;
    onBulkDbUpdate: () => void;
    onDeleteSelected: () => void;
    showDuplicatesOnly: boolean;
    setShowDuplicatesOnly: (value: boolean) => void;
    showUnsavedOnly: boolean;
    setShowUnsavedOnly: (value: boolean) => void;
    filterScore: number | null;
    setFilterScore: (value: number | null) => void;
    onRescan: () => void;
    onAutoResolveDuplicates: () => void;
    onRefreshCurrentPage: () => void;
    isRefreshing: boolean;
    pageSize: number;
    setPageSize: (value: number) => void;
    isChatOpen: boolean;
    onToggleChat: () => void;
    viewMode: VerifierViewMode;
    setViewMode: (mode: VerifierViewMode) => void;
}

export default function VerifierReviewToolbar({
    selectedCount,
    filteredCount,
    dataSource,
    autoSaveEnabled,
    onToggleAutoSave,
    onSelectAll,
    isAllSelected,
    isPartiallySelected,
    isRewritingAll,
    rewriteProgress,
    onBulkRewrite,
    isAutoscoring,
    autoscoreProgress,
    onAutoscoreSelected,
    isBulkUpdating,
    onBulkDbUpdate,
    onDeleteSelected,
    showDuplicatesOnly,
    setShowDuplicatesOnly,
    showUnsavedOnly,
    setShowUnsavedOnly,
    filterScore,
    setFilterScore,
    onRescan,
    onAutoResolveDuplicates,
    onRefreshCurrentPage,
    isRefreshing,
    pageSize,
    setPageSize,
    isChatOpen,
    onToggleChat,
    viewMode,
    setViewMode
}: VerifierReviewToolbarProps) {
    return (
        <>
            <CollapsibleSection
                title="Bulk Actions"
                icon={<Settings2 className="w-3.5 h-3.5 text-sky-400" />}
                summary={`${selectedCount} selected`}
                defaultExpanded={false}
            >
                <div className="flex flex-wrap items-center justify-between gap-4 bg-sky-950/10 border border-sky-900/30 p-3 rounded-xl">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 border-r border-sky-800/30 pr-4">
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                ref={(input) => {
                                    if (input) {
                                        input.indeterminate = isPartiallySelected;
                                    }
                                }}
                                onChange={onSelectAll}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-900/60 text-sky-500 focus:ring-offset-slate-900"
                            />
                            <span className="text-xs font-bold text-sky-400">{selectedCount} Selected</span>
                        </div>

                        {dataSource === VerifierDataSource.Database && (
                            <div className="flex items-center gap-2 px-2 py-1 bg-slate-900/60 rounded-lg border border-slate-700/70">
                                <span className="text-[10px] font-bold text-slate-300 uppercase">Auto-Save</span>
                                <button
                                    onClick={onToggleAutoSave}
                                    className={`w-8 h-4 rounded-full relative transition-colors ${autoSaveEnabled ? 'bg-sky-600' : 'bg-slate-800/70'}`}
                                    title="Automatically save changes to DB"
                                >
                                    <div
                                        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${autoSaveEnabled ? 'left-4.5 translate-x-0' : 'left-0.5'}`}
                                        style={autoSaveEnabled ? { left: '1.125rem' } : {}}
                                    />
                                </button>
                            </div>
                        )}

                        <div className="relative group z-20">
                            <button
                                onMouseEnter={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                disabled={isRewritingAll || selectedCount === 0}
                                className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${isRewritingAll ? 'bg-sky-600 text-white' : 'bg-sky-600/10 text-sky-500 hover:bg-sky-600/20'} disabled:opacity-50`}
                            >
                                {isRewritingAll ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Rewriting {rewriteProgress.current}/{rewriteProgress.total}
                                    </>
                                ) : (
                                    <>
                                        <Edit3 className="w-3.5 h-3.5" />
                                        Rewrite
                                        <ChevronDown className="w-3 h-3" />
                                    </>
                                )}
                            </button>
                            {!isRewritingAll && selectedCount > 0 && (
                                <div className="hidden group-hover:block absolute top-full left-0 pt-1 w-48 z-50">
                                    <div className="bg-slate-950/70 border border-slate-700/70 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                                        <button onClick={() => onBulkRewrite(VerifierRewriteTarget.Query)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-900/60 text-slate-200 hover:text-white transition-colors">Query Only</button>
                                        <button onClick={() => onBulkRewrite(VerifierRewriteTarget.Reasoning)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-900/60 text-slate-200 hover:text-white transition-colors">Reasoning Only</button>
                                        <button onClick={() => onBulkRewrite(VerifierRewriteTarget.Answer)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-900/60 text-slate-200 hover:text-white transition-colors">Answer Only</button>
                                        <div className="h-px bg-slate-900/60 my-1" />
                                        <button onClick={() => onBulkRewrite(VerifierRewriteTarget.Both)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-900/60 text-sky-400 hover:text-sky-300 font-bold transition-colors">Rewrite Both</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={onAutoscoreSelected}
                            disabled={isAutoscoring || selectedCount === 0}
                            className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${isAutoscoring ? 'bg-emerald-600 text-white' : 'bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20'} disabled:opacity-50`}
                        >
                            {isAutoscoring ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Scoring {autoscoreProgress.current}/{autoscoreProgress.total}
                                </>
                            ) : (
                                <>
                                    <Star className="w-3.5 h-3.5" />
                                    Autoscore
                                </>
                            )}
                        </button>

                        {dataSource === VerifierDataSource.Database && (
                            <>
                                <button
                                    onClick={onBulkDbUpdate}
                                    disabled={selectedCount === 0 || isBulkUpdating}
                                    className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800/70 text-slate-200 hover:text-white transition-colors disabled:opacity-50"
                                >
                                    {isBulkUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {isBulkUpdating ? 'Updating...' : 'Update DB'}
                                </button>
                                <button
                                    onClick={onDeleteSelected}
                                    disabled={selectedCount === 0}
                                    className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-red-900/50 transition-colors disabled:opacity-50"
                                    title="Permanently Delete Selected from DB"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </CollapsibleSection>

            <CollapsibleSection
                title="Filters & View"
                icon={<Filter className="w-3.5 h-3.5 text-sky-400" />}
                summary={`${filteredCount} items`}
                defaultExpanded
            >
                <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/70 p-3 rounded-xl border border-slate-800/70">
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-slate-300 uppercase tracking-wide px-2 border-r border-slate-800/70">{filteredCount} Items</span>

                        <button onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)} className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${showDuplicatesOnly ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-white'}`}>
                            <GitBranch className="w-3.5 h-3.5" /> Duplicates
                        </button>

                        <button onClick={() => setShowUnsavedOnly(!showUnsavedOnly)} className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${showUnsavedOnly ? 'bg-orange-500/20 text-orange-400' : 'text-slate-400 hover:text-white'}`}>
                            <AlertCircle className="w-3.5 h-3.5" /> Unsaved
                        </button>

                        <div className="flex items-center gap-2">
                            <Filter className="w-3.5 h-3.5 text-slate-400" />
                            <select value={filterScore === null ? 'all' : filterScore} onChange={(e) => setFilterScore(e.target.value === 'all' ? null : Number(e.target.value))} className="bg-slate-950/70 border border-slate-700/70 text-xs text-slate-200 rounded px-2 py-1 outline-none">
                                <option value="all">All Scores</option>
                                <option value="0">Unrated</option>
                                <option value="1">1 Star</option>
                                <option value="2">2 Stars</option>
                                <option value="3">3 Stars</option>
                                <option value="4">4 Stars</option>
                                <option value="5">5 Stars</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={onRescan} className="text-xs bg-slate-900/60 hover:bg-slate-800/70 text-slate-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2" title="Re-scan for duplicates (ignoring discarded)">
                            <Search className="w-3.5 h-3.5" /> Re-Scan
                        </button>
                        <button onClick={onAutoResolveDuplicates} className="text-xs bg-slate-900/60 hover:bg-slate-800/70 text-slate-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2">
                            <RefreshCcw className="w-3.5 h-3.5" /> Auto-Resolve Dupes
                        </button>
                        {dataSource === VerifierDataSource.Database && (
                            <button
                                onClick={onRefreshCurrentPage}
                                disabled={isRefreshing}
                                className="text-xs bg-slate-900/60 hover:bg-slate-800/70 text-slate-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                                title="Refresh current page from database"
                            >
                                {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                                Refresh Page
                            </button>
                        )}
                        <div className="h-4 w-px bg-slate-900/60 mx-2" />
                        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="bg-slate-950/70 border border-slate-700/70 text-xs text-slate-200 rounded px-2 py-1.5 outline-none">
                            <option value="1">1 / page</option>
                            <option value="5">5 / page</option>
                            <option value="10">10 / page</option>
                            <option value="25">25 / page</option>
                            <option value="50">50 / page</option>
                            <option value="100">100 / page</option>
                        </select>
                        <div className="h-4 w-px bg-slate-900/60 mx-2" />
                        <button onClick={() => setViewMode(VerifierViewMode.List)} className={`p-1.5 rounded ${viewMode === VerifierViewMode.List ? 'bg-sky-600 text-white' : 'text-slate-400'}`}><List className="w-4 h-4" /></button>
                        <button onClick={() => setViewMode(VerifierViewMode.Grid)} className={`p-1.5 rounded ${viewMode === VerifierViewMode.Grid ? 'bg-sky-600 text-white' : 'text-slate-400'}`}><LayoutGrid className="w-4 h-4" /></button>
                    </div>
                </div>
            </CollapsibleSection>
        </>
    );
}
