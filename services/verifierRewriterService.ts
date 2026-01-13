import { ExternalProvider, VerifierItem } from '../types';
import { PromptService } from './promptService';
import * as ExternalApiService from './externalApiService';
import * as GeminiService from './geminiService';
import { SettingsService } from './settingsService';

export interface RewriterConfig {
    provider: 'gemini' | 'external';
    externalProvider: ExternalProvider;
    apiKey: string;
    model: string;
    customBaseUrl?: string;
    maxRetries?: number;
    retryDelay?: number;
    systemPrompt?: string;  // Custom system prompt override
}

export type RewritableField = 'query' | 'reasoning' | 'answer';

interface RewriteFieldParams {
    item: VerifierItem;
    field: RewritableField;
    config: RewriterConfig;
    signal?: AbortSignal;
    promptSet?: string;  // Optional prompt set override for auto-routing
}

interface RewriteMessageParams {
    item: VerifierItem;
    messageIndex: number;
    config: RewriterConfig;
    signal?: AbortSignal;
    promptSet?: string;  // Optional prompt set override for auto-routing
}

/**
 * Builds context string from a VerifierItem for AI rewriting
 */
function buildItemContext(item: VerifierItem, targetField: RewritableField): string {
    return `## FULL ITEM CONTEXT

**Query:** ${item.query}

**Reasoning Trace:**
${item.reasoning}

**Answer:**
${item.answer}

---
TARGET FIELD TO REWRITE: ${targetField.toUpperCase()}
Current value of ${targetField}:
${item[targetField]}`;
}

/**
 * Builds context for message rewriting with conversation history up to target
 */
function buildMessageContext(item: VerifierItem, targetIndex: number): string {
    if (!item.messages || item.messages.length === 0) {
        return '';
    }

    const contextMessages = item.messages.slice(0, targetIndex + 1);
    const formattedHistory = contextMessages.map((msg, idx) => {
        const isTarget = idx === targetIndex;
        return `[${msg.role.toUpperCase()}]${isTarget ? ' (TARGET TO REWRITE)' : ''}:
${msg.content}`;
    }).join('\n\n');

    return `## CONVERSATION HISTORY (up to and including target message)

${formattedHistory}

---
REWRITE THE LAST MESSAGE IN THE HISTORY ABOVE (the one marked as TARGET).`;
}

/**
 * Helper to extract content from potentially JSON-wrapped response
 */
function cleanResponse(input: any): string {
    let content = input;

    // If input is a string that looks like JSON, try to parse it
    if (typeof input === 'string') {
        try {
            const trimmed = input.trim();
            // Check if it looks like a JSON object using simple heuristic
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                content = JSON.parse(input);
            }
        } catch (e) {
            // Not valid JSON, treat as raw string
            return input;
        }
    }

    // If content is an object (either returned directly or parsed)
    if (typeof content === 'object' && content !== null) {
        return content.response || content.answer || content.content || content.text || content.reasoning || JSON.stringify(content);
    }

    return String(content);
}

/**
 * Calls the AI service to rewrite content
 */
export async function callRewriterAI(
    systemPrompt: string,
    userPrompt: string,
    config: RewriterConfig,
    signal?: AbortSignal
): Promise<string> {
    if (config.provider === 'gemini') {
        const result = await GeminiService.generateReasoningTrace(
            userPrompt,
            systemPrompt,
            {
                maxRetries: config.maxRetries ?? 2,
                retryDelay: config.retryDelay ?? 1000
            }
        );
        // GeminiService returns { query, reasoning, answer }
        // The rewriten text might be in 'answer' (potentially as a JSON string if prompted)
        // or just the answer text itself
        const rawText = result.answer || result.reasoning || String(result);
        return cleanResponse(rawText);
    } else {
        const result = await ExternalApiService.callExternalApi({
            provider: config.externalProvider,
            apiKey: config.apiKey || SettingsService.getApiKey(config.externalProvider),
            model: config.model,
            customBaseUrl: config.customBaseUrl || SettingsService.getCustomBaseUrl(),
            systemPrompt,
            userPrompt,
            signal,
            maxRetries: config.maxRetries ?? 2,
            retryDelay: config.retryDelay ?? 1000,
            structuredOutput: true
        });

        return cleanResponse(result);
    }
}

/**
 * Rewrites a specific field of a VerifierItem using AI
 */
export async function rewriteField(params: RewriteFieldParams): Promise<string> {
    const { item, field, config, signal, promptSet } = params;

    // Load prompt from PromptService (uses promptSet if provided for auto-routing consistency)
    // "query" -> "query_rewrite", "reasoning" -> "reasoning_rewrite", etc.
    const promptName = `${field}_rewrite`;
    // Use custom prompt from config if provided, otherwise load from PromptService
    const systemPrompt = config.systemPrompt || PromptService.getPrompt('verifier', promptName, promptSet);

    const userPrompt = buildItemContext(item, field);

    const result = await callRewriterAI(systemPrompt, userPrompt, config, signal);
    return result.trim();
}

/**
 * Rewrites a specific message in a multi-turn conversation
 */
export async function rewriteMessage(params: RewriteMessageParams): Promise<string> {
    const { item, messageIndex, config, signal, promptSet } = params;

    if (!item.messages || messageIndex >= item.messages.length) {
        throw new Error('Invalid message index or no messages in item');
    }

    // Use custom prompt from config if provided, otherwise load from PromptService
    const systemPrompt = config.systemPrompt || PromptService.getPrompt('verifier', 'message_rewrite', promptSet);
    const userPrompt = buildMessageContext(item, messageIndex);

    const result = await callRewriterAI(systemPrompt, userPrompt, config, signal);
    return result.trim();
}
