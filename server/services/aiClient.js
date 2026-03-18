/**
 * Chat completions caller for backend jobs using official SDKs.
 * Uses @anthropic-ai/sdk for Anthropic-compatible providers,
 * and openai SDK for OpenAI-compatible providers.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 2000;

/** Providers that use the Anthropic Messages API format */
const ANTHROPIC_COMPATIBLE = new Set(['anthropic', 'minimax']);

const isAnthropicCompatible = (provider) => ANTHROPIC_COMPATIBLE.has(provider);

/**
 * Normalise the base URL for the OpenAI SDK.
 * The SDK appends /chat/completions, so strip it if present.
 */
const normaliseOpenAIBaseUrl = (baseUrl) => {
    let url = baseUrl.replace(/\/+$/, '');
    url = url.replace(/\/chat\/completions$/, '');
    return url;
};

/**
 * Call a chat completions endpoint.
 *
 * @param {object} options
 * @param {string} options.baseUrl      – Provider base URL (e.g. https://api.openai.com/v1)
 * @param {string} options.apiKey       – API key
 * @param {string} options.model        – Model identifier
 * @param {string} options.systemPrompt – System message
 * @param {string} options.userPrompt   – User message
 * @param {string} [options.provider]   – Provider identifier (e.g. 'anthropic', 'minimax')
 * @param {number} [options.maxTokens]  – Max completion tokens (default: 4096)
 * @param {number} [options.temperature] – Temperature (default: 0.3)
 * @param {number} [options.maxRetries] – Retry count (default: 2)
 * @param {number} [options.retryDelay] – Delay between retries in ms (default: 2000)
 * @returns {Promise<string>} The assistant's response content
 */
export async function callChatCompletion({
    baseUrl,
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    provider = '',
    maxTokens = 4096,
    temperature = 0.3,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY_MS,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
}) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (isAnthropicCompatible(provider)) {
                const client = new Anthropic({
                    apiKey,
                    baseURL: baseUrl.replace(/\/+$/, ''),
                });

                const response = await client.messages.create({
                    model,
                    max_tokens: maxTokens,
                    temperature,
                    ...(topP != null && { top_p: topP }),
                    ...(topK != null && { top_k: topK }),
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userPrompt }],
                });

                const content = response.content?.[0]?.type === 'text'
                    ? response.content[0].text
                    : null;

                if (content === undefined || content === null) {
                    throw new Error('No content in Anthropic API response');
                }
                return content;
            } else {
                const client = new OpenAI({
                    apiKey: apiKey || 'ollama-local',
                    baseURL: normaliseOpenAIBaseUrl(baseUrl),
                });

                const response = await client.chat.completions.create({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    max_tokens: maxTokens,
                    temperature,
                    ...(topP != null && { top_p: topP }),
                    ...(frequencyPenalty != null && { frequency_penalty: frequencyPenalty }),
                    ...(presencePenalty != null && { presence_penalty: presencePenalty }),
                });

                const content = response.choices?.[0]?.message?.content;
                if (content === undefined || content === null) {
                    throw new Error('No content in OpenAI API response');
                }
                return content;
            }
        } catch (error) {
            lastError = error;

            // Don't retry on auth errors
            const status = error?.status || error?.statusCode;
            if (status && status >= 400 && status < 500 && status !== 429) {
                throw error;
            }

            if (attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, retryDelay));
            }
        }
    }

    throw lastError || new Error('callChatCompletion failed after retries');
}
