import React, { useState } from 'react';
import { User, Bot, ChevronDown, ChevronUp, Sparkles, Settings, Edit3, RotateCcw, Check, X, Loader2 } from 'lucide-react';
import { ChatMessage } from '../types';
import ReasoningHighlighter from './ReasoningHighlighter';

interface ConversationViewProps {
    messages: ChatMessage[];
    onEditStart?: (index: number, content: string) => void;
    onEditSave?: () => void;
    onEditCancel?: () => void;
    onEditChange?: (val: string) => void;
    onRewrite?: (index: number) => void;
    editingIndex?: number;
    editValue?: string;
    rewritingIndex?: number;
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
    editingIndex,
    editValue,
    rewritingIndex
}) => {
    const [expandedReasoning, setExpandedReasoning] = useState<Set<number>>(new Set());

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
                        key={idx}
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
                                            {onRewrite && (
                                                <button
                                                    onClick={() => onRewrite(idx)}
                                                    disabled={rewritingIndex === idx}
                                                    className="p-1 text-slate-500 hover:text-teal-400 hover:bg-teal-900/30 rounded disabled:opacity-50"
                                                    title="AI Rewrite"
                                                >
                                                    {rewritingIndex === idx ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        <RotateCcw className="w-3 h-3" />
                                                    )}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Reasoning Toggle for Assistant Messages */}
                                {msg.role === 'assistant' && displayReasoning && !isEditing && (
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
                                        {expandedReasoning.has(idx) && (
                                            <div className="mt-2 bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                                                <ReasoningHighlighter text={displayReasoning} />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isEditing ? (
                                    <textarea
                                        value={editValue}
                                        onChange={e => onEditChange?.(e.target.value)}
                                        className="w-full bg-slate-900/50 border border-cyan-500/50 rounded p-2 text-inherit resize-none outline-none min-h-[100px]"
                                        autoFocus
                                    />
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
