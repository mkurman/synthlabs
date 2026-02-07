/**
 * Response parsing utilities for AI outputs
 * Handles <think> tags, JSON extraction, tool calls, etc.
 */

/**
 * Parse <think> tags from content
 * @param {string} text - Raw text content
 * @returns {{ reasoning: string, answer: string, hasThinkTags: boolean }}
 */
export const parseThinkTags = (text) => {
    if (!text) {
        return { reasoning: '', answer: '', hasThinkTags: false };
    }

    const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);

    if (thinkMatch) {
        const reasoning = thinkMatch[1].trim();
        const answer = text.replace(/<think>[\s\S]*?<\/think>/, '').trim();
        return { reasoning, answer, hasThinkTags: true };
    }

    return { reasoning: '', answer: text, hasThinkTags: false };
};

/**
 * Extract JSON fields from text (handles partial/streaming JSON)
 * @param {string} text - Text that may contain JSON
 * @param {string[]} [requiredFields] - Fields to extract
 * @returns {{ data: object | null, isComplete: boolean, error: string | null }}
 */
export const extractJsonFields = (text, requiredFields = ['reasoning', 'answer']) => {
    if (!text) {
        return { data: null, isComplete: false, error: null };
    }

    // Try to find JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return { data: null, isComplete: false, error: null };
    }

    try {
        const parsed = JSON.parse(jsonMatch[0]);
        const missingFields = requiredFields.filter(f => !(f in parsed));

        return {
            data: parsed,
            isComplete: missingFields.length === 0,
            error: missingFields.length > 0 ? `Missing fields: ${missingFields.join(', ')}` : null,
        };
    } catch (e) {
        // Attempt to repair common JSON issues
        try {
            const repaired = repairJson(jsonMatch[0]);
            const parsed = JSON.parse(repaired);
            const missingFields = requiredFields.filter(f => !(f in parsed));

            return {
                data: parsed,
                isComplete: missingFields.length === 0,
                error: missingFields.length > 0 ? `Missing fields: ${missingFields.join(', ')}` : null,
            };
        } catch {
            return { data: null, isComplete: false, error: 'Invalid JSON' };
        }
    }
};

/**
 * Attempt to repair common JSON issues
 * @param {string} json - Potentially malformed JSON string
 * @returns {string} - Repaired JSON string
 */
const repairJson = (json) => {
    let repaired = json;

    // Remove trailing commas
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');

    // Add missing closing braces/brackets
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    repaired += '}'.repeat(Math.max(0, openBraces - closeBraces));
    repaired += ']'.repeat(Math.max(0, openBrackets - closeBrackets));

    return repaired;
};

/**
 * Parse tool calls from text (handles both XML format and native format)
 * @param {string} text - Text that may contain tool calls
 * @returns {Array<{ id: string, name: string, arguments: object }>}
 */
export const parseToolCalls = (text) => {
    const toolCalls = [];

    if (!text) return toolCalls;

    // Parse XML-style tool calls: <tool_call>...</tool_call>
    const xmlMatches = text.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g);
    for (const match of xmlMatches) {
        try {
            const content = match[1].trim();
            const parsed = JSON.parse(content);
            toolCalls.push({
                id: parsed.id || `tool_${Date.now()}_${toolCalls.length}`,
                name: parsed.name,
                arguments: parsed.arguments || {},
            });
        } catch {
            // Skip malformed tool calls
        }
    }

    return toolCalls;
};

/**
 * Strip markdown code block encapsulation
 * @param {string} text - Text that may be wrapped in code blocks
 * @returns {string} - Cleaned text
 */
export const stripCodeBlocks = (text) => {
    if (!text) return text;
    let cleaned = text.trim();

    // Match opening ``` with optional language identifier and closing ```
    const codeBlockMatch = cleaned.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/);
    if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
    }

    return cleaned;
};

/**
 * Combine reasoning_content with regular content using <think> tags
 * @param {string} reasoningContent - Reasoning from the model
 * @param {string} content - Regular content from the model
 * @returns {string} - Combined content with <think> tags
 */
export const combineReasoningContent = (reasoningContent, content) => {
    if (reasoningContent && content) {
        return `<think>${reasoningContent}</think>${content}`;
    }
    if (reasoningContent) {
        return `<think>${reasoningContent}</think>`;
    }
    return content || '';
};

/**
 * Progressive parsing state for streaming
 */
export class ProgressiveParser {
    constructor() {
        this.accumulated = '';
        this.reasoning = '';
        this.answer = '';
        this.phase = 'waiting'; // 'waiting' | 'reasoning' | 'answer' | 'complete'
        this.hasThinkTags = false;
    }

    /**
     * Update with new accumulated content
     * @param {string} accumulated - Full accumulated content so far
     * @returns {{ reasoning: string, answer: string, phase: string }}
     */
    update(accumulated) {
        this.accumulated = accumulated;

        // Check for <think> tag start
        const thinkStart = accumulated.indexOf('<think>');
        const thinkEnd = accumulated.indexOf('</think>');

        if (thinkStart !== -1) {
            this.hasThinkTags = true;

            if (thinkEnd !== -1) {
                // Complete reasoning
                this.reasoning = accumulated.slice(thinkStart + 7, thinkEnd).trim();
                this.answer = accumulated.slice(thinkEnd + 8).trim();
                this.phase = this.answer ? 'answer' : 'reasoning';
            } else {
                // Still in reasoning
                this.reasoning = accumulated.slice(thinkStart + 7).trim();
                this.phase = 'reasoning';
            }
        } else {
            // No think tags, treat all as answer
            this.answer = accumulated;
            this.phase = 'answer';
        }

        return {
            reasoning: this.reasoning,
            answer: this.answer,
            phase: this.phase,
        };
    }

    /**
     * Get final parsed result
     */
    finalize() {
        // Ensure think tag is closed
        if (this.hasThinkTags && !this.accumulated.includes('</think>')) {
            this.accumulated += '</think>';
        }

        return this.update(this.accumulated);
    }
}
