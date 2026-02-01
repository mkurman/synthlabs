/**
 * File Service Interfaces
 * 
 * Provides type definitions for file operations, loading, saving, and exports.
 */

import { AppMode } from '../enums';
import { DetectedColumns } from '../../types';
import { ConfirmVariant } from '../../services/confirmService';

/**
 * Supported file formats for import/export.
 */
export enum FileFormat {
    /** JSON array format */
    Json = 'json',
    /** JSON Lines format */
    Jsonl = 'jsonl',
    /** Plain text format */
    Txt = 'txt',
    /** Markdown format */
    Md = 'md'
}

/**
 * File type categories for validation and filtering.
 */
export enum FileType {
    /** Rubric/prompt files */
    Rubric = 'rubric',
    /** Source data files */
    Source = 'source',
    /** Session files */
    Session = 'session',
    /** Export files */
    Export = 'export'
}

/**
 * Export method used for JSONL export.
 */
export enum ExportMethod {
    /** File System Access API with streaming */
    Streaming = 'streaming',
    /** In-memory fallback with blob download */
    Fallback = 'fallback'
}

/**
 * Configuration for loading a rubric/prompt file.
 */
export interface LoadRubricConfig {
    /** Current application mode */
    appMode: AppMode;
    /** Set system prompt for generator mode */
    setSystemPrompt: (prompt: string) => void;
    /** Set converter prompt for converter mode */
    setConverterPrompt: (prompt: string) => void;
}

/**
 * Configuration for saving a rubric/prompt file.
 */
export interface SaveRubricConfig {
    /** Current application mode */
    appMode: AppMode;
    /** System prompt content (generator mode) */
    systemPrompt: string;
    /** Converter prompt content (converter mode) */
    converterPrompt: string;
}

/**
 * Configuration for loading a source data file.
 */
export interface LoadSourceFileConfig {
    /** Set the manual file name */
    setManualFileName: (name: string) => void;
    /** Set converter input text */
    setConverterInputText: (text: string) => void;
    /** Set rows to fetch */
    setRowsToFetch: (rows: number) => void;
    /** Set available columns */
    setAvailableColumns: (columns: string[]) => void;
    /** Set detected columns */
    setDetectedColumns: (columns: DetectedColumns) => void;
    /** Update HF config */
    setHfConfig: (config: any) => void;
    /** Current HF config for auto-selection */
    hfConfig: any;
    /** Column detection function */
    detectColumns: (columns: string[]) => DetectedColumns;
}

/**
 * Result from parsing a source file.
 */
export interface ParsedSourceFile {
    /** File name */
    fileName: string;
    /** File content */
    content: string;
    /** Detected columns */
    columns: string[];
    /** Number of rows */
    rowCount: number;
    /** Detected column categories */
    detectedColumns: DetectedColumns;
}

/**
 * Configuration for JSONL export.
 */
export interface ExportJsonlConfig {
    /** Total number of logs to export */
    totalLogCount: number;
    /** Session UID for filtering logs */
    sessionUid: string;
    /** Confirm service for user confirmation */
    confirmService: {
        confirm: (options: { title: string; message: string; confirmLabel: string; cancelLabel: string; variant: ConfirmVariant }) => Promise<boolean>;
        alert: (options: { title: string; message: string; variant: ConfirmVariant }) => Promise<void>;
    };
    /** Toast service for notifications */
    toast: {
        success: (message: string) => void;
        warning: (message: string) => void;
        info: (message: string) => void;
    };
    /** Log storage service for iterating logs */
    logStorageService: {
        iterateLogs: (sessionUid: string, callback: (log: any) => Promise<void>) => Promise<void>;
        getAllLogs: (sessionUid: string) => Promise<any[]>;
    };
}

/**
 * Result from a file export operation.
 */
export interface ExportResult {
    /** Whether export was successful */
    success: boolean;
    /** Export method used */
    method: ExportMethod;
    /** Number of logs exported */
    count: number;
    /** Error message if failed */
    error?: string;
}

/**
 * File validation result.
 */
export interface FileValidationResult {
    /** Whether file is valid */
    valid: boolean;
    /** Detected file format */
    format: FileFormat;
    /** Error message if invalid */
    error?: string;
}
