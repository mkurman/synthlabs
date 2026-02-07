/**
 * Streaming AI client for backend SSE proxying
 * Supports OpenAI, Anthropic, OpenRouter, Ollama, and custom providers
 */

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
    OTHER: 'other',
};

/**
 * Build the API endpoint URL based on provider
 */
const buildEndpoint = (baseUrl, provider) => {
    let url = baseUrl.replace(/\/+$/, '');

    if (provider === Providers.ANTHROPIC) {
        if (!url.endsWith('/messages')) {
            url += '/v1/messages';
        }
        return url;
    }

    if (provider === Providers.OLLAMA) {
        if (!url.includes('/api/')) {
            url += '/api/chat';
        }
        return url;
    }

    // OpenAI-compatible (OpenAI, OpenRouter, Together, etc.)
    if (url.endsWith('/chat/completions')) return url;
    if (!url.endsWith('/v1')) {
        url += '/v1';
    }
    return `${url}/chat/completions`;
};

/**
 * Build headers based on provider
 */
const buildHeaders = (apiKey, provider) => {
    const headers = {
        'Content-Type': 'application/json',
    };

    if (provider === Providers.ANTHROPIC) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
    } else if (provider !== Providers.OLLAMA) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    return headers;
};

/**
 * Build request payload based on provider
 */
const buildPayload = (messages, options, provider) => {
    const { model, maxTokens = 4096, temperature = 0.7, tools, responseFormat } = options;

    if (provider === Providers.ANTHROPIC) {
        const systemMessage = messages.find(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');

        return {
            model,
            max_tokens: maxTokens,
            temperature,
            stream: true,
            system: systemMessage?.content || '',
            messages: nonSystemMessages.map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
            })),
        };
    }

    if (provider === Providers.OLLAMA) {
        return {
            model,
            messages,
            stream: true,
            options: { temperature },
        };
    }

    // OpenAI-compatible
    const payload = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        stream_options: { include_usage: true },
    };

    if (tools && tools.length > 0) {
        payload.tools = tools;
    }

    if (responseFormat === 'json') {
        payload.response_format = { type: 'json_object' };
    }

    return payload;
};

/**
 * Parse a streaming chunk based on provider
 * @returns {{ content: string, reasoningContent: string, toolCalls: any[], usage: any, done: boolean }}
 */
const parseStreamChunk = (json, provider) => {
    const result = {
        content: '',
        reasoningContent: '',
        toolCalls: null,
        usage: null,
        done: false,
    };

    if (provider === Providers.ANTHROPIC) {
        if (json.type === 'content_block_delta') {
            result.content = json.delta?.text || '';
        } else if (json.type === 'message_delta' && json.delta?.stop_reason) {
            result.done = true;
        } else if (json.type === 'message_stop') {
            result.done = true;
        }
        if (json.usage) {
            result.usage = json.usage;
        }
        return result;
    }

    if (provider === Providers.OLLAMA) {
        if (json.message?.content) {
            result.content = json.message.content;
        }
        if (json.done) {
            result.done = true;
        }
        return result;
    }

    // OpenAI-compatible
    if (json.usage) {
        result.usage = json.usage;
    }

    const choice = json.choices?.[0];
    if (!choice) return result;

    if (choice.finish_reason) {
        result.done = true;
    }

    const delta = choice.delta;
    if (!delta) return result;

    // Handle reasoning content (for models that support it)
    if (delta.reasoning_content || delta.reasoning) {
        result.reasoningContent = delta.reasoning_content || delta.reasoning;
    }

    // Handle regular content
    if (delta.content) {
        result.content = delta.content;
    }

    // Handle tool calls
    if (delta.tool_calls) {
        result.toolCalls = delta.tool_calls;
    }

    return result;
};

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
    const endpoint = buildEndpoint(baseUrl, provider);
    const headers = buildHeaders(apiKey, provider);
    const payload = buildPayload(messages, { model, maxTokens, temperature, tools, responseFormat }, provider);

    console.log('[aiStreamClient] Starting request to:', endpoint);
    console.log('[aiStreamClient] Provider:', provider, '| Model:', model);
    console.log('[aiStreamClient] Messages:', messages.length, '| Tools:', tools?.length || 0);

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        console.log('[aiStreamClient] Attempt', attempt + 1, 'of', maxRetries + 1);
        try {
            // Check if already aborted
            if (signal?.aborted) {
                console.log('[aiStreamClient] Signal already aborted before fetch');
                throw new DOMException('Aborted', 'AbortError');
            }

            console.log('[aiStreamClient] Sending fetch request to:', endpoint);

            // Create a combined abort controller for timeout + external signal
            const timeoutMs = 120000; // 2 minute timeout for initial response
            const fetchController = new AbortController();
            const timeoutId = setTimeout(() => {
                console.log('[aiStreamClient] Request timeout after', timeoutMs, 'ms');
                fetchController.abort();
            }, timeoutMs);

            // If external signal aborts, abort the fetch too
            const abortHandler = () => {
                console.log('[aiStreamClient] External signal aborted, aborting fetch');
                fetchController.abort();
            };
            if (signal) {
                signal.addEventListener('abort', abortHandler, { once: true });
            }

            console.log('[aiStreamClient] Starting fetch now...');
            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: fetchController.signal,
            });

            clearTimeout(timeoutId);
            if (signal) {
                signal.removeEventListener('abort', abortHandler);
            }
            console.log('[aiStreamClient] Response status:', response.status);

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                console.log('[aiStreamClient] Error response:', text.slice(0, 200));
                const error = new Error(`API returned ${response.status}: ${text.slice(0, 500)}`);
                error.status = response.status;
                throw error;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body for streaming');
            }
            console.log('[aiStreamClient] Got reader, starting stream...');

            const decoder = new TextDecoder();
            let buffer = '';
            let accumulated = '';
            let reasoningAccumulated = '';
            let isInReasoning = false;
            let usageData = null;
            let allToolCalls = {};
            let stopped = false;

            try {
                while (!stopped) {
                    if (signal?.aborted) {
                        reader.cancel();
                        throw new DOMException('Aborted', 'AbortError');
                    }

                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed === 'data: [DONE]') continue;

                        // Handle SSE data prefix
                        let jsonStr = '';
                        if (trimmed.startsWith('data: ')) {
                            jsonStr = trimmed.slice(6);
                        } else if (provider === Providers.OLLAMA && trimmed.startsWith('{')) {
                            jsonStr = trimmed;
                        } else {
                            continue;
                        }

                        try {
                            const json = JSON.parse(jsonStr);

                            // Log raw response for debugging
                            if (accumulated.length === 0) {
                                console.log('[aiStreamClient] First chunk raw JSON:', JSON.stringify(json).slice(0, 500));
                            }

                            const parsed = parseStreamChunk(json, provider);

                            // Log what was parsed
                            if (accumulated.length === 0 && (parsed.content || parsed.toolCalls)) {
                                console.log('[aiStreamClient] Parsed first chunk:', {
                                    contentLen: parsed.content?.length || 0,
                                    reasoningLen: parsed.reasoningContent?.length || 0,
                                    hasToolCalls: !!parsed.toolCalls,
                                    done: parsed.done
                                });
                            }

                            // Track usage
                            if (parsed.usage) {
                                usageData = parsed.usage;
                            }

                            // Handle reasoning content (wrap in <think> tags)
                            if (parsed.reasoningContent) {
                                if (!isInReasoning) {
                                    isInReasoning = true;
                                    accumulated += '<think>';
                                }
                                accumulated += parsed.reasoningContent;
                                reasoningAccumulated += parsed.reasoningContent;
                            }

                            // Handle regular content
                            if (parsed.content) {
                                // Close reasoning tag if we were in reasoning mode
                                if (isInReasoning) {
                                    isInReasoning = false;
                                    accumulated += '</think>';
                                }
                                accumulated += parsed.content;
                            }

                            // Handle tool calls
                            if (parsed.toolCalls) {
                                for (const tc of parsed.toolCalls) {
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
                            if (parsed.content || parsed.reasoningContent || parsed.usage) {
                                const chunk = parsed.reasoningContent || parsed.content || '';
                                const toolCallsArray = Object.values(allToolCalls);
                                const shouldStop = onChunk(
                                    chunk,
                                    accumulated,
                                    reasoningAccumulated,
                                    usageData,
                                    toolCallsArray.length > 0 ? toolCallsArray : null
                                );
                                if (shouldStop === false) {
                                    stopped = true;
                                    reader.cancel();
                                    break;
                                }
                            }
                        } catch (parseErr) {
                            // Skip unparseable chunks
                            console.warn('Failed to parse stream chunk:', jsonStr.slice(0, 100));
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }

            // Close any open reasoning tag
            if (isInReasoning) {
                accumulated += '</think>';
            }

            // Format tool calls
            const toolCallsArray = Object.values(allToolCalls).map(tc => {
                try {
                    return {
                        id: tc.id,
                        name: tc.name,
                        arguments: JSON.parse(tc.args || '{}'),
                    };
                } catch {
                    return {
                        id: tc.id,
                        name: tc.name,
                        arguments: tc.args,
                    };
                }
            });

            return {
                content: accumulated,
                reasoning: reasoningAccumulated,
                usage: usageData,
                toolCalls: toolCallsArray.length > 0 ? toolCallsArray : null,
            };
        } catch (error) {
            lastError = error;

            // Don't retry on abort
            if (error.name === 'AbortError') {
                throw error;
            }

            // Don't retry on 4xx errors (except 429)
            if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
                throw error;
            }

            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, retryDelay));
            }
        }
    }

    throw lastError || new Error('streamChatCompletion failed after retries');
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
