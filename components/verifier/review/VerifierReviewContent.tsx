import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
    AlertTriangle,
    Bot,
    Brain,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ChevronsLeft,
    ChevronsRight,
    Download,
    Edit3,
    Loader2,
    Maximize2,
    MessageCircle,
    Minimize2,
    RotateCcw,
    Save,
    Sparkles,
    Star,
    Trash2,
    User,
    X
} from 'lucide-react';

import { VerifierItem } from '../../../types';
import { OutputFieldName, StreamingField, VerifierRewriteTarget } from '../../../interfaces/enums';
import { VerifierDataSource } from '../../../interfaces/enums/VerifierDataSource';
import { VerifierViewMode } from '../../../interfaces/enums/VerifierViewMode';
import ReasoningHighlighter from '../../ReasoningHighlighter';
import { parseThinkTagsForDisplay } from '../../../utils/thinkTagParser';
import ConversationView from '../../ConversationView';
import AutoResizeTextarea from '../../AutoResizeTextarea';

interface EditingFieldState {
    itemId: string;
    field: OutputFieldName.Query | OutputFieldName.Reasoning | OutputFieldName.Answer | VerifierRewriteTarget.MessageAnswer;
    messageIndex?: number;
    originalValue: string;
}

interface VerifierReviewContentProps {
    reviewScrollRef: MutableRefObject<HTMLDivElement | null>;
    handleReviewScroll: () => void;
    viewMode: VerifierViewMode;
    currentItems: VerifierItem[];
    data: VerifierItem[];
    focusedItemIndex: number;
    setFocusedItemIndex: Dispatch<SetStateAction<number>>;
    itemRefs: MutableRefObject<Record<string, HTMLDivElement>>;
    openDetailPanel: (item: VerifierItem) => void;
    expandedItems: Set<string>;
    toggleItemExpand: (id: string) => void;
    selectedItemIds: Set<string>;
    toggleSelection: (id: string) => void;
    toggleDuplicateStatus: (id: string) => void;
    handleScoreClick: (item: VerifierItem, score: number) => void;
    dataSource: VerifierDataSource | null;
    handleDbUpdate: (item: VerifierItem) => Promise<void>;
    handleDbRollback: (item: VerifierItem) => void;
    itemStates: Record<string, 'idle' | 'saving' | 'saved'>;
    initiateDelete: (ids: string[]) => void;
    toggleDiscard: (id: string) => void;
    editingField: EditingFieldState | null;
    setEditingField: Dispatch<SetStateAction<EditingFieldState | null>>;
    startEditing: (itemId: string, field: OutputFieldName.Query | OutputFieldName.Reasoning | OutputFieldName.Answer, currentValue: string) => void;
    saveEditing: () => void;
    cancelEditing: () => void;
    editValue: string;
    setEditValue: Dispatch<SetStateAction<string>>;
    isRewritingThis: (itemId: string, field: VerifierRewriteTarget) => boolean;
    rewritingField: { itemId: string; field: VerifierRewriteTarget; messageIndex?: number } | null;
    streamingContent: string;
    handleFieldRewrite: (itemId: string, field: VerifierRewriteTarget.Query | VerifierRewriteTarget.Reasoning | VerifierRewriteTarget.Answer) => Promise<void>;
    handleBothRewrite: (itemId: string) => Promise<void>;
    showRegenerateDropdown: string | null;
    setShowRegenerateDropdown: Dispatch<SetStateAction<string | null>>;
    expandedConversations: Set<string>;
    toggleConversationExpand: (id: string) => void;
    messageRewriteStates: Record<string, { field: VerifierRewriteTarget; content: string; reasoningContent?: string }>;
    toStreamingField: (field: VerifierRewriteTarget | undefined) => StreamingField | undefined;
    handleMessageRewrite: (itemId: string, messageIndex: number) => Promise<void>;
    handleMessageReasoningRewrite: (itemId: string, messageIndex: number) => Promise<void>;
    handleMessageBothRewrite: (itemId: string, messageIndex: number) => Promise<void>;
    handleMessageQueryRewrite: (itemId: string, messageIndex: number) => Promise<void>;
    cancelMessageRewrite: (itemId: string, messageIndex: number) => void;
    handleDeleteMessagesFromHere: (itemId: string, messageIndex: number) => Promise<void>;
    handleFetchMore: (offset: number, limit: number) => Promise<void>;
    isImporting: boolean;
    totalPages: number;
    currentPage: number;
    setCurrentPage: Dispatch<SetStateAction<number>>;
}

export default function VerifierReviewContent({
    reviewScrollRef,
    handleReviewScroll,
    viewMode,
    currentItems,
    data,
    focusedItemIndex,
    setFocusedItemIndex,
    itemRefs,
    openDetailPanel,
    expandedItems,
    toggleItemExpand,
    selectedItemIds,
    toggleSelection,
    toggleDuplicateStatus,
    handleScoreClick,
    dataSource,
    handleDbUpdate,
    handleDbRollback,
    itemStates,
    initiateDelete,
    toggleDiscard,
    editingField,
    setEditingField,
    startEditing,
    saveEditing,
    cancelEditing,
    editValue,
    setEditValue,
    isRewritingThis,
    rewritingField,
    streamingContent,
    handleFieldRewrite,
    handleBothRewrite,
    showRegenerateDropdown,
    setShowRegenerateDropdown,
    expandedConversations,
    toggleConversationExpand,
    messageRewriteStates,
    toStreamingField,
    handleMessageRewrite,
    handleMessageReasoningRewrite,
    handleMessageBothRewrite,
    handleMessageQueryRewrite,
    cancelMessageRewrite,
    handleDeleteMessagesFromHere,
    handleFetchMore,
    isImporting,
    totalPages,
    currentPage,
    setCurrentPage
}: VerifierReviewContentProps) {
    return (
        <div className="flex gap-4 flex-1 min-h-0">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div
                    ref={reviewScrollRef}
                    onScroll={handleReviewScroll}
                    className={`flex-1 overflow-y-auto pr-2 grid gap-4 ${viewMode === VerifierViewMode.Grid ? 'grid-cols-2 lg:grid-cols-3 content-start' : 'grid-cols-1 content-start'}`}
                >

                    {currentItems.map((item, index) => {
                        const parsedAnswer = parseThinkTagsForDisplay(item.answer || '');
                        const displayReasoning = item.reasoning || parsedAnswer.reasoning || '';
                        const displayAnswer = parsedAnswer.hasThinkTags ? parsedAnswer.answer : item.answer;
                        const isExpanded = expandedItems.has(item.id);
                        const isFocused = focusedItemIndex === index;

                        return (
                            <div
                                key={item.id}
                                ref={el => { if (el) itemRefs.current[item.id] = el; }}
                                onClick={(e) => {
                                    if ((e.target as HTMLElement).tagName === 'BUTTON'
                                        || (e.target as HTMLElement).tagName === 'INPUT'
                                        || (e.target as HTMLElement).tagName === 'TEXTAREA') {
                                        return;
                                    }
                                    setFocusedItemIndex(index);
                                }}
                                onDoubleClick={() => openDetailPanel(item)}
                                className={`bg-slate-950/70 border relative group transition-all rounded-xl flex flex-col overflow-hidden ${
                                    item.hasUnsavedChanges
                                        ? 'border-orange-500/80 shadow-[0_0_15px_-3px_rgba(249,115,22,0.3)]'
                                        : item.isDuplicate
                                            ? 'border-amber-500/30'
                                            : isFocused
                                                ? 'border-sky-500/50 ring-1 ring-sky-500/30'
                                                : 'border-slate-800/70 hover:border-sky-500/30'
                                } ${isExpanded ? 'shadow-lg' : ''}`}
                            >

                                <div className={`sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm p-4 border-b ${
                                    item.hasUnsavedChanges ? 'border-orange-500/30' : 'border-slate-800/50'
                                }`}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <input
                                                type="checkbox"
                                                checked={selectedItemIds.has(item.id)}
                                                onChange={() => toggleSelection(item.id)}
                                                className="w-4 h-4 rounded border-slate-600 bg-slate-900/60 text-sky-600 focus:ring-offset-slate-900 cursor-pointer"
                                            />
                                            <span className="text-xs font-mono text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-700/70" title="Index in dataset (0-based)">
                                                #{data.indexOf(item)}
                                            </span>
                                            <span className="text-xs font-mono text-slate-300 bg-slate-900/70 px-2 py-0.5 rounded border border-slate-700/70 max-w-[200px] truncate" title={`ID: ${item.id}`}>
                                                {item.id.slice(0, 12)}...
                                            </span>

                                            {item.isDuplicate && (
                                                <button
                                                    onClick={() => toggleDuplicateStatus(item.id)}
                                                    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-800/50 transition-colors"
                                                    title="Duplicate Detected. Click to unmark."
                                                >
                                                    <AlertTriangle className="w-3 h-3" />
                                                    Duplicate
                                                </button>
                                            )}

                                            <div className="flex items-center gap-0.5">
                                                {[1, 2, 3, 4, 5].map(star => (
                                                    <button
                                                        key={star}
                                                        onClick={() => handleScoreClick(item, star)}
                                                        className="focus:outline-none transition-transform hover:scale-110 p-0.5"
                                                    >
                                                        <Star className={`w-4 h-4 ${item.score >= star ? 'fill-yellow-400 text-yellow-400' : 'text-slate-700'}`} />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => openDetailPanel(item)}
                                                className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-900/30 rounded transition-colors"
                                                title="Open in Detail View (Double-click item)"
                                            >
                                                <Maximize2 className="w-4 h-4" />
                                            </button>

                                            {dataSource === VerifierDataSource.Database && item.hasUnsavedChanges && (
                                                <>
                                                    <button
                                                        onClick={() => handleDbUpdate(item)}
                                                        disabled={itemStates[item.id] === 'saving'}
                                                        className={`p-1.5 rounded transition-colors ${itemStates[item.id] === 'saved' ? 'text-emerald-500' : 'text-slate-400 hover:text-sky-400 hover:bg-slate-800'}`}
                                                        title={itemStates[item.id] === 'saved' ? 'Saved!' : 'Update in DB'}
                                                    >
                                                        {itemStates[item.id] === 'saving' ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : itemStates[item.id] === 'saved' ? (
                                                            <Check className="w-4 h-4" />
                                                        ) : (
                                                            <Save className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDbRollback(item)}
                                                        className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors"
                                                        title="Discard Changes"
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => initiateDelete([item.id])}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-950/30 rounded transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                            {dataSource !== VerifierDataSource.Database && (
                                                <button
                                                    onClick={() => toggleDiscard(item.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/30 rounded transition-colors"
                                                    title="Remove"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className={`p-4 pt-2 space-y-4 transition-all duration-200 ${isExpanded ? '' : 'max-h-[400px] overflow-hidden'}`}>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                                                <User className="w-3.5 h-3.5 text-sky-400" />
                                                Query
                                                {item.isMultiTurn && <MessageCircle className="w-3 h-3 text-cyan-400" />}
                                            </h4>
                                            <div className="flex items-center gap-1">
                                                {editingField?.itemId === item.id && editingField.field === OutputFieldName.Query ? (
                                                    <>
                                                        <button onClick={saveEditing} className="p-1.5 text-emerald-400 hover:bg-emerald-900/30 rounded" title="Save">
                                                            <Check className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={cancelEditing} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded" title="Cancel">
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => startEditing(item.id, OutputFieldName.Query, item.query || (item as any).QUERY || item.full_seed || '')}
                                                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit3 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleFieldRewrite(item.id, VerifierRewriteTarget.Query)}
                                                            disabled={rewritingField?.itemId === item.id && rewritingField.field === VerifierRewriteTarget.Query}
                                                            className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-900/30 rounded transition-colors disabled:opacity-50"
                                                            title="AI Rewrite"
                                                        >
                                                            {rewritingField?.itemId === item.id && rewritingField.field === VerifierRewriteTarget.Query ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : (
                                                                <RotateCcw className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {editingField?.itemId === item.id && editingField.field === OutputFieldName.Query ? (
                                            <AutoResizeTextarea
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                onBlur={saveEditing}
                                                autoFocus
                                                className="w-full bg-slate-950 border border-sky-500/50 rounded-lg p-3 text-sm text-slate-100 outline-none min-h-[80px] leading-relaxed"
                                                placeholder="Enter query..."
                                            />
                                        ) : (
                                            <div
                                                onClick={() => !item.isMultiTurn && toggleItemExpand(item.id)}
                                                className={`bg-slate-950/50 border border-slate-800/50 rounded-lg p-3 ${!item.isMultiTurn ? 'cursor-pointer hover:border-slate-700' : ''}`}
                                            >
                                                {isRewritingThis(item.id, VerifierRewriteTarget.Query) && streamingContent ? (
                                                    <p className="text-sm text-sky-300 animate-pulse whitespace-pre-wrap leading-relaxed min-h-[40px]">
                                                        {streamingContent}
                                                        <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                                                    </p>
                                                ) : (
                                                    <p className={`text-sm text-slate-100 leading-relaxed ${isExpanded ? '' : 'line-clamp-3'}`}>
                                                        {item.query || (item as any).QUERY || item.full_seed || '(No query)'}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {item.isMultiTurn && item.messages && item.messages.length > 0 ? (
                                        <div className="bg-slate-950/30 rounded-lg border border-cyan-800/30">
                                            <div className="flex items-center justify-between p-3 border-b border-cyan-800/20">
                                                <h4 className="text-xs font-semibold text-cyan-400 flex items-center gap-2">
                                                    <MessageCircle className="w-4 h-4" />
                                                    Conversation ({item.messages.length} messages)
                                                </h4>
                                                <button
                                                    onClick={() => toggleConversationExpand(item.id)}
                                                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400 transition-colors"
                                                >
                                                    {expandedConversations.has(item.id) ? (
                                                        <><Minimize2 className="w-3.5 h-3.5" /> Collapse</>
                                                    ) : (
                                                        <><Maximize2 className="w-3.5 h-3.5" /> Expand</>
                                                    )}
                                                </button>
                                            </div>
                                            <div className={`p-3 transition-all ${expandedConversations.has(item.id) ? 'max-h-[50vh]' : 'max-h-[400px]'} overflow-y-auto`}>
                                                {(() => {
                                                    const rewritingByIndex: Record<number, { content: string; reasoningContent?: string; field?: StreamingField }> = {};
                                                    Object.entries(messageRewriteStates).forEach(([key, state]) => {
                                                        const [stateItemId, stateMessageIndex] = key.split(':');
                                                        if (stateItemId !== item.id) return;
                                                        const messageIdx = Number(stateMessageIndex);
                                                        if (!Number.isFinite(messageIdx)) return;
                                                        rewritingByIndex[messageIdx] = {
                                                            content: state.content,
                                                            reasoningContent: state.reasoningContent,
                                                            field: toStreamingField(state.field)
                                                        };
                                                    });
                                                    return (
                                                        <ConversationView
                                                            messages={item.messages}
                                                            onEditStart={(idx, content) => {
                                                                setEditingField({
                                                                    itemId: item.id,
                                                                    field: VerifierRewriteTarget.MessageAnswer,
                                                                    messageIndex: idx,
                                                                    originalValue: content
                                                                });
                                                                setEditValue(content);
                                                            }}
                                                            onEditSave={saveEditing}
                                                            onEditCancel={cancelEditing}
                                                            onEditChange={setEditValue}
                                                            onRewrite={(idx) => handleMessageRewrite(item.id, idx)}
                                                            onRewriteReasoning={(idx) => handleMessageReasoningRewrite(item.id, idx)}
                                                            onRewriteBoth={(idx) => handleMessageBothRewrite(item.id, idx)}
                                                            onRewriteQuery={(idx) => handleMessageQueryRewrite(item.id, idx)}
                                                            onCancelRewrite={(idx) => cancelMessageRewrite(item.id, idx)}
                                                            onDeleteFromHere={(idx) => handleDeleteMessagesFromHere(item.id, idx)}
                                                            editingIndex={editingField?.itemId === item.id && editingField.field === VerifierRewriteTarget.MessageAnswer ? editingField.messageIndex : undefined}
                                                            editValue={editValue}
                                                            rewritingByIndex={rewritingByIndex}
                                                        />
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                                                        <Brain className="w-3.5 h-3.5 text-purple-400" />
                                                        Reasoning Trace
                                                    </h4>
                                                    <div className="flex items-center gap-1">
                                                        {editingField?.itemId === item.id && editingField.field === OutputFieldName.Reasoning ? (
                                                            <>
                                                                <button onClick={saveEditing} className="p-1.5 text-emerald-400 hover:bg-emerald-900/30 rounded" title="Save">
                                                                    <Check className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button onClick={cancelEditing} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded" title="Cancel">
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => startEditing(item.id, OutputFieldName.Reasoning, item.reasoning)}
                                                                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                                                                    title="Edit"
                                                                >
                                                                    <Edit3 className="w-3.5 h-3.5" />
                                                                </button>
                                                                <div className="relative">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(showRegenerateDropdown === item.id ? null : item.id); }}
                                                                        disabled={rewritingField?.itemId === item.id}
                                                                        className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-900/30 rounded transition-colors disabled:opacity-50"
                                                                        title="AI Regenerate"
                                                                    >
                                                                        {rewritingField?.itemId === item.id ? (
                                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                        ) : (
                                                                            <Sparkles className="w-3.5 h-3.5" />
                                                                        )}
                                                                    </button>
                                                                    {showRegenerateDropdown === item.id && (
                                                                        <div
                                                                            className="absolute right-0 top-full mt-1 bg-slate-950 border border-slate-700 rounded-lg shadow-2xl z-30 py-1 min-w-[160px]"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); void handleFieldRewrite(item.id, VerifierRewriteTarget.Reasoning); }}
                                                                                className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                                                                            >
                                                                                <Brain className="w-3.5 h-3.5" /> Reasoning Only
                                                                            </button>
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); void handleFieldRewrite(item.id, VerifierRewriteTarget.Answer); }}
                                                                                className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                                                                            >
                                                                                <Bot className="w-3.5 h-3.5" /> Answer Only
                                                                            </button>
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); void handleBothRewrite(item.id); }}
                                                                                className="w-full px-3 py-2 text-left text-xs text-sky-400 hover:bg-slate-800 flex items-center gap-2 border-t border-slate-800"
                                                                            >
                                                                                <Sparkles className="w-3.5 h-3.5" /> Both Together
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {showRegenerateDropdown === item.id && (
                                                                    <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); }} />
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {editingField?.itemId === item.id && editingField.field === OutputFieldName.Reasoning ? (
                                                    <AutoResizeTextarea
                                                        value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        onBlur={saveEditing}
                                                        autoFocus
                                                        className="w-full bg-slate-950 border border-sky-500/50 rounded-lg p-3 text-sm text-slate-100 outline-none min-h-[150px] font-mono leading-relaxed"
                                                    />
                                                ) : (
                                                    <div
                                                        onClick={() => toggleItemExpand(item.id)}
                                                        className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3 cursor-pointer hover:border-slate-700 transition-colors min-h-[60px]"
                                                    >
                                                        {rewritingField?.itemId === item.id && rewritingField.field === VerifierRewriteTarget.Reasoning && streamingContent ? (
                                                            <div className="max-h-64 overflow-y-auto">
                                                                <p className="text-sm text-sky-300 font-mono animate-pulse whitespace-pre-wrap leading-relaxed">
                                                                    {streamingContent}
                                                                    <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <div className={`${isExpanded ? 'max-h-[50vh]' : 'max-h-40'} overflow-y-auto`}>
                                                                <div className="text-sm text-slate-300 font-mono leading-relaxed">
                                                                    <ReasoningHighlighter text={displayReasoning || '(No reasoning)'} />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                                                        <Bot className="w-3.5 h-3.5 text-emerald-400" />
                                                        Answer
                                                    </h4>
                                                    <div className="flex items-center gap-1">
                                                        {editingField?.itemId === item.id && editingField.field === OutputFieldName.Answer ? (
                                                            <>
                                                                <button onClick={saveEditing} className="p-1.5 text-emerald-400 hover:bg-emerald-900/30 rounded" title="Save">
                                                                    <Check className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button onClick={cancelEditing} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded" title="Cancel">
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => startEditing(item.id, OutputFieldName.Answer, item.answer)}
                                                                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                                                                title="Edit"
                                                            >
                                                                <Edit3 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {editingField?.itemId === item.id && editingField.field === OutputFieldName.Answer ? (
                                                    <AutoResizeTextarea
                                                        value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        onBlur={saveEditing}
                                                        autoFocus
                                                        className="w-full bg-slate-950 border border-sky-500/50 rounded-lg p-3 text-sm text-slate-100 outline-none min-h-[100px] leading-relaxed"
                                                    />
                                                ) : (
                                                    <div
                                                        onClick={() => toggleItemExpand(item.id)}
                                                        className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3 cursor-pointer hover:border-slate-700 transition-colors min-h-[60px]"
                                                    >
                                                        {rewritingField?.itemId === item.id && rewritingField.field === VerifierRewriteTarget.Answer && streamingContent ? (
                                                            <div className="max-h-64 overflow-y-auto">
                                                                <p className="text-sm text-sky-300 font-mono whitespace-pre-wrap animate-pulse leading-relaxed">
                                                                    {streamingContent}
                                                                    <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <div className={`${isExpanded ? 'max-h-[50vh]' : 'max-h-40'} overflow-y-auto`}>
                                                                <p className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">{displayAnswer || '(No answer)'}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {!isExpanded && (
                                    <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
                                )}
                                <button
                                    onClick={() => toggleItemExpand(item.id)}
                                    className="sticky bottom-2 mx-auto mb-2 flex items-center gap-1 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white text-xs rounded-full transition-colors backdrop-blur-sm border border-slate-700/50 z-10"
                                >
                                    {isExpanded ? (
                                        <><ChevronUp className="w-3.5 h-3.5" /> Show Less</>
                                    ) : (
                                        <><ChevronDown className="w-3.5 h-3.5" /> Show More (Double-click to open detail view)</>
                                    )}
                                </button>

                                <div className="px-4 py-3 border-t border-slate-800/50 bg-slate-950/30">
                                    <div className="flex justify-between items-center text-xs text-slate-500">
                                        <div className="flex items-center gap-3">
                                            <span className="truncate max-w-[200px]" title={item.modelUsed}>{item.modelUsed}</span>
                                            {item.sessionUid && (
                                                <span className="bg-slate-800/60 text-slate-400 font-mono px-2 py-0.5 rounded border border-slate-700/50" title={`Session: ${item.sessionUid}`}>
                                                    {item.sessionUid.slice(0, 8)}...
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {item.deepMetadata && <span className="bg-sky-900/30 text-sky-400 px-2 py-0.5 rounded text-[10px] font-medium border border-sky-800/50">Deep</span>}
                                            {item.hasUnsavedChanges && (
                                                <span className="bg-orange-900/30 text-orange-400 px-2 py-0.5 rounded text-[10px] font-medium border border-orange-800/50">
                                                    Unsaved
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {dataSource === VerifierDataSource.Database && (
                    <div className="flex justify-center p-4 mt-2 border-t border-slate-800/70 bg-slate-950/70 rounded-xl">
                        <button
                            onClick={() => handleFetchMore(0, 0)}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-900/60 hover:bg-slate-800/70 text-slate-200 rounded-lg transition-colors border border-slate-700/70"
                            disabled={isImporting}
                        >
                            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            <span>Fetch More Rows</span>
                        </button>
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 mt-2 p-3 bg-slate-950/70 rounded-xl border border-slate-800/70">
                        <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="p-2 rounded-lg hover:bg-slate-900/60 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
                            title="First Page"
                        >
                            <ChevronsLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 rounded-lg hover:bg-slate-900/60 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
                            title="Previous Page"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>

                        <span className="text-xs font-mono text-slate-300">
                            Page <span className="text-white font-bold">{currentPage}</span> of {totalPages}
                        </span>

                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-lg hover:bg-slate-900/60 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
                            title="Next Page"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-lg hover:bg-slate-900/60 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
                            title="Last Page"
                        >
                            <ChevronsRight className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
