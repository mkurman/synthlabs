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
    onRewriteQuery?: (index: number) => void;
    onCancelRewrite?: (index: number) => void;
    onDeleteFromHere?: (index: number) => void;
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
                bubble: 'bg-sky-950/30 text-slate-100 border border-sky-800/50',
                icon: User,
                label: 'User',
                align: 'flex-row-reverse',
                textAlign: 'text-right',
                labelColor: 'text-sky-400'
            };
        case 'system':
            return {
                avatar: 'bg-amber-400/15 text-amber-300',
                bubble: 'bg-amber-500/10 text-amber-100 border border-amber-400/20',
                icon: Settings,
                label: 'System',
                align: '',
                textAlign: '',
                labelColor: 'text-amber-400'
            };
        case 'assistant':
        default:
            return {
                avatar: 'bg-slate-800 text-slate-300',
                bubble: 'bg-slate-950/50 text-slate-100 border border-slate-800/70',
                icon: Bot,
                label: 'Assistant',
                align: '',
                textAlign: '',
                labelColor: 'text-slate-400'
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
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    // Close dropdown when clicking outside
    React.useEffect(() => {
        const handleClickOutside = () => setShowRewriteDropdown(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    if (!messages || messages.length === 0) {
        return (
            <div className="text-slate-400 text-sm italic p-4 bg-slate-950/30 rounded-lg border border-slate-800/50">
                No conversation messages.
            </div>
        );
    }

    return (
        <div className="space-y-4">
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
                // Note: isUser is used in the role styling logic

                return (
                    <div
                        key={`${idx}-${msg.content?.substring(0, 50) || ''}`}
                        className={`flex gap-3 ${styles.align}`}
                    >
                        {/* Avatar */}
                        <div className="shrink-0 flex flex-col items-center gap-1">
                            <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center ring-1 ring-slate-700/50 ${styles.avatar}`}
                            >
                                <IconComponent className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">#{idx + 1}</span>
                        </div>

                        {/* Message Bubble */}
                        <div className={`flex-1 ${styles.textAlign}`}>
                            <div
                                className={`inline-block w-full text-left rounded-xl px-4 py-3 text-sm leading-relaxed relative shadow-sm ${styles.bubble}`}
                            >
                                {/* Edit/Rewrite Controls */}
                                <div className={`absolute top-3 right-3 ${isRewritingThis ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity flex gap-1 bg-slate-950/80 backdrop-blur-sm rounded-lg p-1 border border-slate-800/50`}>
                                    {isRewritingThis && onCancelRewrite ? (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onCancelRewrite(idx); }}
                                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded flex items-center gap-1"
                                            title="Cancel rewrite"
                                        >
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    ) : isEditing ? (
                                        <>
                                            <button 
                                                onClick={onEditSave} 
                                                className="p-1.5 text-emerald-400 hover:bg-emerald-900/30 rounded transition-colors" 
                                                title="Save"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                            <button 
                                                onClick={onEditCancel} 
                                                className="p-1.5 text-red-400 hover:bg-red-900/30 rounded transition-colors" 
                                                title="Cancel"
                                            >
                                                <X className="w-3.5 h-3.5" />
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
                                                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                                                title="Edit"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                            {onDeleteFromHere && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDeleteFromHere(idx); }}
                                                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
                                                    title="Delete this & all below"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {/* User messages: simple rewrite button */}
                                            {msg.role === ChatRole.User && onRewriteQuery && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onRewriteQuery(idx); }}
                                                    className="p-1.5 text-sky-400 hover:bg-sky-900/30 rounded transition-colors"
                                                    title="Rewrite Query"
                                                >
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {/* Assistant messages: dropdown with options */}
                                            {msg.role === ChatRole.Assistant && onRewrite && (
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(showRewriteDropdown === idx ? null : idx); }}
                                                        className="p-1.5 text-sky-400 hover:bg-sky-900/30 rounded transition-colors"
                                                        title="AI Rewrite"
                                                    >
                                                        <Sparkles className="w-3.5 h-3.5" />
                                                    </button>
                                                    {showRewriteDropdown === idx && (
                                                        <div
                                                            className="absolute right-0 top-full mt-1 bg-slate-950 border border-slate-700 rounded-lg shadow-2xl z-20 py-1 min-w-[160px]"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(null); onRewrite(idx); }}
                                                                className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" /> Answer Only
                                                            </button>
                                                            {onRewriteReasoning && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(null); onRewriteReasoning(idx); }}
                                                                    className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                                                                >
                                                                    <Brain className="w-3.5 h-3.5" /> Reasoning Only
                                                                </button>
                                                            )}
                                                            {onRewriteBoth && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(null); onRewriteBoth(idx); }}
                                                                    className="w-full px-3 py-2 text-left text-xs text-sky-400 hover:bg-slate-800 flex items-center gap-2 border-t border-slate-800"
                                                                >
                                                                    <Sparkles className="w-3.5 h-3.5" /> Both Together
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
                                    <div className="mt-1 text-left">
                                        <button
                                            onClick={() => toggleReasoning(idx)}
                                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors uppercase font-bold tracking-wider mb-2"
                                        >
                                            <Brain className="w-3.5 h-3.5" />
                                            Thoughts
                                            {expandedReasoning.has(idx) ? (
                                                <ChevronUp className="w-3.5 h-3.5" />
                                            ) : (
                                                <ChevronDown className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                        {(expandedReasoning.has(idx) || (isRewritingThis && (
                                            rewriteStreamingField === StreamingField.Reasoning ||
                                            (rewriteStreamingField === StreamingField.Both && rewriteStreamingReasoningContent)
                                        ))) && (
                                            <div className="bg-slate-950/60 border border-slate-800/70 rounded-lg p-3 max-h-64 overflow-y-auto">
                                                {isRewritingThis && (
                                                    rewriteStreamingField === StreamingField.Reasoning ||
                                                    (rewriteStreamingField === StreamingField.Both && rewriteStreamingReasoningContent)
                                                ) ? (
                                                    <p className="text-sm text-sky-300 font-mono whitespace-pre-wrap animate-pulse leading-relaxed">
                                                        {rewriteStreamingField === StreamingField.Reasoning 
                                                            ? rewriteStreamingContent 
                                                            : rewriteStreamingReasoningContent}
                                                        <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                                                    </p>
                                                ) : (
                                                    <div className="text-sm leading-relaxed">
                                                        <ReasoningHighlighter text={displayReasoning!} />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isEditing ? (
                                    <AutoResizeTextarea
                                        value={editValue || ''}
                                        onChange={e => onEditChange?.(e.target.value)}
                                        className="w-full bg-slate-950/60 border border-sky-500/40 rounded-lg p-3 text-inherit outline-none min-h-[120px] text-sm leading-relaxed"
                                        autoFocus
                                    />
                                ) : isRewritingThis && (
                                    rewriteStreamingField === StreamingField.Answer ||
                                    rewriteStreamingField === StreamingField.Query ||
                                    (rewriteStreamingField === StreamingField.Both && rewriteStreamingContent && !rewriteStreamingReasoningContent)
                                ) ? (
                                    <p className="text-sky-300 whitespace-pre-wrap animate-pulse max-h-64 overflow-y-auto pr-1 text-sm leading-relaxed min-h-[40px]">
                                        {rewriteStreamingContent}
                                        <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                                    </p>
                                ) : (
                                    <p className="whitespace-pre-wrap max-h-64 overflow-y-auto pr-1 text-sm leading-relaxed">
                                        {displayContent || '(No content)'}
                                    </p>
                                )}
                            </div>

                            {/* Role Label */}
                            <div
                                className={`text-[10px] ${styles.labelColor} uppercase font-bold mt-1 ${msg.role === ChatRole.User ? 'text-right mr-1' : 'ml-1'}`}
                            >
                                {styles.label} • Message {idx + 1}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ConversationView;
