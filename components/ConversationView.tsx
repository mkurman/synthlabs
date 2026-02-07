import React, { useState } from 'react';
import { User, Bot, ChevronDown, ChevronUp, Sparkles, Settings, Edit3, RotateCcw, Check, X, Loader2, Brain, Trash2 } from 'lucide-react';
import { ChatMessage } from '../types';
import { ChatRole, StreamingField } from '../interfaces/enums';
import ReasoningHighlighter from './ReasoningHighlighter';
import { parseThinkTagsForDisplay, sanitizeReasoningContent } from '../utils/thinkTagParser';
import AutoResizeTextarea from './AutoResizeTextarea';

interface ConversationViewProps {
    messages: ChatMessage[];
    onEditStart?: (index: number, content: string) => void;
    onEditSave?: () => void;
    onEditCancel?: () => void;
    onEditChange?: (val: string) => void;
    onRewrite?: (index: number) => void;
    onRewriteReasoning?: (index: number) => void;
    onRewriteBoth?: (index: number) => void;
    onRewriteQuery?: (index: number) => void;  // For user message query rewrite
    onCancelRewrite?: (index: number) => void;  // Cancel in-progress rewrite
    onDeleteFromHere?: (index: number) => void;  // Delete this message and all after it
    editingIndex?: number;
    editValue?: string;
    rewritingByIndex?: Record<number, { content: string; reasoningContent?: string; field?: StreamingField }>;
}



// Role styling configuration
const getRoleStyles = (role: string) => {
    switch (role) {
        case 'user':
            return {
                avatar: 'bg-sky-500/15 text-sky-300',
                bubble: 'bg-slate-950/70 text-slate-100 border border-slate-700/70',
                icon: User,
                label: 'User',
                align: 'flex-row-reverse',
                textAlign: 'text-right'
            };
        case 'system':
            return {
                avatar: 'bg-amber-400/15 text-amber-300',
                bubble: 'bg-amber-500/10 text-amber-100 border border-amber-400/20',
                icon: Settings,
                label: 'System',
                align: '',
                textAlign: ''
            };
        case 'assistant':
        default:
            return {
                avatar: 'bg-slate-900/60 text-slate-100',
                bubble: 'bg-slate-950/70 text-slate-100 border border-slate-800/70',
                icon: Bot,
                label: 'Assistant',
                align: '',
                textAlign: ''
            };
    }
};

const ConversationView: React.FC<ConversationViewProps> = ({
    messages,
    onEditStart,
    onEditSave,
    onEditCancel,
    onEditChange,
    onRewrite,
    onRewriteReasoning,
    onRewriteBoth,
    onRewriteQuery,
    onCancelRewrite,
    onDeleteFromHere,
    editingIndex,
    editValue,
    rewritingByIndex
}) => {
    const [expandedReasoning, setExpandedReasoning] = useState<Set<number>>(new Set());
    const [showRewriteDropdown, setShowRewriteDropdown] = useState<number | null>(null);

    const toggleReasoning = (index: number) => {
        setExpandedReasoning(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    // Close dropdown when clicking outside
    React.useEffect(() => {
        const handleClickOutside = () => {
            setShowRewriteDropdown(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    if (!messages || messages.length === 0) {
        return (
            <div className="text-slate-400 text-sm italic p-4">
                No conversation messages.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {messages.map((msg, idx) => {
                const parsed = parseThinkTagsForDisplay(msg.content || '');
                const displayReasoning = sanitizeReasoningContent(msg.reasoning_content || parsed.reasoning || '');
                const displayContent = parsed.hasThinkTags ? parsed.answer : msg.content;

                const styles = getRoleStyles(msg.role);
                const IconComponent = styles.icon;
                const isEditing = editingIndex === idx;
                const rewriteState = rewritingByIndex?.[idx];
                const isRewritingThis = !!rewriteState;
                const rewriteStreamingContent = rewriteState?.content || '';
                const rewriteStreamingReasoningContent = rewriteState?.reasoningContent || '';
                const rewriteStreamingField = rewriteState?.field;

                return (
                    <div
                        key={`${idx}-${msg.content?.substring(0, 50) || ''}-${msg.reasoning?.substring(0, 20) || ''}`}
                        className={`group flex gap-3 ${styles.align}`}
                    >
                        {/* Avatar */}
                        <div className="shrink-0 flex flex-col items-center gap-1">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center ring-1 ring-slate-700/50 ${styles.avatar}`}
                            >
                                <IconComponent className="w-4 h-4" />
                            </div>
                            <span className="text-[9px] text-slate-500 font-mono">#{idx + 1}</span>
                        </div>

                        {/* Message Bubble */}
                        <div
                            className={`flex-1 max-w-[85%] ${styles.textAlign}`}
                        >
                            <div
                                className={`inline-block w-full text-left rounded-lg px-4 py-3 text-sm leading-relaxed relative shadow-sm ${styles.bubble}`}
                            >
                                {/* Edit/Rewrite Controls */}
                                <div className={`absolute top-2 ${msg.role === ChatRole.User ? 'left-2' : 'right-2'} ${isRewritingThis ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity flex gap-1`}>
                                    {isRewritingThis && onCancelRewrite ? (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onCancelRewrite(idx); }}
                                            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded flex items-center gap-1"
                                            title="Cancel rewrite"
                                        >
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            <X className="w-3 h-3" />
                                        </button>
                                    ) : isEditing ? (
                                        <>
                                            <button onClick={onEditSave} className="p-1 text-emerald-300 hover:bg-emerald-900/30 rounded" title="Save">
                                                <Check className="w-3 h-3" />
                                            </button>
                                            <button onClick={onEditCancel} className="p-1 text-red-300 hover:bg-red-900/30 rounded" title="Cancel">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => {
                                                    const assistantEditableContent =
                                                        msg.role === ChatRole.Assistant && displayReasoning
                                                            ? `<think>\n${displayReasoning}\n</think>\n\n${displayContent || ''}`
                                                            : msg.content;
                                                    onEditStart?.(idx, assistantEditableContent);
                                                }}
                                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-900/60 rounded"
                                                title="Edit"
                                            >
                                                <Edit3 className="w-3 h-3" />
                                            </button>
                                            {onDeleteFromHere && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDeleteFromHere(idx); }}
                                                    className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded"
                                                    title="Delete this & all below"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                            {/* User messages: simple rewrite button */}
                                            {msg.role === ChatRole.User && onRewriteQuery && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onRewriteQuery(idx); }}
                                                    className="p-1 text-slate-400 hover:text-sky-300 hover:bg-sky-900/30 rounded"
                                                    title="Rewrite Query"
                                                >
                                                    <Sparkles className="w-3 h-3" />
                                                </button>
                                            )}
                                            {/* Assistant messages: dropdown with options */}
                                            {msg.role === ChatRole.Assistant && onRewrite && (
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(showRewriteDropdown === idx ? null : idx); }}
                                                        className="p-1 text-slate-400 hover:text-sky-300 hover:bg-sky-900/30 rounded"
                                                        title="AI Rewrite"
                                                    >
                                                        <Sparkles className="w-3 h-3" />
                                                    </button>
                                                    {showRewriteDropdown === idx && (
                                                        <div
                                                            className="absolute right-0 top-full mt-1 bg-slate-950/70 border border-slate-700/70 rounded-lg shadow-2xl z-20 py-1 min-w-[140px]"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(null); onRewrite(idx); }}
                                                                className="w-full px-3 py-2 text-left text-xs text-slate-100 hover:bg-slate-900/60 flex items-center gap-2"
                                                            >
                                                                <RotateCcw className="w-3 h-3" /> Answer Only
                                                            </button>
                                                            {onRewriteReasoning && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(null); onRewriteReasoning(idx); }}
                                                                    className="w-full px-3 py-2 text-left text-xs text-slate-100 hover:bg-slate-900/60 flex items-center gap-2"
                                                                >
                                                                    <RotateCcw className="w-3 h-3" /> Reasoning Only
                                                                </button>
                                                            )}
                                                            {onRewriteBoth && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(null); onRewriteBoth(idx); }}
                                                                    className="w-full px-3 py-2 text-left text-xs text-sky-300 hover:bg-slate-900/60 flex items-center gap-2 border-t border-slate-800/70"
                                                                >
                                                                    <Sparkles className="w-3 h-3" /> Both Together
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Reasoning Toggle for Assistant Messages */}
                                {msg.role === ChatRole.Assistant && (
                                    displayReasoning ||
                                    (isRewritingThis && rewriteStreamingField === StreamingField.Reasoning) ||
                                    (isRewritingThis && rewriteStreamingField === StreamingField.Both && rewriteStreamingReasoningContent)
                                ) && !isEditing && (
                                        <div className="mt-2 text-left">
                                            <button
                                                onClick={() => toggleReasoning(idx)}
                                                className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors uppercase font-bold tracking-wider"
                                            >
                                                <Brain className="w-3 h-3" />
                                                Thoughts
                                                {expandedReasoning.has(idx) ? (
                                                    <ChevronUp className="w-3 h-3" />
                                                ) : (
                                                    <ChevronDown className="w-3 h-3" />
                                                )}
                                            </button>
                                            {(expandedReasoning.has(idx) || (isRewritingThis && (rewriteStreamingContent || rewriteStreamingReasoningContent))) && (
                                                <div className="mt-2 bg-slate-950/60 border border-slate-800/70 rounded-lg p-3 max-h-56 overflow-y-auto pr-1">
                                                    {isRewritingThis && rewriteStreamingContent && rewriteStreamingField === StreamingField.Reasoning ? (
                                                        <p className="text-[10px] text-sky-300 font-mono whitespace-pre-wrap animate-pulse">
                                                            {rewriteStreamingContent}
                                                            <span className="inline-block w-2 h-3 bg-sky-400 ml-0.5 animate-pulse" />
                                                        </p>
                                                    ) : isRewritingThis && rewriteStreamingField === StreamingField.Both && rewriteStreamingReasoningContent ? (
                                                        <p className="text-[10px] text-sky-300 font-mono whitespace-pre-wrap animate-pulse">
                                                            {rewriteStreamingReasoningContent}
                                                            {/* Show cursor only while reasoning is still actively streaming (answer hasn't started) */}
                                                            {!rewriteStreamingContent && <span className="inline-block w-2 h-3 bg-sky-400 ml-0.5 animate-pulse" />}
                                                        </p>
                                                    ) : (
                                                        <ReasoningHighlighter text={displayReasoning!} />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                {isEditing ? (
                                    <AutoResizeTextarea
                                        value={editValue || ''}
                                        onChange={e => onEditChange?.(e.target.value)}
                                        className="w-full bg-slate-950/60 border border-sky-500/40 rounded p-2 text-inherit outline-none min-h-[100px]"
                                        autoFocus
                                    />
                                ) : isRewritingThis && rewriteStreamingContent && (
                                    rewriteStreamingField === StreamingField.Answer ||
                                    rewriteStreamingField === StreamingField.Query
                                ) ? (
                                    <p className="text-sky-300 whitespace-pre-wrap animate-pulse max-h-44 overflow-y-auto pr-1">
                                        {rewriteStreamingContent}
                                        <span className="inline-block w-2 h-3 bg-sky-400 ml-0.5 animate-pulse" />
                                    </p>
                                ) : isRewritingThis && rewriteStreamingField === StreamingField.Both && rewriteStreamingContent ? (
                                    <p className="text-sky-300 whitespace-pre-wrap animate-pulse max-h-44 overflow-y-auto pr-1">
                                        {rewriteStreamingContent}
                                        <span className="inline-block w-2 h-3 bg-sky-400 ml-0.5 animate-pulse" />
                                    </p>
                                ) : (
                                    <p className="whitespace-pre-wrap max-h-44 overflow-y-auto pr-1">{displayContent}</p>
                                )}
                            </div>

                            {/* Role Label */}
                            <div
                                className={`text-[9px] text-slate-400 uppercase font-bold mt-1 ${msg.role === ChatRole.User ? 'text-right mr-1' : 'ml-1'}`}
                            >
                                {styles.label} • msg {idx + 1}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ConversationView;
