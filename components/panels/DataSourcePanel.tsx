import React from 'react';
import { BrainCircuit, ChevronDown, ChevronRight, Dice5, FileText, Info, Layers, List, MessageSquare, RefreshCcw, Search, Server, Table, Upload } from 'lucide-react';
import { CATEGORIES, DetectedColumns, HuggingFaceConfig } from '../../types';
import { DataSource, OutputFieldName } from '../../interfaces/enums';
import { DEFAULT_HF_PREFETCH_CONFIG } from '../../types';
import ColumnSelector from '../ColumnSelector';
import DataPreviewTable from '../DataPreviewTable';

interface DataSourcePanelProps {
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

export default function DataSourcePanel({
    dataSourceMode,
    onDataSourceModeChange,
    topicCategory,
    onTopicCategoryChange,
    isGeneratingTopic,
    onGenerateRandomTopic,
    geminiTopic,
    onGeminiTopicChange,
    rowsToFetch,
    onRowsToFetchChange,
    skipRows,
    onSkipRowsChange,
    hfConfig,
    setHfConfig,
    hfStructure,
    hfSearchResults,
    isSearchingHF,
    showHFResults,
    setShowHFResults,
    onHFSearch,
    onSelectHFDataset,
    onConfigChange,
    onSplitChange,
    prefetchColumns,
    isPrefetching,
    availableColumns,
    detectedColumns,
    concurrency,
    hfTotalRows,
    hfPreviewData,
    isLoadingHfPreview,
    onClearHfPreview,
    converterInputText,
    onConverterInputChange,
    sourceFileInputRef,
    onLoadSourceFile
}: DataSourcePanelProps) {
    const [isHfAdvancedOpen, setIsHfAdvancedOpen] = React.useState(false);
    const [isManualAdvancedOpen, setIsManualAdvancedOpen] = React.useState(false);

    return (
        <div className="space-y-4">
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800/70">
                <button onClick={() => onDataSourceModeChange(DataSource.Synthetic)} className={`flex-1 py-2 text-[10px] font-bold rounded flex flex-col items-center justify-center gap-1 transition-all uppercase tracking-wide ${dataSourceMode === DataSource.Synthetic ? 'bg-slate-500/80 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}><BrainCircuit className="w-3.5 h-3.5" /> Synthetic</button>
                <button onClick={() => onDataSourceModeChange(DataSource.HuggingFace)} className={`flex-1 py-2 text-[10px] font-bold rounded flex flex-col items-center justify-center gap-1 transition-all uppercase tracking-wide ${dataSourceMode === DataSource.HuggingFace ? 'bg-slate-500/80 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}><Server className="w-3.5 h-3.5" /> HuggingFace</button>
                <button onClick={() => onDataSourceModeChange(DataSource.Manual)} className={`flex-1 py-2 text-[10px] font-bold rounded flex flex-col items-center justify-center gap-1 transition-all uppercase tracking-wide ${dataSourceMode === DataSource.Manual ? 'bg-slate-500/80 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}><FileText className="w-3.5 h-3.5" /> Manual</button>
            </div>

            {dataSourceMode === DataSource.Synthetic && (
                <div className="space-y-3 animate-in fade-in">
                    <div className="flex gap-2">
                        <select value={topicCategory} onChange={e => onTopicCategoryChange(e.target.value)} className="bg-slate-950 border border-slate-700/70 text-[10px] text-slate-200 rounded px-2 py-1 flex-1 outline-none">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                        <button onClick={onGenerateRandomTopic} disabled={isGeneratingTopic} className="bg-slate-900/60 hover:bg-slate-800/70 border border-slate-700/70 rounded p-1.5 text-slate-200 transition-colors disabled:opacity-50"><Dice5 className={`w-3.5 h-3.5 ${isGeneratingTopic ? 'animate-spin' : ''}`} /></button>
                    </div>
                    <textarea value={geminiTopic || ''} onChange={e => onGeminiTopicChange(e.target.value)} className="w-full h-20 bg-slate-950 border border-slate-700/70 rounded px-3 py-2 text-xs text-slate-100 focus:border-sky-500 outline-none resize-none" placeholder="Enter topic..." />
                    <div className="space-y-1"><label className="text-[10px] text-slate-400 font-bold uppercase">Items to Generate</label><input type="number" value={rowsToFetch} onChange={e => onRowsToFetchChange(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none" /></div>
                </div>
            )}
            {dataSourceMode === DataSource.HuggingFace && (
                <div className="space-y-3 animate-in fade-in relative">
                    <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded text-[10px] text-sky-200">Fetches rows from a public HF dataset.</div>
                    <div className="space-y-1 relative" onBlur={() => setTimeout(() => setShowHFResults(false), 200)}>
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Dataset ID</label>
                        <div className="relative"><input type="text" value={hfConfig.dataset || ''} onChange={e => onHFSearch(e.target.value)} onFocus={() => hfSearchResults.length > 0 && setShowHFResults(true)} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none pr-8" placeholder="Search e.g. fka/awesome-chatgpt-prompts" /><div className="absolute right-2 top-1.5 text-slate-400 pointer-events-none">{isSearchingHF ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}</div></div>
                        {showHFResults && hfSearchResults.length > 0 && (<div className="absolute z-10 w-full bg-slate-950/70 border border-slate-700/70 rounded-lg shadow-xl max-h-48 overflow-y-auto mt-1">{hfSearchResults.map(result => (<button key={result} onClick={() => onSelectHFDataset(result)} className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/60 hover:text-white transition-colors border-b border-slate-800/70 last:border-0">{result}</button>))}</div>)}
                    </div>
                    <div className="flex gap-2">
                        <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-400 font-bold uppercase">Config</label>{hfStructure.configs.length > 0 ? (<select value={hfConfig.config || ''} onChange={e => onConfigChange(e.target.value)} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none appearance-none">{hfStructure.configs.map(c => <option key={c} value={c}>{c}</option>)}</select>) : (<input type="text" value={hfConfig.config || ''} onChange={e => setHfConfig({ ...hfConfig, config: e.target.value })} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none" />)}</div>
                        <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-400 font-bold uppercase">Split</label>{hfStructure.splits[hfConfig.config]?.length > 0 ? (<select value={hfConfig.split || ''} onChange={e => onSplitChange(e.target.value)} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none appearance-none">{hfStructure.splits[hfConfig.config].map(s => <option key={s} value={s}>{s}</option>)}</select>) : (<input type="text" value={hfConfig.split || ''} onChange={e => onSplitChange(e.target.value)} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none" />)}</div>
                    </div>
                    <div className="flex gap-2">
                        <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-400 font-bold uppercase">Rows to Fetch</label><input type="number" value={rowsToFetch} onChange={e => onRowsToFetchChange(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none" /></div>
                        <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-400 font-bold uppercase">Skip Rows</label><input type="number" value={skipRows} onChange={e => onSkipRowsChange(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none" /></div>
                    </div>
                    <div className="bg-slate-950/70 rounded-lg border border-slate-800/70 overflow-hidden">
                        <button
                            onClick={() => setIsHfAdvancedOpen(!isHfAdvancedOpen)}
                            className="w-full flex items-center justify-between p-3 hover:bg-slate-900/60 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Layers className="w-3.5 h-3.5 text-sky-400" />
                                <span className="text-xs font-bold text-slate-200">Advanced Settings</span>
                                {!isHfAdvancedOpen && (
                                    <span className="text-[10px] text-slate-400 ml-2">
                                        Prefetch {hfConfig.prefetchConfig?.prefetchBatches ?? DEFAULT_HF_PREFETCH_CONFIG.prefetchBatches} × {concurrency}
                                    </span>
                                )}
                            </div>
                            {isHfAdvancedOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-300" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                        </button>

                        {isHfAdvancedOpen && (
                            <div className="p-3 pt-0 space-y-3 border-t border-slate-800/70 mt-1">
                                <div className="flex gap-2 pt-3">
                                    <div className="space-y-1 flex-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase" title="Number of batches to prefetch (batch size = concurrency). Higher = more memory, fewer API calls.">
                                            Prefetch Batches
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={hfConfig.prefetchConfig?.prefetchBatches ?? DEFAULT_HF_PREFETCH_CONFIG.prefetchBatches}
                                            onChange={e => setHfConfig(prev => ({
                                                ...prev,
                                                prefetchConfig: {
                                                    ...prev.prefetchConfig || DEFAULT_HF_PREFETCH_CONFIG,
                                                    prefetchBatches: Math.max(1, parseInt(e.target.value) || 10)
                                                }
                                            }))}
                                            className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1 flex-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase" title="Refetch threshold (0-100%). When buffer drops below this %, fetch more data.">
                                            Refetch Threshold %
                                        </label>
                                        <input
                                            type="number"
                                            min="10"
                                            max="90"
                                            value={Math.round((hfConfig.prefetchConfig?.prefetchThreshold ?? DEFAULT_HF_PREFETCH_CONFIG.prefetchThreshold) * 100)}
                                            onChange={e => setHfConfig(prev => ({
                                                ...prev,
                                                prefetchConfig: {
                                                    ...prev.prefetchConfig || DEFAULT_HF_PREFETCH_CONFIG,
                                                    prefetchThreshold: Math.min(0.9, Math.max(0.1, (parseInt(e.target.value) || 30) / 100))
                                                }
                                            }))}
                                            className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="text-[9px] text-slate-400 -mt-1">
                                    Prefetch: {(hfConfig.prefetchConfig?.prefetchBatches ?? DEFAULT_HF_PREFETCH_CONFIG.prefetchBatches) * concurrency} samples ({hfConfig.prefetchConfig?.prefetchBatches ?? DEFAULT_HF_PREFETCH_CONFIG.prefetchBatches} batches × {concurrency} workers). Refetch when buffer drops to {Math.round((hfConfig.prefetchConfig?.prefetchThreshold ?? DEFAULT_HF_PREFETCH_CONFIG.prefetchThreshold) * 100)}%.
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                            <Table className="w-3 h-3" /> Column Mapping
                                        </label>
                                        <button onClick={() => prefetchColumns()} disabled={isPrefetching} className="text-[9px] text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors disabled:opacity-50">
                                            {isPrefetching ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} Scan Columns
                                        </button>
                                    </div>
                                    <div className="bg-sky-500/10 border border-sky-500/20 p-2 rounded text-[10px] text-sky-200 mb-2 flex gap-2 items-start">
                                        <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold">Column Mapping Guide:</span>
                                            <ul className="list-disc ml-4 mt-1 space-y-0.5 text-sky-200/80">
                                                <li><b>Input Column:</b> Content maps to the <code className="bg-black/30 px-1 rounded mx-0.5">{OutputFieldName.Query}</code> field. This acts as the prompt for the reasoning engine.</li>
                                                <li><b>Ground Truth:</b> Content maps to the <code className="bg-black/30 px-1 rounded mx-0.5">{OutputFieldName.Answer}</code> field. Used for reference/verification.</li>
                                                <li><b>Reasoning Column (optional):</b> Explicitly map a column containing pre-existing reasoning.</li>
                                            </ul>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <ColumnSelector
                                            label={`Input Column (Maps to '${OutputFieldName.Query}')`}
                                            columns={availableColumns}
                                            selected={hfConfig.inputColumns || []}
                                            onSelect={(cols) => setHfConfig(prev => ({ ...prev, inputColumns: cols }))}
                                            autoDetected={detectedColumns.input}
                                            placeholder="Select input column(s)"
                                        />
                                        <ColumnSelector
                                            label="Reasoning Columns (optional)"
                                            columns={availableColumns}
                                            selected={hfConfig.reasoningColumns || []}
                                            onSelect={(cols) => setHfConfig(prev => ({ ...prev, reasoningColumns: cols }))}
                                            autoDetected={detectedColumns.reasoning}
                                            placeholder="Select reasoning column(s)"
                                        />
                                        <div className="col-span-2">
                                            <ColumnSelector
                                                label={`Ground Truth (Maps to '${OutputFieldName.Answer}')`}
                                                columns={availableColumns}
                                                selected={hfConfig.outputColumns || []}
                                                onSelect={(cols) => setHfConfig(prev => ({ ...prev, outputColumns: cols }))}
                                                autoDetected={detectedColumns.output}
                                                placeholder="Select output column(s)"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                            <List className="w-3 h-3" /> MCQ Options Column (optional)
                                        </label>
                                        <select
                                            value={hfConfig.mcqColumn || ''}
                                            onChange={(e) => setHfConfig(prev => ({ ...prev, mcqColumn: e.target.value || undefined }))}
                                            className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                                        >
                                            <option value="">None</option>
                                            {availableColumns.map(col => (
                                                <option key={col} value={col}>{col}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                            <List className="w-3 h-3" /> MCQ Options Column (optional)
                                        </label>
                                        <select
                                            value={hfConfig.mcqColumn || ''}
                                            onChange={(e) => setHfConfig(prev => ({ ...prev, mcqColumn: e.target.value || undefined }))}
                                            className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                                        >
                                            <option value="">None</option>
                                            {availableColumns.map(col => (
                                                <option key={col} value={col}>{col}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Turn Index</label><input type="number" min="0" value={hfConfig.messageTurnIndex || 0} onChange={e => setHfConfig({ ...hfConfig, messageTurnIndex: Math.max(0, parseInt(e.target.value) || 0) })} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none" placeholder="0" /></div>
                                    <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1"><Layers className="w-3 h-3" /> Max Traces</label><input type="number" min="0" value={hfConfig.maxMultiTurnTraces || ''} onChange={e => setHfConfig({ ...hfConfig, maxMultiTurnTraces: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0) })} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none" placeholder="All" /></div>
                                </div>
                            </div>
                        )}
                    </div>

                    {hfConfig.dataset && (
                        <div className="space-y-2 mt-3">
                            {hfTotalRows > 0 && (
                                <div className="flex items-center gap-2 text-[10px]">
                                    <span className="text-slate-400">Total rows in dataset:</span>
                                    <span className="bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded font-mono">
                                        {hfTotalRows.toLocaleString()}
                                    </span>
                                </div>
                            )}

                            {isLoadingHfPreview ? (
                                <div className="flex items-center justify-center py-4 text-slate-400 text-xs">
                                    <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> Loading preview...
                                </div>
                            ) : hfPreviewData.length > 0 && (
                                <DataPreviewTable
                                    rawText={JSON.stringify(hfPreviewData)}
                                    onClose={onClearHfPreview}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}
            {dataSourceMode === DataSource.Manual && (
                <div className="space-y-3 animate-in fade-in">
                    <div className="flex gap-2">
                        <button onClick={() => sourceFileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 bg-slate-900/60 hover:bg-slate-800/70 border border-slate-700/70 text-slate-200 text-xs py-2 rounded transition-colors">
                            <Upload className="w-3.5 h-3.5" /> Upload File
                        </button>
                        <input type="file" ref={sourceFileInputRef} onChange={onLoadSourceFile} className="hidden" accept=".json,.jsonl,.txt" />
                    </div>

                    <div className="flex gap-2">
                        <div className="space-y-1 flex-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Rows to Fetch</label>
                            <input type="number" value={rowsToFetch} onChange={e => onRowsToFetchChange(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none" />
                        </div>
                        <div className="space-y-1 flex-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Skip Rows</label>
                            <input type="number" value={skipRows} onChange={e => onSkipRowsChange(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none" />
                        </div>
                    </div>

                    {converterInputText.trim() ? (
                        <DataPreviewTable
                            rawText={converterInputText}
                            onClose={() => onConverterInputChange('')}
                        />
                    ) : (
                        <textarea
                            value={converterInputText}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onConverterInputChange(e.target.value)}
                            className="w-full h-32 bg-slate-950 border border-slate-700/70 rounded px-3 py-2 text-[10px] font-mono text-slate-300 focus:border-sky-500 outline-none resize-none"
                            placeholder="Paste text or JSON lines here..."
                        />
                    )}

                    {availableColumns.length > 0 && (
                        <div className="bg-slate-950/70 rounded-lg border border-slate-800/70 overflow-hidden">
                            <button
                                onClick={() => setIsManualAdvancedOpen(!isManualAdvancedOpen)}
                                className="w-full flex items-center justify-between p-3 hover:bg-slate-900/60 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Table className="w-3.5 h-3.5 text-sky-400" />
                                    <span className="text-xs font-bold text-slate-200">Advanced Column Mapping</span>
                                </div>
                                {isManualAdvancedOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-300" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                            </button>

                            {isManualAdvancedOpen && (
                                <div className="p-3 pt-0 space-y-2 border-t border-slate-800/70 mt-1">
                                    <div className="bg-sky-500/10 border border-sky-500/20 p-2 rounded text-[10px] text-sky-200 mb-2 flex gap-2 items-start">
                                        <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold">Column Mapping Guide:</span>
                                            <ul className="list-disc ml-4 mt-1 space-y-0.5 text-sky-200/80">
                                                <li><b>Input Column:</b> Content maps to the <code className="bg-black/30 px-1 rounded mx-0.5">{OutputFieldName.Query}</code> field.</li>
                                                <li><b>Ground Truth:</b> Content maps to the <code className="bg-black/30 px-1 rounded mx-0.5">{OutputFieldName.Answer}</code> field. Used for reference/verification.</li>
                                                <li><b>Reasoning Column (optional):</b> Explicitly map a column containing pre-existing reasoning.</li>
                                            </ul>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <ColumnSelector
                                            label={`Input Column (Maps to '${OutputFieldName.Query}')`}
                                            columns={availableColumns}
                                            selected={hfConfig.inputColumns || []}
                                            onSelect={(cols) => setHfConfig(prev => ({ ...prev, inputColumns: cols }))}
                                            autoDetected={detectedColumns.input}
                                            placeholder="Select input column(s)"
                                        />
                                        <ColumnSelector
                                            label="Reasoning Columns (optional)"
                                            columns={availableColumns}
                                            selected={hfConfig.reasoningColumns || []}
                                            onSelect={(cols) => setHfConfig(prev => ({ ...prev, reasoningColumns: cols }))}
                                            autoDetected={detectedColumns.reasoning}
                                            placeholder="Select reasoning column(s)"
                                        />
                                        <div className="col-span-2">
                                            <ColumnSelector
                                                label={`Ground Truth (Maps to '${OutputFieldName.Answer}')`}
                                                columns={availableColumns}
                                                selected={hfConfig.outputColumns || []}
                                                onSelect={(cols) => setHfConfig(prev => ({ ...prev, outputColumns: cols }))}
                                                autoDetected={detectedColumns.output}
                                                placeholder="Select output column(s)"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                            <List className="w-3 h-3" /> MCQ Options Column (optional)
                                        </label>
                                        <select
                                            value={hfConfig.mcqColumn || ''}
                                            onChange={(e) => setHfConfig(prev => ({ ...prev, mcqColumn: e.target.value || undefined }))}
                                            className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                                        >
                                            <option value="">None</option>
                                            {availableColumns.map(col => (
                                                <option key={col} value={col}>{col}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                            <List className="w-3 h-3" /> MCQ Options Column (optional)
                                        </label>
                                        <select
                                            value={hfConfig.mcqColumn || ''}
                                            onChange={(e) => setHfConfig(prev => ({ ...prev, mcqColumn: e.target.value || undefined }))}
                                            className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                                        >
                                            <option value="">None</option>
                                            {availableColumns.map(col => (
                                                <option key={col} value={col}>{col}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>{converterInputText.split('\n').filter((l: string) => l.trim()).length} lines detected</span>
                        {converterInputText.trim() && (
                            <button
                                onClick={() => onConverterInputChange('')}
                                className="text-slate-400 hover:text-red-400 transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
