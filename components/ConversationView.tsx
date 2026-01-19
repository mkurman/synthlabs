import React, { useState } from 'react';
import { User, Bot, ChevronDown, ChevronUp, Sparkles, Settings, Edit3, RotateCcw, Check, X, Loader2 } from 'lucide-react';
import { ChatMessage } from '../types';
import ReasoningHighlighter from './ReasoningHighlighter';
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
    editingIndex?: number;
    editValue?: string;
    rewritingIndex?: number;
    streamingContent?: string;  // Real-time streaming content to display
    streamingField?: 'reasoning' | 'answer' | 'both' | 'query';  // Which field is being streamed
}

// Helper to parse <think> tags from content
const parseThinkTags = (content: string): { reasoning: string | null; answer: string } => {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
        const reasoning = thinkMatch[1].trim();
        const answer = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
        return { reasoning, answer };
    }
    return { reasoning: null, answer: content };
};

// Role styling configuration
const getRoleStyles = (role: string) => {
    switch (role) {
        case 'user':
            return {
                avatar: 'bg-indigo-500/20 text-indigo-400',
                bubble: 'bg-indigo-600/30 text-indigo-100 border border-indigo-500/30',
                icon: User,
                label: 'User',
                align: 'flex-row-reverse',
                textAlign: 'text-right'
            };
        case 'system':
            return {
                avatar: 'bg-violet-500/20 text-violet-400',
                bubble: 'bg-violet-900/30 text-violet-100 border border-violet-500/30',
                icon: Settings,
                label: 'System',
                align: '',
                textAlign: ''
            };
        case 'assistant':
        default:
            return {
                avatar: 'bg-emerald-500/20 text-emerald-400',
                bubble: 'bg-slate-800 text-slate-200 border border-slate-700',
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
    editingIndex,
    editValue,
    rewritingIndex,
    streamingContent,
    streamingField
}) => {
    console.log('ConversationView rendered, messages length:', messages?.length);
    React.useEffect(() => {
        console.log('ConversationView messages updated:', messages?.map((m, i) => ({ index: i, role: m.role, hasReasoning: !!m.reasoning })));
    }, [messages]);

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
            <div className="text-slate-500 text-sm italic p-4">
                No conversation messages.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {messages.map((msg, idx) => {
                // Parse <think> tags from content for display
                const { reasoning: embeddedReasoning, answer: cleanContent } = parseThinkTags(msg.content || '');
                // Use embedded reasoning if separate reasoning field is empty
                const displayReasoning = msg.reasoning || embeddedReasoning;
                const displayContent = cleanContent;

                const styles = getRoleStyles(msg.role);
                const IconComponent = styles.icon;
                const isEditing = editingIndex === idx;

                return (
                    <div
                        key={`${idx}-${msg.content?.substring(0, 50) || ''}-${msg.reasoning?.substring(0, 20) || ''}`}
                        className={`group flex gap-3 ${styles.align}`}
                    >
                        {/* Avatar */}
                        <div
                            className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${styles.avatar}`}
                        >
                            <IconComponent className="w-4 h-4" />
                        </div>

                        {/* Message Bubble */}
                        <div
                            className={`flex-1 max-w-[85%] ${styles.textAlign}`}
                        >
                            <div
                                className={`inline-block w-full text-left rounded-xl px-4 py-3 text-sm leading-relaxed relative ${styles.bubble}`}
                            >
                                {/* Edit/Rewrite Controls */}
                                <div className={`absolute top-2 ${msg.role === 'user' ? 'left-2' : 'right-2'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-1`}>
                                    {isEditing ? (
                                        <>
                                            <button onClick={onEditSave} className="p-1 text-green-400 hover:bg-green-900/30 rounded" title="Save">
                                                <Check className="w-3 h-3" />
                                            </button>
                                            <button onClick={onEditCancel} className="p-1 text-red-400 hover:bg-red-900/30 rounded" title="Cancel">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => onEditStart?.(idx, msg.content)}
                                                className="p-1 text-slate-500 hover:text-white hover:bg-slate-700/50 rounded"
                                                title="Edit"
                                            >
                                                <Edit3 className="w-3 h-3" />
                                            </button>
                                            {/* User messages: simple rewrite button */}
                                            {msg.role === 'user' && onRewriteQuery && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onRewriteQuery(idx); }}
                                                    disabled={rewritingIndex === idx}
                                                    className="p-1 text-slate-500 hover:text-teal-400 hover:bg-teal-900/30 rounded disabled:opacity-50"
                                                    title="Rewrite Query"
                                                >
                                                    {rewritingIndex === idx ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        <Sparkles className="w-3 h-3" />
                                                    )}
                                                </button>
                                            )}
                                            {/* Assistant messages: dropdown with options */}
                                            {msg.role === 'assistant' && onRewrite && (
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(showRewriteDropdown === idx ? null : idx); }}
                                                        disabled={rewritingIndex === idx}
                                                        className="p-1 text-slate-500 hover:text-teal-400 hover:bg-teal-900/30 rounded disabled:opacity-50"
                                                        title="AI Rewrite"
                                                    >
                                                        {rewritingIndex === idx ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Sparkles className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                    {showRewriteDropdown === idx && (
                                                        <div
                                                            className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1 min-w-[140px]"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(null); console.log('ConversationView: onRewrite clicked, idx:', idx); onRewrite(idx); }}
                                                                className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                                            >
                                                                <RotateCcw className="w-3 h-3" /> Answer Only
                                                            </button>
                                                            {onRewriteReasoning && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(null); console.log('ConversationView: onRewriteReasoning clicked, idx:', idx); onRewriteReasoning(idx); }}
                                                                    className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                                                >
                                                                    <RotateCcw className="w-3 h-3" /> Reasoning Only
                                                                </button>
                                                            )}
                                                            {onRewriteBoth && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setShowRewriteDropdown(null); console.log('ConversationView: onRewriteBoth clicked, idx:', idx); onRewriteBoth(idx); }}
                                                                    className="w-full px-3 py-2 text-left text-xs text-teal-400 hover:bg-slate-700 flex items-center gap-2 border-t border-slate-700"
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
                                {msg.role === 'assistant' && (displayReasoning || (rewritingIndex === idx && streamingField === 'reasoning')) && !isEditing && (
                                    <div className="mt-2 text-left">
                                        <button
                                            onClick={() => toggleReasoning(idx)}
                                            className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-400 transition-colors uppercase font-bold tracking-wider"
                                        >
                                            <Sparkles className="w-3 h-3" />
                                            Reasoning Trace
                                            {expandedReasoning.has(idx) ? (
                                                <ChevronUp className="w-3 h-3" />
                                            ) : (
                                                <ChevronDown className="w-3 h-3" />
                                            )}
                                        </button>
                                        {(expandedReasoning.has(idx) || (rewritingIndex === idx && streamingContent)) && (
                                            <div className="mt-2 bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                                                {rewritingIndex === idx && streamingContent && streamingField === 'reasoning' ? (
                                                    <p className="text-[10px] text-teal-300 font-mono whitespace-pre-wrap animate-pulse">
                                                        {streamingContent}
                                                        <span className="inline-block w-2 h-3 bg-teal-400 ml-0.5 animate-pulse" />
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
                                        className="w-full bg-slate-900/50 border border-cyan-500/50 rounded p-2 text-inherit outline-none min-h-[100px]"
                                        autoFocus
                                    />
                                ) : rewritingIndex === idx && streamingContent && (streamingField === 'answer' || streamingField === 'both' || streamingField === 'query') ? (
                                    <p className="text-teal-300 whitespace-pre-wrap animate-pulse">
                                        {streamingContent}
                                        <span className="inline-block w-2 h-3 bg-teal-400 ml-0.5 animate-pulse" />
                                    </p>
                                ) : (
                                    <p className="whitespace-pre-wrap">{displayContent}</p>
                                )}
                            </div>

                            {/* Role Label */}
                            <div
                                className={`text-[9px] text-slate-600 uppercase font-bold mt-1 ${msg.role === 'user' ? 'text-right mr-1' : 'ml-1'}`}
                            >
                                {styles.label}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ConversationView;
