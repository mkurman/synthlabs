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
    let content = rawJson.trim();
    if (content.startsWith('```json')) {
        content = content.replace(/^```json\s*/, '').replace(/```$/, '');
    } else if (content.startsWith('```')) {
        content = content.replace(/^```\s*/, '').replace(/```$/, '');
    }

    // Try to find "reasoning" field
    const reasoningPatterns = [
        /"reasoning"\s*:\s*"/,
        /'reasoning'\s*:\s*'/,
        /reasoning\s*:\s*"/,
    ];

    for (const pattern of reasoningPatterns) {
        const match = content.match(pattern);
        if (match) {
            result.hasReasoningStart = true;
            const startIdx = match.index! + match[0].length;

            // Find the end of the reasoning value
            let endIdx = findStringEnd(content, startIdx);

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

    // Try to find "answer" field
    const answerPatterns = [
        /"answer"\s*:\s*"/,
        /'answer'\s*:\s*'/,
        /answer\s*:\s*"/,
    ];

    for (const pattern of answerPatterns) {
        const match = content.match(pattern);
        if (match) {
            result.hasAnswerStart = true;
            const startIdx = match.index! + match[0].length;

            // Find the end of the answer value
            let endIdx = findStringEnd(content, startIdx);

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
            // Verify this looks like a proper JSON field end
            // (should be followed by comma, closing brace, or whitespace + one of those)
            const afterQuote = content.slice(i + 1).trimStart();
            if (afterQuote.length === 0) {
                // Still streaming, can't confirm end
                return -1;
            }
            // Valid terminators after a JSON string value
            if (afterQuote[0] === ',' || afterQuote[0] === '}' || afterQuote[0] === ']') {
                return i;
            }
            // If there's more content but no valid terminator, might be incomplete
            // Continue looking (this handles cases where quote appears in content)
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
