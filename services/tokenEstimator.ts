/**
 * Token estimation utilities for context management.
 * Uses character-based estimation (roughly 4 chars per token for English).
 * More accurate than nothing, less accurate than tiktoken.
 */

// Average characters per token varies by model/tokenizer
// GPT-4/Claude: ~4 chars/token for English
// Some models may differ, but this is a reasonable default
const DEFAULT_CHARS_PER_TOKEN = 4;

export interface TokenEstimate {
    tokens: number;
    chars: number;
    method: 'char-estimate';
}

/**
 * Estimate token count from text using character-based heuristic.
 */
export function estimateTokens(text: string, charsPerToken = DEFAULT_CHARS_PER_TOKEN): number {
    if (!text) return 0;
    return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate tokens for a chat message (including role overhead).
 */
export function estimateMessageTokens(message: { role: string; content: string | null; tool_calls?: unknown[] }): number {
    let tokens = 4; // Base overhead for message structure

    // Role tokens
    tokens += estimateTokens(message.role);

    // Content tokens
    if (message.content) {
        tokens += estimateTokens(message.content);
    }

    // Tool calls overhead (rough estimate)
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
        tokens += message.tool_calls.length * 50; // ~50 tokens per tool call structure
        for (const tc of message.tool_calls) {
            if (typeof tc === 'object' && tc !== null) {
                const tcObj = tc as { function?: { name?: string; arguments?: string } };
                if (tcObj.function?.name) tokens += estimateTokens(tcObj.function.name);
                if (tcObj.function?.arguments) tokens += estimateTokens(tcObj.function.arguments);
            }
        }
    }

    return tokens;
}

/**
 * Estimate total tokens for an array of messages.
 */
export function estimateConversationTokens(
    messages: Array<{ role: string; content: string | null; tool_calls?: unknown[] }>
): number {
    let total = 3; // Base overhead for conversation structure
    for (const msg of messages) {
        total += estimateMessageTokens(msg);
    }
    return total;
}

/**
 * Get detailed token estimate with metadata.
 */
export function getDetailedEstimate(text: string): TokenEstimate {
    return {
        tokens: estimateTokens(text),
        chars: text.length,
        method: 'char-estimate'
    };
}
