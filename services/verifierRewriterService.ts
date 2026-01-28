import { ExternalProvider, GenerationParams, VerifierItem, ApiType } from '../types';
import { PromptService } from './promptService';
import * as ExternalApiService from './externalApiService';
import * as GeminiService from './geminiService';
import { SettingsService } from './settingsService';
import { extractJsonFields } from '../utils/jsonFieldExtractor';

// Streaming callback type for real-time content display
export type RewriterStreamCallback = (chunk: string, accumulated: string) => void;

export interface RewriterConfig {
    provider: 'gemini' | 'external';
    externalProvider: ExternalProvider;
    apiType?: ApiType; // 'chat' | 'responses' - defaults to 'chat' if not specified
    apiKey: string;
    model: string;
    customBaseUrl?: string;
    maxRetries?: number;
    retryDelay?: number;
    systemPrompt?: string;  // Custom system prompt override
    generationParams?: GenerationParams; // Optional generation parameters
    // Streaming options
    stream?: boolean;
    onStreamChunk?: RewriterStreamCallback;
    // Batch processing options
    concurrency?: number;
    delayMs?: number;
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

// Result type for functions that return both reasoning and answer
export interface RewriteResult {
    reasoning: string;
    answer: string;
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
${item[targetField]}

IMPORTANT: Respond with a VALID JSON object.

Expected Output Format:
{
  "response": "The rewritten content for ${targetField}..."
}`;
}

/**
 * Builds context for message rewriting with conversation history up to target
 * Used for answer-only regeneration
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
REWRITE THE LAST MESSAGE IN THE HISTORY ABOVE (the one marked as TARGET).
IMPORTANT: Only rewrite the ANSWER portion. Preserve any existing reasoning structure.`;
}

/**
 * Builds detailed context for targeted regeneration with specific component selection
 */
function buildMessageContextForTarget(
    item: VerifierItem,
    targetIndex: number,
    targetComponent: 'reasoning' | 'answer' | 'both'
): string {
    if (!item.messages || item.messages.length === 0) {
        return '';
    }

    const targetMessage = item.messages[targetIndex];

    // Parse existing reasoning and answer from message
    const thinkMatch = targetMessage.content.match(/<think>([\s\S]*?)<\/think>/);
    const existingReasoning = thinkMatch ? thinkMatch[1].trim() : (targetMessage.reasoning || '');
    const existingAnswer = thinkMatch
        ? targetMessage.content.replace(/<think>[\s\S]*?<\/think>/, '').trim()
        : targetMessage.content;

    // Build full conversation history
    const contextMessages = item.messages.slice(0, targetIndex + 1);
    const formattedHistory = contextMessages.map((msg, idx) => {
        const isTarget = idx === targetIndex;
        if (isTarget) {
            return `[${msg.role.toUpperCase()}] (TARGET MESSAGE):
<REASONING_TRACE>
${existingReasoning || '(no reasoning present)'}
</REASONING_TRACE>

<ANSWER>
${existingAnswer}
</ANSWER>`;
        }
        return `[${msg.role.toUpperCase()}]:
${msg.content}`;
    }).join('\n\n');

    let instructions = '';
    if (targetComponent === 'reasoning') {
        instructions = `TASK: Regenerate ONLY the REASONING TRACE for the target message.
- Keep the existing ANSWER exactly as it is (do not output it).
- Generate new, improved reasoning that leads to this answer.
- Your response must be a VALID JSON object.

Expected Output Format:
{
  "reasoning": "# 1. Query decomposition..."
}`;
    } else if (targetComponent === 'answer') {
        instructions = `TASK: Regenerate ONLY the ANSWER for the target message.
- Keep the existing REASONING TRACE for reference (do not output it).
- Generate a new, improved answer based on the reasoning.
- Your response must be a VALID JSON object.

Expected Output Format:
{
  "answer": "Here is the improved answer..."
}`;
    } else {
        instructions = `TASK: Regenerate BOTH the REASONING TRACE and ANSWER for the target message.
- Generate new reasoning that thoroughly analyzes the user's request
- Generate a new answer that follows from the reasoning
- Your response must be a VALID JSON object.

Expected Output Format:
{
  "reasoning": "# 1. Query decomposition...",
  "answer": "The solution is..."
}`;
    }

    return `## CONVERSATION HISTORY

${formattedHistory}

---
${instructions}

Respond with ONLY the JSON object, no additional text.`;
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
                const parsed = JSON.parse(input);
                if (typeof parsed === 'object' && parsed !== null) {
                    content = parsed;
                } else {
                    // Parsed as string (or other primitive), force extraction
                    throw new Error("Parsed as non-object");
                }
            }
        } catch (e) {
            // Not valid JSON, try to extract fields robustly
            const extracted = extractJsonFields(input);
            if (extracted.answer || extracted.reasoning) {
                return extracted.answer || extracted.reasoning || input;
            }
            // Treat as raw string
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
 * Parses JSON response that should contain reasoning and answer
 */
function parseRewriteResult(input: any, fallbackReasoning: string, fallbackAnswer: string): RewriteResult {
    let content = input;

    // Try to parse if it's a string
    if (typeof input === 'string') {
        try {
            const trimmed = input.trim();
            // Remove markdown code blocks if present (only at start of content)
            const jsonMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```/) || [null, trimmed];
            const jsonStr = jsonMatch[1].trim();

            if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
                content = JSON.parse(jsonStr);
            }
        } catch (e) {
            console.warn('Failed to parse rewrite result as JSON:', e);
            // If parsing fails, treat entire response as the answer
            return { reasoning: fallbackReasoning, answer: input.trim() };
        }
    }

    // Extract from parsed object
    if (typeof content === 'object' && content !== null) {
        return {
            reasoning: content.reasoning || content.reasoning_trace || content.thought || fallbackReasoning,
            answer: content.answer || content.response || content.content || fallbackAnswer
        };
    }

    return { reasoning: fallbackReasoning, answer: String(content) };
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
                retryDelay: config.retryDelay ?? 1000,
                generationParams: config.generationParams || SettingsService.getDefaultGenerationParams()
            }
        );
        // GeminiService returns { query, reasoning, answer }
        // The rewriten text might be in 'answer' (potentially as a JSON string if prompted)
        // or just the answer text itself
        const rawText = result.answer || result.reasoning || String(result);
        return cleanResponse(rawText);
    } else {
        // Determine appropriate schema for rewrite operations
        const isRewriteField = systemPrompt.toLowerCase().includes('rewrite') && 
                              (systemPrompt.toLowerCase().includes('query') || 
                               systemPrompt.toLowerCase().includes('reasoning') || 
                               systemPrompt.toLowerCase().includes('answer'));
        const responsesSchema: ExternalApiService.ResponsesSchemaName = isRewriteField ? 'rewriteResponse' : 'reasoningTrace';

        const result = await ExternalApiService.callExternalApi({
            provider: config.externalProvider,
            apiKey: config.apiKey || SettingsService.getApiKey(config.externalProvider),
            model: config.model,
            apiType: config.apiType || 'chat', // Pass API type (defaults to 'chat')
            customBaseUrl: config.customBaseUrl || SettingsService.getCustomBaseUrl(),
            systemPrompt,
            userPrompt,
            signal,
            maxRetries: config.maxRetries ?? 2,
            retryDelay: config.retryDelay ?? 1000,
            generationParams: config.generationParams || SettingsService.getDefaultGenerationParams(),
            structuredOutput: true,
            responsesSchema // Pass schema for Responses API
        });

        return cleanResponse(result);
    }
}

/**
 * Calls the AI service to rewrite content with streaming support
 * For external providers: streams tokens in real-time
 * For Gemini: falls back to non-streaming (simulates streaming with final result)
 */
export async function callRewriterAIStreaming(
    systemPrompt: string,
    userPrompt: string,
    config: RewriterConfig,
    onChunk: RewriterStreamCallback,
    signal?: AbortSignal
): Promise<string> {
    if (config.provider === 'gemini') {
        // Gemini SDK streaming is complex, fall back to non-streaming
        // and emit the final result as a single "stream" chunk
        const result = await GeminiService.generateReasoningTrace(
            userPrompt,
            systemPrompt,
            {
                maxRetries: config.maxRetries ?? 2,
                retryDelay: config.retryDelay ?? 1000,
                generationParams: config.generationParams || SettingsService.getDefaultGenerationParams()
            }
        );
        const rawText = result.answer || result.reasoning || String(result);
        const cleaned = cleanResponse(rawText);
        // Simulate streaming by emitting final result
        onChunk(cleaned, cleaned);
        return cleaned;
    } else {
        const result = await ExternalApiService.callExternalApi({
            provider: config.externalProvider,
            apiKey: config.apiKey || SettingsService.getApiKey(config.externalProvider),
            model: config.model,
            apiType: config.apiType || 'chat', // Pass API type (defaults to 'chat')
            customBaseUrl: config.customBaseUrl || SettingsService.getCustomBaseUrl(),
            systemPrompt,
            userPrompt,
            signal,
            maxRetries: config.maxRetries ?? 2,
            retryDelay: config.retryDelay ?? 1000,
            generationParams: config.generationParams || SettingsService.getDefaultGenerationParams(),
            structuredOutput: false,  // Don't parse as JSON during streaming
            stream: true,
            onStreamChunk: (chunk, accumulated) => onChunk(chunk, accumulated)
        });

        return typeof result === 'string' ? result : cleanResponse(result);
    }
}

/**
 * Calls the AI service and returns raw result for structured parsing
 */
async function callRewriterAIRaw(
    systemPrompt: string,
    userPrompt: string,
    config: RewriterConfig,
    signal?: AbortSignal
): Promise<any> {
    if (config.provider === 'gemini') {
        const result = await GeminiService.generateReasoningTrace(
            userPrompt,
            systemPrompt,
            {
                maxRetries: config.maxRetries ?? 2,
                retryDelay: config.retryDelay ?? 1000,
                generationParams: config.generationParams || SettingsService.getDefaultGenerationParams()
            }
        );
        return result.answer || result.reasoning || String(result);
    } else {
        // For raw calls, use reasoning trace schema by default or generic if unsure
        const responsesSchema: ExternalApiService.ResponsesSchemaName = 'reasoningTrace';

        const result = await ExternalApiService.callExternalApi({
            provider: config.externalProvider,
            apiKey: config.apiKey || SettingsService.getApiKey(config.externalProvider),
            model: config.model,
            apiType: config.apiType || 'chat', // Pass API type (defaults to 'chat')
            customBaseUrl: config.customBaseUrl || SettingsService.getCustomBaseUrl(),
            systemPrompt,
            userPrompt,
            signal,
            maxRetries: config.maxRetries ?? 2,
            retryDelay: config.retryDelay ?? 1000,
            generationParams: config.generationParams || SettingsService.getDefaultGenerationParams(),
            structuredOutput: true,
            responsesSchema // Pass schema for Responses API
        });
        return result;
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
 * Rewrites a specific field with streaming support
 * Streams the AI response in real-time via the onChunk callback
 */
export async function rewriteFieldStreaming(
    params: RewriteFieldParams,
    onChunk: RewriterStreamCallback
): Promise<string> {
    const { item, field, config, signal, promptSet } = params;

    const promptName = `${field}_rewrite`;
    const systemPrompt = config.systemPrompt || PromptService.getPrompt('verifier', promptName, promptSet);
    const userPrompt = buildItemContext(item, field);

    const result = await callRewriterAIStreaming(systemPrompt, userPrompt, config, onChunk, signal);
    return result.trim();
}

/**
 * Rewrites a specific message in a multi-turn conversation (answer only)
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

/**
 * Rewrites a specific message with streaming support
 * Defaults to "answer" component rewrite if not specified
 */
export async function rewriteMessageStreaming(
    params: RewriteMessageParams,
    onChunk: RewriterStreamCallback
): Promise<string> {
    const { item, messageIndex, config, signal } = params;

    if (!item.messages || messageIndex >= item.messages.length) {
        throw new Error('Invalid message index or no messages in item');
    }

    const systemPrompt = config.systemPrompt || `You are an expert at improving and correcting AI assistant responses.
Given a conversation and a target message, regenerate ONLY the ANSWER.
Keep the existing reasoning trace exactly as provided.`;

    const userPrompt = buildMessageContextForTarget(item, messageIndex, 'answer');

    const result = await callRewriterAIStreaming(systemPrompt, userPrompt, config, onChunk, signal);
    return result.trim();
}

/**
 * Rewrites both reasoning and answer for a message with streaming support
 */
export async function rewriteMessageBothStreaming(
    params: RewriteMessageParams,
    onChunk: RewriterStreamCallback
): Promise<string> {
    const { item, messageIndex, config, signal } = params;

    if (!item.messages || messageIndex >= item.messages.length) {
        throw new Error('Invalid message index or no messages in item');
    }

    const systemPrompt = config.systemPrompt || `You are an expert at generating detailed reasoning traces and answers.
Given a conversation and a target message, regenerate BOTH the reasoning process AND the final answer.`;

    const userPrompt = buildMessageContextForTarget(item, messageIndex, 'both');

    const result = await callRewriterAIStreaming(systemPrompt, userPrompt, config, onChunk, signal);
    return result.trim();
}

/**
 * Rewrites only the reasoning trace for a message, preserving the answer
 */
export async function rewriteMessageReasoning(params: RewriteMessageParams): Promise<RewriteResult> {
    const { item, messageIndex, config, signal } = params;

    if (!item.messages || messageIndex >= item.messages.length) {
        throw new Error('Invalid message index or no messages in item');
    }

    const targetMessage = item.messages[messageIndex];

    // Extract existing answer to preserve
    const thinkMatch = targetMessage.content.match(/<think>([\s\S]*?)<\/think>/);
    const existingReasoning = thinkMatch ? thinkMatch[1].trim() : (targetMessage.reasoning || '');
    const existingAnswer = thinkMatch
        ? targetMessage.content.replace(/<think>[\s\S]*?<\/think>/, '').trim()
        : targetMessage.content;

    const systemPrompt = config.systemPrompt || `You are an expert at generating detailed reasoning traces. 
Given a conversation and a target message, regenerate ONLY the reasoning/thinking process.
The answer must remain EXACTLY as provided - do not modify it.
Respond with a JSON object: { "reasoning": "your new reasoning", "answer": "preserved answer" }`;

    const userPrompt = buildMessageContextForTarget(item, messageIndex, 'reasoning');

    const result = await callRewriterAIRaw(systemPrompt, userPrompt, config, signal);
    return parseRewriteResult(result, existingReasoning, existingAnswer);
}

/**
 * Rewrites only the reasoning trace for a message with streaming support
 * Uses the same prompt as rewriteMessageReasoning but with real-time streaming
 */
export async function rewriteMessageReasoningStreaming(
    params: RewriteMessageParams,
    onChunk: RewriterStreamCallback
): Promise<string> {
    const { item, messageIndex, config, signal } = params;

    if (!item.messages || messageIndex >= item.messages.length) {
        throw new Error('Invalid message index or no messages in item');
    }

    const systemPrompt = config.systemPrompt || `You are an expert at generating detailed reasoning traces. 
Given a conversation and a target message, regenerate ONLY the reasoning/thinking process.
The answer must remain EXACTLY as provided - do not modify it.`;

    const userPrompt = buildMessageContextForTarget(item, messageIndex, 'reasoning');

    const result = await callRewriterAIStreaming(systemPrompt, userPrompt, config, onChunk, signal);
    return result.trim();
}

/**
 * Rewrites both reasoning and answer for a message
 */
export async function rewriteMessageBoth(params: RewriteMessageParams): Promise<RewriteResult> {
    const { item, messageIndex, config, signal } = params;

    if (!item.messages || messageIndex >= item.messages.length) {
        throw new Error('Invalid message index or no messages in item');
    }

    const targetMessage = item.messages[messageIndex];

    // Extract existing values as fallbacks
    const thinkMatch = targetMessage.content.match(/<think>([\s\S]*?)<\/think>/);
    const existingReasoning = thinkMatch ? thinkMatch[1].trim() : (targetMessage.reasoning || '');
    const existingAnswer = thinkMatch
        ? targetMessage.content.replace(/<think>[\s\S]*?<\/think>/, '').trim()
        : targetMessage.content;

    const systemPrompt = config.systemPrompt || `You are an expert at generating high-quality reasoning traces and answers.
Given a conversation, regenerate both the reasoning process AND the final answer for the target message.
Respond with a JSON object: { "reasoning": "your reasoning", "answer": "your answer" }`;

    const userPrompt = buildMessageContextForTarget(item, messageIndex, 'both');

    const result = await callRewriterAIRaw(systemPrompt, userPrompt, config, signal);
    return parseRewriteResult(result, existingReasoning, existingAnswer);
}

/**
 * Rewrites both reasoning and answer for a non-message VerifierItem
 */
export async function rewriteBoth(params: Omit<RewriteFieldParams, 'field'>): Promise<RewriteResult> {
    const { item, config, signal } = params;

    const systemPrompt = config.systemPrompt || `You are an expert at generating high-quality reasoning traces and answers.
Given a query, regenerate both the reasoning process AND the final answer.
Respond with a JSON object: { "reasoning": "your reasoning", "answer": "your answer" }`;

    const userPrompt = `## ITEM TO REGENERATE

**Query:** ${item.query}

**Current Reasoning Trace:**
${item.reasoning}

**Current Answer:**
${item.answer}

---
TASK: Regenerate BOTH the reasoning trace and answer.
Respond with a JSON object: { "reasoning": "your new reasoning", "answer": "your new answer" }`;

    const result = await callRewriterAIRaw(systemPrompt, userPrompt, config, signal);
    return parseRewriteResult(result, item.reasoning, item.answer);
}
