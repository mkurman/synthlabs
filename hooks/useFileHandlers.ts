import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { FileService } from '../services/fileService';
import { AppMode } from '../interfaces/enums';
import type { HuggingFaceConfig, DetectedColumns } from '../types';
import type { ColumnDetectionResult } from '../interfaces/services/DataTransformConfig';

interface UseFileHandlersOptions {
    appMode: AppMode;
    systemPrompt: string;
    converterPrompt: string;
    setSystemPrompt: (prompt: string) => void;
    setConverterPrompt: (prompt: string) => void;
    setError: (error: string | null) => void;
    setManualFileName: (name: string) => void;
    setConverterInputText: (text: string) => void;
    setRowsToFetch: (rows: number) => void;
    setAvailableColumns: (columns: string[]) => void;
    setDetectedColumns: (columns: DetectedColumns) => void;
    setHfConfig: Dispatch<SetStateAction<HuggingFaceConfig>>;
    hfConfig: HuggingFaceConfig;
    detectColumns: (columns: string[]) => ColumnDetectionResult;
}

export function useFileHandlers({
    appMode,
    systemPrompt,
    converterPrompt,
    setSystemPrompt,
    setConverterPrompt,
    setError,
    setManualFileName,
    setConverterInputText,
    setRowsToFetch,
    setAvailableColumns,
    setDetectedColumns,
    setHfConfig,
    hfConfig,
    detectColumns
}: UseFileHandlersOptions) {
    const handleLoadRubric = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await FileService.loadRubric(file, {
                appMode,
                setSystemPrompt,
                setConverterPrompt
            });
        } catch (err) {
            console.error('Failed to load rubric', err);
            setError('Failed to load rubric file');
        }
        e.target.value = '';
    }, [appMode, setConverterPrompt, setError, setSystemPrompt]);

    const handleLoadSourceFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await FileService.loadSourceFile(file, {
                setManualFileName,
                setConverterInputText,
                setRowsToFetch,
                setAvailableColumns,
                setDetectedColumns,
                setHfConfig,
                hfConfig,
                detectColumns
            });
        } catch (err) {
            console.error('Failed to load source file', err);
            setError('Failed to load source file');
        }
        e.target.value = '';
    }, [detectColumns, hfConfig, setAvailableColumns, setConverterInputText, setDetectedColumns, setError, setHfConfig, setManualFileName, setRowsToFetch]);

    const handleSaveRubric = useCallback(() => {
        FileService.saveRubric({
            appMode,
            systemPrompt,
            converterPrompt
        });
    }, [appMode, converterPrompt, systemPrompt]);

    return {
        handleLoadRubric,
        handleLoadSourceFile,
        handleSaveRubric
    };
}

export default useFileHandlers;
