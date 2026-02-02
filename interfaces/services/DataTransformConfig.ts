import { CreatorMode } from '../enums';
import { HuggingFaceConfig, DetectedColumns } from '../../types';

/**
 * Configuration for row content extraction.
 * Used by DataTransformService.getRowContent() to extract content from dataset rows.
 */
export interface RowContentConfig {
    /** HuggingFace dataset configuration with column mappings */
    hfConfig: HuggingFaceConfig;
    /** Current application mode (generator or converter) */
    appMode: CreatorMode;
}

/**
 * Result from column detection with scored matches.
 * Extends DetectedColumns from types.ts
 */
export interface ColumnDetectionResult extends DetectedColumns {
    /** Columns detected as input fields, sorted by match score */
    input: string[];
    /** Columns detected as output fields, sorted by match score */
    output: string[];
    /** Columns detected as reasoning fields, sorted by match score */
    reasoning: string[];
    /** All available columns */
    all: string[];
}

/**
 * Format mode for content extraction.
 * - Llm: Full context with query and reasoning for LLM consumption
 * - Display: UI summary showing just the query
 */
export enum ExtractContentFormat {
    /** Full context with [USER QUERY] and [RAW REASONING TRACE] */
    Llm = 'llm',
    /** Just the query for UI display */
    Display = 'display'
}

/**
 * Options for extractInputContent function.
 */
export interface ExtractContentOptions {
    /** Format mode for content extraction */
    format?: ExtractContentFormat;
}
