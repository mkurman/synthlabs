import { useState, useRef, useCallback } from 'react';
import { 
    HuggingFaceConfig, 
    DetectedColumns, 
    DEFAULT_HF_PREFETCH_CONFIG,
    DataSource
} from '../types';
import { 
    fetchHuggingFaceRows, 
    searchDatasets, 
    getDatasetStructure, 
    getDatasetInfo 
} from '../services/huggingFaceService';
import { HFPrefetchManager, PrefetchState } from '../services/hfPrefetchService';

// Column detection helper
function detectColumns(columns: string[]): DetectedColumns {
    const inputKeywords = ['input', 'prompt', 'question', 'query', 'instruction', 'text', 'content', 'message'];
    const outputKeywords = ['output', 'response', 'answer', 'completion', 'result', 'target', 'label'];
    const reasoningKeywords = ['reasoning', 'think', 'thought', 'explanation', 'rationale', 'logic', 'chain'];

    const detected: DetectedColumns = { input: [], output: [], all: columns, reasoning: [] };

    columns.forEach(col => {
        const lowerCol = col.toLowerCase();
        if (inputKeywords.some(kw => lowerCol.includes(kw))) detected.input.push(col);
        if (outputKeywords.some(kw => lowerCol.includes(kw))) detected.output.push(col);
        if (reasoningKeywords.some(kw => lowerCol.includes(kw))) detected.reasoning.push(col);
    });

    return detected;
}

export interface UseHuggingFaceDataReturn {
    // State
    hfConfig: HuggingFaceConfig;
    hfStructure: { configs: string[]; splits: Record<string, string[]> };
    hfSearchResults: string[];
    isSearchingHF: boolean;
    showHFResults: boolean;
    availableColumns: string[];
    detectedColumns: DetectedColumns;
    isPrefetching: boolean;
    hfPreviewData: any[];
    hfTotalRows: number;
    isLoadingHfPreview: boolean;
    prefetchManagerRef: React.MutableRefObject<HFPrefetchManager | null>;
    prefetchState: PrefetchState | null;
    
    // Actions
    setHfConfig: React.Dispatch<React.SetStateAction<HuggingFaceConfig>>;
    setHfStructure: React.Dispatch<React.SetStateAction<{ configs: string[]; splits: Record<string, string[]> }>>;
    setHfSearchResults: React.Dispatch<React.SetStateAction<string[]>>;
    setIsSearchingHF: React.Dispatch<React.SetStateAction<boolean>>;
    setShowHFResults: React.Dispatch<React.SetStateAction<boolean>>;
    setAvailableColumns: React.Dispatch<React.SetStateAction<string[]>>;
    setDetectedColumns: React.Dispatch<React.SetStateAction<DetectedColumns>>;
    setIsPrefetching: React.Dispatch<React.SetStateAction<boolean>>;
    setHfPreviewData: React.Dispatch<React.SetStateAction<any[]>>;
    setHfTotalRows: React.Dispatch<React.SetStateAction<number>>;
    setIsLoadingHfPreview: React.Dispatch<React.SetStateAction<boolean>>;
    setPrefetchState: React.Dispatch<React.SetStateAction<PrefetchState | null>>;
    
    // Handlers
    prefetchColumns: (overrideConfig?: HuggingFaceConfig) => Promise<void>;
    handleHFSearch: (query: string) => void;
    handleSelectHFDataset: (datasetId: string) => Promise<void>;
    handleConfigChange: (newConfig: string) => Promise<void>;
    handleSplitChange: (newSplit: string) => Promise<void>;
    handleDataSourceModeChange: (mode: DataSource, setDataSourceMode: (mode: DataSource) => void, clearColumns: () => void) => void;
}

export function useHuggingFaceData(
    setError: (error: string | null) => void
): UseHuggingFaceDataReturn {
    // State
    const [hfConfig, setHfConfig] = useState<HuggingFaceConfig>({
        dataset: 'fka/awesome-chatgpt-prompts',
        config: 'default',
        split: 'train',
        columnName: '',
        inputColumns: [],
        outputColumns: [],
        messageTurnIndex: 0,
        prefetchConfig: { ...DEFAULT_HF_PREFETCH_CONFIG }
    });

    const [hfStructure, setHfStructure] = useState<{ configs: string[]; splits: Record<string, string[]> }>({ 
        configs: [], 
        splits: {} 
    });
    const [hfSearchResults, setHfSearchResults] = useState<string[]>([]);
    const [isSearchingHF, setIsSearchingHF] = useState(false);
    const [showHFResults, setShowHFResults] = useState(false);
    const searchTimeoutRef = useRef<number | null>(null);

    const [availableColumns, setAvailableColumns] = useState<string[]>([]);
    const [detectedColumns, setDetectedColumns] = useState<DetectedColumns>({ 
        input: [], 
        output: [], 
        all: [], 
        reasoning: [] 
    });
    const [isPrefetching, setIsPrefetching] = useState(false);

    const [hfPreviewData, setHfPreviewData] = useState<any[]>([]);
    const [hfTotalRows, setHfTotalRows] = useState<number>(0);
    const [isLoadingHfPreview, setIsLoadingHfPreview] = useState(false);

    const prefetchManagerRef = useRef<HFPrefetchManager | null>(null);
    const [prefetchState, setPrefetchState] = useState<PrefetchState | null>(null);

    // Prefetch columns from dataset
    const prefetchColumns = useCallback(async (overrideConfig?: HuggingFaceConfig) => {
        const configToUse = overrideConfig || hfConfig;
        if (!configToUse.dataset) {
            setError("Please enter a Dataset ID first.");
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

                    // Detect and auto-populate columns
                    const detected = detectColumns(cols);
                    setDetectedColumns(detected);

                    // Auto-select detected columns if none are already selected
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
                    setError("Row is not an object, cannot detect columns.");
                }
            } else {
                setError("No rows returned from dataset.");
            }
        } catch (e: any) {
            console.error(e);
            setError("Failed to fetch row: " + (e.message || "Unknown error"));
        } finally {
            setIsPrefetching(false);
        }
    }, [hfConfig, setError]);

    // Search for datasets
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
    }, []);

    // Select a dataset
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

            // Fetch preview data and row count
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
    }, [hfConfig, prefetchColumns]);

    // Handle config change
    const handleConfigChange = useCallback(async (newConfig: string) => {
        const splits = hfStructure.splits[newConfig] || [];
        const newSplit = splits.includes('train') ? 'train' : (splits[0] || '');
        const updatedConfig = { ...hfConfig, config: newConfig, split: newSplit };
        setHfConfig(updatedConfig);
        setAvailableColumns([]);

        // Refresh preview data and columns for the new config/split
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
    }, [hfConfig, hfStructure, prefetchColumns]);

    // Handle split change
    const handleSplitChange = useCallback(async (newSplit: string) => {
        const updatedConfig = { ...hfConfig, split: newSplit };
        setHfConfig(updatedConfig);

        // Refresh preview data and columns for the new split
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
    }, [hfConfig, prefetchColumns]);

    // Handle data source mode change
    const handleDataSourceModeChange = useCallback((
        mode: DataSource, 
        setDataSourceMode: (mode: DataSource) => void,
        clearColumns: () => void
    ) => {
        setDataSourceMode(mode);
        clearColumns();
        setHfConfig(prev => ({ ...prev, inputColumns: [], outputColumns: [], reasoningColumns: [] }));
    }, []);

    return {
        // State
        hfConfig,
        hfStructure,
        hfSearchResults,
        isSearchingHF,
        showHFResults,
        availableColumns,
        detectedColumns,
        isPrefetching,
        hfPreviewData,
        hfTotalRows,
        isLoadingHfPreview,
        prefetchManagerRef,
        prefetchState,
        
        // Actions
        setHfConfig,
        setHfStructure,
        setHfSearchResults,
        setIsSearchingHF,
        setShowHFResults,
        setAvailableColumns,
        setDetectedColumns,
        setIsPrefetching,
        setHfPreviewData,
        setHfTotalRows,
        setIsLoadingHfPreview,
        setPrefetchState,
        
        // Handlers
        prefetchColumns,
        handleHFSearch,
        handleSelectHFDataset,
        handleConfigChange,
        handleSplitChange,
        handleDataSourceModeChange
    };
}
