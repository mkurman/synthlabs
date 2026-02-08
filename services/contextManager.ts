/**
 * Context Manager Service
 * Handles intelligent context window management with multiple compaction strategies.
 */

import { estimateMessageTokens, estimateConversationTokens } from './tokenEstimator';
import { getModelContextLimit, ContextCompactionStrategy } from '../constants';
import type { ChatMessage } from '../types';
import { ChatRole } from '../interfaces/enums';

export interface ContextCompactionConfig {
    strategy: ContextCompactionStrategy;
    responseReserve: number;
    triggerThreshold: number;
    keepRecentMessages: number;
    summarizePrompt: string;
}

export interface CompactionResult {
    messages: ChatMessage[];
    wasCompacted: boolean;
    compactionType: ContextCompactionStrategy | null;
    originalTokens: number;
    finalTokens: number;
    removedMessages: number;
    summary?: string;
}

export interface ContextStatus {
    currentTokens: number;
    maxTokens: number;
    availableTokens: number;
    usagePercent: number;
    needsCompaction: boolean;
}

export type SummarizationCallback = (status: 'starting' | 'summarizing' | 'complete' | 'error', summary?: string) => void;

const DEFAULT_CONFIG: ContextCompactionConfig = {
    strategy: ContextCompactionStrategy.TruncateMiddle,
    responseReserve: 4096,
    triggerThreshold: 0.85,
    keepRecentMessages: 10,
    summarizePrompt: `Summarize the following conversation concisely, preserving key facts, decisions, and context needed to continue the conversation. Keep the summary under 500 words.

Conversation to summarize:
{conversation}

Summary:`,
};

export class ContextManager {
    private config: ContextCompactionConfig;
    private modelId: string;
    private contextLimit: number;

    constructor(modelId: string, config?: Partial<ContextCompactionConfig>) {
        this.modelId = modelId;
        this.contextLimit = getModelContextLimit(modelId);
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Update the model being used (recalculates context limit).
     */
    public setModel(modelId: string): void {
        this.modelId = modelId;
        this.contextLimit = getModelContextLimit(modelId);
    }

    /**
     * Update configuration.
     */
    public setConfig(config: Partial<ContextCompactionConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get current context limit.
     */
    public getContextLimit(): number {
        return this.contextLimit;
    }

    /**
     * Get available tokens for the request (after response reserve).
     */
    public getAvailableTokens(): number {
        return this.contextLimit - this.config.responseReserve;
    }

    /**
     * Check context status for a given message array.
     */
    public getContextStatus(messages: ChatMessage[]): ContextStatus {
        const openAiMessages = this.convertToOpenAiFormat(messages);
        const currentTokens = estimateConversationTokens(openAiMessages);
        const maxTokens = this.getAvailableTokens();
        const availableTokens = Math.max(0, maxTokens - currentTokens);
        const usagePercent = currentTokens / maxTokens;
        const needsCompaction = usagePercent >= this.config.triggerThreshold;

        return {
            currentTokens,
            maxTokens,
            availableTokens,
            usagePercent,
            needsCompaction,
        };
    }

    /**
     * Compact messages if needed, using configured strategy.
     */
    public async compactIfNeeded(
        messages: ChatMessage[],
        summarizeFunction?: (prompt: string) => Promise<string>,
        onSummarizationStatus?: SummarizationCallback
    ): Promise<CompactionResult> {
        const status = this.getContextStatus(messages);

        if (!status.needsCompaction || this.config.strategy === ContextCompactionStrategy.None) {
            return {
                messages,
                wasCompacted: false,
                compactionType: null,
                originalTokens: status.currentTokens,
                finalTokens: status.currentTokens,
                removedMessages: 0,
            };
        }

        switch (this.config.strategy) {
            case ContextCompactionStrategy.TruncateOld:
                return this.truncateOld(messages, status);

            case ContextCompactionStrategy.TruncateMiddle:
                return this.truncateMiddle(messages, status);

            case ContextCompactionStrategy.Summarize:
                if (!summarizeFunction) {
                    console.warn('[ContextManager] Summarize strategy requires a summarize function, falling back to truncate-middle');
                    return this.truncateMiddle(messages, status);
                }
                return this.summarize(messages, status, summarizeFunction, onSummarizationStatus);

            default:
                return {
                    messages,
                    wasCompacted: false,
                    compactionType: null,
                    originalTokens: status.currentTokens,
                    finalTokens: status.currentTokens,
                    removedMessages: 0,
                };
        }
    }

    /**
     * Truncate oldest messages (keep recent).
     */
    private truncateOld(messages: ChatMessage[], status: ContextStatus): CompactionResult {
        const targetTokens = this.getAvailableTokens() * this.config.triggerThreshold * 0.8;
        const result: ChatMessage[] = [];
        let currentTokens = 0;

        // Work backwards from most recent
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const msgTokens = estimateMessageTokens(this.convertSingleMessage(msg));

            if (currentTokens + msgTokens <= targetTokens) {
                result.unshift(msg);
                currentTokens += msgTokens;
            } else {
                break;
            }
        }

        const finalStatus = this.getContextStatus(result);

        return {
            messages: result,
            wasCompacted: true,
            compactionType: ContextCompactionStrategy.TruncateOld,
            originalTokens: status.currentTokens,
            finalTokens: finalStatus.currentTokens,
            removedMessages: messages.length - result.length,
        };
    }

    /**
     * Truncate middle messages (keep system + recent).
     */
    private truncateMiddle(messages: ChatMessage[], status: ContextStatus): CompactionResult {
        if (messages.length <= this.config.keepRecentMessages + 1) {
            return {
                messages,
                wasCompacted: false,
                compactionType: null,
                originalTokens: status.currentTokens,
                finalTokens: status.currentTokens,
                removedMessages: 0,
            };
        }

        // Keep first message (often system context) + last N messages
        const firstMessage = messages[0];
        const recentMessages = messages.slice(-this.config.keepRecentMessages);

        const result = [firstMessage, ...recentMessages];
        const finalStatus = this.getContextStatus(result);

        // If still too large, progressively reduce
        let finalResult = result;
        let keepCount = this.config.keepRecentMessages;

        while (finalStatus.needsCompaction && keepCount > 2) {
            keepCount = Math.floor(keepCount * 0.7);
            const newRecent = messages.slice(-keepCount);
            finalResult = [firstMessage, ...newRecent];
            const newStatus = this.getContextStatus(finalResult);
            if (!newStatus.needsCompaction) break;
        }

        const actualFinalStatus = this.getContextStatus(finalResult);

        return {
            messages: finalResult,
            wasCompacted: true,
            compactionType: ContextCompactionStrategy.TruncateMiddle,
            originalTokens: status.currentTokens,
            finalTokens: actualFinalStatus.currentTokens,
            removedMessages: messages.length - finalResult.length,
        };
    }

    /**
     * Summarize older messages using LLM.
     */
    private async summarize(
        messages: ChatMessage[],
        status: ContextStatus,
        summarizeFunction: (prompt: string) => Promise<string>,
        onStatus?: SummarizationCallback
    ): Promise<CompactionResult> {
        if (messages.length <= this.config.keepRecentMessages + 1) {
            return {
                messages,
                wasCompacted: false,
                compactionType: null,
                originalTokens: status.currentTokens,
                finalTokens: status.currentTokens,
                removedMessages: 0,
            };
        }

        onStatus?.('starting');

        try {
            // Separate messages to summarize vs keep
            const recentCount = this.config.keepRecentMessages;
            const toSummarize = messages.slice(0, -recentCount);
            const toKeep = messages.slice(-recentCount);

            // Build conversation text for summarization
            const conversationText = toSummarize.map(msg => {
                const role = msg.role === 'model' ? 'Assistant' : msg.role === 'user' ? 'User' : msg.role;
                return `${role}: ${msg.content || ''}`;
            }).join('\n\n');

            const prompt = this.config.summarizePrompt.replace('{conversation}', conversationText);

            onStatus?.('summarizing');

            const summary = await summarizeFunction(prompt);

            onStatus?.('complete', summary);

            // Create summary message
            const summaryMessage: ChatMessage = {
                role: ChatRole.User, // Use user role for context
                content: `[Previous conversation summary]\n${summary}\n[End of summary - continuing conversation]`,
            };

            const result = [summaryMessage, ...toKeep];
            const finalStatus = this.getContextStatus(result);

            return {
                messages: result,
                wasCompacted: true,
                compactionType: ContextCompactionStrategy.Summarize,
                originalTokens: status.currentTokens,
                finalTokens: finalStatus.currentTokens,
                removedMessages: toSummarize.length,
                summary,
            };
        } catch (error) {
            console.error('[ContextManager] Summarization failed:', error);
            onStatus?.('error');

            // Fall back to truncate-middle
            return this.truncateMiddle(messages, status);
        }
    }

    /**
     * Convert internal messages to OpenAI format for token estimation.
     */
    private convertToOpenAiFormat(messages: ChatMessage[]): Array<{ role: string; content: string | null; tool_calls?: unknown[] }> {
        return messages.map(msg => this.convertSingleMessage(msg));
    }

    private convertSingleMessage(msg: ChatMessage): { role: string; content: string | null; tool_calls?: unknown[] } {
        return {
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.content || null,
            tool_calls: msg.toolCalls?.map(tc => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            })),
        };
    }
}

// Singleton instance for default usage
let defaultManager: ContextManager | null = null;

export function getDefaultContextManager(modelId?: string): ContextManager {
    if (!defaultManager || (modelId && defaultManager['modelId'] !== modelId)) {
        defaultManager = new ContextManager(modelId || 'gpt-4');
    }
    return defaultManager;
}
