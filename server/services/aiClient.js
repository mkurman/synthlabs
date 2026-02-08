/**
 * Simple OpenAI-compatible chat completions caller for backend jobs.
 * Supports any provider with an OpenAI-compatible API (OpenAI, Together, OpenRouter, etc.)
 */

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 2000;

/**
 * Normalise the base URL so it ends with a usable chat completions path.
 * Handles cases like:
 *   - https://api.openai.com/v1          → https://api.openai.com/v1/chat/completions
 *   - https://api.openai.com/v1/         → https://api.openai.com/v1/chat/completions
 *   - https://api.together.xyz           → https://api.together.xyz/v1/chat/completions
 *   - https://custom.host/custom/path    → https://custom.host/custom/path/chat/completions
 */
const buildEndpoint = (baseUrl) => {
    let url = baseUrl.replace(/\/+$/, '');
    if (url.endsWith('/chat/completions')) return url;
    if (!url.endsWith('/v1')) {
        url += '/v1';
    }
    return `${url}/chat/completions`;
};

/**
 * Call a chat completions endpoint.
 *
 * @param {object} options
 * @param {string} options.baseUrl      – Provider base URL (e.g. https://api.openai.com/v1)
 * @param {string} options.apiKey       – Bearer token
 * @param {string} options.model        – Model identifier
 * @param {string} options.systemPrompt – System message
 * @param {string} options.userPrompt   – User message
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
    maxTokens = 4096,
    temperature = 0.3,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY_MS,
}) {
    const endpoint = buildEndpoint(baseUrl);
    const body = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
    };

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`API returned ${response.status}: ${text.slice(0, 500)}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (content === undefined || content === null) {
                throw new Error('No content in API response');
            }
            return content;
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, retryDelay));
            }
        }
    }

    throw lastError || new Error('callChatCompletion failed after retries');
}
