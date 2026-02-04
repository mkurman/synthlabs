import React from 'react';
import { User, Bot, Loader, ChevronDown, ChevronUp, Sparkles, X, Square, Brain } from 'lucide-react';
import ReasoningHighlighter from './ReasoningHighlighter';
import { ChatMessage, StreamingConversationState } from '../types';
import { ChatRole, StreamingPhase } from '../interfaces/enums';

interface StreamingConversationCardProps {
    /** Streaming conversation state from App.tsx */
    streamState: StreamingConversationState;
    /** Optional handler to delete/dismiss this card */
    onDelete?: (id: string) => void;
    /** Optional handler to halt this stream */
    onHalt?: (id: string) => void;
}

// Role styling
const getRoleStyles = (role: ChatRole) => {
    switch (role) {
        case ChatRole.User:
            return {
                avatar: 'bg-sky-500/15 text-sky-300',
                bubble: 'bg-slate-950/70 text-slate-100 border border-slate-700/70',
                icon: User,
                label: 'User'
            };
        case ChatRole.Assistant:
        default:
            return {
                avatar: 'bg-slate-900/60 text-slate-100',
                bubble: 'bg-slate-950/70 text-slate-100 border border-slate-800/70',
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
            <div key={idx} className={`flex gap-3 ${msg.role === ChatRole.User ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${styles.avatar}`}>
                    <IconComponent className="w-3.5 h-3.5" />
                </div>

                {/* Message */}
                <div className={`flex-1 max-w-[85%] ${msg.role === ChatRole.User ? 'text-right' : ''}`}>
                    <div className={`inline-block w-full text-left rounded-lg px-3 py-2 text-xs leading-relaxed ${styles.bubble} ${isStreaming ? 'border-emerald-500/30' : ''}`}>
                        {/* Reasoning toggle for assistant */}
                        {msg.role === ChatRole.Assistant && msg.reasoning_content && (
                            <div className="mb-2">
                                <button
                                    onClick={() => toggleReasoning(idx)}
                                    className="flex items-center gap-1 text-[9px] text-slate-400 hover:text-slate-300 uppercase font-bold"
                                >

                                    <Brain className="w-3 h-3" />
                                    <span className="font-medium">Thinking...</span>
                                    {expandedReasoning.has(idx) ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                                </button>
                                {expandedReasoning.has(idx) && (
                                    <div className="mt-2 bg-slate-950/70 border border-slate-800/70 rounded p-2">
                                        <ReasoningHighlighter text={msg.reasoning_content} />
                                    </div>
                                )}
                            </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <div className={`text-[8px] text-slate-500 uppercase font-bold mt-0.5 ${msg.role === ChatRole.User ? 'text-right mr-1' : 'ml-1'}`}>
                        {styles.label}
                    </div>
                </div>
            </div>
        );
    };

    // Single-prompt mode: render simpler card without conversation bubbles
    if (streamState.isSinglePrompt) {
        return (
            <div className="bg-gradient-to-br from-slate-950/60 via-slate-950/40 to-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800/70 overflow-hidden shadow-2xl shadow-slate-950/40">
                {/* Header */}
                <div className="bg-slate-950/70 p-3 border-b border-slate-800/70 flex items-center gap-3">
                    <Loader className="w-4 h-4 text-sky-300 animate-spin" />
                    <span className="text-xs font-medium text-slate-100">
                        Generating Response
                    </span>
                    <span className="text-[10px] text-slate-400 ml-auto font-mono capitalize">
                        {phase.replace(/_/g, ' ')}
                    </span>
                    {onHalt && isStreaming && (
                        <button
                            onClick={() => onHalt(streamState.id)}
                            className="ml-2 text-amber-300 hover:text-amber-200 transition-colors"
                            title="Halt"
                        >
                            <Square className="w-4 h-4" />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={() => onDelete(streamState.id)}
                            className="ml-2 text-slate-400 hover:text-red-300 transition-colors"
                            title="Remove"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Two-column layout like log cards */}
                <div className="grid lg:grid-cols-2">
                    {/* Left: Reasoning Trace */}
                    <div className="p-4 border-r border-slate-800/70 bg-slate-950/40">
                        <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-3 flex items-center gap-2">
                            <Brain className="w-3 h-3 text-sky-300 animate-pulse" />
                            {phase === StreamingPhase.ExtractingReasoning ? (
                                <>
                                    Thinking...
                                </>
                            ) : (
                                'Thoughts'
                            )}
                        </h4>
                        <div className="text-sm text-slate-200 font-mono">
                            {currentReasoning ? (
                                <>
                                    <ReasoningHighlighter text={currentReasoning} />
                                    {phase === StreamingPhase.ExtractingReasoning && (
                                        <span className="inline-block w-1.5 h-4 bg-sky-400/60 ml-0.5 animate-pulse" />
                                    )}
                                </>
                            ) : phase === StreamingPhase.WaitingForResponse ? (
                                <div className="flex items-center gap-2 text-slate-400">
                                    <Loader className="w-3 h-3 animate-spin" />
                                    <span>Waiting for thoughts...</span>
                                </div>
                            ) : (
                                <span className="text-slate-500 italic">No thoughts yet...</span>
                            )}
                        </div>
                    </div>

                    {/* Right: Final Answer */}
                    <div className="p-4 bg-slate-950/40">
                        <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-3 flex items-center gap-2">
                            {phase === StreamingPhase.ExtractingAnswer ? (
                                <>
                                    <Sparkles className="w-3 h-3 text-sky-300 animate-pulse" />
                                    Extracting Answer...
                                </>
                            ) : (
                                'Answer'
                            )}
                        </h4>
                        <div className="text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                            {currentAnswer ? (
                                <>
                                    {currentAnswer}
                                    {phase === StreamingPhase.ExtractingAnswer && (
                                        <span className="inline-block w-1.5 h-4 bg-sky-400/60 ml-0.5 animate-pulse" />
                                    )}
                                </>
                            ) : phase === StreamingPhase.ExtractingAnswer ? (
                                <span className="text-slate-500 italic">Generating answer...</span>
                            ) : (
                                <span className="text-slate-500 italic">Waiting...</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-slate-950/60 via-slate-950/40 to-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800/70 overflow-hidden shadow-2xl shadow-slate-950/40">
            {/* Header */}
            <div className="bg-slate-950/70 p-3 border-b border-slate-800/70 flex items-center gap-3">
                <Loader className="w-4 h-4 text-sky-300 animate-spin" />
                <span className="text-xs font-medium text-slate-100">
                    Processing Message {currentMessageIndex + 1} of {totalMessages}
                </span>
                <span className="text-[10px] text-slate-400 ml-auto font-mono capitalize">
                    {phase.replace(/_/g, ' ')}
                </span>
                {onHalt && isStreaming && (
                    <button
                        onClick={() => onHalt(streamState.id)}
                        className="ml-2 text-amber-300 hover:text-amber-200 transition-colors"
                        title="Halt"
                    >
                        <Square className="w-4 h-4" />
                    </button>
                )}
                {onDelete && (
                    <button
                        onClick={() => onDelete(streamState.id)}
                        className="ml-2 text-slate-400 hover:text-red-300 transition-colors"
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
                    renderMessage({ role: ChatRole.User, content: currentUserMessage }, completedMessages.length)
                )}

                {/* Current assistant response - streaming */}
                {(phase === StreamingPhase.WaitingForResponse || phase === StreamingPhase.ExtractingReasoning || phase === StreamingPhase.ExtractingAnswer) && (
                    <div className="flex gap-3">
                        <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-slate-900/60 text-slate-100 ring-1 ring-slate-700/50">
                            <Bot className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 max-w-[85%]">
                            <div className="inline-block w-full text-left rounded-lg px-3 py-2 text-xs leading-relaxed bg-slate-950/70 text-slate-100 border border-slate-800/70">

                                {/* Waiting state */}
                                {phase === StreamingPhase.WaitingForResponse && (
                                    <div className="flex items-center gap-2 text-slate-300">
                                        <Loader className="w-3 h-3 animate-spin" />
                                        <span>Generating response...</span>
                                    </div>
                                )}

                                {/* Extracting reasoning */}
                                {phase === StreamingPhase.ExtractingReasoning && (
                                    <>
                                        <div className="flex items-center gap-1 text-[9px] text-sky-300 uppercase font-bold mb-1">
                                            <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                                            Thinking...
                                        </div>
                                        <div className="bg-slate-950/60 border border-slate-800/70 rounded p-2 mb-2">
                                            {currentReasoning ? (
                                                <>
                                                    <ReasoningHighlighter text={currentReasoning} />
                                                    <span className="inline-block w-1.5 h-3 bg-sky-400/60 ml-0.5 animate-pulse" />
                                                </>
                                            ) : (
                                                <span className="text-slate-400 italic">Extracting thoughts...</span>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* Extracting answer */}
                                {phase === StreamingPhase.ExtractingAnswer && (
                                    <>
                                        {/* Show collapsed reasoning */}
                                        {currentReasoning && (
                                            <div className="mb-2">
                                                <button
                                                    onClick={() => toggleReasoning(-1)}
                                                    className="flex items-center gap-1 text-[9px] text-slate-400 hover:text-slate-300 uppercase font-bold"
                                                >
                                                    <Sparkles className="w-2.5 h-2.5" />
                                                    Thoughts
                                                    {expandedReasoning.has(-1) ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                                                </button>
                                                {expandedReasoning.has(-1) && (
                                                    <div className="mt-2 bg-slate-950/60 border border-slate-800/70 rounded p-2">
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
                                                {currentAnswer || <span className="text-slate-400 italic">Generating answer...</span>}
                                                {currentAnswer && <span className="inline-block w-1.5 h-3 bg-sky-400/60 ml-0.5 animate-pulse" />}
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="text-[8px] text-sky-300 uppercase font-bold mt-0.5 ml-1 flex items-center gap-1">
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
