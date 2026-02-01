import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { fetchHuggingFaceRows, searchDatasets, getDatasetStructure, getDatasetInfo } from '../services/huggingFaceService';
import { DataSource } from '../interfaces/enums';
import type { HuggingFaceConfig, DetectedColumns } from '../types';
import type { ColumnDetectionResult } from '../interfaces/services/DataTransformConfig';

interface UseHuggingFaceOptions {
    hfConfig: HuggingFaceConfig;
    setHfConfig: Dispatch<SetStateAction<HuggingFaceConfig>>;
    setError: (error: string | null) => void;
    setAvailableColumns: Dispatch<SetStateAction<string[]>>;
    setDetectedColumns: Dispatch<SetStateAction<DetectedColumns>>;
    setDataSourceMode: Dispatch<SetStateAction<DataSource>>;
    setHfPreviewData: Dispatch<SetStateAction<any[]>>;
    setHfTotalRows: Dispatch<SetStateAction<number>>;
    detectColumns: (columns: string[]) => ColumnDetectionResult;
}

export function useHuggingFace({
    hfConfig,
    setHfConfig,
    setError,
    setAvailableColumns,
    setDetectedColumns,
    setDataSourceMode,
    setHfPreviewData,
    setHfTotalRows,
    detectColumns
}: UseHuggingFaceOptions) {
    const [hfSearchResults, setHfSearchResults] = useState<string[]>([]);
    const [isSearchingHF, setIsSearchingHF] = useState(false);
    const [hfStructure, setHfStructure] = useState<{ configs: string[]; splits: Record<string, string[]> }>({
        configs: [],
        splits: {}
    });
    const [showHFResults, setShowHFResults] = useState(false);
    const [isPrefetching, setIsPrefetching] = useState(false);
    const [isLoadingHfPreview, setIsLoadingHfPreview] = useState(false);
    const searchTimeoutRef = useRef<number | null>(null);

    const prefetchColumns = useCallback(async (overrideConfig?: HuggingFaceConfig) => {
        const configToUse = overrideConfig || hfConfig;
        if (!configToUse.dataset) {
            setError('Please enter a Dataset ID first.');
            return;
        }
        setIsPrefetching(true);
        setAvailableColumns([]);
        setDetectedColumns({ input: [], output: [], all: [], reasoning: [] });
        setError(null);
        try {
            const rows = await fetchHuggingFaceRows(configToUse, 0, 1);
            if (rows.length > 0 && rows[0]) {
                if (typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
                    const cols = Object.keys(rows[0]);
                    setAvailableColumns(cols);

                    const detected = detectColumns(cols);
                    setDetectedColumns(detected);

                    if ((!configToUse.inputColumns || configToUse.inputColumns.length === 0) && detected.input.length > 0) {
                        setHfConfig(prev => ({ ...prev, inputColumns: detected.input.slice(0, 1) }));
                    }
                    if ((!configToUse.outputColumns || configToUse.outputColumns.length === 0) && detected.output.length > 0) {
                        setHfConfig(prev => ({ ...prev, outputColumns: detected.output.slice(0, 1) }));
                    }
                    if ((!configToUse.reasoningColumns || configToUse.reasoningColumns.length === 0) && detected.reasoning.length > 0) {
                        setHfConfig(prev => ({ ...prev, reasoningColumns: detected.reasoning.slice(0, 1) }));
                    }
                } else {
                    setError('Row is not an object, cannot detect columns.');
                }
            } else {
                setError('No rows returned from dataset.');
            }
        } catch (e: any) {
            console.error(e);
            setError('Failed to fetch row: ' + (e.message || 'Unknown error'));
        } finally {
            setIsPrefetching(false);
        }
    }, [detectColumns, hfConfig, setAvailableColumns, setDetectedColumns, setError, setHfConfig]);

    const handleHFSearch = useCallback((query: string) => {
        setHfConfig(prev => ({ ...prev, dataset: query }));
        if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
        if (query.length < 3) {
            setHfSearchResults([]);
            setShowHFResults(false);
            return;
        }
        setIsSearchingHF(true);
        searchTimeoutRef.current = window.setTimeout(async () => {
            const results = await searchDatasets(query);
            setHfSearchResults(results);
            setShowHFResults(true);
            setIsSearchingHF(false);
        }, 500);
    }, [setHfConfig]);

    const handleSelectHFDataset = useCallback(async (datasetId: string) => {
        setHfConfig(prev => ({ ...prev, dataset: datasetId, config: '', split: '' }));
        setShowHFResults(false);
        setHfPreviewData([]);
        setHfTotalRows(0);

        const structure = await getDatasetStructure(datasetId);
        setHfStructure(structure);
        if (structure.configs.length > 0) {
            const defaultConfig = structure.configs.includes('default') ? 'default' : structure.configs[0];
            const splits = structure.splits[defaultConfig] || [];
            const defaultSplit = splits.includes('train') ? 'train' : (splits[0] || '');
            const newConfig = { ...hfConfig, dataset: datasetId, config: defaultConfig, split: defaultSplit };
            setHfConfig(newConfig);

            setIsLoadingHfPreview(true);
            try {
                const [previewRows, datasetInfo] = await Promise.all([
                    fetchHuggingFaceRows(newConfig, 0, 5),
                    getDatasetInfo(datasetId, defaultConfig, defaultSplit)
                ]);
                setHfPreviewData(previewRows);
                setHfTotalRows(datasetInfo.totalRows);
            } catch (e) {
                console.error('Failed to fetch HF preview:', e);
            } finally {
                setIsLoadingHfPreview(false);
            }

            prefetchColumns(newConfig);
        }
    }, [hfConfig, prefetchColumns, setHfConfig, setHfPreviewData, setHfTotalRows]);

    const handleConfigChange = useCallback(async (newConfig: string) => {
        const splits = hfStructure.splits[newConfig] || [];
        const newSplit = splits.includes('train') ? 'train' : (splits[0] || '');
        const updatedConfig = { ...hfConfig, config: newConfig, split: newSplit };
        setHfConfig(updatedConfig);
        setAvailableColumns([]);

        if (hfConfig.dataset) {
            setIsLoadingHfPreview(true);
            try {
                const [previewRows, datasetInfo] = await Promise.all([
                    fetchHuggingFaceRows(updatedConfig, 0, 5),
                    getDatasetInfo(hfConfig.dataset, newConfig, newSplit)
                ]);
                setHfPreviewData(previewRows);
                setHfTotalRows(datasetInfo.totalRows);
                prefetchColumns(updatedConfig);
            } catch (e) {
                console.error('Failed to refresh HF preview on config change:', e);
            } finally {
                setIsLoadingHfPreview(false);
            }
        }
    }, [hfConfig, hfStructure.splits, prefetchColumns, setAvailableColumns, setHfConfig, setHfPreviewData, setHfTotalRows]);

    const handleSplitChange = useCallback(async (newSplit: string) => {
        const updatedConfig = { ...hfConfig, split: newSplit };
        setHfConfig(updatedConfig);

        if (hfConfig.dataset && hfConfig.config) {
            setIsLoadingHfPreview(true);
            try {
                const [previewRows, datasetInfo] = await Promise.all([
                    fetchHuggingFaceRows(updatedConfig, 0, 5),
                    getDatasetInfo(hfConfig.dataset, hfConfig.config, newSplit)
                ]);
                setHfPreviewData(previewRows);
                setHfTotalRows(datasetInfo.totalRows);
                prefetchColumns(updatedConfig);
            } catch (e) {
                console.error('Failed to refresh HF preview on split change:', e);
            } finally {
                setIsLoadingHfPreview(false);
            }
        }
    }, [hfConfig, prefetchColumns, setHfConfig, setHfPreviewData, setHfTotalRows]);

    const handleDataSourceModeChange = useCallback((mode: DataSource) => {
        setDataSourceMode(mode);
        setAvailableColumns([]);
        setDetectedColumns({ input: [], output: [], all: [], reasoning: [] });
        setHfConfig(prev => ({ ...prev, inputColumns: [], outputColumns: [], reasoningColumns: [] }));
    }, [setAvailableColumns, setDataSourceMode, setDetectedColumns, setHfConfig]);

    return {
        hfSearchResults,
        isSearchingHF,
        hfStructure,
        showHFResults,
        setShowHFResults,
        isPrefetching,
        isLoadingHfPreview,
        prefetchColumns,
        handleHFSearch,
        handleSelectHFDataset,
        handleConfigChange,
        handleSplitChange,
        handleDataSourceModeChange
    };
}

export default useHuggingFace;
