import React from 'react';
import { User, Bot, Loader, ChevronDown, ChevronUp, Sparkles, X, Square } from 'lucide-react';
import ReasoningHighlighter from './ReasoningHighlighter';
import { ChatMessage, StreamingConversationState } from '../types';

interface StreamingConversationCardProps {
    /** Streaming conversation state from App.tsx */
    streamState: StreamingConversationState;
    /** Optional handler to delete/dismiss this card */
    onDelete?: (id: string) => void;
    /** Optional handler to halt this stream */
    onHalt?: (id: string) => void;
}

// Role styling
const getRoleStyles = (role: string) => {
    switch (role) {
        case 'user':
            return {
                avatar: 'bg-indigo-500/20 text-indigo-400',
                bubble: 'bg-indigo-600/30 text-indigo-100 border border-indigo-500/30',
                icon: User,
                label: 'User'
            };
        case 'assistant':
        default:
            return {
                avatar: 'bg-emerald-500/20 text-emerald-400',
                bubble: 'bg-slate-800 text-slate-200 border border-slate-700',
                icon: Bot,
                label: 'Assistant'
            };
    }
};

const StreamingConversationCard: React.FC<StreamingConversationCardProps> = ({
    streamState,
    onDelete,
    onHalt
}) => {
    const [expandedReasoning, setExpandedReasoning] = React.useState<Set<number>>(new Set());

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

    const {
        phase,
        completedMessages,
        currentUserMessage,
        currentReasoning,
        currentAnswer,
        currentMessageIndex,
        totalMessages,
        useOriginalAnswer,
        originalAnswer
    } = streamState;
    const isStreaming = phase !== 'idle';

    // Helper to render a message bubble
    const renderMessage = (msg: ChatMessage, idx: number, isStreaming: boolean = false) => {
        const styles = getRoleStyles(msg.role);
        const IconComponent = styles.icon;

        return (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${styles.avatar}`}>
                    <IconComponent className="w-3.5 h-3.5" />
                </div>

                {/* Message */}
                <div className={`flex-1 max-w-[85%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`inline-block w-full text-left rounded-lg px-3 py-2 text-xs leading-relaxed ${styles.bubble} ${isStreaming ? 'border-emerald-500/30' : ''}`}>
                        {/* Reasoning toggle for assistant */}
                        {msg.role === 'assistant' && msg.reasoning && (
                            <div className="mb-2">
                                <button
                                    onClick={() => toggleReasoning(idx)}
                                    className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-slate-400 uppercase font-bold"
                                >
                                    <Sparkles className="w-2.5 h-2.5" />
                                    Reasoning
                                    {expandedReasoning.has(idx) ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                                </button>
                                {expandedReasoning.has(idx) && (
                                    <div className="mt-2 bg-slate-900/50 border border-slate-800 rounded p-2">
                                        <ReasoningHighlighter text={msg.reasoning} />
                                    </div>
                                )}
                            </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <div className={`text-[8px] text-slate-600 uppercase font-bold mt-0.5 ${msg.role === 'user' ? 'text-right mr-1' : 'ml-1'}`}>
                        {styles.label}
                    </div>
                </div>
            </div>
        );
    };

    // Single-prompt mode: render simpler card without conversation bubbles
    if (streamState.isSinglePrompt) {
        return (
            <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900/80 backdrop-blur-sm rounded-xl border border-indigo-500/30 overflow-hidden shadow-lg shadow-indigo-500/5">
                {/* Header */}
                <div className="bg-slate-950/50 p-3 border-b border-indigo-500/20 flex items-center gap-3">
                    <Loader className="w-4 h-4 text-indigo-400 animate-spin" />
                    <span className="text-xs font-medium text-indigo-300">
                        Generating Response
                    </span>
                    <span className="text-[10px] text-slate-500 ml-auto font-mono capitalize">
                        {phase.replace(/_/g, ' ')}
                    </span>
                    {onHalt && isStreaming && (
                        <button
                            onClick={() => onHalt(streamState.id)}
                            className="ml-2 text-amber-400 hover:text-amber-300 transition-colors"
                            title="Halt"
                        >
                            <Square className="w-4 h-4" />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={() => onDelete(streamState.id)}
                            className="ml-2 text-slate-500 hover:text-red-400 transition-colors"
                            title="Remove"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Two-column layout like log cards */}
                <div className="grid lg:grid-cols-2">
                    {/* Left: Reasoning Trace */}
                    <div className="p-4 border-r border-slate-800 bg-slate-950/20">
                        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            {phase === 'extracting_reasoning' ? (
                                <>
                                    <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />
                                    Extracting Reasoning...
                                </>
                            ) : (
                                'Stenographic Trace'
                            )}
                        </h4>
                        <div className="text-sm text-slate-300 font-mono">
                            {currentReasoning ? (
                                <>
                                    <ReasoningHighlighter text={currentReasoning} />
                                    {phase === 'extracting_reasoning' && (
                                        <span className="inline-block w-1.5 h-4 bg-emerald-400/60 ml-0.5 animate-pulse" />
                                    )}
                                </>
                            ) : phase === 'waiting_for_response' ? (
                                <div className="flex items-center gap-2 text-slate-500">
                                    <Loader className="w-3 h-3 animate-spin" />
                                    <span>Waiting for response...</span>
                                </div>
                            ) : (
                                <span className="text-slate-600 italic">No reasoning yet...</span>
                            )}
                        </div>
                    </div>

                    {/* Right: Final Answer */}
                    <div className="p-4 bg-slate-950/20">
                        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            {phase === 'extracting_answer' ? (
                                <>
                                    <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />
                                    Extracting Answer...
                                </>
                            ) : (
                                'Final Output'
                            )}
                        </h4>
                        <div className="text-sm text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                            {currentAnswer ? (
                                <>
                                    {currentAnswer}
                                    {phase === 'extracting_answer' && (
                                        <span className="inline-block w-1.5 h-4 bg-emerald-400/60 ml-0.5 animate-pulse" />
                                    )}
                                </>
                            ) : phase === 'extracting_answer' ? (
                                <span className="text-slate-600 italic">Generating answer...</span>
                            ) : (
                                <span className="text-slate-600 italic">Waiting...</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900/80 backdrop-blur-sm rounded-xl border border-indigo-500/30 overflow-hidden shadow-lg shadow-indigo-500/5">
            {/* Header */}
            <div className="bg-slate-950/50 p-3 border-b border-indigo-500/20 flex items-center gap-3">
                <Loader className="w-4 h-4 text-indigo-400 animate-spin" />
                <span className="text-xs font-medium text-indigo-300">
                    Processing Message {currentMessageIndex + 1} of {totalMessages}
                </span>
                <span className="text-[10px] text-slate-500 ml-auto font-mono capitalize">
                    {phase.replace(/_/g, ' ')}
                </span>
                {onHalt && isStreaming && (
                    <button
                        onClick={() => onHalt(streamState.id)}
                        className="ml-2 text-amber-400 hover:text-amber-300 transition-colors"
                        title="Halt"
                    >
                        <Square className="w-4 h-4" />
                    </button>
                )}
                {onDelete && (
                    <button
                        onClick={() => onDelete(streamState.id)}
                        className="ml-2 text-slate-500 hover:text-red-400 transition-colors"
                        title="Remove"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Messages Container */}
            <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                {/* Completed messages */}
                {completedMessages.map((msg, idx) => renderMessage(msg, idx))}

                {/* Current user message (if we have one) */}
                {currentUserMessage && phase !== 'idle' && (
                    renderMessage({ role: 'user', content: currentUserMessage }, completedMessages.length)
                )}

                {/* Current assistant response - streaming */}
                {(phase === 'waiting_for_response' || phase === 'extracting_reasoning' || phase === 'extracting_answer') && (
                    <div className="flex gap-3">
                        <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-emerald-500/20 text-emerald-400">
                            <Bot className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 max-w-[85%]">
                            <div className="inline-block w-full text-left rounded-lg px-3 py-2 text-xs leading-relaxed bg-slate-800 text-slate-200 border border-emerald-500/30">

                                {/* Waiting state */}
                                {phase === 'waiting_for_response' && (
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <Loader className="w-3 h-3 animate-spin" />
                                        <span>Generating response...</span>
                                    </div>
                                )}

                                {/* Extracting reasoning */}
                                {phase === 'extracting_reasoning' && (
                                    <>
                                        <div className="flex items-center gap-1 text-[9px] text-emerald-400 uppercase font-bold mb-1">
                                            <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                                            Reasoning...
                                        </div>
                                        <div className="bg-slate-900/50 border border-emerald-500/20 rounded p-2 mb-2">
                                            {currentReasoning ? (
                                                <>
                                                    <ReasoningHighlighter text={currentReasoning} />
                                                    <span className="inline-block w-1.5 h-3 bg-emerald-400/60 ml-0.5 animate-pulse" />
                                                </>
                                            ) : (
                                                <span className="text-slate-500 italic">Extracting reasoning...</span>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* Extracting answer */}
                                {phase === 'extracting_answer' && (
                                    <>
                                        {/* Show collapsed reasoning */}
                                        {currentReasoning && (
                                            <div className="mb-2">
                                                <button
                                                    onClick={() => toggleReasoning(-1)}
                                                    className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-slate-400 uppercase font-bold"
                                                >
                                                    <Sparkles className="w-2.5 h-2.5" />
                                                    Reasoning Complete
                                                    {expandedReasoning.has(-1) ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                                                </button>
                                                {expandedReasoning.has(-1) && (
                                                    <div className="mt-2 bg-slate-900/50 border border-slate-800 rounded p-2">
                                                        <ReasoningHighlighter text={currentReasoning} />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Show answer being streamed */}
                                        {useOriginalAnswer && originalAnswer ? (
                                            <p className="whitespace-pre-wrap">{originalAnswer}</p>
                                        ) : (
                                            <p className="whitespace-pre-wrap">
                                                {currentAnswer || <span className="text-slate-500 italic">Generating answer...</span>}
                                                {currentAnswer && <span className="inline-block w-1.5 h-3 bg-emerald-400/60 ml-0.5 animate-pulse" />}
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="text-[8px] text-emerald-400 uppercase font-bold mt-0.5 ml-1 flex items-center gap-1">
                                <Loader className="w-2 h-2 animate-spin" /> Streaming
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StreamingConversationCard;
