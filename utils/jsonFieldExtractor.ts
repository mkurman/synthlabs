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

    let content = rawJson.trim();

    // Extract content from markdown code blocks if present
    // Only extract if the code block is at the START of the content
    // This prevents matching ``` markers that appear inside JSON string values
    const codeBlockMatch = content.match(/^```(?:json)?\s*([\s\S]*?)(?:```|$)/);
    if (codeBlockMatch && codeBlockMatch[1]) {
        const extracted = codeBlockMatch[1].trim();
        // Only use the extracted content if it looks like valid JSON (starts with { and ends with })
        // This prevents issues when the model contains ``` markers inside string values
        const trimmedExtracted = extracted.replace(/^[\s\n\r]+/, '');
        if (trimmedExtracted.startsWith('{') && trimmedExtracted.endsWith('}')) {
            content = extracted;
        }
    }

    // Sanitize smart quotes to straight quotes
    content = content.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

    // Handle double-encoded JSON (if the content itself is a JSON string literal)
    // e.g. "{\"reasoning\":...}"
    // We detect this if it starts with a quote, and we try to unescape it slightly to peek inside
    if (content.startsWith('"') && !content.trim().startsWith('"{')) {
        try {
            // Try to parse it as a string to unwrap one level
            // If it's a partial stream, JSON.parse might fail, so we might need manual unescaping
            // Simple heuristic: if it looks like "{\" or "{\n", unescape manually
            if (content.match(/^"\\?\{/)) {
                // It's likely a JSON string.
                // We can't use JSON.parse on partial content.
                // So we manually remove the surrounding quotes and unescape common chars.
                let inner = content.slice(1);
                if (inner.endsWith('"')) inner = inner.slice(0, -1);
                content = unescapeJsonString(inner);
            }
        } catch (e) {
            // Ignore
        }
    }

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
