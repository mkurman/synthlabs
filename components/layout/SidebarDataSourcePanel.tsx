import { DetectedColumns, HuggingFaceConfig } from '../../types';
import { DataSource } from '../../interfaces/enums';
import DataSourcePanel from '../panels/DataSourcePanel';

interface SidebarDataSourcePanelProps {
    dataSourceMode: DataSource;
    onDataSourceModeChange: (mode: DataSource) => void;
    topicCategory: string;
    onTopicCategoryChange: (category: string) => void;
    isGeneratingTopic: boolean;
    onGenerateRandomTopic: () => void;
    geminiTopic: string;
    onGeminiTopicChange: (topic: string) => void;
    rowsToFetch: number;
    onRowsToFetchChange: (value: number) => void;
    skipRows: number;
    onSkipRowsChange: (value: number) => void;
    hfConfig: HuggingFaceConfig;
    setHfConfig: React.Dispatch<React.SetStateAction<HuggingFaceConfig>>;
    hfStructure: { configs: string[]; splits: Record<string, string[]> };
    hfSearchResults: string[];
    isSearchingHF: boolean;
    showHFResults: boolean;
    setShowHFResults: (show: boolean) => void;
    onHFSearch: (value: string) => void;
    onSelectHFDataset: (dataset: string) => void;
    onConfigChange: (config: string) => void;
    onSplitChange: (split: string) => void;
    prefetchColumns: () => void;
    isPrefetching: boolean;
    availableColumns: string[];
    detectedColumns: DetectedColumns;
    concurrency: number;
    hfTotalRows: number;
    hfPreviewData: any[];
    isLoadingHfPreview: boolean;
    onClearHfPreview: () => void;
    converterInputText: string;
    onConverterInputChange: (value: string) => void;
    sourceFileInputRef: React.RefObject<HTMLInputElement | null>;
    onLoadSourceFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function SidebarDataSourcePanel(props: SidebarDataSourcePanelProps) {
    return <DataSourcePanel {...props} />;
}
