import { extractJsonFields } from '../../../utils/jsonFieldExtractor';

export interface RewriteResult {
    reasoning: string;
    answer: string;
}

/**
 * Strip unwanted tags from AI responses:
 * - <think> tags: remove tag markers but KEEP inner content (it's valid text)
 * - <tool_call> tags: remove tags AND content entirely (model artifact/garbage)
 */
const stripUnwantedTags = (text: string): string =>
    text
        .replace(/<tool_call>[\s\S]*?<\/tool_call>\s*/gi, '') // closed tool_call: remove entirely
        .replace(/^<tool_call>[\s\S]*/gi, '') // unclosed tool_call at start: remove entirely
        .replace(/<\/?think>\s*/gi, '') // strip think tag markers only, keep inner content
        .trim();

/**
 * Helper to extract content from potentially JSON-wrapped response.
 * Always strips <think> tags — reasoning_content must never contain them.
 */
export function cleanResponse(input: any): string {
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
                return stripUnwantedTags(extracted.answer || extracted.reasoning || input);
            }
            // Treat as raw string
            return stripUnwantedTags(input);
        }
    }

    // If content is an object (either returned directly or parsed)
    if (typeof content === 'object' && content !== null) {
        const raw = content.response || content.answer || content.content || content.text || content.reasoning || JSON.stringify(content);
        return stripUnwantedTags(raw);
    }

    return stripUnwantedTags(String(content));
}

/**
 * Parses JSON response that should contain reasoning and answer
 */
export function parseRewriteResult(input: any, fallbackReasoning: string, fallbackAnswer: string): RewriteResult {
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
