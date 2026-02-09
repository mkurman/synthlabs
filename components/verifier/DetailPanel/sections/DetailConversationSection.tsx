import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Bot, Brain, Check, X, Sparkles, Trash2, ChevronLeft, ChevronRight, MessageCircle, Filter } from 'lucide-react';
import { VerifierItem } from '../../../../types';
import { VerifierRewriteTarget, ChatRole } from '../../../../interfaces/enums';
import AutoResizeTextarea from '../../../AutoResizeTextarea';
import ReasoningHighlighter from '../../../ReasoningHighlighter';
import MarkdownRenderer from '../../../MarkdownRenderer';
import { parseThinkTagsForDisplay, sanitizeReasoningContent } from '../../../../utils/thinkTagParser';

interface DetailConversationSectionProps {
    item: VerifierItem;
    editState: { field: string; value: string; messageIndex?: number } | null;
    expandedMessages: Set<number>;
    messageRewriteDropdownIndex: number | null;
    messageRewriteStates: Record<string, { field: VerifierRewriteTarget; content: string; reasoningContent?: string }>;
    activeMessageIndex?: number;
    onActiveMessageChange?: (index: number) => void;
    onEditStart: (field: string, value: string, messageIndex?: number) => void;
    onEditChange: (value: string) => void;
    onEditSave: () => void;
    onEditCancel: () => void;
    onToggleMessageExpand: (index: number) => void;
    onRewriteMessage?: (item: VerifierItem, messageIndex: number) => void;
    onRewriteMessageReasoning?: (item: VerifierItem, messageIndex: number) => void;
    onRewriteMessageBoth?: (item: VerifierItem, messageIndex: number) => void;
    onRewriteQuery?: (item: VerifierItem, messageIndex: number) => void;
    onDeleteMessageFromHere?: (item: VerifierItem, messageIndex: number) => void;
    setMessageRewriteDropdownIndex: (index: number | null) => void;
}

export const DetailConversationSection: React.FC<DetailConversationSectionProps> = ({
    item,
    editState,
    expandedMessages,
    messageRewriteDropdownIndex,
    messageRewriteStates,
    activeMessageIndex: controlledActiveIndex,
    onActiveMessageChange,
    onEditStart,
    onEditChange,
    onEditSave,
    onEditCancel,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onToggleMessageExpand,
    onRewriteMessage,
    onRewriteMessageReasoning,
    onRewriteMessageBoth,
    onRewriteQuery,
    onDeleteMessageFromHere,
    setMessageRewriteDropdownIndex
}) => {
    const [internalActiveIndex, setInternalActiveIndex] = useState(0);
    const [showOnlyAssistant, setShowOnlyAssistant] = useState(false);
    const activeMessageIndex = controlledActiveIndex ?? internalActiveIndex;
    const setActiveMessageIndex = onActiveMessageChange ?? setInternalActiveIndex;

    const visibleIndices = useMemo(() => {
        if (!item.messages) return [];
        if (!showOnlyAssistant) return item.messages.map((_, idx) => idx);
        return item.messages
            .map((msg, idx) => ({ msg, idx }))
            .filter(({ msg }) => msg.role !== ChatRole.User)
            .map(({ idx }) => idx);
    }, [item.messages, showOnlyAssistant]);

    useEffect(() => {
        if (visibleIndices.length === 0) return;
        const targetIndex = visibleIndices[0];
        setActiveMessageIndex(targetIndex);
    }, [item.id, showOnlyAssistant]);

    // Guard clauses after all hooks
    const hasMessages = !!item.messages && item.messages.length > 0;
    const activeMsg = hasMessages ? item.messages![activeMessageIndex] : null;
    const hasActiveMsg = !!activeMsg;

    const getMessageRewriteState = (messageIndex: number) => {
        const key = `${item.id}:${messageIndex}`;
        return messageRewriteStates[key];
    };

    const isUser = hasActiveMsg ? activeMsg!.role === ChatRole.User : false;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isExpanded = expandedMessages.has(activeMessageIndex);
    const isEditing = editState?.field === 'message' && editState.messageIndex === activeMessageIndex;
    const isEditingReasoning = editState?.field?.startsWith('message_reasoning') && editState.messageIndex === activeMessageIndex;
    const rewriteState = getMessageRewriteState(activeMessageIndex);
    const isRewritingThis = !!rewriteState;

    const parsed = hasActiveMsg ? parseThinkTagsForDisplay(activeMsg!.content || '') : { hasThinkTags: false, reasoning: '', answer: '' };
    const msgReasoning = hasActiveMsg ? sanitizeReasoningContent(activeMsg!.reasoning_content || parsed.reasoning || '') : '';
    const msgContent = hasActiveMsg ? (parsed.hasThinkTags ? parsed.answer : activeMsg!.content) : '';

    const goToPrevious = () => {
        const currentVisibleIdx = visibleIndices.indexOf(activeMessageIndex);
        const newIdx = currentVisibleIdx <= 0 ? visibleIndices.length - 1 : currentVisibleIdx - 1;
        setActiveMessageIndex(visibleIndices[newIdx]);
    };

    const goToNext = () => {
        const currentVisibleIdx = visibleIndices.indexOf(activeMessageIndex);
        const newIdx = currentVisibleIdx >= visibleIndices.length - 1 ? 0 : currentVisibleIdx + 1;
        setActiveMessageIndex(visibleIndices[newIdx]);
    };

    // Keyboard navigation with Tab key
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Only handle Tab when not editing
        if (editState) return;
        
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                // Shift+Tab = previous message
                goToPrevious();
            } else {
                // Tab = next message
                goToNext();
            }
        }
    }, [activeMessageIndex, item.messages?.length, editState]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Handle case where there are no messages
    if (!hasMessages) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-500">
                No messages in this conversation
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Message Navigation Tabs */}
            <div className="flex items-center gap-2 p-1 bg-slate-900/50 rounded-lg overflow-x-auto">
                {item.messages!.map((msg, idx) => {
                    const isVisible = visibleIndices.includes(idx);
                    if (!isVisible) return null;
                    const isActive = idx === activeMessageIndex;
                    const isMsgUser = msg.role === ChatRole.User;
                    return (
                        <button
                            key={idx}
                            onClick={() => setActiveMessageIndex(idx)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                                isActive
                                    ? isMsgUser
                                        ? 'bg-sky-600 text-white shadow-md'
                                        : 'bg-slate-700 text-white shadow-md'
                                    : isMsgUser
                                        ? 'text-sky-400 hover:bg-sky-900/30'
                                        : 'text-slate-400 hover:bg-slate-800'
                            }`}
                        >
                            {isMsgUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                            <span>#{idx + 1}</span>
                            <span className="hidden sm:inline">{isMsgUser ? 'User' : 'Assistant'}</span>
                        </button>
                    );
                })}
                <div className="flex-1" />
                <button
                    onClick={() => setShowOnlyAssistant(!showOnlyAssistant)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                        showOnlyAssistant
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'text-slate-400 hover:bg-slate-800'
                    }`}
                    title={showOnlyAssistant ? 'Show all messages' : 'Show only assistant messages'}
                >
                    <Filter className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{showOnlyAssistant ? 'Assistant Only' : 'All Messages'}</span>
                </button>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center justify-between px-1">
                <button
                    onClick={goToPrevious}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                </button>
                <span className="text-xs text-slate-500 font-mono">
                    Message {visibleIndices.indexOf(activeMessageIndex) + 1} of {visibleIndices.length}
                    {showOnlyAssistant && <span className="text-purple-400 ml-1">(filtered)</span>}
                </span>
                <button
                    onClick={goToNext}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                    Next
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Active Message Card */}
            <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-6">
                <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ring-2 ring-offset-2 ring-offset-slate-950 ${
                        isUser
                            ? 'bg-sky-500/20 text-sky-400 ring-sky-500/30'
                            : 'bg-slate-800 text-slate-300 ring-slate-600/30'
                    }`}>
                        {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-semibold ${isUser ? 'text-sky-400' : 'text-slate-300'}`}>
                                    {isUser ? 'User' : 'Assistant'}
                                </span>
                                <span className="text-xs text-slate-500 font-mono">
                                    Message #{activeMessageIndex + 1}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                {isEditing ? (
                                    <>
                                        <button
                                            onClick={onEditSave}
                                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-900/30 rounded transition-colors"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            Save
                                        </button>
                                        <button
                                            onClick={onEditCancel}
                                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => onEditStart('message', activeMsg!.content || '', activeMessageIndex)}
                                            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                                        >
                                            Edit
                                        </button>
                                        {!isUser && onRewriteMessage && (
                                            <div className="relative">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setMessageRewriteDropdownIndex(messageRewriteDropdownIndex === activeMessageIndex ? null : activeMessageIndex); }}
                                                    className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-sky-400 hover:bg-sky-900/30 rounded transition-colors"
                                                >
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    Rewrite
                                                </button>
                                                {messageRewriteDropdownIndex === activeMessageIndex && (
                                                    <>
                                                        <div
                                                            className="absolute right-0 top-full mt-1 bg-slate-950 border border-slate-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px]"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <button
                                                                onClick={() => { setMessageRewriteDropdownIndex(null); onRewriteMessage(item, activeMessageIndex); }}
                                                                className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                                                            >
                                                                Answer Only
                                                            </button>
                                                            {onRewriteMessageReasoning && (
                                                                <button
                                                                    onClick={() => { setMessageRewriteDropdownIndex(null); onRewriteMessageReasoning(item, activeMessageIndex); }}
                                                                    className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                                                                >
                                                                    Reasoning Only
                                                                </button>
                                                            )}
                                                            {onRewriteMessageBoth && (
                                                                <button
                                                                    onClick={() => { setMessageRewriteDropdownIndex(null); onRewriteMessageBoth(item, activeMessageIndex); }}
                                                                    className="w-full px-3 py-2 text-left text-xs text-sky-400 hover:bg-slate-800 border-t border-slate-800"
                                                                >
                                                                    Both Together
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div
                                                            className="fixed inset-0 z-40"
                                                            onClick={(e) => { e.stopPropagation(); setMessageRewriteDropdownIndex(null); }}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {isUser && onRewriteQuery && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onRewriteQuery(item, activeMessageIndex); }}
                                                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-sky-400 hover:bg-sky-900/30 rounded transition-colors"
                                            >
                                                <Sparkles className="w-3.5 h-3.5" />
                                                Rewrite
                                            </button>
                                        )}
                                        {onDeleteMessageFromHere && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDeleteMessageFromHere(item, activeMessageIndex); }}
                                                className="p-1.5 text-red-400 hover:bg-red-900/30 rounded transition-colors"
                                                title="Delete from here"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Reasoning Section (for Assistant) */}
                        {!isUser && (
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Brain className="w-4 h-4 text-purple-400" />
                                        <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                                            Reasoning
                                        </span>
                                    </div>
                                    {!isEditingReasoning && !isRewritingThis && (
                                        <div className="flex items-center gap-1">
                                            {msgReasoning ? (
                                                <>
                                                    <button
                                                        onClick={() => onEditStart('message_reasoning', msgReasoning, activeMessageIndex)}
                                                        className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 hover:bg-slate-800 rounded transition-colors"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => onEditStart('message_reasoning_delete', '', activeMessageIndex)}
                                                        className="text-xs text-red-500 hover:text-red-300 px-2 py-1 hover:bg-red-900/30 rounded transition-colors"
                                                    >
                                                        Delete
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => onEditStart('message_reasoning', '', activeMessageIndex)}
                                                    className="flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-300 px-2 py-1 hover:bg-emerald-900/30 rounded transition-colors"
                                                >
                                                    <Brain className="w-3 h-3" />
                                                    Add Reasoning
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className={`bg-purple-950/10 border border-purple-900/20 rounded-lg p-4 ${isEditingReasoning ? '' : 'max-h-64 overflow-y-auto'}`}>
                                    {isEditingReasoning ? (
                                        editState?.field === 'message_reasoning_delete' ? (
                                            <div className="text-center py-4">
                                                <p className="text-sm text-slate-400 mb-3">Delete this reasoning content?</p>
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={onEditSave}
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/30 rounded"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        Delete
                                                    </button>
                                                    <button
                                                        onClick={onEditCancel}
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <AutoResizeTextarea
                                                    value={editState?.value ?? ''}
                                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onEditChange(e.target.value)}
                                                    className="w-full bg-slate-950 border border-sky-500/40 rounded-lg p-3 text-sm text-slate-100 font-mono outline-none min-h-[200px] leading-relaxed"
                                                    autoFocus
                                                />
                                                <div className="flex items-center justify-end gap-2 mt-2">
                                                    <button
                                                        onClick={onEditSave}
                                                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-900/30 rounded"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={onEditCancel}
                                                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                        Cancel
                                                    </button>
                                                </div>
                                            </>
                                        )
                                    ) : isRewritingThis && (
                                        rewriteState?.field === VerifierRewriteTarget.MessageReasoning ||
                                        (rewriteState?.field === VerifierRewriteTarget.MessageBoth && rewriteState.reasoningContent)
                                    ) ? (
                                        <p className="text-sm text-sky-300 font-mono whitespace-pre-wrap animate-pulse leading-relaxed">
                                            {rewriteState.reasoningContent || rewriteState.content}
                                            <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                                        </p>
                                    ) : msgReasoning ? (
                                        <div className="text-sm text-slate-400 font-mono leading-relaxed">
                                            <ReasoningHighlighter text={msgReasoning} />
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500 italic">No reasoning content</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Message Content */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <MessageCircle className="w-4 h-4 text-slate-400" />
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    Content
                                </span>
                            </div>
                            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4">
                                {isEditing ? (
                                    <AutoResizeTextarea
                                        value={editState.value}
                                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onEditChange(e.target.value)}
                                        className="w-full bg-slate-950/60 border border-sky-500/40 rounded-lg p-3 text-inherit outline-none min-h-[150px] text-sm leading-relaxed focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500/60 transition-all"
                                        autoFocus
                                    />
                                ) : isRewritingThis && (
                                    rewriteState?.field === VerifierRewriteTarget.MessageAnswer ||
                                    rewriteState?.field === VerifierRewriteTarget.MessageQuery ||
                                    (rewriteState?.field === VerifierRewriteTarget.MessageBoth && rewriteState.content && !rewriteState.reasoningContent)
                                ) ? (
                                    <p className="text-sm text-sky-300 animate-pulse whitespace-pre-wrap leading-relaxed">
                                        {rewriteState.content}
                                        <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                                    </p>
                                ) : isUser ? (
                                    <p className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
                                        {msgContent || '(No content)'}
                                    </p>
                                ) : (
                                    <div className="text-sm text-slate-100 leading-relaxed prose prose-invert prose-sm max-w-none">
                                        <MarkdownRenderer content={msgContent || '(No content)'} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DetailConversationSection;
