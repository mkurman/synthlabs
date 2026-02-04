import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Bot, Sparkles,
    ChevronDown, ChevronRight, Wrench, Plus, History, Copy, Check, Square, SendHorizontal, Trash2, ArrowDown, ArrowUp, Brain, RotateCcw, Zap
} from 'lucide-react';
import { ChatService } from '../services/chatService';
import type { ToolCall } from '../services/chatService';
import type { ChatMessage, ChatUsageSummary } from '../types';
import { SettingsService, AVAILABLE_PROVIDERS } from '../services/settingsService';
import type { AssistantDefaults } from '../services/settingsService';
import { PROVIDERS } from '../constants';
import { ToolExecutor } from '../services/toolService';
import type { ToolApprovalInfo } from '../services/toolService';
import { VerifierItem } from '../types';
import { useChatSessions } from '../hooks/useChatSessions';
import { useChatPersistence } from '../hooks/useChatPersistence';
import { useChatScroll } from '../hooks/useChatScroll';
import { ChatRole, ExternalProvider, ProviderType, ToolApprovalAction } from '../interfaces/enums';
import ModelSelector from './ModelSelector';



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

interface PendingToolCall {
    toolCall: ToolCall;
    approvalInfo?: ToolApprovalInfo | null;
}


const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    } catch (err) {
        console.error('Failed to copy', err);
    }
};

const extractUsageSummary = (usage: unknown, startedAt: number | null): ChatUsageSummary | null => {
    if (!usage || typeof usage !== 'object') return null;
    const record = usage as Record<string, unknown>;

    const promptTokens =
        Number(record.prompt_tokens ?? record.promptTokens ?? record.input_tokens ?? record.inputTokens ?? 0);
    const completionTokens =
        Number(record.completion_tokens ?? record.completionTokens ?? record.output_tokens ?? record.outputTokens ?? 0);
    const totalTokens =
        Number(record.total_tokens ?? record.totalTokens ?? (promptTokens + completionTokens) ?? 0);
    const cost = Number(record.cost ?? record.total_cost ?? record.totalCost ?? 0);

    const durationMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
    const durationSeconds = durationMs > 0 ? durationMs / 1000 : 0;
    const tps = durationSeconds > 0 ? completionTokens / durationSeconds : 0;

    return {
        promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
        completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
        totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
        cost: Number.isFinite(cost) ? cost : 0,
        tps: Number.isFinite(tps) ? tps : 0,
        durationMs
    };
};

const ToolCallView = ({
    toolCall,
    result,
    isPendingApproval,
    approvalInfo,
    onApprove,
    onReject,
    onAutoApprove
}: {
    toolCall: ToolCall;
    result?: string;
    isPendingApproval: boolean;
    approvalInfo?: ToolApprovalInfo | null;
    onApprove: () => void;
    onReject: () => void;
    onAutoApprove: () => void;
}) => {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [copiedArgs, setCopiedArgs] = useState(false);
    const [copiedResult, setCopiedResult] = useState(false);
    const [approvalAction, setApprovalAction] = useState<ToolApprovalAction>(ToolApprovalAction.Pending);

    const isCompleted = result !== undefined && !isPendingApproval;
    const approvalLabel = approvalInfo?.approvalSettingName || 'Tool approval';

    return (
        <div className="my-2 border border-slate-700/70 rounded-lg overflow-hidden bg-slate-950/60 w-full">
            {/* Header */}
            <div
                className="flex items-center justify-between p-2 cursor-pointer hover:bg-slate-900/60 transition-colors w-full"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-2 w-full">
                    {isCollapsed ? <ChevronRight size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                    <span className="font-bold text-xs text-slate-100">{toolCall.name}</span>
                </div>
                <div className={`text-[10px] px-1.5 py-0.5 rounded border ${isPendingApproval
                    ? 'bg-amber-900/20 text-amber-400 border-amber-900/30'
                    : isCompleted
                        ? 'bg-slate-900/60 text-blue-400 border-blue-900/30'
                        : 'bg-yellow-900/20 text-yellow-500 border-yellow-900/30'}`}>
                    {isPendingApproval ? 'Awaiting approval' : isCompleted ? 'Completed' : 'Running...'}
                </div>
            </div>

            {/* Content */}
            {!isCollapsed && (
                <div className="p-3 border-t border-slate-800/70 text-xs flex flex-col gap-3 bg-black/20">
                    {/* Arguments */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                            <span>Arguments</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(JSON.stringify(toolCall.args, null, 2), setCopiedArgs); }}
                                className="hover:text-white transition-colors"
                            >
                                {copiedArgs ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                            </button>
                        </div>
                        <div className="bg-slate-950 p-2 rounded border border-slate-800/70 overflow-x-auto relative group">
                            <pre className="text-slate-200 font-mono">
                                {JSON.stringify(toolCall.args, null, 2)}
                            </pre>
                        </div>
                    </div>

                    {isPendingApproval && (
                        <div className="flex flex-col gap-2">
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Approval</div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={approvalAction}
                                    onChange={(e) => {
                                        const nextAction = e.target.value as ToolApprovalAction;
                                        setApprovalAction(nextAction);
                                        if (nextAction === ToolApprovalAction.Approve) {
                                            onApprove();
                                        } else if (nextAction === ToolApprovalAction.Reject) {
                                            onReject();
                                        } else if (nextAction === ToolApprovalAction.AutoApprove) {
                                            onAutoApprove();
                                        }
                                        setApprovalAction(ToolApprovalAction.Pending);
                                    }}
                                    className="w-full bg-slate-950/80 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-blue-500 outline-none"
                                >
                                    <option value={ToolApprovalAction.Pending}>Approval: {approvalLabel}</option>
                                    <option value={ToolApprovalAction.Approve}>Approve</option>
                                    <option value={ToolApprovalAction.Reject}>Reject</option>
                                    <option value={ToolApprovalAction.AutoApprove}>Auto-approve</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Output */}
                    {isCompleted && (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                                <span>Output</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(result, setCopiedResult); }}
                                    className="hover:text-white transition-colors"
                                >
                                    {copiedResult ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                </button>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800/70 overflow-x-auto max-h-[300px] custom-scrollbar">
                                <pre className="text-slate-200 font-mono whitespace-pre-wrap">
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
    const [toolsEnabled, setToolsEnabled] = useState(() => {
        const settings = SettingsService.getSettings();
        return settings.assistantDefaults?.toolsEnabled ?? true;
    });
    const [pendingToolCalls, setPendingToolCalls] = useState<Record<string, PendingToolCall>>({});
    const [autoApproveTools, setAutoApproveTools] = useState<Record<string, boolean>>({});

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
    const [totalPromptTokens, setTotalPromptTokens] = useState(0);
    const [totalCompletionTokens, setTotalCompletionTokens] = useState(0);
    const [totalCost, setTotalCost] = useState(0);
    const [lastUsage, setLastUsage] = useState<ChatUsageSummary | null>(null);

    const resolveDefaultModel = (provider: ChatProvider): string => {
        return SettingsService.getDefaultModel(provider) || (provider === ProviderType.Gemini ? 'gemini-2.0-flash-20240905' : '');
    };

    // Model Selection State
    const [activeModel, setActiveModel] = useState<{ provider: ChatProvider; model: string; apiKey: string; customBaseUrl: string }>(() => {
        const settings = SettingsService.getSettings();
        const assistantDefaults = settings.assistantDefaults;
        if (assistantDefaults) {
            return {
                provider: assistantDefaults.provider as ChatProvider,
                model: assistantDefaults.model || resolveDefaultModel(assistantDefaults.provider as ChatProvider),
                apiKey: assistantDefaults.apiKeyOverride || '',
                customBaseUrl: assistantDefaults.customBaseUrl || ''
            };
        }
        return {
            provider: modelConfig.provider === ProviderType.External ? modelConfig.externalProvider : ProviderType.Gemini,
            model: modelConfig.provider === ProviderType.External
                ? modelConfig.externalModel
                : resolveDefaultModel(ProviderType.Gemini),
            apiKey: modelConfig.provider === ProviderType.External ? modelConfig.externalApiKey : modelConfig.apiKey,
            customBaseUrl: ''
        };
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

    const syncServiceHistory = useCallback((msgs: ChatMessage[]) => {
        if (chatServiceRef.current) {
            chatServiceRef.current.clearHistory();
            msgs.forEach(m => (chatServiceRef.current as any).history.push(m));
        }
    }, []);

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

    useEffect(() => {
        hasHydratedUsageRef.current = false;
        setLastUsage(null);
        setTotalPromptTokens(0);
        setTotalCompletionTokens(0);
        setTotalCost(0);
    }, [currentSessionId]);

    const dataRef = useRef(data);
    const setDataRef = useRef(setData);
    const pendingToolCallsRef = useRef(pendingToolCalls);
    const autoApproveToolsRef = useRef(autoApproveTools);
    const hasLoadedAssistantDefaults = useRef(false);
    const interactionStartRef = useRef<number | null>(null);
    const interactionUsageAddedRef = useRef(false);
    const interactionUsageRef = useRef<ChatUsageSummary | null>(null);
    const hasHydratedUsageRef = useRef(false);

    useEffect(() => {
        pendingToolCallsRef.current = pendingToolCalls;
    }, [pendingToolCalls]);

    useEffect(() => {
        autoApproveToolsRef.current = autoApproveTools;
    }, [autoApproveTools]);

    useEffect(() => {
        if (messages.length === 0) {
            hasHydratedUsageRef.current = false;
            setTotalPromptTokens(0);
            setTotalCompletionTokens(0);
            setTotalCost(0);
            setLastUsage(null);
        }
    }, [messages.length]);

    useEffect(() => {
        if (hasHydratedUsageRef.current) return;
        const usageMessages = messages.filter(msg => Boolean(msg.usage));
        if (usageMessages.length === 0) return;

        const totals = usageMessages.reduce((acc, msg) => {
            const usage = msg.usage!;
            acc.prompt += usage.promptTokens;
            acc.completion += usage.completionTokens;
            acc.cost += usage.cost;
            return acc;
        }, { prompt: 0, completion: 0, cost: 0 });

        setTotalPromptTokens(totals.prompt);
        setTotalCompletionTokens(totals.completion);
        setTotalCost(totals.cost);
        setLastUsage(usageMessages[usageMessages.length - 1].usage || null);
        hasHydratedUsageRef.current = true;
    }, [messages]);

    useEffect(() => {
        if (hasLoadedAssistantDefaults.current) return;
        SettingsService.getSettingsAsync().then((settings) => {
            if (hasLoadedAssistantDefaults.current) return;
            const assistantDefaults = settings.assistantDefaults;
            if (!assistantDefaults) {
                hasLoadedAssistantDefaults.current = true;
                return;
            }
            const provider = assistantDefaults.provider as ChatProvider;
            setActiveModel({
                provider,
                model: assistantDefaults.model || resolveDefaultModel(provider),
                apiKey: assistantDefaults.apiKeyOverride || '',
                customBaseUrl: assistantDefaults.customBaseUrl || ''
            });
            if (typeof assistantDefaults.toolsEnabled === 'boolean') {
                setToolsEnabled(assistantDefaults.toolsEnabled);
            }
            hasLoadedAssistantDefaults.current = true;
        }).catch((err) => {
            console.error('Failed to load assistant settings', err);
            hasLoadedAssistantDefaults.current = true;
        });
    }, []);

    useEffect(() => {
        const nextDefaults: AssistantDefaults = {
            provider: activeModel.provider,
            model: activeModel.model,
            apiKeyOverride: activeModel.apiKey || '',
            customBaseUrl: activeModel.customBaseUrl || '',
            toolsEnabled
        };
        SettingsService.updateSettings({ assistantDefaults: nextDefaults });
    }, [activeModel, toolsEnabled]);



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

        // Initialize ChatService only if not already initialized
        if (!chatServiceRef.current) {
            chatServiceRef.current = new ChatService(executor);
        }
    }, [toolExecutor]);

    useChatPersistence({ currentSessionId: currentSessionId || '', messages });
    const { handleScrollToBottom } = useChatScroll({
        messages,
        isStreaming,
        lastMessageLength: messages.length > 0 ? (messages[messages.length - 1]?.content?.length || 0) : 0,
        autoScroll,
        messagesEndRef,
        messagesContainerRef,
        setAutoScroll,
        setShowScrollButton
    });

    useEffect(() => {
        // Never show scroll button during streaming
        if (isStreaming) {
            setShowScrollButton(false);
            return;
        }
        // Only show after streaming completes if not near bottom
        if (messages.length > 0 && !autoScroll) {
            setShowScrollButton(true);
        } else if (autoScroll) {
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
        interactionStartRef.current = Date.now();
        interactionUsageAddedRef.current = false;
        interactionUsageRef.current = null;
        setLastUsage(null);

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
        interactionStartRef.current = Date.now();
        interactionUsageAddedRef.current = false;
        interactionUsageRef.current = null;
        setLastUsage(null);

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
                        const summary = extractUsageSummary(usage, interactionStartRef.current);
                        if (summary) {
                            interactionUsageRef.current = summary;
                            setLastUsage(summary);
                            if (!interactionUsageAddedRef.current) {
                                interactionUsageAddedRef.current = true;
                                setTotalPromptTokens(prev => prev + summary.promptTokens);
                                setTotalCompletionTokens(prev => prev + summary.completionTokens);
                                setTotalCost(prev => prev + summary.cost);
                            }
                        }
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
                toolCalls: toolCalls,
                usage: interactionUsageRef.current || undefined
            };

            if (interactionUsageRef.current) {
                setMessages(prev => {
                    const next = [...prev];
                    const lastIndex = next.length - 1;
                    if (lastIndex >= 0 && next[lastIndex]?.role === ChatRole.Model) {
                        next[lastIndex] = { ...next[lastIndex], usage: interactionUsageRef.current || undefined };
                    }
                    return next;
                });
            }

            chatServiceRef.current.getHistory().push(modelMsgEntry);

            if (toolCalls && toolCalls.length > 0) {
                let pausedForApproval = false;
                for (const tc of toolCalls) {
                    if (tc.name === 'invalid_tool_call') {
                        const resultStr = `System Error: The tool call JSON was invalid.\n` +
                            `Error: ${tc.args.error}\n` +
                            `Received: ${tc.args.raw}\n\n` +
                            `Please ensure you use valid JSON inside <tool_call> tags. Example:\n` +
                            `<tool_call>\n{"name": "toolName", "arguments": { "arg": "value" }}\n</tool_call>`;

                        upsertToolMessage(tc.id, resultStr);

                        chatServiceRef.current.getHistory().push({
                            role: ChatRole.Tool,
                            content: resultStr,
                            toolCallId: tc.id
                        } as ChatMessage);
                        continue;
                    }

                    const approvalInfo = executor.getToolApproval(tc.name);
                    const requiresApproval = approvalInfo?.requiresApproval ?? false;
                    const isAutoApproved = requiresApproval && Boolean(autoApproveToolsRef.current[tc.name]);

                    if (requiresApproval && !isAutoApproved) {
                        setPendingToolCalls(prev => ({
                            ...prev,
                            [tc.id]: { toolCall: tc, approvalInfo }
                        }));
                        pausedForApproval = true;
                        break;
                    }

                    upsertToolMessage(tc.id, `Executing ${tc.name}...`);

                    let resultStr = '';

                    try {
                        const result = await executor.executeTool(tc.name, tc.args);
                        resultStr = JSON.stringify(result, null, 2);
                    } catch (err: unknown) {
                        const errorMessage = err instanceof Error ? err.message : String(err);
                        resultStr = `Tool Execution Error: ${errorMessage}`;
                    }

                    upsertToolMessage(tc.id, resultStr);

                    chatServiceRef.current.getHistory().push({
                        role: ChatRole.Tool,
                        content: resultStr,
                        toolCallId: tc.id
                    } as ChatMessage);
                }
                if (pausedForApproval) {
                    return;
                }
                turnCount++;
                setMessages(prev => [...prev, { role: ChatRole.Model, content: '' }]);
            } else {
                break;
            }
        }
    };

    const upsertToolMessage = useCallback((toolCallId: string, content: string) => {
        setMessages(prev => {
            const index = prev.findIndex(m => m.role === ChatRole.Tool && m.toolCallId === toolCallId);
            if (index === -1) {
                return [...prev, { role: ChatRole.Tool, content, toolCallId } as ChatMessage];
            }
            const next = [...prev];
            next[index] = { ...next[index], content };
            return next;
        });
    }, []);

    const getToolApprovalInfo = useCallback((toolName: string): ToolApprovalInfo | null => {
        const executor = toolExecutor || toolExecutorRef.current;
        if (!executor) return null;
        return executor.getToolApproval(toolName);
    }, [toolExecutor]);

    const clearPendingToolCall = useCallback((toolCallId: string) => {
        setPendingToolCalls(prev => {
            if (!prev[toolCallId]) return prev;
            const next = { ...prev };
            delete next[toolCallId];
            return next;
        });
    }, []);

    const handleToolApproval = useCallback(async (toolCallId: string, action: ToolApprovalAction) => {
        const executor = toolExecutor || toolExecutorRef.current;
        if (!executor || !chatServiceRef.current) return;

        const pendingCall = pendingToolCallsRef.current[toolCallId];
        if (!pendingCall) return;

        const { toolCall } = pendingCall;

        if (action === ToolApprovalAction.AutoApprove) {
            setAutoApproveTools(prev => ({ ...prev, [toolCall.name]: true }));
        }

        setIsStreaming(true);

        let resultStr = '';
        if (action === ToolApprovalAction.Reject) {
            resultStr = 'Tool call rejected by user.';
        } else {
            try {
                const result = await executor.executeTool(toolCall.name, toolCall.args);
                resultStr = JSON.stringify(result, null, 2);
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                resultStr = `Tool Execution Error: ${errorMessage}`;
            }
        }

        upsertToolMessage(toolCall.id, resultStr);

        chatServiceRef.current.getHistory().push({
            role: ChatRole.Tool,
            content: resultStr,
            toolCallId: toolCall.id
        } as ChatMessage);

        clearPendingToolCall(toolCallId);

        try {
            await processTurn();
        } catch (err) {
            console.error(err);
            setMessages(prev => [...prev, { role: ChatRole.Model, content: "Error: " + String(err) } as ChatMessage]);
        } finally {
            setIsStreaming(false);
        }
    }, [clearPendingToolCall, processTurn, toolExecutor]);

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
                                const toolCall = tc as ToolCall;
                                const toolResultMsg = messages.slice(idx + 1).find(
                                    m => m.role === ChatRole.Tool && m.toolCallId === toolCall.id
                                );
                                const result = toolResultMsg ? toolResultMsg.content : undefined;
                                const pendingCall = pendingToolCalls[toolCall.id];
                                const approvalInfo = pendingCall?.approvalInfo || getToolApprovalInfo(toolCall.name);
                                const isPendingApproval = Boolean(pendingCall);

                                return (
                                    <ToolCallView
                                        key={toolCall.id || i}
                                        toolCall={toolCall}
                                        result={result}
                                        isPendingApproval={isPendingApproval}
                                        approvalInfo={approvalInfo}
                                        onApprove={() => handleToolApproval(toolCall.id, ToolApprovalAction.Approve)}
                                        onReject={() => handleToolApproval(toolCall.id, ToolApprovalAction.Reject)}
                                        onAutoApprove={() => handleToolApproval(toolCall.id, ToolApprovalAction.AutoApprove)}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {/* Only render text bubble if there is content or if it's currently streaming */}
                    {(msg.content?.trim() || (isStreaming && idx === messages.length - 1)) && (
                        <div className={`relative group px-4 py-2 rounded-2xl text-[14px] whitespace-pre-wrap break-words break-all ${isUser
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-900/60 text-slate-100 border border-slate-700/70'
                            }`}>
                            {msg.content}
                            {!msg.content && isStreaming && idx === messages.length - 1 && (
                                <span className="animate-pulse">▍</span>
                            )}

                            {/* Actions: Copy & Delete */}
                            {!isStreaming && (
                                <div className={`absolute -bottom-6 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-slate-950/70 rounded px-1 py-0.5 border border-slate-700/70`}>
                                    <button
                                        onClick={() => copyToClipboard(msg.content || '', () => { })}
                                        className="p-1 text-slate-300 hover:text-white transition-colors"
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
                                            className="p-1 text-slate-300 hover:text-sky-400 transition-colors"
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
                                        className="p-1 text-slate-300 hover:text-red-400 transition-colors"
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
        <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800/70 w-[400px] relative">
            {/* Header */}
            <div className="h-14 border-b border-slate-800/70 flex items-center justify-between px-4 bg-slate-950/70">
                <div className="flex items-center gap-2 text-slate-100 font-medium">
                    <Sparkles size={16} className="text-blue-400" />
                    <span>Data Assistant</span>
                </div>
                <div className="flex items-center gap-1 relative">
                    <button
                        onClick={handleHistoryClick}
                        className={`p-1.5 text-slate-300 hover:text-white hover:bg-slate-900/60 rounded-lg transition-colors ${showHistory ? 'bg-slate-900/60 text-white' : ''}`}
                        title="Chat History"
                    >
                        <History size={16} />
                    </button>

                    {/* History Popover */}
                    {showHistory && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setShowHistory(false)} />
                            <div className="absolute top-full right-0 mt-2 w-64 bg-slate-950/70 border border-slate-700/70 rounded-xl shadow-2xl z-40 overflow-hidden flex flex-col max-h-96">
                                <div className="p-2 border-b border-slate-800/70 font-bold text-xs text-slate-400 uppercase">Recent Chats</div>
                                <div className="overflow-y-auto custom-scrollbar flex-1">
                                    {historySessions.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-slate-400">No history yet</div>
                                    ) : (
                                        historySessions.map(session => (
                                            <div
                                                key={session.id}
                                                className={`group flex items-center justify-between p-2 hover:bg-slate-900/60 cursor-pointer ${session.id === currentSessionId ? 'bg-slate-900/60' : ''}`}
                                                onClick={() => handleSessionSelect(session.id)}
                                            >
                                                <div className="flex flex-col gap-0.5 overflow-hidden">
                                                    <span className="text-xs text-slate-100 truncate font-medium">{session.title || 'New Chat'}</span>
                                                    <span className="text-[10px] text-slate-400">{new Date(session.updatedAt).toLocaleDateString()}</span>
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
                        className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-900/60 rounded-lg transition-colors"
                        title="New Chat"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" ref={messagesContainerRef}>
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 animate-in fade-in zoom-in duration-500">
                        <h2 className="text-3xl font-serif text-slate-100 mb-2">Hi, how are you?</h2>
                        <p className="text-slate-300">I can help you verify and clean your data.</p>
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
                        className='w-max-[50%] w-[50%] bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full shadow-lg shadow-blue-500/30 flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-bottom-4 transition-all hover:scale-105 z-20'
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
                        className="bg-slate-800/70 hover:bg-slate-600 text-slate-100 px-3 py-1.5 rounded-md shadow-lg flex items-center gap-2 text-xs font-medium transition-all hover:scale-105"
                        title="Continue generation"
                    >
                        Continue
                    </button>
                </div>
            )}

            {/* Usage Info */}
            <div className="px-4 pt-2 border-t border-slate-800/70 bg-slate-950">
                <div className="flex items-center justify-between text-[10px] text-slate-300">
                    <div className="flex items-center align-center gap-3">
                        <span className="inline-flex items-center gap-1">
                            <ArrowUp className="w-3 h-3 text-emerald-400" />
                            {totalPromptTokens.toLocaleString()}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <ArrowDown className="w-3 h-3 text-sky-400" />
                            {totalCompletionTokens.toLocaleString()}
                        </span>
                        <span className="text-slate-500">
                            {lastUsage ? (
                                <div className="text-[10px] text-slate-500 flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 px-2 py-0.5 text-[9px] text-amber-300">
                                        <Zap className="w-3 h-3 text-amber-400" />
                                        {lastUsage.tps.toFixed(1)} tps
                                    </span>
                                </div>
                            ) : (
                                <div className="text-[10px] text-slate-500">
                                    Usage pending
                                </div>
                            )}
                        </span>
                    </div>
                    <span>${totalCost.toFixed(4)}</span>
                </div>

            </div>

            {/* Input */}
            <div className="p-4 pt-2 bg-slate-950/60">
                <div className="relative bg-slate-950/70 border border-slate-700/70 rounded-xl focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
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
                        className="w-full bg-transparent border-none rounded-xl pl-4 pr-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-0 resize-none"
                        rows={1}
                        style={{ minHeight: '46px', maxHeight: '120px' }}
                    />

                    {/* Input Footer */}
                    <div className="flex items-center justify-between px-2 pb-2">
                        <div className="flex items-center gap-2">
                            {/* Model Selector Pill */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowModelSelector(!showModelSelector)}
                                    className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-900/60 border border-slate-700/70 text-xs text-slate-200 font-medium hover:bg-slate-800/70 hover:text-white transition-colors"
                                >
                                    <Bot size={14} className="text-blue-400" />
                                    <span>{activeModel.model.split('/').pop()}</span>
                                </button>

                                {showModelSelector && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowModelSelector(false)} />
                                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-slate-950/95 border border-slate-700/80 rounded-xl shadow-2xl z-20 overflow-hidden flex flex-col p-2 space-y-2">
                                            <div className="text-[10px] uppercase font-bold text-slate-400 px-1">Model & Tools</div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] text-slate-300">Provider</label>
                                                <select
                                                    value={activeModel.provider}
                                                    onChange={(e) => handleProviderChange(e.target.value)}
                                                    className="w-full bg-slate-950/90 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-blue-500 outline-none"
                                                >
                                                    {allProviders.map(p => (
                                                        <option key={p} value={p}>
                                                            {PROVIDERS[p]?.name || p}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] text-slate-300">Model ID</label>
                                                <ModelSelector
                                                    provider={activeModel.provider}
                                                    value={activeModel.model}
                                                    onChange={(model) => setActiveModel(prev => ({ ...prev, model }))}
                                                    apiKey={activeModel.apiKey || SettingsService.getApiKey(activeModel.provider)}
                                                    customBaseUrl={activeModel.customBaseUrl}
                                                    placeholder="Select or enter model"
                                                    className="w-full"
                                                />
                                            </div>

                                            {activeModel.provider !== ProviderType.Gemini && activeModel.provider !== ExternalProvider.Ollama && (
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-slate-300">API Key (Optional override)</label>
                                                    <input
                                                        type="password"
                                                        value={activeModel.apiKey || ''}
                                                        onChange={(e) => setActiveModel(prev => ({ ...prev, apiKey: e.target.value }))}
                                                        placeholder="Leave empty to use Settings"
                                                        className="w-full bg-slate-950/90 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-blue-500 outline-none"
                                                    />
                                                </div>
                                            )}

                                            {activeModel.provider === ExternalProvider.Other && (
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-slate-300">Base URL (Optional override)</label>
                                                    <input
                                                        type="text"
                                                        value={activeModel.customBaseUrl || ''}
                                                        onChange={(e) => setActiveModel(prev => ({ ...prev, customBaseUrl: e.target.value }))}
                                                        placeholder="e.g. https://api.example.com/v1"
                                                        className="w-full bg-slate-950/90 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-blue-500 outline-none"
                                                    />
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between pt-2 border-t border-slate-800/70">
                                                <span className="text-[10px] text-slate-300">Tools</span>
                                                <button
                                                    onClick={() => setToolsEnabled(!toolsEnabled)}
                                                    className={`p-1.5 rounded-lg transition-colors ${toolsEnabled
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                                                        }`}
                                                    title={toolsEnabled ? "Tools Enabled" : "Tools Disabled"}
                                                >
                                                    <Wrench size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 hidden sm:inline-block">CMD + Enter</span>
                            <button
                                onClick={isStreaming ? handleStop : handleSubmit}
                                disabled={!input.trim() && !isStreaming}
                                className={`p-1.5 rounded-lg transition-colors ${input.trim() || isStreaming
                                    ? isStreaming
                                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                                        : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'
                                    : 'bg-slate-900/60 text-slate-400 cursor-not-allowed'
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
        <div className="mb-2 border border-slate-700/70 rounded-lg overflow-hidden bg-slate-950/60">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-7 flex items-center gap-2 px-3 text-xs text-slate-300 hover:text-slate-200 hover:bg-slate-900/60 transition-colors"
            >
                <Brain size={14} className="text-blue-400" />
                <span className="font-mono uppercase tracking-wider text-[10px]">thinking</span>
                {isOpen ? <ChevronDown size={12} /> : null}
                {content.length > 0 && <span className="ml-auto opacity-50">{content.length} chars</span>}
            </button>

            {isOpen && (
                <div className="p-3 text-xs text-slate-300 font-mono bg-slate-950/70 border-t border-slate-800/70 whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar">
                    {content}
                </div>
            )}
        </div>
    );
}
