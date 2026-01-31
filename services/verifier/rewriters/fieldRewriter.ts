import { VerifierItem } from '../../../types';
import { PromptCategory, PromptRole, OutputFieldName, VerifierRewriteTarget } from '../../../interfaces/enums';
import { PromptService } from '../../promptService';
import { RewriterConfig, RewriterStreamCallback, callRewriterAI, callRewriterAIStreaming, callRewriterAIStreamingWithSystemPrompt } from './aiCaller';
import { buildItemContext } from './contextBuilder';
import { buildMessageContext } from './contextBuilder';
import { buildMessageContextForTarget } from './targetedContextBuilder';


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

    const promptRole = field === OutputFieldName.Query
        ? PromptRole.QueryRewrite
        : field === OutputFieldName.Reasoning
            ? PromptRole.ReasoningRewrite
            : PromptRole.AnswerRewrite;
    const schema = config.promptSchema || PromptService.getPromptSchema(PromptCategory.Verifier, promptRole, promptSet);
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

    const promptRole = field === OutputFieldName.Query
        ? PromptRole.QueryRewrite
        : field === OutputFieldName.Reasoning
            ? PromptRole.ReasoningRewrite
            : PromptRole.AnswerRewrite;
    const schema = config.promptSchema || PromptService.getPromptSchema(PromptCategory.Verifier, promptRole, promptSet);
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

    const schema = config.promptSchema || PromptService.getPromptSchema(PromptCategory.Verifier, PromptRole.MessageRewrite, promptSet);
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
 * Returns the raw accumulated string for the caller to parse
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
The reasoning should explain the thought process, and the answer should be the final response.`;

    const userPrompt = buildMessageContextForTarget(item, messageIndex, VerifierRewriteTarget.Both);

    // Return raw string - caller will parse with extractJsonFields
    return await callRewriterAIStreamingWithSystemPrompt(systemPrompt, userPrompt, config, onChunk, signal);
}
