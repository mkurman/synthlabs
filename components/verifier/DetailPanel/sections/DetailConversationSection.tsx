import React from 'react';
import { User, Bot, Brain, Check, X, Sparkles, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { VerifierItem } from '../../../../types';
import { VerifierRewriteTarget, ChatRole } from '../../../../interfaces/enums';
import AutoResizeTextarea from '../../../AutoResizeTextarea';
import ReasoningHighlighter from '../../../ReasoningHighlighter';
import { parseThinkTagsForDisplay, sanitizeReasoningContent } from '../../../../utils/thinkTagParser';

interface DetailConversationSectionProps {
    item: VerifierItem;
    editState: { field: string; value: string; messageIndex?: number } | null;
    expandedMessages: Set<number>;
    messageRewriteDropdownIndex: number | null;
    messageRewriteStates: Record<string, { field: VerifierRewriteTarget; content: string; reasoningContent?: string }>;
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
    onEditStart,
    onEditChange,
    onEditSave,
    onEditCancel,
    onToggleMessageExpand,
    onRewriteMessage,
    onRewriteMessageReasoning,
    onRewriteMessageBoth,
    onRewriteQuery,
    onDeleteMessageFromHere,
    setMessageRewriteDropdownIndex
}) => {
    if (!item.messages) return null;

    const getMessageRewriteState = (messageIndex: number) => {
        const key = `${item.id}:${messageIndex}`;
        return messageRewriteStates[key];
    };

    return (
        <div className="space-y-4">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {item.messages.map((msg, idx) => {
                    const isUser = msg.role === ChatRole.User;
                    const isExpanded = expandedMessages.has(idx);
                    const isEditing = editState?.field === 'message' && editState.messageIndex === idx;
    const isEditingReasoning = editState?.field?.startsWith('message_reasoning') && editState.messageIndex === idx;
                    const rewriteState = getMessageRewriteState(idx);
                    const isRewritingThis = !!rewriteState;
                    
                    const parsed = parseThinkTagsForDisplay(msg.content || '');
                    const msgReasoning = sanitizeReasoningContent(msg.reasoning_content || parsed.reasoning || '');
                    const msgContent = parsed.hasThinkTags ? parsed.answer : msg.content;

                    return (
                        <div 
                            key={idx}
                            className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
                        >
                            <div className="shrink-0 flex flex-col items-center gap-1">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    isUser ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-300'
                                }`}>
                                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                </div>
                                <span className="text-[10px] text-slate-500">#{idx + 1}</span>
                            </div>
                            
                            <div className={`flex-1 ${isUser ? 'text-right' : ''}`}>
                                <div className={`inline-block w-full max-w-[90%] text-left rounded-lg border ${
                                    isUser 
                                        ? 'bg-sky-950/30 border-sky-800/50' 
                                        : 'bg-slate-950/50 border-slate-800'
                                } p-4`}>
                                    {/* Message Header */}
                                    <div className="flex items-center justify-between mb-3">
                                        <span className={`text-xs font-medium ${
                                            isUser ? 'text-sky-400' : 'text-slate-400'
                                        }`}>
                                            {isUser ? 'User' : 'Assistant'}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {isEditing ? (
                                                <>
                                                    <button
                                                        onClick={onEditSave}
                                                        className="p-1 text-emerald-400 hover:bg-emerald-900/30 rounded"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={onEditCancel}
                                                        className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            // Edit raw message content without <think> wrapping
                                                            onEditStart('message', msg.content || '', idx);
                                                        }}
                                                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                                                    >
                                                        Edit
                                                    </button>
                                                    {!isUser && !msgReasoning && (
                                                        <button
                                                            onClick={() => onEditStart('message_reasoning', '', idx)}
                                                            className="p-1 text-emerald-500 hover:bg-emerald-900/30 rounded"
                                                            title="Add Reasoning"
                                                        >
                                                            <Brain className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    {!isUser && onRewriteMessage && (
                                                        <div className="relative">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setMessageRewriteDropdownIndex(messageRewriteDropdownIndex === idx ? null : idx); }}
                                                                className="p-1 text-sky-400 hover:bg-sky-900/30 rounded"
                                                            >
                                                                <Sparkles className="w-3.5 h-3.5" />
                                                            </button>
                                                            {messageRewriteDropdownIndex === idx && (
                                                                <div 
                                                                    className="absolute right-0 top-full mt-1 bg-slate-950 border border-slate-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px]"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <button
                                                                        onClick={() => { setMessageRewriteDropdownIndex(null); onRewriteMessage(item, idx); }}
                                                                        className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                                                                    >
                                                                        Answer Only
                                                                    </button>
                                                                    {onRewriteMessageReasoning && (
                                                                        <button
                                                                            onClick={() => { setMessageRewriteDropdownIndex(null); onRewriteMessageReasoning(item, idx); }}
                                                                            className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                                                                        >
                                                                            Reasoning Only
                                                                        </button>
                                                                    )}
                                                                    {onRewriteMessageBoth && (
                                                                        <button
                                                                            onClick={() => { setMessageRewriteDropdownIndex(null); onRewriteMessageBoth(item, idx); }}
                                                                            className="w-full px-3 py-2 text-left text-xs text-sky-400 hover:bg-slate-800 border-t border-slate-800"
                                                                        >
                                                                            Both Together
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {messageRewriteDropdownIndex === idx && (
                                                                <div 
                                                                    className="fixed inset-0 z-40" 
                                                                    onClick={(e) => { e.stopPropagation(); setMessageRewriteDropdownIndex(null); }} 
                                                                />
                                                            )}
                                                        </div>
                                                    )}
                                                    {isUser && onRewriteQuery && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onRewriteQuery(item, idx); }}
                                                            className="p-1 text-sky-400 hover:bg-sky-900/30 rounded"
                                                        >
                                                            <Sparkles className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    {onDeleteMessageFromHere && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onDeleteMessageFromHere(item, idx); }}
                                                            className="p-1 text-red-400 hover:bg-red-900/30 rounded"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Reasoning Toggle for Assistant Messages */}
                                    {!isUser && (
                                        msgReasoning ||
                                        isEditingReasoning ||
                                        (isRewritingThis && rewriteState?.field === VerifierRewriteTarget.MessageReasoning) ||
                                        (isRewritingThis && rewriteState?.field === VerifierRewriteTarget.MessageBoth && rewriteState.reasoningContent)
                                    ) && !isEditing && (
                                        <div className="mb-2">
                                            <div className="flex items-center justify-between mb-2">
                                                <button
                                                    onClick={() => onToggleMessageExpand(idx)}
                                                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors uppercase font-bold tracking-wider"
                                                >
                                                    <Brain className="w-3.5 h-3.5" />
                                                    {msgReasoning ? 'Thoughts' : 'No Reasoning'}
                                                    {isExpanded ? (
                                                        <ChevronUp className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <ChevronDown className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                                {isExpanded && !isRewritingThis && !editState && (
                                                    <div className="flex items-center gap-1">
                                                        {msgReasoning ? (
                                                            <>
                                                                <button
                                                                    onClick={() => onEditStart('message_reasoning', msgReasoning, idx)}
                                                                    className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 hover:bg-slate-800 rounded transition-colors"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => onEditStart('message_reasoning_delete', '', idx)}
                                                                    className="text-xs text-red-500 hover:text-red-300 px-2 py-1 hover:bg-red-900/30 rounded transition-colors"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => onEditStart('message_reasoning', '', idx)}
                                                                className="text-xs text-emerald-500 hover:text-emerald-300 px-2 py-1 hover:bg-emerald-900/30 rounded transition-colors"
                                                            >
                                                                + Add Reasoning
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {(isExpanded || isEditingReasoning || (isRewritingThis && (
                                                rewriteState?.field === VerifierRewriteTarget.MessageReasoning ||
                                                (rewriteState?.field === VerifierRewriteTarget.MessageBoth && rewriteState.reasoningContent)
                                            ))) && (
                                                <div className={`bg-slate-950/60 border border-slate-800/70 rounded-lg p-3 overflow-y-auto ${isEditingReasoning ? 'max-h-[70vh]' : 'max-h-64'}`}>
                                                    {isEditingReasoning ? (
                                                        editState?.field === 'message_reasoning_delete' ? (
                                                            // Delete confirmation
                                                            <div className="text-center py-4">
                                                                <p className="text-xs text-slate-400 mb-3">Delete this reasoning content?</p>
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
                                                            // Edit reasoning
                                                            <>
                                                                <AutoResizeTextarea
                                                                    value={editState?.value ?? ''}
                                                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onEditChange(e.target.value)}
                                                                    className="w-full bg-slate-950 border border-sky-500/40 rounded-lg p-3 text-xs text-slate-100 font-mono outline-none min-h-[50vh] leading-relaxed"
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
                                                        <p className="text-xs text-sky-300 font-mono whitespace-pre-wrap animate-pulse leading-relaxed">
                                                            {rewriteState.reasoningContent || rewriteState.content}
                                                            <span className="inline-block w-2 h-3 bg-sky-400 ml-1 animate-pulse" />
                                                        </p>
                                                    ) : (
                                                        <div className="text-xs text-slate-400 font-mono leading-relaxed">
                                                            <ReasoningHighlighter text={msgReasoning || ''} />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Message Content */}
                                    {isEditing ? (
                                        <AutoResizeTextarea
                                            value={editState.value}
                                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onEditChange(e.target.value)}
                                            className="w-full bg-slate-950/60 border border-sky-500/40 rounded-lg p-3 text-inherit outline-none min-h-[150px] text-sm leading-relaxed"
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
                                    ) : (
                                        <p className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
                                            {msgContent || '(No content)'}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default DetailConversationSection;
