import { ExtractContentFormat, ExtractContentOptions } from '../interfaces/services/DataTransformConfig';

/**
 * Extracts input content from text, handling various formats like input_query/model_response tags.
 * @param text - The raw text to extract from
 * @param options - Optional format settings
 * @returns Extracted content string
 */
export function extractInputContent(text: string, options: ExtractContentOptions = {}): string {
    const queryMatch = text.match(/<input_query>([\s\S]*?)<\/input_query>/);
    const responseMatch = text.match(/<model_response>([\s\S]*?)<\/model_response>/);

    if (queryMatch && responseMatch) {
        const query = queryMatch[1].trim();
        const rawResponse = responseMatch[1].trim();
        const thinkMatch = rawResponse.match(/<think>([\s\S]*?)<\/think>/i);
        const logic = thinkMatch ? thinkMatch[1].trim() : rawResponse;

        if (options.format === ExtractContentFormat.Display) {
            return query; // Just return the query for UI summary
        }
        return `[USER QUERY]:\n${query}\n\n[RAW REASONING TRACE]:\n${logic}`;
    }

    const match = text.match(/<think>([\s\S]*?)<\/think>/i);
    if (match && match[1]) {
        return match[1].trim();
    }
    return text.trim();
}
