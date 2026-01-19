/**
 * Utility for extracting JSON fields from partial/streaming JSON content.
 * Handles incomplete JSON where fields are being streamed in.
 */

export interface ExtractedFields {
    reasoning?: string;
    answer?: string;
    hasReasoningStart: boolean;
    hasReasoningEnd: boolean;
    hasAnswerStart: boolean;
    hasAnswerEnd: boolean;
}

/**
 * Extract reasoning and answer fields from partial JSON.
 * Handles both complete and incomplete JSON structures.
 * 
 * Looks for patterns like:
 * - "reasoning": "content..."
 * - "reasoning" : "content..."
 * - 'reasoning': 'content...'
 */
export function extractJsonFields(rawJson: string): ExtractedFields {
    const result: ExtractedFields = {
        hasReasoningStart: false,
        hasReasoningEnd: false,
        hasAnswerStart: false,
        hasAnswerEnd: false,
    };

    // Clean markdown code blocks if present
    // Clean markdown code blocks if present
    let content = rawJson.trim();

    // Robustly extract content from markdown code blocks if present
    // Matches ```json ... ``` or ``` ... ``` anywhere in the string
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
    if (codeBlockMatch && codeBlockMatch[1]) {
        content = codeBlockMatch[1].trim();
    }

    // Sanitize smart quotes to straight quotes
    content = content.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

    // Try to find "reasoning" field
    const reasoningPatterns = [
        { regex: /"\s*reasoning\s*"\s*:\s*"/i, quote: '"' },
        { regex: /'\s*reasoning\s*'\s*:\s*'/i, quote: "'" },
        { regex: /reasoning\s*:\s*"/i, quote: '"' },
    ];

    for (const { regex, quote } of reasoningPatterns) {
        const match = content.match(regex);
        if (match) {
            result.hasReasoningStart = true;
            const startIdx = match.index! + match[0].length;

            // Find the end of the reasoning value
            let endIdx = findStringEnd(content, startIdx, quote);

            if (endIdx !== -1) {
                result.reasoning = unescapeJsonString(content.slice(startIdx, endIdx));
                result.hasReasoningEnd = true;
            } else {
                // Still streaming - get content so far
                result.reasoning = unescapeJsonString(content.slice(startIdx));
                result.hasReasoningEnd = false;
            }
            break;
        }
    }

    // Try to find "answer" field (or alternative names like "response", "content", "text")
    const answerPatterns = [
        { regex: /"\s*answer\s*"\s*:\s*"/i, quote: '"' },
        { regex: /'\s*answer\s*'\s*:\s*'/i, quote: "'" },
        { regex: /answer\s*:\s*"/i, quote: '"' },
        { regex: /"\s*response\s*"\s*:\s*"/i, quote: '"' },
        { regex: /'\s*response\s*'\s*:\s*'/i, quote: "'" },
        { regex: /response\s*:\s*"/i, quote: '"' },
        { regex: /"\s*content\s*"\s*:\s*"/i, quote: '"' },
        { regex: /'\s*content\s*'\s*:\s*'/i, quote: "'" },
        { regex: /"\s*text\s*"\s*:\s*"/i, quote: '"' },
        { regex: /'\s*text\s*'\s*:\s*'/i, quote: "'" },
    ];

    for (const { regex, quote } of answerPatterns) {
        const match = content.match(regex);
        if (match) {
            result.hasAnswerStart = true;
            const startIdx = match.index! + match[0].length;

            // Find the end of the answer value
            let endIdx = findStringEnd(content, startIdx, quote);

            if (endIdx !== -1) {
                result.answer = unescapeJsonString(content.slice(startIdx, endIdx));
                result.hasAnswerEnd = true;
            } else {
                // Still streaming - get content so far
                result.answer = unescapeJsonString(content.slice(startIdx));
                result.hasAnswerEnd = false;
            }
            break;
        }
    }

    return result;
}

/**
 * Find the end of a JSON string value (the closing quote).
 * Handles escaped quotes within the string.
 * Returns -1 if the string is not yet complete.
 * 
 * The quoteChar parameter specifies which quote type started the string.
 */
function findStringEnd(content: string, startIdx: number, quoteChar: string = '"'): number {
    let i = startIdx;
    let escaped = false;

    while (i < content.length) {
        const char = content[i];

        if (escaped) {
            escaped = false;
            i++;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            i++;
            continue;
        }

        // Only end on the MATCHING quote type
        if (char === quoteChar) {
            // Found the closing quote - return it immediately
            // We trust that the first unescaped matching quote is the end
            // This handles cases with trailing text/garbage robustly
            return i;
        }

        i++;
    }

    return -1; // String not yet terminated
}

/**
 * Unescape common JSON escape sequences.
 */
function unescapeJsonString(str: string): string {
    return str
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
}

/**
 * Detect if streaming content looks like it contains JSON structure.
 */
export function hasJsonStructure(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.startsWith('{') ||
        trimmed.startsWith('```json') ||
        trimmed.startsWith('```{');
}
