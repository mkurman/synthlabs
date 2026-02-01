/**
 * Data Transform Service
 * 
 * Provides utilities for transforming and extracting content from dataset rows.
 * Handles column detection, content extraction, and format conversions.
 */

import { AppMode } from '../interfaces/enums';
import { OutputFieldName } from '../interfaces/enums/OutputFieldName';
import { RowContentConfig, ColumnDetectionResult } from '../interfaces/services/DataTransformConfig';

// Re-export extractInputContent for convenience
export { extractInputContent } from '../utils/contentExtractor';

/**
 * Column name patterns for detection.
 * Ordered by priority within each category.
 */
const COLUMN_PATTERNS = {
    input: [
        OutputFieldName.Query, 'question', 'prompt', 'input', 'instruction', 'text', 'problem', 'request',
        'context', 'document', 'passage', 'user', 'human', 'message', 'conversation',
        'dialog', 'task'
    ],
    output: [
        'response', OutputFieldName.Answer, 'output', 'completion', 'chosen', 'target', 'solution', 'reply',
        'assistant', 'gold', 'label', 'expected', 'ground_truth', 'groundtruth', 'reference',
        'correct', 'synthetic_answer', 'gpt', 'model_output'
    ],
    reasoning: [
        OutputFieldName.Reasoning, 'thought', 'think', 'rationale', 'chain', 'brain', 'logic', 'cot',
        'explanation', 'analysis', 'steps', 'work', 'process', 'derivation', 'justification',
        'scratchpad', 'synthetic_reasoning', 'trace'
    ]
};

/**
 * Score a column name against a list of patterns.
 * @param columnName - The column name to score
 * @param patterns - List of patterns to match against
 * @returns Score from 0 to 1 (1 = exact match, 0.8 = starts with, 0.5 = contains, 0 = no match)
 */
function scoreMatch(columnName: string, patterns: string[]): number {
    const name = columnName.toLowerCase();
    if (patterns.includes(name)) return 1.0; // Exact match
    if (patterns.some(p => name.startsWith(p))) return 0.8; // Starts with
    if (patterns.some(p => name.includes(p))) return 0.5; // Contains
    return 0;
}

/**
 * Detect and categorize dataset columns as input, output, or reasoning
 * based on pattern matching with scoring system.
 * 
 * @param columns - Array of column names to analyze
 * @returns DetectedColumns with columns sorted by match score in each category
 * 
 * @example
 * ```typescript
 * const detected = detectColumns(['query', 'answer', 'reasoning', 'id']);
 * // Returns: { input: ['query'], output: ['answer'], reasoning: ['reasoning'], all: [...] }
 * ```
 */
export function detectColumns(columns: string[]): ColumnDetectionResult {
    const input = columns
        .map(c => ({ col: c, score: scoreMatch(c, COLUMN_PATTERNS.input) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.col);

    const output = columns
        .map(c => ({ col: c, score: scoreMatch(c, COLUMN_PATTERNS.output) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.col);

    const reasoning = columns
        .map(c => ({ col: c, score: scoreMatch(c, COLUMN_PATTERNS.reasoning) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.col);

    return { input, output, reasoning, all: columns };
}

/**
 * Separator used between multiple column contents.
 */
const COLUMN_SEPARATOR = '\n\n' + '-'.repeat(50) + '\n\n';

/**
 * Format MCQ options from dict or list into readable string.
 * @param options - Options in various formats
 * @returns Formatted string with labeled options
 */
function formatMcqOptions(options: unknown): string {
    if (!options) return '';

    // Handle dictionary format: {"A": "option text", "B": "option text"}
    if (typeof options === 'object' && !Array.isArray(options)) {
        return Object.entries(options as Record<string, unknown>)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
    }

    // Handle array format: ["option A", "option B"] - add A, B, C labels
    if (Array.isArray(options)) {
        const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return options
            .map((opt: unknown, idx: number) => 
                `${labels[idx] || idx + 1}: ${typeof opt === 'object' ? JSON.stringify(opt) : opt}`
            )
            .join('\n');
    }

    // Fallback for string (already formatted)
    if (typeof options === 'string') return options;

    return JSON.stringify(options);
}

/**
 * Extract text content from a node (handles various formats).
 * @param node - Content node (string, array, or object)
 * @returns Extracted text string
 */
function getText(node: unknown): string {
    if (!node) return "";
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(getText).join('\n');
    if (typeof node === 'object' && node !== null) {
        const obj = node as Record<string, unknown>;
        const content = obj.content || obj.value || obj.text;
        const reasoning = obj.reasoning_content || obj.reasoning;
        if (content && reasoning) {
            return `<think>${String(reasoning)}</think>${String(content)}`;
        }
        return String(content || JSON.stringify(node));
    }
    return String(node);
}

/**
 * Get content from a specific column in a row.
 * @param row - The data row
 * @param columnName - Name of the column to extract
 * @param config - Configuration with hfConfig and appMode
 * @returns Extracted content string
 */
function getColumnContent(row: Record<string, unknown>, columnName: string, config: RowContentConfig): string {
    const value = row[columnName];
    if (value === undefined || value === null) return '';

    // Return string values as-is (what's in the dataset is what you get)
    if (typeof value === 'string') return value;

    // Handle array content (e.g., chat messages)
    if (Array.isArray(value)) {
        const turnIndex = config.hfConfig.messageTurnIndex || 0;
        const firstItem = value[0];
        const isChat = firstItem && typeof firstItem === 'object' && 
            ('role' in (firstItem as object) || 'from' in (firstItem as object));
        
        if (isChat) {
            if (config.appMode === AppMode.Converter) {
                const userIndex = turnIndex * 2;
                const assistantIndex = turnIndex * 2 + 1;
                const userMsg = value[userIndex];
                const assistantMsg = value[assistantIndex];
                if (userMsg && assistantMsg) {
                    return `<input_query>${getText(userMsg)}</input_query><model_response>${getText(assistantMsg)}</model_response>`;
                }
            }
            return getText(value[turnIndex * 2]);
        } else {
            return getText(value[turnIndex]);
        }
    }

    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/**
 * Extract content from HuggingFace row data.
 * Handles chat messages, MCQ options, multiple column formats, and conversation arrays.
 * 
 * @param row - The raw row data from HuggingFace dataset
 * @param config - Configuration with hfConfig and appMode
 * @returns Extracted content string, formatted for the specified app mode
 * 
 * @example
 * ```typescript
 * const content = getRowContent(row, {
 *   hfConfig: { dataset: 'my/dataset', inputColumns: ['question'], outputColumns: ['answer'] },
 *   appMode: AppMode.Generator
 * });
 * ```
 */
export function getRowContent(row: Record<string, unknown>, config: RowContentConfig): string {
    const { hfConfig, appMode } = config;

    // Try inputColumns first (new multi-column approach)
    if (hfConfig.inputColumns && hfConfig.inputColumns.length > 0) {
        const contents = hfConfig.inputColumns
            .map((col: string) => getColumnContent(row, col, config))
            .filter((c: string) => c.trim() !== '');

        // Append MCQ options if mcqColumn is configured
        if (hfConfig.mcqColumn && row[hfConfig.mcqColumn]) {
            const formattedOptions = formatMcqOptions(row[hfConfig.mcqColumn]);
            if (formattedOptions) {
                contents.push('\nOptions:\n' + formattedOptions);
            }
        }

        let outputContent: string | null = null;

        if (hfConfig.outputColumns && hfConfig.outputColumns.length > 0) {
            outputContent = hfConfig.outputColumns
                .map((col: string) => getColumnContent(row, col, config))
                .filter((c: string) => c.trim() !== '')
                .join(COLUMN_SEPARATOR);
        }

        // Append reasoning if reasoningColumns are configured
        if (hfConfig.reasoningColumns && hfConfig.reasoningColumns.length > 0) {
            const reasoning = hfConfig.reasoningColumns
                .map((col: string) => getColumnContent(row, col, config))
                .filter((c: string) => c.trim() !== '')
                .join('\n\n');

            if (reasoning) {
                // If we have input content (query), we wrap both for extractInputContent
                const inputQuery = contents.join(COLUMN_SEPARATOR);
                const outputQuery = outputContent ? `<output>${outputContent}</output>` : '';
                return `<input_query>${inputQuery}</input_query><model_response><think>${reasoning}</think>${outputQuery}</model_response>`;
            }
        }

        // Fallback: if reasoning_content exists on the row, include it
        if (!hfConfig.reasoningColumns || hfConfig.reasoningColumns.length === 0) {
            const rowReasoning = row[OutputFieldName.ReasoningContent] || row[OutputFieldName.Reasoning];
            if (rowReasoning !== undefined && rowReasoning !== null) {
                const reasoningText = typeof rowReasoning === 'string' ? rowReasoning : JSON.stringify(rowReasoning);
                const inputQuery = contents.join(COLUMN_SEPARATOR);
                const outputQuery = outputContent ? `<output>${outputContent}</output>` : '';
                return `<input_query>${inputQuery}</input_query><model_response><think>${reasoningText}</think>${outputQuery}</model_response>`;
            }
        }

        if (outputContent) {
            return "<input_query>" + contents.join(COLUMN_SEPARATOR) + "</input_query><model_response>" + outputContent + "</model_response>";
        }

        if (contents.length > 0) {
            return contents.join(COLUMN_SEPARATOR);
        }
    }

    // Fallback to legacy columnName
    if (hfConfig.columnName && row[hfConfig.columnName] !== undefined) {
        return getColumnContent(row, hfConfig.columnName, config);
    }

    // Auto-detect fallback
    const autoContent = row.messages || row.conversations || row.conversation ||
        row.prompt || row.instruction || row.text || row.content || row.input || row;

    if (Array.isArray(autoContent)) {
        const turnIndex = hfConfig.messageTurnIndex || 0;
        const firstItem = autoContent[0];
        const isChat = firstItem && typeof firstItem === 'object' && 
            ('role' in (firstItem as object) || 'from' in (firstItem as object));
        
        if (appMode === AppMode.Converter) {
            if (isChat) {
                const userIndex = turnIndex * 2;
                const assistantIndex = turnIndex * 2 + 1;
                const userMsg = autoContent[userIndex];
                const assistantMsg = autoContent[assistantIndex];
                if (userMsg && assistantMsg) {
                    return `<input_query>${getText(userMsg)}</input_query><model_response>${getText(assistantMsg)}</model_response>`;
                }
            }
            return getText(autoContent[turnIndex]);
        } else {
            if (isChat) {
                return getText(autoContent[turnIndex * 2]);
            } else {
                return getText(autoContent[turnIndex]);
            }
        }
    }
    
    if (typeof autoContent === 'object') return JSON.stringify(autoContent);
    return String(autoContent);
}

/**
 * DataTransformService object for convenient access to all data transform utilities.
 */
export const DataTransformService = {
    detectColumns,
    getRowContent,
    // Re-exported from contentExtractor
    get extractInputContent() {
        // Dynamic import to avoid circular dependencies
        return require('../utils/contentExtractor').extractInputContent;
    }
};

export default DataTransformService;
