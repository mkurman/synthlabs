import React, { useMemo, useState } from 'react';
import {
    ChevronDown,
    ChevronRight,
    Info,
    Layers,
    List,
    MessageSquare,
    RefreshCcw,
    Search,
    Server,
    Table
} from 'lucide-react';

import { OutputFieldName } from '../../interfaces/enums/OutputFieldName';
import type { DetectedColumns, HuggingFaceConfig } from '../../types';
import ColumnSelector from '../ColumnSelector';
import DataPreviewTable from '../DataPreviewTable';

interface HuggingFaceImportCardProps {
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
    hfTotalRows: number;
    hfPreviewData: unknown[];
    isLoadingHfPreview: boolean;
    rowsToFetch: number;
    onRowsToFetchChange: (value: number) => void;
    skipRows: number;
    onSkipRowsChange: (value: number) => void;
    isImporting: boolean;
    onImport: () => void;
    importError: string | null;
}

function getPreviewData(rawRows: unknown[]): Record<string, string> {
    const first = rawRows[0];
    if (!first || typeof first !== 'object' || Array.isArray(first)) return {};
    const record = first as Record<string, unknown>;
    return Object.keys(record).reduce((acc, key) => {
        const value = record[key];
        acc[key] = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
        return acc;
    }, {} as Record<string, string>);
}

export default function HuggingFaceImportCard({
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
    hfTotalRows,
    hfPreviewData,
    isLoadingHfPreview,
    rowsToFetch,
    onRowsToFetchChange,
    skipRows,
    onSkipRowsChange,
    isImporting,
    onImport,
    importError
}: HuggingFaceImportCardProps): JSX.Element {
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const previewData = useMemo(() => getPreviewData(hfPreviewData), [hfPreviewData]);

    return (
        <div className="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-slate-700/70 hover:border-sky-500 hover:bg-slate-900/60 transition-all relative">
            <div className="w-16 h-16 rounded-full bg-slate-900/60 flex items-center justify-center mb-2">
                <Server className="w-8 h-8 text-sky-400" />
            </div>
            <div className="text-center w-full space-y-3">
                <h3 className="text-white font-bold">HuggingFace</h3>
                <div className="space-y-3 text-left">
                    <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded text-[10px] text-sky-200">
                        Search public datasets and auto-detect configs, splits, and columns.
                    </div>
                    <div className="space-y-1 relative" onBlur={() => setTimeout(() => setShowHFResults(false), 200)}>
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Dataset ID</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={hfConfig.dataset || ''}
                                onChange={e => onHFSearch(e.target.value)}
                                onFocus={() => hfSearchResults.length > 0 && setShowHFResults(true)}
                                className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none pr-8"
                                placeholder="Search e.g. fka/awesome-chatgpt-prompts"
                            />
                            <div className="absolute right-2 top-1.5 text-slate-400 pointer-events-none">
                                {isSearchingHF ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                            </div>
                        </div>
                        {showHFResults && hfSearchResults.length > 0 && (
                            <div className="absolute z-10 w-full bg-slate-950/70 border border-slate-700/70 rounded-lg shadow-xl max-h-48 overflow-y-auto mt-1">
                                {hfSearchResults.map(result => (
                                    <button
                                        key={result}
                                        onClick={() => onSelectHFDataset(result)}
                                        className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/60 hover:text-white transition-colors border-b border-slate-800/70 last:border-0"
                                    >
                                        {result}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <div className="space-y-1 flex-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Config</label>
                            {hfStructure.configs.length > 0 ? (
                                <select
                                    value={hfConfig.config || ''}
                                    onChange={e => onConfigChange(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none appearance-none"
                                >
                                    {hfStructure.configs.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={hfConfig.config || ''}
                                    onChange={e => setHfConfig(prev => ({ ...prev, config: e.target.value }))}
                                    className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                                />
                            )}
                        </div>
                        <div className="space-y-1 flex-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Split</label>
                            {hfStructure.splits[hfConfig.config]?.length > 0 ? (
                                <select
                                    value={hfConfig.split || ''}
                                    onChange={e => onSplitChange(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none appearance-none"
                                >
                                    {hfStructure.splits[hfConfig.config].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={hfConfig.split || ''}
                                    onChange={e => onSplitChange(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                                />
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="space-y-1 flex-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Rows to Fetch</label>
                            <input
                                type="number"
                                value={rowsToFetch}
                                onChange={e => onRowsToFetchChange(Number(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                            />
                        </div>
                        <div className="space-y-1 flex-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase">Skip Rows</label>
                            <input
                                type="number"
                                value={skipRows}
                                onChange={e => onSkipRowsChange(Number(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="bg-slate-950/70 rounded-lg border border-slate-800/70 overflow-hidden">
                        <button
                            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                            className="w-full flex items-center justify-between p-3 hover:bg-slate-900/60 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Layers className="w-3.5 h-3.5 text-sky-400" />
                                <span className="text-xs font-bold text-slate-200">Column Mapping</span>
                                {!isAdvancedOpen && (
                                    <span className="text-[10px] text-slate-400 ml-2">
                                        {availableColumns.length > 0 ? `${availableColumns.length} columns detected` : 'Scan to detect columns'}
                                    </span>
                                )}
                            </div>
                            {isAdvancedOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                            )}
                        </button>

                        {isAdvancedOpen && (
                            <div className="p-3 pt-0 space-y-3 border-t border-slate-800/70 mt-1">
                                <div className="flex items-center justify-between pt-3">
                                    <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                        <Table className="w-3 h-3" /> Column Mapping
                                    </label>
                                    <button
                                        onClick={() => prefetchColumns()}
                                        disabled={isPrefetching}
                                        className="text-[9px] text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                                    >
                                        {isPrefetching ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                                        Scan Columns
                                    </button>
                                </div>
                                <div className="bg-sky-500/10 border border-sky-500/20 p-2 rounded text-[10px] text-sky-200 mb-2 flex gap-2 items-start">
                                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="font-bold">Column Mapping Guide:</span>
                                        <ul className="list-disc ml-4 mt-1 space-y-0.5 text-sky-200/80">
                                            <li><b>Input Column:</b> Maps to <code className="bg-black/30 px-1 rounded mx-0.5">{OutputFieldName.Query}</code>.</li>
                                            <li><b>Ground Truth:</b> Maps to <code className="bg-black/30 px-1 rounded mx-0.5">{OutputFieldName.Answer}</code>.</li>
                                            <li><b>Reasoning:</b> Optional column with pre-existing reasoning.</li>
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
                                        previewData={previewData}
                                    />
                                    <ColumnSelector
                                        label="Reasoning Columns (optional)"
                                        columns={availableColumns}
                                        selected={hfConfig.reasoningColumns || []}
                                        onSelect={(cols) => setHfConfig(prev => ({ ...prev, reasoningColumns: cols }))}
                                        autoDetected={detectedColumns.reasoning}
                                        placeholder="Select reasoning column(s)"
                                        previewData={previewData}
                                    />
                                    <div className="col-span-2">
                                        <ColumnSelector
                                            label={`Ground Truth (Maps to '${OutputFieldName.Answer}')`}
                                            columns={availableColumns}
                                            selected={hfConfig.outputColumns || []}
                                            onSelect={(cols) => setHfConfig(prev => ({ ...prev, outputColumns: cols }))}
                                            autoDetected={detectedColumns.output}
                                            placeholder="Select output column(s)"
                                            previewData={previewData}
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
                                <div className="flex gap-2">
                                    <div className="space-y-1 flex-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                            <MessageSquare className="w-3 h-3" /> Turn Index
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={hfConfig.messageTurnIndex || 0}
                                            onChange={e => setHfConfig({ ...hfConfig, messageTurnIndex: Math.max(0, parseInt(e.target.value) || 0) })}
                                            className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {hfConfig.dataset && (
                        <div className="space-y-2">
                            {hfTotalRows > 0 && (
                                <div className="flex items-center gap-2 text-[10px]">
                                    <span className="text-slate-400">Total rows:</span>
                                    <span className="bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded font-mono">
                                        {hfTotalRows.toLocaleString()}
                                    </span>
                                </div>
                            )}
                            {isLoadingHfPreview ? (
                                <div className="flex items-center justify-center py-4 text-slate-400 text-xs">
                                    <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> Loading preview...
                                </div>
                            ) : hfPreviewData.length > 0 ? (
                                <DataPreviewTable rawText={JSON.stringify(hfPreviewData)} />
                            ) : null}
                        </div>
                    )}

                    {importError && (
                        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
                            {importError}
                        </div>
                    )}

                    <button
                        onClick={onImport}
                        disabled={isImporting}
                        className="w-full mt-2 bg-sky-600 hover:bg-sky-500 text-white py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                        {isImporting ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                        Import Dataset
                    </button>
                </div>
            </div>
        </div>
    );
}
