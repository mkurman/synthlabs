import { extractJsonFields } from '../../../utils/jsonFieldExtractor';

export interface RewriteResult {
    reasoning: string;
    answer: string;
}

/**
 * Helper to extract content from potentially JSON-wrapped response
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
                return extracted.answer || extracted.reasoning || input;
            }
            // Treat as raw string
            return input;
        }
    }

    // If content is an object (either returned directly or parsed)
    if (typeof content === 'object' && content !== null) {
        return content.response || content.answer || content.content || content.text || content.reasoning || JSON.stringify(content);
    }

    return String(content);
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
