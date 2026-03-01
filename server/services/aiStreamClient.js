/**
 * Streaming AI client for backend SSE proxying.
 * Uses official SDKs: @anthropic-ai/sdk for Anthropic-compatible,
 * openai for OpenAI-compatible providers.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 2000;

/**
 * Provider identifiers
 */
export const Providers = {
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic',
    OPENROUTER: 'openrouter',
    OLLAMA: 'ollama',
    GEMINI: 'gemini',
    MINIMAX: 'minimax',
    OTHER: 'other',
};

/** Providers that use the Anthropic Messages API format */
const ANTHROPIC_COMPATIBLE = new Set([Providers.ANTHROPIC, Providers.MINIMAX]);
const isAnthropicCompatible = (provider) => ANTHROPIC_COMPATIBLE.has(provider);

/**
 * Normalise base URL for Anthropic SDK.
 * The SDK appends /v1/messages internally, so strip trailing /v1 if present.
 */
const normaliseAnthropicBaseUrl = (baseUrl) => {
    let url = baseUrl.replace(/\/+$/, '');
    if (url.endsWith('/v1')) url = url.slice(0, -3);
    return url;
};

/**
 * Normalise base URL for OpenAI SDK.
 * The SDK appends /chat/completions internally, so strip it if present.
 */
const normaliseOpenAIBaseUrl = (baseUrl) => {
    let url = baseUrl.replace(/\/+$/, '');
    url = url.replace(/\/chat\/completions$/, '');
    return url;
};

/**
 * Stream via Anthropic SDK (for Anthropic/MiniMax providers)
 */
async function streamAnthropic({
    baseUrl, apiKey, model, messages, onChunk, signal,
    maxTokens, temperature, maxRetries,
}) {
    const client = new Anthropic({
        apiKey,
        baseURL: normaliseAnthropicBaseUrl(baseUrl),
        maxRetries,
        timeout: 120000,
    });

    const systemMessage = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const stream = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemMessage?.content || '',
        messages: nonSystemMessages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
        })),
        stream: true,
    }, { signal });

    let accumulated = '';
    let usageData = null;
    let firstChunk = true;

    for await (const event of stream) {
        if (signal?.aborted) break;

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const text = event.delta.text || '';
            accumulated += text;

            if (firstChunk && text) {
                console.log('[aiStreamClient] First Anthropic chunk:', text.slice(0, 100));
                firstChunk = false;
            }

            const shouldStop = onChunk(text, accumulated, '', usageData, null);
            if (shouldStop === false) break;
        } else if (event.type === 'message_start' && event.message?.usage) {
            usageData = {
                input_tokens: event.message.usage.input_tokens || 0,
                output_tokens: 0,
            };
        } else if (event.type === 'message_delta') {
            if (event.usage) {
                usageData = {
                    ...usageData,
                    output_tokens: event.usage.output_tokens || 0,
                };
                onChunk('', accumulated, '', usageData, null);
            }
        }
    }

    return {
        content: accumulated,
        reasoning: '',
        usage: usageData,
        toolCalls: null,
    };
}

/**
 * Stream via OpenAI SDK (for OpenAI, OpenRouter, Ollama, Gemini, etc.)
 */
async function streamOpenAI({
    baseUrl, apiKey, model, messages, onChunk, signal,
    maxTokens, temperature, tools, responseFormat, maxRetries, provider,
}) {
    const client = new OpenAI({
        apiKey: apiKey || 'ollama-local',
        baseURL: normaliseOpenAIBaseUrl(baseUrl),
        maxRetries,
        timeout: 120000,
    });

    const params = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        stream_options: { include_usage: true },
    };

    if (tools && tools.length > 0) {
        params.tools = tools;
    }

    if (responseFormat === 'json') {
        params.response_format = { type: 'json_object' };
    }

    const stream = await client.chat.completions.create(params, { signal });

    let accumulated = '';
    let reasoningAccumulated = '';
    let isInReasoning = false;
    let usageData = null;
    let allToolCalls = {};
    let firstChunk = true;

    for await (const chunk of stream) {
        if (signal?.aborted) break;

        if (chunk.usage) usageData = chunk.usage;

        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (!delta && !chunk.usage) continue;

        if (firstChunk && delta) {
            console.log('[aiStreamClient] First OpenAI chunk delta:', JSON.stringify(delta).slice(0, 200));
            firstChunk = false;
        }

        // Handle reasoning content (models like DeepSeek, Qwen)
        const reasoning = delta?.reasoning_content || delta?.reasoning;
        if (reasoning) {
            if (!isInReasoning) {
                isInReasoning = true;
                accumulated += '<think>';
            }
            accumulated += reasoning;
            reasoningAccumulated += reasoning;
        }

        // Handle regular content
        if (delta?.content) {
            if (isInReasoning) {
                isInReasoning = false;
                accumulated += '</think>';
            }
            accumulated += delta.content;
        }

        // Handle tool calls
        if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!allToolCalls[idx]) {
                    allToolCalls[idx] = { id: tc.id || '', name: '', args: '' };
                }
                if (tc.id) allToolCalls[idx].id = tc.id;
                if (tc.function?.name) allToolCalls[idx].name += tc.function.name;
                if (tc.function?.arguments) allToolCalls[idx].args += tc.function.arguments;
            }
        }

        // Call the chunk callback
        if (delta?.content || reasoning || chunk.usage) {
            const chunkText = reasoning || delta?.content || '';
            const toolCallsArray = Object.values(allToolCalls);
            const shouldStop = onChunk(
                chunkText,
                accumulated,
                reasoningAccumulated,
                usageData,
                toolCallsArray.length > 0 ? toolCallsArray : null
            );
            if (shouldStop === false) break;
        }
    }

    // Close any open reasoning tag
    if (isInReasoning) accumulated += '</think>';

    // Format tool calls
    const toolCallsArray = Object.values(allToolCalls).map(tc => {
        try {
            return { id: tc.id, name: tc.name, arguments: JSON.parse(tc.args || '{}') };
        } catch {
            return { id: tc.id, name: tc.name, arguments: tc.args };
        }
    });

    return {
        content: accumulated,
        reasoning: reasoningAccumulated,
        usage: usageData,
        toolCalls: toolCallsArray.length > 0 ? toolCallsArray : null,
    };
}

/**
 * Stream a chat completion from an AI provider
 *
 * @param {object} options
 * @param {string} options.baseUrl - Provider base URL
 * @param {string} options.apiKey - API key
 * @param {string} options.model - Model identifier
 * @param {string} options.provider - Provider identifier (openai, anthropic, etc.)
 * @param {Array} options.messages - Chat messages array
 * @param {Function} options.onChunk - Callback: (chunk, accumulated, reasoningAccumulated, usage, toolCalls) => void | false
 * @param {AbortSignal} [options.signal] - Abort signal
 * @param {number} [options.maxTokens] - Max completion tokens
 * @param {number} [options.temperature] - Temperature
 * @param {Array} [options.tools] - Tool definitions for function calling
 * @param {string} [options.responseFormat] - Response format ('text' | 'json')
 * @param {number} [options.maxRetries] - Number of retries
 * @param {number} [options.retryDelay] - Delay between retries in ms
 * @returns {Promise<{ content: string, reasoning: string, usage: any, toolCalls: any[] }>}
 */
export async function streamChatCompletion({
    baseUrl,
    apiKey,
    model,
    provider = Providers.OPENAI,
    messages,
    onChunk,
    signal,
    maxTokens = 4096,
    temperature = 0.7,
    tools,
    responseFormat,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY_MS,
}) {
    console.log('[aiStreamClient] Provider:', provider, '| Model:', model, '| BaseUrl:', baseUrl);
    console.log('[aiStreamClient] Messages:', messages.length, '| Tools:', tools?.length || 0);

    if (isAnthropicCompatible(provider)) {
        return streamAnthropic({
            baseUrl, apiKey, model, messages, onChunk, signal,
            maxTokens, temperature, maxRetries,
        });
    } else {
        return streamOpenAI({
            baseUrl, apiKey, model, messages, onChunk, signal,
            maxTokens, temperature, tools, responseFormat, maxRetries, provider,
        });
    }
}

/**
 * Non-streaming chat completion (convenience wrapper)
 */
export async function chatCompletion(options) {
    let result = '';
    await streamChatCompletion({
        ...options,
        onChunk: (chunk, accumulated) => {
            result = accumulated;
        },
    });
    return result;
}
