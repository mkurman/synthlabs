import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Download,
    Loader2
} from 'lucide-react';

import { VerifierItem } from '../../../types';
import { OutputFieldName, StreamingField, VerifierRewriteTarget } from '../../../interfaces/enums';
import { VerifierDataSource } from '../../../interfaces/enums/VerifierDataSource';
import { VerifierViewMode } from '../../../interfaces/enums/VerifierViewMode';
import VerifierListItem from './VerifierListItem';

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
                        const isExpanded = expandedItems.has(item.id);
                        const isFocused = focusedItemIndex === index;

                        return (
                            <VerifierListItem
                                key={item.id}
                                item={item}
                                dataIndex={data.indexOf(item)}
                                isExpanded={isExpanded}
                                isFocused={isFocused}
                                isSelected={selectedItemIds.has(item.id)}
                                itemState={itemStates[item.id]}
                                dataSource={dataSource}
                                onToggleExpand={() => toggleItemExpand(item.id)}
                                onSelect={() => toggleSelection(item.id)}
                                onFocus={() => setFocusedItemIndex(index)}
                                onOpenDetail={() => openDetailPanel(item)}
                                onToggleDuplicate={() => toggleDuplicateStatus(item.id)}
                                onScore={(score) => handleScoreClick(item, score)}
                                onSaveToDb={() => handleDbUpdate(item)}
                                onRollback={() => handleDbRollback(item)}
                                onDelete={() => initiateDelete([item.id])}
                                onEditQuery={() => startEditing(item.id, OutputFieldName.Query, item.query || (item as any).QUERY || item.full_seed || '')}
                                onEditReasoning={() => startEditing(item.id, OutputFieldName.Reasoning, item.reasoning)}
                                onEditAnswer={() => startEditing(item.id, OutputFieldName.Answer, item.answer)}
                                onRewriteQuery={() => void handleFieldRewrite(item.id, VerifierRewriteTarget.Query)}
                                onRewriteReasoning={() => void handleFieldRewrite(item.id, VerifierRewriteTarget.Reasoning)}
                                onRewriteAnswer={() => void handleFieldRewrite(item.id, VerifierRewriteTarget.Answer)}
                                isRewritingQuery={rewritingField?.itemId === item.id && rewritingField.field === VerifierRewriteTarget.Query}
                                isRewritingReasoning={rewritingField?.itemId === item.id && rewritingField.field === VerifierRewriteTarget.Reasoning}
                                isRewritingAnswer={rewritingField?.itemId === item.id && rewritingField.field === VerifierRewriteTarget.Answer}
                                streamingContent={streamingContent}
                            />
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
