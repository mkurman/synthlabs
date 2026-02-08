import { useCallback } from 'react';

import type { HuggingFaceConfig, VerifierItem } from '../types';
import { VerifierPanelTab } from '../interfaces/enums/VerifierPanelTab';
import { VerifierDataSource } from '../interfaces/enums/VerifierDataSource';
import { fetchHuggingFaceRows } from '../services/huggingFaceService';
import { mapHfRowsToVerifierItems } from '../services/verifierHfImportService';
import { logger } from '../utils/logger';

interface UseVerifierHfImportOptions {
    hfConfig: HuggingFaceConfig;
    rowsToFetch: number;
    skipRows: number;
    setIsImporting: (value: boolean) => void;
    analyzeDuplicates: (items: VerifierItem[]) => void;
    setData: (items: VerifierItem[]) => void;
    setDataSource: (source: VerifierDataSource | null) => void;
    setActiveTab: (tab: VerifierPanelTab) => void;
    setImportError: (value: string | null) => void;
    toast: { error: (message: string) => void; info: (message: string) => void };
}

interface UseVerifierHfImportReturn {
    handleHfImport: () => Promise<void>;
}

function validateHfConfig(config: HuggingFaceConfig): string | null {
    if (!config.dataset) return 'Select a dataset before importing.';
    if (!config.config) return 'Select a config before importing.';
    if (!config.split) return 'Select a split before importing.';
    return null;
}

function validateFetchRange(rowsToFetch: number): string | null {
    if (!Number.isFinite(rowsToFetch) || rowsToFetch <= 0) {
        return 'Rows to fetch must be greater than 0.';
    }
    return null;
}

export function useVerifierHfImport({
    hfConfig,
    rowsToFetch,
    skipRows,
    setIsImporting,
    analyzeDuplicates,
    setData,
    setDataSource,
    setActiveTab,
    setImportError,
    toast
}: UseVerifierHfImportOptions): UseVerifierHfImportReturn {
    const handleHfImport = useCallback(async () => {
        const configError = validateHfConfig(hfConfig);
        if (configError) {
            setImportError(configError);
            toast.error(configError);
            return;
        }

        const rangeError = validateFetchRange(rowsToFetch);
        if (rangeError) {
            setImportError(rangeError);
            toast.error(rangeError);
            return;
        }

        setIsImporting(true);
        setImportError(null);
        try {
            const rows = await fetchHuggingFaceRows(hfConfig, Math.max(0, skipRows), rowsToFetch);
            if (rows.length === 0) {
                toast.info('No rows returned from HuggingFace.');
                return;
            }
            const items = mapHfRowsToVerifierItems(rows, { hfConfig });
            analyzeDuplicates(items);
            setData(items);
            setDataSource(VerifierDataSource.HuggingFace);
            setActiveTab(VerifierPanelTab.Review);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error('HuggingFace import failed', error);
            setImportError(`HuggingFace import failed: ${message}`);
            toast.error(`HuggingFace import failed: ${message}`);
        } finally {
            setIsImporting(false);
        }
    }, [analyzeDuplicates, hfConfig, rowsToFetch, skipRows, setActiveTab, setData, setDataSource, setImportError, setIsImporting, toast]);

    return { handleHfImport };
}

export default useVerifierHfImport;
