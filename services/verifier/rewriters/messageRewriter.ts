import { VerifierItem } from '../../../types';
import { RewriterConfig, RewriterStreamCallback, callRewriterAIRaw, callRewriterAIStreamingWithSystemPrompt } from './aiCaller';
import { buildMessageContextForTarget } from './targetedContextBuilder';
import { parseRewriteResult, RewriteResult } from './responseParser';

export interface RewriteMessageParams {
    item: VerifierItem;
    messageIndex: number;
    config: RewriterConfig;
    signal?: AbortSignal;
    promptSet?: string;
}

/**
 * Rewrites only the reasoning trace for a message
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

    const result = await callRewriterAIStreamingWithSystemPrompt(systemPrompt, userPrompt, config, onChunk, signal);
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
export async function rewriteBoth(
    item: VerifierItem,
    config: RewriterConfig,
    signal?: AbortSignal
): Promise<RewriteResult> {
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
