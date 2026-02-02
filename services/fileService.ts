/**
 * File Service
 * 
 * Manages file operations including loading rubrics, source files,
 * and exporting data in various formats.
 */

import { logger } from '../utils/logger';
import {
    FileFormat,
    FileType,
    ExportMethod,
    LoadRubricConfig,
    SaveRubricConfig,
    LoadSourceFileConfig,
    ParsedSourceFile,
    ExportJsonlConfig,
    ExportResult,
    FileValidationResult
} from '../interfaces/services/FileServiceConfig';
import { CreatorMode } from '../interfaces/enums';
import { DetectedColumns } from '../types';

/**
 * Maximum buffer size for streaming exports (256KB).
 */
const MAX_BUFFER_CHARS = 256 * 1024;

/**
 * FileService provides methods for file I/O operations.
 */
export const FileService = {
    /**
     * Load a rubric/prompt file and set the appropriate prompt based on app mode.
     * 
     * @param file - File to load
     * @param config - Configuration with app mode and setters
     * @returns Promise resolving when complete
     */
    async loadRubric(file: File, config: LoadRubricConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                if (typeof event.target?.result === 'string') {
                    const content = event.target.result;
                    if (config.appMode === CreatorMode.Generator) {
                        config.setSystemPrompt(content);
                    } else {
                        config.setConverterPrompt(content);
                    }
                    resolve();
                } else {
                    reject(new Error('Failed to read file content'));
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsText(file);
        });
    },

    /**
     * Save a rubric/prompt file based on current app mode.
     * 
     * @param config - Configuration with app mode and prompt content
     */
    saveRubric(config: SaveRubricConfig): void {
        const content = config.appMode === CreatorMode.Generator
            ? config.systemPrompt
            : config.converterPrompt;

        const modeLabel = config.appMode === CreatorMode.Generator ? 'generator' : 'converter';
        const fileName = `${modeLabel}_rubric_${new Date().toISOString().slice(0, 10)}.txt`;

        this.downloadFile(content, fileName, 'text/plain');
    },

    /**
     * Load a source data file (JSON, JSONL, or plain text).
     * Parses the file and detects columns.
     * 
     * @param file - File to load
     * @param config - Configuration with setters and detection function
     * @returns Promise resolving to parsed file data
     */
    async loadSourceFile(file: File, config: LoadSourceFileConfig): Promise<ParsedSourceFile> {
        // Store the file name
        config.setManualFileName(file.name);

        const content = await this.readFileAsText(file);
        config.setConverterInputText(content);

        // Detect columns from JSON data
        const trimmedText = content.trim();
        let detectedCols: string[] = [];
        let rowCount = 0;

        // First try parsing as JSON array
        if (trimmedText.startsWith('[') && trimmedText.endsWith(']')) {
            try {
                const arr = JSON.parse(trimmedText);
                if (Array.isArray(arr)) {
                    rowCount = arr.length;
                    if (arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
                        detectedCols = Object.keys(arr[0]);
                    }
                }
            } catch (error) {
                logger.warn('Failed to parse file as JSON array, trying JSONL format:', error);
            }
        }

        // Fallback to JSONL format if no columns detected
        if (detectedCols.length === 0) {
            const lines = content.split('\n').filter(l => l.trim());
            let validJsonlRows = 0;

            for (const line of lines) {
                try {
                    const obj = JSON.parse(line);
                    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
                        validJsonlRows++;
                        // Detect columns from first valid object
                        if (detectedCols.length === 0) {
                            detectedCols = Object.keys(obj);
                        }
                    }
                } catch (error) {
                    logger.warn(`Skipping invalid JSONL line: "${line.substring(0, 50)}..."`, error);
                }
            }

            // Use validated JSONL row count if we found valid rows
            if (validJsonlRows > 0) {
                rowCount = validJsonlRows;
            }
        }

        // Fallback row count for plain text format
        if (rowCount === 0) {
            rowCount = content.split('\n').filter(l => l.trim()).length;
            logger.warn('Could not parse file as JSON or JSONL, using line count as fallback');
        }

        // Set the correct row count
        config.setRowsToFetch(rowCount);

        // Apply detected columns
        let detectedColumnResult: DetectedColumns = { input: [], output: [], reasoning: [], all: [] };
        if (detectedCols.length > 0) {
            config.setAvailableColumns(detectedCols);
            detectedColumnResult = config.detectColumns(detectedCols);
            config.setDetectedColumns(detectedColumnResult);

            // Auto-select first detected input column if none selected
            if ((!config.hfConfig.inputColumns || config.hfConfig.inputColumns.length === 0) && detectedColumnResult.input.length > 0) {
                config.setHfConfig((prev: any) => ({ ...prev, inputColumns: detectedColumnResult.input.slice(0, 1) }));
            }

            // Auto-select detected reasoning columns if none selected
            if ((!config.hfConfig.reasoningColumns || config.hfConfig.reasoningColumns.length === 0)
                && detectedColumnResult.reasoning.length > 0) {
                config.setHfConfig((prev: any) => ({ ...prev, reasoningColumns: detectedColumnResult.reasoning }));
            }
        }

        return {
            fileName: file.name,
            content,
            columns: detectedCols,
            rowCount,
            detectedColumns: detectedColumnResult
        };
    },

    /**
     * Export logs to JSONL format.
     * Uses streaming File System Access API when available, falls back to in-memory.
     * 
     * @param config - Export configuration
     * @returns Promise resolving to export result
     */
    async exportJsonl(config: ExportJsonlConfig): Promise<ExportResult> {
        if (config.totalLogCount === 0) {
            return { success: false, method: ExportMethod.Fallback, count: 0, error: 'No logs to export' };
        }

        const confirmExport = await config.confirmService.confirm({
            title: 'Export logs?',
            message: `Exporting ${config.totalLogCount} logs. This might take a moment.`,
            confirmLabel: 'Export',
            cancelLabel: 'Cancel',
            variant: 'warning'
        });

        if (!confirmExport) {
            return { success: false, method: ExportMethod.Fallback, count: 0, error: 'User cancelled' };
        }

        const fileName = `synth_dataset_${new Date().toISOString().slice(0, 10)}.jsonl`;
        const anyWindow = window as any;

        // Try streaming export first
        try {
            if (typeof anyWindow.showSaveFilePicker === 'function') {
                const handle = await anyWindow.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [
                        {
                            description: 'JSON Lines',
                            accept: { 'application/x-jsonlines': ['.jsonl'] }
                        }
                    ]
                });

                const writable = await handle.createWritable();
                const encoder = new TextEncoder();
                let buffer = '';
                let count = 0;

                await config.logStorageService.iterateLogs(config.sessionUid, async (log: any) => {
                    buffer += JSON.stringify(log) + '\n';
                    count++;
                    if (buffer.length >= MAX_BUFFER_CHARS) {
                        await writable.write(encoder.encode(buffer));
                        buffer = '';
                    }
                });

                if (buffer.length > 0) {
                    await writable.write(encoder.encode(buffer));
                }

                await writable.close();
                config.toast.success('Exported with streaming writer');
                return { success: true, method: ExportMethod.Streaming, count };
            }
        } catch (e: any) {
            console.error('Streaming export failed, falling back to in-memory export:', e);
            config.toast.warning('Streaming export failed; using fallback');
        }

        // Fallback: in-memory export
        const allLogs = await config.logStorageService.getAllLogs(config.sessionUid);
        if (allLogs.length === 0) {
            await config.confirmService.alert({
                title: 'No logs found',
                message: 'No logs found to export. Check console for details.',
                variant: 'warning'
            });
            return { success: false, method: ExportMethod.Fallback, count: 0, error: 'No logs found' };
        }

        const jsonl = allLogs.map((log: any) => JSON.stringify(log)).join('\n');
        this.downloadFile(jsonl, fileName, 'application/x-jsonlines');
        config.toast.info('Exported with fallback method');
        return { success: true, method: ExportMethod.Fallback, count: allLogs.length };
    },

    /**
     * Read a file as text.
     * 
     * @param file - File to read
     * @returns Promise resolving to file content
     */
    async readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                if (typeof event.target?.result === 'string') {
                    resolve(event.target.result);
                } else {
                    reject(new Error('Failed to read file content'));
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsText(file);
        });
    },

    /**
     * Download content as a file.
     * 
     * @param content - Content to download
     * @param fileName - File name
     * @param mimeType - MIME type
     */
    downloadFile(content: string, fileName: string, mimeType: string): void {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Validate a file based on its extension.
     * 
     * @param file - File to validate
     * @param allowedTypes - Allowed file types
     * @returns Validation result
     */
    validateFile(file: File, allowedTypes: FileType[]): FileValidationResult {
        const extension = file.name.split('.').pop()?.toLowerCase() || '';

        const formatMap: Record<string, FileFormat> = {
            'json': FileFormat.Json,
            'jsonl': FileFormat.Jsonl,
            'txt': FileFormat.Txt,
            'md': FileFormat.Md
        };

        const format = formatMap[extension];

        if (!format) {
            return { valid: false, format: FileFormat.Txt, error: `Unsupported file format: .${extension}` };
        }

        // Check if format is allowed for the file type
        const typeFormatMap: Record<FileType, FileFormat[]> = {
            [FileType.Rubric]: [FileFormat.Txt, FileFormat.Md, FileFormat.Json],
            [FileType.Source]: [FileFormat.Json, FileFormat.Jsonl, FileFormat.Txt],
            [FileType.Session]: [FileFormat.Json],
            [FileType.Export]: [FileFormat.Jsonl]
        };

        for (const type of allowedTypes) {
            if (typeFormatMap[type]?.includes(format)) {
                return { valid: true, format };
            }
        }

        return { valid: false, format, error: `File format .${extension} not allowed for this operation` };
    },

    /**
     * Detect file format from content.
     * 
     * @param content - File content
     * @returns Detected file format
     */
    detectFormat(content: string): FileFormat {
        const trimmed = content.trim();

        // Check for JSON array
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                JSON.parse(trimmed);
                return FileFormat.Json;
            } catch {
                // Not valid JSON, continue checking
            }
        }

        // Check for JSONL (first line is JSON object)
        const firstLine = trimmed.split('\n')[0];
        if (firstLine) {
            try {
                const obj = JSON.parse(firstLine);
                if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
                    return FileFormat.Jsonl;
                }
            } catch {
                // Not valid JSONL, continue checking
            }
        }

        // Default to plain text
        return FileFormat.Txt;
    }
};

export default FileService;
