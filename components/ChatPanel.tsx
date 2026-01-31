import { useState, useEffect, useRef } from 'react';
import {
    Bot, Sparkles,
    ChevronDown, ChevronRight, Wrench, Plus, History, Copy, Check, Square, SendHorizontal, Trash2, ArrowDown, Brain, RotateCcw
} from 'lucide-react';
import { ChatService } from '../services/chatService';
import { ChatMessage } from '../types';
import { SettingsService, AVAILABLE_PROVIDERS } from '../services/settingsService';
import { PROVIDERS } from '../constants';
import { ToolExecutor } from '../services/toolService';
import { VerifierItem } from '../types';
import { useChatSessions } from '../hooks/useChatSessions';
import { useChatPersistence } from '../hooks/useChatPersistence';
import { useChatScroll } from '../hooks/useChatScroll';
import { ChatRole, ExternalProvider, ProviderType } from '../interfaces/enums';



interface ChatPanelProps {
    data: VerifierItem[];
    setData: (data: VerifierItem[]) => void;
    modelConfig: {
        provider: ProviderType;
        externalProvider: ExternalProvider;
        externalModel: string;
        apiKey: string;
        externalApiKey: string;
    };
    toolExecutor?: ToolExecutor;
}

type ChatProvider = ExternalProvider | ProviderType.Gemini;

const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    } catch (err) {
        console.error('Failed to copy', err);
    }
};

const ToolCallView = ({ toolCall, result }: { toolCall: any, result?: string }) => {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [copiedArgs, setCopiedArgs] = useState(false);
    const [copiedResult, setCopiedResult] = useState(false);

    const isCompleted = result !== undefined;

    return (
        <div className="my-2 border border-slate-700/50 rounded-lg overflow-hidden bg-slate-900/30 w-full">
            {/* Header */}
            <div
                className="flex items-center justify-between p-2 cursor-pointer hover:bg-slate-800/50 transition-colors w-full"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-2 w-full">
                    {isCollapsed ? <ChevronRight size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                    <span className="font-bold text-xs text-slate-200">{toolCall.name}</span>
                </div>
                <div className={`text-[10px] px-1.5 py-0.5 rounded border ${isCompleted
                    ? 'bg-slate-800 text-blue-400 border-blue-900/30'
                    : 'bg-yellow-900/20 text-yellow-500 border-yellow-900/30'}`}>
                    {isCompleted ? 'Completed' : 'Running...'}
                </div>
            </div>

            {/* Content */}
            {!isCollapsed && (
                <div className="p-3 border-t border-slate-800/50 text-xs flex flex-col gap-3 bg-black/20">
                    {/* Arguments */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                            <span>Arguments</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(JSON.stringify(toolCall.args, null, 2), setCopiedArgs); }}
                                className="hover:text-white transition-colors"
                            >
                                {copiedArgs ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                            </button>
                        </div>
                        <div className="bg-slate-950 p-2 rounded border border-slate-800/50 overflow-x-auto relative group">
                            <pre className="text-slate-300 font-mono">
                                {JSON.stringify(toolCall.args, null, 2)}
                            </pre>
                        </div>
                    </div>

                    {/* Output */}
                    {isCompleted && (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                                <span>Output</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(result, setCopiedResult); }}
                                    className="hover:text-white transition-colors"
                                >
                                    {copiedResult ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                </button>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800/50 overflow-x-auto max-h-[300px] custom-scrollbar">
                                <pre className="text-slate-300 font-mono whitespace-pre-wrap">
                                    {result}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default function ChatPanel({ data, setData, modelConfig, toolExecutor }: ChatPanelProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [toolsEnabled, setToolsEnabled] = useState(true);

    // Session State
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [historySessions, setHistorySessions] = useState<{ id: string, title: string, updatedAt: number }[]>([]);

    // Scroll State
    const [autoScroll, setAutoScroll] = useState(true);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    // Continue Button State
    const [showContinueButton, setShowContinueButton] = useState(false);

    // Usage Tracking State
    const [totalTokens, setTotalTokens] = useState(0);
    const [totalCost, setTotalCost] = useState(0);

    // Model Selection State
    const [activeModel, setActiveModel] = useState<{ provider: ChatProvider; model: string; apiKey: string; customBaseUrl: string }>({
        provider: modelConfig.provider === ProviderType.External ? modelConfig.externalProvider : ProviderType.Gemini,
        model: modelConfig.provider === ProviderType.External ? modelConfig.externalModel : 'gemini-2.0-flash-20240905',
        apiKey: modelConfig.provider === ProviderType.External ? modelConfig.externalApiKey : modelConfig.apiKey,
        customBaseUrl: ''
    });

    const [showModelSelector, setShowModelSelector] = useState(false);

    const allProviders = [ProviderType.Gemini, ...AVAILABLE_PROVIDERS];

    const handleProviderChange = (newProvider: string) => {
        const providerValue = newProvider as ChatProvider;
        const defaultModel = SettingsService.getDefaultModel(providerValue);
        setActiveModel(prev => ({
            ...prev,
            provider: providerValue,
            model: defaultModel || '', // Auto-select default model if available
            apiKey: '' // Reset API key override on provider switch
        }));
    };

    // Services
    const toolExecutorRef = useRef<ToolExecutor | null>(null);
    const chatServiceRef = useRef<ChatService | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const syncServiceHistory = (msgs: ChatMessage[]) => {
        if (chatServiceRef.current) {
            chatServiceRef.current.clearHistory();
            msgs.forEach(m => (chatServiceRef.current as any).history.push(m));
        }
    };

    const {
        handleNewChat,
        handleHistoryClick,
        handleSessionSelect,
        handleDeleteSession
    } = useChatSessions({
        chatServiceRef,
        syncServiceHistory,
        setCurrentSessionId,
        setMessages,
        setShowModelSelector,
        showHistory,
        setShowHistory,
        setHistorySessions,
        currentSessionId
    });

    const dataRef = useRef(data);
    const setDataRef = useRef(setData);



    // Initialize ChatService with ToolExecutor (prop or local)
    useEffect(() => {
        let executor = toolExecutor;

        // Fallback to local executor if not provided via props
        if (!executor) {
            if (!toolExecutorRef.current) {
                toolExecutorRef.current = new ToolExecutor(() => ({
                    data: dataRef.current,
                    setData: setDataRef.current
                }));
            }
            executor = toolExecutorRef.current;
        }

        // Initialize ChatService
        chatServiceRef.current = new ChatService(executor);

        // Sync initial messages if present
        if (messages.length > 0) {
            syncServiceHistory(messages);
        }

    }, [toolExecutor, messages.length === 0]); // Re-init if executor changes or on first load (messages check rough proxy for mount/session change)

    useChatPersistence({ currentSessionId: currentSessionId || '', messages });
    const { handleScrollToBottom } = useChatScroll({
        messages,
        autoScroll,
        messagesEndRef,
        messagesContainerRef,
        setAutoScroll,
        setShowScrollButton
    });

    useEffect(() => {
        if (messages.length > 0 && !autoScroll && !isStreaming) {
            setShowScrollButton(true);
        } else if (autoScroll || isStreaming) {
            setShowScrollButton(false);
        }
    }, [messages.length, autoScroll, isStreaming]);

    // Show Continue button when streaming finishes and there are messages
    useEffect(() => {
        setShowContinueButton(!isStreaming && messages.length > 0);
    }, [isStreaming, messages.length]);

    // Hide Continue button when user types in input
    useEffect(() => {
        if (input.trim()) {
            setShowContinueButton(false);
        }
    }, [input]);

    // State for abort controller
    const abortControllerRef = useRef<AbortController | null>(null);

    const handleSubmit = async () => {
        if (!input.trim() || isStreaming || !chatServiceRef.current) return;

        const userMsg = input.trim();
        setInput('');
        setIsStreaming(true);

        const newHistory = [...messages, { role: 'user', content: userMsg } as ChatMessage];
        setMessages(newHistory);
        chatServiceRef.current.addUserMessage(userMsg);

        // Hide continue button when sending new message
        setShowContinueButton(false);

        // Reset abort controller
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        try {
            await processTurn();
        } catch (e) {
            console.error(e);
            setMessages(prev => [...prev, { role: ChatRole.Model, content: "Error: " + String(e) } as ChatMessage]);
        } finally {
            setIsStreaming(false);
            abortControllerRef.current = null;
        }
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsStreaming(false);
    };

    const handleContinue = async () => {
        if (isStreaming || !chatServiceRef.current) return;

        const continueMsg = 'continue';
        setIsStreaming(true);

        const newHistory = [...messages, { role: ChatRole.User, content: continueMsg } as ChatMessage];
        setMessages(newHistory);
        chatServiceRef.current.addUserMessage(continueMsg);

        // Reset abort controller
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        try {
            await processTurn();
        } catch (e) {
            console.error(e);
            setMessages(prev => [...prev, { role: ChatRole.Model, content: "Error: " + String(e) } as ChatMessage]);
        } finally {
            setIsStreaming(false);
            abortControllerRef.current = null;
        }
    };


    const processTurn = async () => {
        // Use prop executor or local ref
        const executor = toolExecutor || toolExecutorRef.current;
        if (!chatServiceRef.current || !executor) return;

        let currentAssistantMessage: ChatMessage = { role: ChatRole.Model, content: '' };
        setMessages(prev => [...prev, currentAssistantMessage]);

        let maxTurns = 5;
        let turnCount = 0;

        while (turnCount < maxTurns) {
            let fullText = "";
            let thinking = "";

            await chatServiceRef.current.streamResponse(
                activeModel,
                toolsEnabled,
                (_chunk, accumulated, usage) => {
                    console.log('ChatPanel streamResponse callback - chunk length:', _chunk?.length || 0, 'accumulated length:', accumulated?.length || 0, 'usage:', usage);
                    fullText = accumulated;
                    const { thinking: think, content, toolCalls } = ChatService.parseResponse(accumulated);
                    thinking = think || '';

                    // Track usage if available
                    if (usage) {
                        console.log('Updating totals - tokens:', usage.total_tokens, 'cost:', usage.cost);
                        setTotalTokens(prev => prev + (usage.total_tokens || 0));
                        setTotalCost(prev => prev + (usage.cost || 0));
                    }

                    setMessages(prev => {
                        const next = [...prev];
                        next[next.length - 1] = {
                            role: ChatRole.Model,
                            content: content,
                            reasoning: thinking,
                            toolCalls: toolCalls
                        };
                        return next;
                    });
                },
                abortControllerRef.current?.signal
            );

            const { thinking: finalThink, content: finalContent, toolCalls } = ChatService.parseResponse(fullText);

            const modelMsgEntry: ChatMessage = {
                role: ChatRole.Model,
                content: finalContent,
                reasoning: finalThink || undefined,
                toolCalls: toolCalls
            };

            chatServiceRef.current.getHistory().push(modelMsgEntry);

            if (toolCalls && toolCalls.length > 0) {
                for (const tc of toolCalls) {
                    // Add UI message for tool execution
                    setMessages(prev => [...prev, {
                        role: ChatRole.Tool,
                        content: tc.name === 'invalid_tool_call' ? 'Error parsing tool call...' : `Executing ${tc.name}...`,
                        toolCallId: tc.id
                    } as ChatMessage]);

                    let resultStr = '';

                    if (tc.name === 'invalid_tool_call') {
                        // Handle syntax error feedback
                        resultStr = `System Error: The tool call JSON was invalid.\n` +
                            `Error: ${tc.args.error}\n` +
                            `Received: ${tc.args.raw}\n\n` +
                            `Please ensure you use valid JSON inside <tool_call> tags. Example:\n` +
                            `<tool_call>\n{"name": "toolName", "arguments": { "arg": "value" }}\n</tool_call>`;
                    } else {
                        // Execute real tool
                        try {
                            const result = await executor.executeTool(tc.name, tc.args);
                            resultStr = JSON.stringify(result, null, 2);
                        } catch (err: any) {
                            resultStr = `Tool Execution Error: ${err.message}`;
                        }
                    }

                    // Add Tool Result to UI
                    setMessages(prev => {
                        const next = [...prev];
                        next[next.length - 1] = {
                            role: ChatRole.Tool,
                            content: resultStr,
                            toolCallId: tc.id
                        };
                        return next;
                    });

                    chatServiceRef.current.getHistory().push({
                        role: ChatRole.Tool,
                        content: resultStr,
                        toolCallId: tc.id
                    } as ChatMessage);
                }
                turnCount++;
                setMessages(prev => [...prev, { role: ChatRole.Model, content: '' }]);
            } else {
                break;
            }
        }
    };

    // UI Helpers
    const renderMessage = (msg: ChatMessage, idx: number) => {
        const isUser = msg.role === ChatRole.User;
        const isTool = msg.role === ChatRole.Tool;
        const isModel = msg.role === ChatRole.Model;
        const isAssistant = msg.role === ChatRole.Assistant;
        const isAssistantMessage = isModel || isAssistant;

        if (isTool) return null;

        return (
            <div key={idx} className={`flex gap-3 my-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex flex-col gap-2 w-full ${isUser ? 'items-end' : 'items-start'}`}>
                    {isModel && msg.reasoning && (
                        <div className="w-full max-w-xl">
                            <ReasoningAccordion content={msg.reasoning} />
                        </div>
                    )}

                    {isModel && msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="flex flex-col gap-1 mb-2 w-full max-w-xl">
                            {msg.toolCalls.map((tc: any, i: number) => {
                                const toolResultMsg = messages.slice(idx + 1).find(
                                    m => m.role === ChatRole.Tool && m.toolCallId === tc.id
                                );
                                const result = toolResultMsg ? toolResultMsg.content : undefined;

                                return (
                                    <ToolCallView
                                        key={tc.id || i}
                                        toolCall={tc}
                                        result={result}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {/* Only render text bubble if there is content or if it's currently streaming */}
                    {(msg.content?.trim() || (isStreaming && idx === messages.length - 1)) && (
                        <div className={`relative group px-4 py-2 rounded-2xl text-[14px] whitespace-pre-wrap break-words break-all ${isUser
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-800 text-slate-200 border border-slate-700'
                            }`}>
                            {msg.content}
                            {!msg.content && isStreaming && idx === messages.length - 1 && (
                                <span className="animate-pulse">▍</span>
                            )}

                            {/* Actions: Copy & Delete */}
                            {!isStreaming && (
                                <div className={`absolute -bottom-6 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-slate-900/80 rounded px-1 py-0.5 border border-slate-700/50`}>
                                    <button
                                        onClick={() => copyToClipboard(msg.content || '', () => { })}
                                        className="p-1 text-slate-400 hover:text-white transition-colors"
                                        title="Copy"
                                    >
                                        <Copy size={12} />
                                    </button>
                                    {isAssistantMessage && (
                                        <button
                                            onClick={() => {
                                                const userMsgIndex = idx - 1;
                                                if (userMsgIndex >= 0 && messages[userMsgIndex]?.role === ChatRole.User) {
                                                    const newMessages = messages.slice(0, idx);
                                                    setMessages(newMessages);
                                                    setInput('');
                                                    setIsStreaming(true);
                                                    if (abortControllerRef.current) abortControllerRef.current.abort();
                                                    abortControllerRef.current = new AbortController();
                                                    if (chatServiceRef.current) {
                                                        chatServiceRef.current.clearHistory();
                                                        newMessages.forEach(m => {
                                                            if (m.role === ChatRole.User) {
                                                                chatServiceRef.current!.addUserMessage(m.content);
                                                            } else if (m.role === ChatRole.Tool) {
                                                                (chatServiceRef.current as any).history.push(m);
                                                            } else {
                                                                (chatServiceRef.current as any).history.push({ ...m, role: ChatRole.Model });
                                                            }
                                                        });
                                                        processTurn().then(() => {
                                                            setIsStreaming(false);
                                                            abortControllerRef.current = null;
                                                        }).catch(err => {
                                                            console.error(err);
                                                            setIsStreaming(false);
                                                            abortControllerRef.current = null;
                                                        });
                                                    }
                                                }
                                            }}
                                            className="p-1 text-slate-400 hover:text-teal-400 transition-colors"
                                            title="Regenerate"
                                        >
                                            <RotateCcw size={12} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            const newMessages = messages.filter((_, i) => i !== idx);
                                            setMessages(newMessages);
                                            // Also purge from ChatService history
                                            if (chatServiceRef.current) {
                                                (chatServiceRef.current as any).history = newMessages;
                                            }
                                        }}
                                        className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800 w-[400px] relative">
            {/* Header */}
            <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/50">
                <div className="flex items-center gap-2 text-slate-200 font-medium">
                    <Sparkles size={16} className="text-purple-400" />
                    <span>Data Assistant</span>
                </div>
                <div className="flex items-center gap-1 relative">
                    <button
                        onClick={handleHistoryClick}
                        className={`p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ${showHistory ? 'bg-slate-800 text-white' : ''}`}
                        title="Chat History"
                    >
                        <History size={16} />
                    </button>

                    {/* History Popover */}
                    {showHistory && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setShowHistory(false)} />
                            <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-40 overflow-hidden flex flex-col max-h-96">
                                <div className="p-2 border-b border-slate-800 font-bold text-xs text-slate-500 uppercase">Recent Chats</div>
                                <div className="overflow-y-auto custom-scrollbar flex-1">
                                    {historySessions.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-slate-500">No history yet</div>
                                    ) : (
                                        historySessions.map(session => (
                                            <div
                                                key={session.id}
                                                className={`group flex items-center justify-between p-2 hover:bg-slate-800 cursor-pointer ${session.id === currentSessionId ? 'bg-slate-800/50' : ''}`}
                                                onClick={() => handleSessionSelect(session.id)}
                                            >
                                                <div className="flex flex-col gap-0.5 overflow-hidden">
                                                    <span className="text-xs text-slate-200 truncate font-medium">{session.title || 'New Chat'}</span>
                                                    <span className="text-[10px] text-slate-500">{new Date(session.updatedAt).toLocaleDateString()}</span>
                                                </div>
                                                <button
                                                    onClick={(e) => handleDeleteSession(e, session.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
                                                >
                                                    <span className="sr-only">Delete</span>
                                                    <Wrench size={10} className="rotate-45" /> {/* Use X or trash if Wrench weird, import trash */}
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    <button
                        onClick={handleNewChat}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        title="New Chat"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" ref={messagesContainerRef}>
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-0 animate-in fade-in zoom-in duration-500">
                        <h2 className="text-3xl font-serif text-slate-200 mb-2">Hi, how are you?</h2>
                        <p className="text-slate-400">I can help you verify and clean your data.</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        // We skip rendering tool outputs directly as they are embedded in tool call view
                        if (msg.role === ChatRole.Tool) return null;

                        return (
                            <div key={idx} className="w-full">
                                {renderMessage(msg, idx)}
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Scroll to Bottom Button - Outside scrollable area, absolute to panel */}
            {showScrollButton && (
                <div className="bottom-4 flex justify-center bg-transparent">
                    <button
                        onClick={handleScrollToBottom}
                        className='w-max-[50%] w-[50%] bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-full shadow-lg shadow-purple-500/30 flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-bottom-4 transition-all hover:scale-105 z-20'
                        title="Scroll to bottom"
                    >
                        <ArrowDown size={16} />
                        New messages
                    </button>
                </div>
            )}

            {/* Continue Button */}
            {showContinueButton && (
                <div className="flex justify-end py-2 pr-4">
                    <button
                        onClick={handleContinue}
                        className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-md shadow-lg flex items-center gap-2 text-xs font-medium transition-all hover:scale-105"
                        title="Continue generation"
                    >
                        Continue
                    </button>
                </div>
            )}

            {/* Usage Info */}
            {(totalTokens > 0 || totalCost > 0) && (
                <div className="px-4 py-2 border-t border-slate-800 bg-slate-950">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>{totalTokens.toLocaleString()} tokens used</span>
                        <span>${totalCost.toFixed(4)} spent</span>
                    </div>
                </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/30">
                <div className="relative bg-slate-900 border border-slate-700 rounded-xl focus-within:ring-1 focus-within:ring-purple-500 focus-within:border-purple-500 transition-all">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                        placeholder="Ask about your data..."
                        className="w-full bg-transparent border-none rounded-xl pl-4 pr-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-0 resize-none"
                        rows={1}
                        style={{ minHeight: '46px', maxHeight: '120px' }}
                    />

                    {/* Input Footer */}
                    <div className="flex items-center justify-between px-2 pb-2">
                        <div className="flex items-center gap-2">
                            {/* Model Selector Pill */}
                            {/* Model Selector Pill */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowModelSelector(!showModelSelector)}
                                    className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 font-medium hover:bg-slate-700 hover:text-white transition-colors"
                                >
                                    <Bot size={14} className="text-purple-400" />
                                    <span>{activeModel.model.split('/').pop()}</span>
                                </button>

                                {showModelSelector && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowModelSelector(false)} />
                                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-20 overflow-hidden flex flex-col p-2 space-y-2">
                                            <div className="text-[10px] uppercase font-bold text-slate-500 px-1">Select Model</div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] text-slate-400">Provider</label>
                                                <select
                                                    value={activeModel.provider}
                                                    onChange={(e) => handleProviderChange(e.target.value)}
                                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                                >
                                                    {allProviders.map(p => (
                                                        <option key={p} value={p}>
                                                            {PROVIDERS[p]?.name || p}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] text-slate-400">Model ID</label>
                                                <input
                                                    type="text"
                                                    value={activeModel.model}
                                                    onChange={(e) => setActiveModel(prev => ({ ...prev, model: e.target.value }))}
                                                    placeholder="Model ID (e.g. gpt-4o)"
                                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                                />
                                            </div>

                                            {activeModel.provider !== ProviderType.Gemini && activeModel.provider !== ExternalProvider.Ollama && (
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-slate-400">API Key (Optional override)</label>
                                                    <input
                                                        type="password"
                                                        value={activeModel.apiKey || ''}
                                                        onChange={(e) => setActiveModel(prev => ({ ...prev, apiKey: e.target.value }))}
                                                        placeholder="Leave empty to use Settings"
                                                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                                    />
                                                </div>
                                            )}

                                            {activeModel.provider === ExternalProvider.Other && (
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-slate-400">Base URL (Optional override)</label>
                                                    <input
                                                        type="text"
                                                        value={activeModel.customBaseUrl || ''}
                                                        onChange={(e) => setActiveModel(prev => ({ ...prev, customBaseUrl: e.target.value }))}
                                                        placeholder="e.g. https://api.example.com/v1"
                                                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                            </div>

                            {/* Tools Toggle */}
                            <button
                                onClick={() => setToolsEnabled(!toolsEnabled)}
                                className={`p-1.5 rounded-lg transition-colors ${toolsEnabled
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                    }`}
                                title={toolsEnabled ? "Tools Enabled" : "Tools Disabled"}
                            >
                                <Wrench size={16} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 hidden sm:inline-block">CMD + Enter</span>
                            <button
                                onClick={isStreaming ? handleStop : handleSubmit}
                                disabled={!input.trim() && !isStreaming}
                                className={`p-1.5 rounded-lg transition-colors ${input.trim() || isStreaming
                                    ? isStreaming
                                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                                        : 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-500/20'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    }`}
                            >
                                {isStreaming ? <Square size={16} fill="currentColor" /> : <SendHorizontal size={16} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ReasoningAccordion({ content }: { content: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="mb-2 border border-slate-700/50 rounded-lg overflow-hidden bg-slate-900/30">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-7 flex items-center gap-2 px-3 text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
            >
                <Brain size={14} className="text-purple-400" />
                <span className="font-mono uppercase tracking-wider text-[10px]">thinking</span>
                {isOpen ? <ChevronDown size={12} /> : null}
                {content.length > 0 && <span className="ml-auto opacity-50">{content.length} chars</span>}
            </button>

            {isOpen && (
                <div className="p-3 text-xs text-slate-400 font-mono bg-slate-950/50 border-t border-slate-800/50 whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar">
                    {content}
                </div>
            )}
        </div>
    );
}
