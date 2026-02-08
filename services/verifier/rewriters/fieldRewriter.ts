import { VerifierItem } from '../../../types';
import { PromptCategory, PromptRole, OutputFieldName, VerifierRewriteTarget } from '../../../interfaces/enums';
import { PromptService } from '../../promptService';
import { RewriterConfig, RewriterStreamCallback, callRewriterAI, callRewriterAIStreaming, callRewriterAIStreamingWithSystemPrompt } from './aiCaller';
import { buildItemContext, buildItemContextPlainText } from './contextBuilder';
import { buildMessageContext } from './contextBuilder';
import { buildMessageContextForTarget } from './targetedContextBuilder';
import { buildMessageContextForTargetPlainText } from './targetedContextBuilder';


export type RewritableField = OutputFieldName.Query | OutputFieldName.Reasoning | OutputFieldName.Answer;

export interface RewriteFieldParams {
    item: VerifierItem;
    field: RewritableField;
    config: RewriterConfig;
    signal?: AbortSignal;
    promptSet?: string;
}

export interface RewriteMessageParams {
    item: VerifierItem;
    messageIndex: number;
    config: RewriterConfig;
    signal?: AbortSignal;
    promptSet?: string;
}

/**
 * Rewrites a specific field of a VerifierItem using AI
 */
export async function rewriteField(params: RewriteFieldParams): Promise<string> {
    const { item, field, config, signal, promptSet } = params;

    const schema = config.promptSchema || PromptService.getPromptSchema(PromptCategory.Verifier, PromptRole.Rewriter, promptSet);
    const enhancedConfig: RewriterConfig = {
        ...config,
        promptSchema: schema,
    };

    const userPrompt = buildItemContext(item, field);

    const result = await callRewriterAI(userPrompt, enhancedConfig, signal);
    return result.trim();
}

/**
 * Rewrites a specific field with streaming support
 */
export async function rewriteFieldStreaming(
    params: RewriteFieldParams,
    onChunk: RewriterStreamCallback
): Promise<string> {
    const { item, field, config, signal, promptSet } = params;

    const schema = config.promptSchema || PromptService.getPromptSchema(PromptCategory.Verifier, PromptRole.Rewriter, promptSet);
    const enhancedConfig: RewriterConfig = {
        ...config,
        promptSchema: schema,
    };
    const userPrompt = buildItemContext(item, field);

    const result = await callRewriterAIStreaming(userPrompt, enhancedConfig, onChunk, signal);
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

    const schema = config.promptSchema || PromptService.getPromptSchema(PromptCategory.Verifier, PromptRole.Rewriter, promptSet);
    const enhancedConfig: RewriterConfig = {
        ...config,
        promptSchema: schema,
    };
    const userPrompt = buildMessageContext(item, messageIndex);

    const result = await callRewriterAI(userPrompt, enhancedConfig, signal);
    return result.trim();
}

/**
 * Rewrites a specific message with streaming support
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

    const userPrompt = buildMessageContextForTarget(item, messageIndex, VerifierRewriteTarget.Answer);

    const result = await callRewriterAIStreamingWithSystemPrompt(systemPrompt, userPrompt, config, onChunk, signal);
    return result.trim();
}

/**
 * Rewrites both reasoning and answer for a message with streaming support
 * Returns the raw accumulated string for the caller to parse with extractJsonFields.
 *
 * NOTE: We capture the raw accumulated content from streaming chunks instead of
 * using callRewriterAIStreamingWithSystemPrompt's return value, because that function
 * applies cleanResponse() which parses the JSON and extracts only a single field
 * (e.g. just "answer"), destroying the { reasoning, answer } structure we need.
 */
export async function rewriteMessageBothStreaming(
    params: RewriteMessageParams,
    onChunk: RewriterStreamCallback
): Promise<string> {
    const { item, messageIndex, config, signal } = params;

    if (!item.messages || messageIndex >= item.messages.length) {
        throw new Error('Invalid message index or no messages in item');
    }

    const systemPrompt = config.systemPrompt || `You are an expert at improving AI assistant responses.
Given a conversation and a target message, regenerate BOTH the reasoning trace and the answer.
Respond with a valid JSON object containing "reasoning" and "answer" fields.`;

    const userPrompt = buildMessageContextForTarget(item, messageIndex, VerifierRewriteTarget.Both);

    // Track raw accumulated content from streaming chunks.
    // The streaming onChunk receives raw content (before cleanResponse),
    // which preserves the JSON structure with both reasoning and answer fields.
    let rawAccumulated = '';

    const cleanedResult = await callRewriterAIStreamingWithSystemPrompt(
        systemPrompt, userPrompt, config,
        (chunk, accumulated) => {
            rawAccumulated = accumulated;
            onChunk(chunk, accumulated);
        },
        signal
    );

    // Prefer raw accumulated (preserves JSON structure) over cleaned result (single field only)
    return rawAccumulated || cleanedResult;
}

/**
 * Split "Both" rewrite for field-level items (non-message).
 * Makes two sequential plain-text requests: reasoning first, then answer with reasoning context.
 * Used when splitFieldRequests setting is enabled.
 */
export async function rewriteBothSplitStreaming(
    params: RewriteFieldParams,
    onReasoningChunk: RewriterStreamCallback,
    onAnswerChunk: RewriterStreamCallback,
): Promise<{ reasoning: string; answer: string }> {
    const { item, config, signal } = params;

    const reasoningSystemPrompt = config.systemPrompt || `You are an expert at generating detailed reasoning traces.
Given the full item context, regenerate ONLY the reasoning/thinking process.
Output the improved reasoning as plain text, nothing else.`;

    const reasoningUserPrompt = buildItemContextPlainText(item, OutputFieldName.Reasoning);

    const reasoningResult = await callRewriterAIStreamingWithSystemPrompt(
        reasoningSystemPrompt, reasoningUserPrompt, config, onReasoningChunk, signal,
        { field: 'reasoning', useRawPrompt: true }
    );
    const finalReasoning = reasoningResult.trim();

    // Check abort between calls
    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const answerSystemPrompt = `You are an expert at generating high-quality answers.
Given the full item context and the reasoning trace, regenerate ONLY the answer.
Output the improved answer as plain text, nothing else.`;

    const answerUserPrompt = buildItemContextPlainText(item, OutputFieldName.Answer, { reasoning: finalReasoning });

    const answerResult = await callRewriterAIStreamingWithSystemPrompt(
        answerSystemPrompt, answerUserPrompt, config, onAnswerChunk, signal,
        { field: 'answer', useRawPrompt: true }
    );
    const finalAnswer = answerResult.trim();

    return { reasoning: finalReasoning, answer: finalAnswer };
}

/**
 * Split "Both" rewrite for message-level items.
 * Makes two sequential plain-text requests: reasoning first, then answer with reasoning context.
 * Used when splitFieldRequests setting is enabled.
 */
export async function rewriteMessageBothSplitStreaming(
    params: RewriteMessageParams,
    onReasoningChunk: RewriterStreamCallback,
    onAnswerChunk: RewriterStreamCallback,
): Promise<{ reasoning: string; answer: string }> {
    const { item, messageIndex, config, signal } = params;

    if (!item.messages || messageIndex >= item.messages.length) {
        throw new Error('Invalid message index or no messages in item');
    }

    const reasoningSystemPrompt = config.systemPrompt || `You are an expert at generating detailed reasoning traces.
Given a conversation and a target message, regenerate ONLY the reasoning/thinking process.
The answer must remain exactly as provided - do not modify it.
Output the improved reasoning as plain text, nothing else.`;

    const reasoningUserPrompt = buildMessageContextForTargetPlainText(
        item, messageIndex, VerifierRewriteTarget.Reasoning
    );

    const reasoningResult = await callRewriterAIStreamingWithSystemPrompt(
        reasoningSystemPrompt, reasoningUserPrompt, config, onReasoningChunk, signal,
        { field: 'reasoning', useRawPrompt: true }
    );
    const finalReasoning = reasoningResult.trim();

    // Check abort between calls
    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const answerSystemPrompt = `You are an expert at improving AI assistant responses.
Given a conversation, the target message, and the reasoning trace, regenerate ONLY the answer.
Use the provided reasoning trace as context for generating a better answer.
Output the improved answer as plain text, nothing else.`;

    const answerUserPrompt = buildMessageContextForTargetPlainText(
        item, messageIndex, VerifierRewriteTarget.Answer, { reasoning: finalReasoning }
    );

    const answerResult = await callRewriterAIStreamingWithSystemPrompt(
        answerSystemPrompt, answerUserPrompt, config, onAnswerChunk, signal,
        { field: 'answer', useRawPrompt: true }
    );
    const finalAnswer = answerResult.trim();

    return { reasoning: finalReasoning, answer: finalAnswer };
}
