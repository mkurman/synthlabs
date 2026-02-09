import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { VerifierItem } from '../../../types';
import { VerifierRewriteTarget, VerifierDataSource, ChatRole } from '../../../interfaces/enums';
import { parseThinkTagsForDisplay } from '../../../utils/thinkTagParser';
import DetailPanelHeader from './components/DetailPanelHeader';
import DetailSectionNav from './components/DetailSectionNav';
import DetailPanelFooter from './components/DetailPanelFooter';
import DetailQuerySection from './sections/DetailQuerySection';
import DetailReasoningSection from './sections/DetailReasoningSection';
import DetailAnswerSection from './sections/DetailAnswerSection';
import DetailConversationSection from './sections/DetailConversationSection';
import { useDetailNavigation } from './hooks/useDetailNavigation';
import { useDetailPersistence } from './hooks/useDetailPersistence';

interface DetailPanelProps {
    item: VerifierItem | null;
    items: VerifierItem[];
    allData?: VerifierItem[];
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (item: VerifierItem) => void;
    onSave: (item: VerifierItem, updates: Partial<VerifierItem>) => void;
    onScore: (item: VerifierItem, score: number) => void;
    onAutoscore?: (itemId: string) => Promise<void>;
    onRewriteField: (item: VerifierItem, field: VerifierRewriteTarget) => void;
    onRewriteMessage?: (item: VerifierItem, messageIndex: number) => void;
    onRewriteMessageReasoning?: (item: VerifierItem, messageIndex: number) => void;
    onRewriteMessageBoth?: (item: VerifierItem, messageIndex: number) => void;
    onRewriteQuery?: (item: VerifierItem, messageIndex: number) => void;
    onDeleteMessageFromHere?: (item: VerifierItem, messageIndex: number) => void;
    onDeleteItem?: (item: VerifierItem) => void;
    onDbUpdate?: (item: VerifierItem) => Promise<void>;
    onDbRollback?: (item: VerifierItem) => Promise<void>;
    onFetchMore?: () => Promise<void>;
    isFetchingMore?: boolean;
    hasMoreData?: boolean;
    totalInDb?: number;
    isAutoscoring?: boolean;
    rewritingField?: { itemId: string; field: VerifierRewriteTarget } | null;
    streamingContent?: string;
    messageRewriteStates?: Record<string, { field: VerifierRewriteTarget; content: string; reasoningContent?: string }>;
    dataSource?: string;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
    item,
    items,
    allData = [],
    isOpen,
    onClose,
    onNavigate,
    onSave,
    onScore,
    onAutoscore,
    onRewriteField,
    onRewriteMessage,
    onRewriteMessageReasoning,
    onRewriteMessageBoth,
    onRewriteQuery,
    onDeleteMessageFromHere,
    onDeleteItem,
    onDbUpdate,
    onDbRollback,
    onFetchMore,
    isFetchingMore = false,
    hasMoreData = false,
    totalInDb = 0,
    isAutoscoring = false,
    rewritingField,
    streamingContent = '',
    messageRewriteStates = {},
    dataSource
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [activeSection, setActiveSection] = useState<'query' | 'reasoning' | 'answer' | 'conversation'>('query');
    const [editState, setEditState] = useState<{ field: string; value: string; messageIndex?: number } | null>(null);
    const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
    const [showRewriteDropdown, setShowRewriteDropdown] = useState(false);
    const [messageRewriteDropdownIndex, setMessageRewriteDropdownIndex] = useState<number | null>(null);
    const [activeMessageIndex, setActiveMessageIndex] = useState(0);

    const isEditing = !!editState;

    const rewriteCallbacksRef = useRef({
        onRewriteField,
        onRewriteMessage,
        onRewriteMessageReasoning,
        onRewriteMessageBoth,
        onRewriteQuery
    });
    rewriteCallbacksRef.current = {
        onRewriteField,
        onRewriteMessage,
        onRewriteMessageReasoning,
        onRewriteMessageBoth,
        onRewriteQuery
    };

    const isRewritingRef = useRef(false);
    useEffect(() => {
        isRewritingRef.current = !!rewritingField;
    }, [rewritingField]);
    // Ensure isMultiTurn is strictly boolean and handles edge cases
    const isMultiTurn = !!(item?.isMultiTurn && Array.isArray(item.messages) && item.messages.length > 0);

    // Navigation hook
    const { currentIndex, hasPrevious, hasNext, goToPrevious, goToNext } = useDetailNavigation({
        items,
        currentItem: item,
        onNavigate,
        isOpen,
        isEditing
    });

    // Persistence hook
    const { isSaving, isRollingBack, handleSave, handleRollback } = useDetailPersistence({
        item,
        onDbUpdate,
        onDbRollback
    });

    // Reset state when item changes
    useEffect(() => {
        setEditState(null);
        setExpandedMessages(new Set());
        setShowRewriteDropdown(false);
        setMessageRewriteDropdownIndex(null);
        if (isMultiTurn) {
            setActiveSection('conversation');
        } else {
            setActiveSection('query');
        }
    }, [item?.id, isMultiTurn]);

    // Keyboard shortcuts (ESC, Ctrl+S, Tab, Ctrl+R/A/B for rewrite)
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (editState) {
                    setEditState(null);
                } else {
                    onClose();
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (editState && item) {
                    handleSaveEdit();
                } else if (item?.hasUnsavedChanges) {
                    handleSave();
                }
            }
            if (e.key === 'Tab' && !editState) {
                e.preventDefault();
                const sections: Array<'query' | 'reasoning' | 'answer' | 'conversation'> =
                    isMultiTurn
                        ? ['conversation', 'query']
                        : ['query', 'reasoning', 'answer'];
                const currentIdx = sections.indexOf(activeSection);
                const nextIndex = e.shiftKey
                    ? (currentIdx - 1 + sections.length) % sections.length
                    : (currentIdx + 1) % sections.length;
                setActiveSection(sections[nextIndex]);
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A') && !editState && item && !isAutoscoring && onAutoscore) {
                e.preventDefault();
                onAutoscore(item.id);
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'c' || e.key === 'C') && !editState && item) {
                e.preventDefault();
                if (isMultiTurn) {
                    const msg = item.messages?.[activeMessageIndex];
                    if (msg) {
                        const isUser = msg.role === ChatRole.User;
                        const updates: Partial<VerifierItem> = {};
                        const newMessages = [...item.messages!];
                        if (isUser) {
                            newMessages[activeMessageIndex] = { ...msg, content: '' };
                        } else {
                            newMessages[activeMessageIndex] = { ...msg, content: '', reasoning_content: undefined };
                        }
                        updates.messages = newMessages;
                        onSave(item, updates);
                    }
                } else {
                    const updates: Partial<VerifierItem> = {};
                    if (activeSection === 'query') {
                        updates.query = '';
                    } else if (activeSection === 'reasoning') {
                        updates.reasoning = '';
                        updates.reasoning_content = '';
                    } else if (activeSection === 'answer') {
                        updates.answer = '';
                    }
                    if (Object.keys(updates).length > 0) {
                        onSave(item, updates);
                    }
                }
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !editState && item && !isRewritingRef.current) {
                const callbacks = rewriteCallbacksRef.current;
                if (isMultiTurn) {
                    const msg = item.messages?.[activeMessageIndex];
                    if (!msg) return;
                    const isUser = msg.role === ChatRole.User;

                    if (e.key === 'q' || e.key === 'Q') {
                        e.preventDefault();
                        if (isUser) {
                            callbacks.onRewriteQuery?.(item, activeMessageIndex);
                        }
                    } else if (e.key === 'r' || e.key === 'R') {
                        e.preventDefault();
                        if (!isUser) {
                            callbacks.onRewriteMessageReasoning?.(item, activeMessageIndex);
                        }
                    } else if (e.key === 'a' || e.key === 'A') {
                        e.preventDefault();
                        if (!isUser) {
                            callbacks.onRewriteMessage?.(item, activeMessageIndex);
                        }
                    } else if (e.key === 'b' || e.key === 'B') {
                        e.preventDefault();
                        if (!isUser) {
                            callbacks.onRewriteMessageBoth?.(item, activeMessageIndex);
                        }
                    }
                } else {
                    if (e.key === 'r' || e.key === 'R') {
                        e.preventDefault();
                        callbacks.onRewriteField(item, VerifierRewriteTarget.Reasoning);
                    } else if (e.key === 'a' || e.key === 'A') {
                        e.preventDefault();
                        callbacks.onRewriteField(item, VerifierRewriteTarget.Answer);
                    } else if (e.key === 'b' || e.key === 'B') {
                        e.preventDefault();
                        callbacks.onRewriteField(item, VerifierRewriteTarget.Both);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, editState, activeSection, item, isMultiTurn, rewritingField, activeMessageIndex]);

    // Focus trap
    useEffect(() => {
        if (!isOpen || !panelRef.current) return;
        
        const focusableElements = panelRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        const handleTabKey = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            
            if (e.shiftKey && document.activeElement === firstElement) {
                e.preventDefault();
                lastElement?.focus();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
                e.preventDefault();
                firstElement?.focus();
            }
        };

        firstElement?.focus();
        document.addEventListener('keydown', handleTabKey);
        return () => document.removeEventListener('keydown', handleTabKey);
    }, [isOpen]);

    const handleStartEdit = (field: string, value: string, messageIndex?: number) => {
        setEditState({ field, value, messageIndex });
    };

    const handleSaveEdit = () => {
        if (!item || !editState) return;
        
        console.log('[DetailPanel] handleSaveEdit - field:', editState.field, 'messageIndex:', editState.messageIndex);
        console.log('[DetailPanel] handleSaveEdit - new value:', editState.value?.substring(0, 100));
        
        const updates: Partial<VerifierItem> = {};
        
        if (editState.field === 'query') {
            updates.query = editState.value;
        } else if (editState.field === 'reasoning') {
            updates.reasoning = editState.value;
            updates.reasoning_content = editState.value;
        } else if (editState.field === 'answer') {
            updates.answer = editState.value;
        } else if (editState.field === 'message' && typeof editState.messageIndex === 'number' && item.messages) {
            const newMessages = [...item.messages];
            const editedMessage = newMessages[editState.messageIndex];
            
            // Parse think tags to separate reasoning from content
            const parsed = parseThinkTagsForDisplay(editState.value);
            
            if (parsed.hasThinkTags) {
                // Update both reasoning_content and content separately
                newMessages[editState.messageIndex] = {
                    ...editedMessage,
                    reasoning_content: parsed.reasoning || undefined,
                    content: parsed.answer
                };
            } else {
                // No think tags - update content only, preserve existing reasoning_content
                newMessages[editState.messageIndex] = {
                    ...editedMessage,
                    content: editState.value
                };
            }
            
            updates.messages = newMessages;
        } else if (editState.field === 'message_reasoning' && typeof editState.messageIndex === 'number' && item.messages) {
            // Direct reasoning edit - update only reasoning_content (empty string is allowed to clear reasoning)
            console.log('[DetailPanel] Saving message_reasoning at index:', editState.messageIndex, 'value length:', editState.value?.length);
            const newMessages = [...item.messages];
            newMessages[editState.messageIndex] = {
                ...newMessages[editState.messageIndex],
                reasoning_content: editState.value  // Allow empty string to clear reasoning
            };
            updates.messages = newMessages;
            console.log('[DetailPanel] Updated reasoning_content, messages length:', newMessages.length);
        } else if (editState.field === 'message_reasoning_delete' && typeof editState.messageIndex === 'number' && item.messages) {
            // Delete reasoning by setting it to undefined
            console.log('[DetailPanel] Deleting message_reasoning at index:', editState.messageIndex);
            const newMessages = [...item.messages];
            newMessages[editState.messageIndex] = {
                ...newMessages[editState.messageIndex],
                reasoning_content: undefined  // Delete the field entirely
            };
            updates.messages = newMessages;
        } else {
            console.log('[DetailPanel] No matching condition - field:', editState.field, 'hasMessages:', !!item.messages, 'msgIdx:', editState.messageIndex, 'typeof:', typeof editState.messageIndex);
        }
        
        console.log('[DetailPanel] Calling onSave with updates:', Object.keys(updates));
        onSave(item, updates);
        setEditState(null);
    };

    const toggleMessageExpand = (index: number) => {
        setExpandedMessages(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    // Debug: log item changes
    useEffect(() => {
        if (item) {
            console.log('[DetailPanel] item prop updated:', item.id);
            console.log('[DetailPanel] isMultiTurn:', isMultiTurn, 'item.isMultiTurn:', item.isMultiTurn);
            console.log('[DetailPanel] has messages:', !!item.messages, 'count:', item.messages?.length);
            console.log('[DetailPanel] query:', item.query?.substring(0, 50));
            console.log('[DetailPanel] reasoning:', item.reasoning?.substring(0, 50));
            console.log('[DetailPanel] answer:', item.answer?.substring(0, 50));
            console.log('[DetailPanel] activeSection:', activeSection);
        }
    }, [item?.id, item?.reasoning, item?.answer, isMultiTurn, activeSection]);
    
    // Debug: log section changes
    useEffect(() => {
        console.log('[DetailPanel] activeSection changed:', activeSection);
    }, [activeSection]);

    if (!isOpen || !item) return null;

    const showPersistenceButtons = dataSource === VerifierDataSource.Database;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={editState ? undefined : onClose}
            />
            
            {/* Panel */}
            <div 
                ref={panelRef}
                className="relative w-full max-w-5xl max-h-[90vh] min-h-[600px] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col"
            >
                {/* Header */}
                <DetailPanelHeader
                    item={item}
                    currentIndex={currentIndex}
                    totalItems={items.length}
                    totalInStack={allData.length}
                    totalInDb={totalInDb}
                    hasPrevious={hasPrevious}
                    hasNext={hasNext}
                    canFetchMore={hasMoreData}
                    isFetchingMore={isFetchingMore}
                    onPrevious={goToPrevious}
                    onNext={goToNext}
                    onClose={onClose}
                    onSave={showPersistenceButtons ? handleSave : undefined}
                    onRollback={showPersistenceButtons ? handleRollback : undefined}
                    onScore={(score) => onScore(item, score)}
                    onDelete={onDeleteItem ? () => onDeleteItem(item) : undefined}
                    onFetchMore={onFetchMore}
                    onAutoscore={onAutoscore ? () => onAutoscore(item.id) : undefined}
                    isSaving={isSaving}
                    isRollingBack={isRollingBack}
                    isAutoscoring={isAutoscoring}
                    showPersistenceButtons={!!showPersistenceButtons}
                />
                
                {/* Section Navigation */}
                <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/30">
                    <DetailSectionNav
                        activeSection={activeSection}
                        onSectionChange={setActiveSection}
                        isMultiTurn={!!isMultiTurn}
                        messageCount={item.messages?.length}
                    />
                </div>
                
                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeSection === 'query' && !isMultiTurn && (
                        <DetailQuerySection
                            item={item}
                            editState={editState}
                            onEditStart={handleStartEdit}
                            onEditChange={(val) => setEditState(prev => prev ? { ...prev, value: val } : null)}
                            onEditSave={handleSaveEdit}
                            onEditCancel={() => setEditState(null)}
                            onRewrite={() => onRewriteField(item, VerifierRewriteTarget.Query)}
                            isRewriting={rewritingField?.itemId === item.id && rewritingField?.field === VerifierRewriteTarget.Query}
                            streamingContent={streamingContent}
                            showRewriteDropdown={showRewriteDropdown}
                            setShowRewriteDropdown={setShowRewriteDropdown}
                        />
                    )}
                    
                    {activeSection === 'reasoning' && !isMultiTurn && (
                        <DetailReasoningSection
                            item={item}
                            editState={editState}
                            onEditStart={handleStartEdit}
                            onEditChange={(val) => setEditState(prev => prev ? { ...prev, value: val } : null)}
                            onEditSave={handleSaveEdit}
                            onEditCancel={() => setEditState(null)}
                            onRewrite={(field) => onRewriteField(item, field)}
                            isRewriting={rewritingField?.itemId === item.id}
                            rewritingField={rewritingField}
                            streamingContent={streamingContent}
                            showRewriteDropdown={showRewriteDropdown}
                            setShowRewriteDropdown={setShowRewriteDropdown}
                        />
                    )}
                    
                    {activeSection === 'answer' && !isMultiTurn && (
                        <DetailAnswerSection
                            item={item}
                            editState={editState}
                            onEditStart={handleStartEdit}
                            onEditChange={(val) => setEditState(prev => prev ? { ...prev, value: val } : null)}
                            onEditSave={handleSaveEdit}
                            onEditCancel={() => setEditState(null)}
                            onRewrite={() => onRewriteField(item, VerifierRewriteTarget.Answer)}
                            isRewriting={rewritingField?.itemId === item.id && rewritingField?.field === VerifierRewriteTarget.Answer}
                            rewritingField={rewritingField}
                            streamingContent={streamingContent}
                        />
                    )}
                    
                    {(activeSection === 'conversation' || isMultiTurn) && (
                        <DetailConversationSection
                            item={item}
                            editState={editState}
                            expandedMessages={expandedMessages}
                            messageRewriteDropdownIndex={messageRewriteDropdownIndex}
                            messageRewriteStates={messageRewriteStates}
                            activeMessageIndex={activeMessageIndex}
                            onActiveMessageChange={setActiveMessageIndex}
                            onEditStart={handleStartEdit}
                            onEditChange={(val) => setEditState(prev => prev ? { ...prev, value: val } : null)}
                            onEditSave={handleSaveEdit}
                            onEditCancel={() => setEditState(null)}
                            onToggleMessageExpand={toggleMessageExpand}
                            onRewriteMessage={onRewriteMessage}
                            onRewriteMessageReasoning={onRewriteMessageReasoning}
                            onRewriteMessageBoth={onRewriteMessageBoth}
                            onRewriteQuery={onRewriteQuery}
                            onDeleteMessageFromHere={onDeleteMessageFromHere}
                            setMessageRewriteDropdownIndex={setMessageRewriteDropdownIndex}
                        />
                    )}
                </div>
                
                {/* Footer */}
                <DetailPanelFooter
                    modelUsed={item.modelUsed}
                    sessionUid={item.sessionUid}
                    isDeep={!!item.deepMetadata}
                    hasUnsavedChanges={item.hasUnsavedChanges}
                    isMultiTurn={isMultiTurn}
                />
            </div>
        </div>,
        document.body
    );
};

export default DetailPanel;
