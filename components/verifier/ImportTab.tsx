import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
    FileJson, AlertTriangle, RefreshCcw, GitBranch, Search, Plus
} from 'lucide-react';
import * as FirebaseService from '../../services/firebaseService';
import type { DetectedColumns, HuggingFaceConfig } from '../../types';
import DatabaseImportCard from './DatabaseImportCard';
import HuggingFaceImportCard from './HuggingFaceImportCard';
import { SessionData } from '../../interfaces';

interface ImportTabProps {
    fileInputRef: RefObject<HTMLInputElement | null>;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    selectedSessionFilter: string;
    setSelectedSessionFilter: (value: string) => void;
    availableSessions: SessionData[];
    customSessionId: string;
    setCustomSessionId: (value: string) => void;
    isLimitEnabled: boolean;
    setIsLimitEnabled: (value: boolean) => void;
    importLimit: number;
    setImportLimit: (value: number) => void;
    handleDbImport: () => void;
    isImporting: boolean;
    hfConfig: HuggingFaceConfig;
    setHfConfig: Dispatch<SetStateAction<HuggingFaceConfig>>;
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
    hfRowsToFetch: number;
    setHfRowsToFetch: (value: number) => void;
    hfSkipRows: number;
    setHfSkipRows: (value: number) => void;
    onHfImport: () => void;
    hfImportError: string | null;
    isCheckingOrphans: boolean;
    orphanedLogsInfo: FirebaseService.OrphanedLogsInfo | null;
    orphanScanProgress: FirebaseService.OrphanScanProgress | null;
    handleCheckOrphans: () => void;
    handleSyncOrphanedLogs: () => void;
    isSyncing: boolean;
    orphanSyncProgress: FirebaseService.OrphanSyncProgress | null;
}

export default function ImportTab({
    fileInputRef,
    handleFileUpload,
    selectedSessionFilter,
    setSelectedSessionFilter,
    availableSessions,
    customSessionId,
    setCustomSessionId,
    isLimitEnabled,
    setIsLimitEnabled,
    importLimit,
    setImportLimit,
    handleDbImport,
    isImporting,
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
    hfRowsToFetch,
    setHfRowsToFetch,
    hfSkipRows,
    setHfSkipRows,
    onHfImport,
    hfImportError,
    isCheckingOrphans,
    orphanedLogsInfo,
    orphanScanProgress,
    handleCheckOrphans,
    handleSyncOrphanedLogs,
    isSyncing,
    orphanSyncProgress
}: ImportTabProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-2">Import Data for Verification</h2>
                <p className="text-slate-300 max-w-md mx-auto">Load raw synthetic logs from local JSON/JSONL files, fetch directly from the generated database, or import HuggingFace datasets.</p>
            </div>

            <div className="w-full max-w-7xl mt-4 space-y-6">
                <div className="flex flex-col items-center gap-3">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="group inline-flex items-center gap-3 px-6 py-3 rounded-xl border-2 border-dashed border-slate-700/70 hover:border-sky-500 hover:bg-slate-900/60 transition-all cursor-pointer relative overflow-hidden"
                    >
                        <div className="w-10 h-10 rounded-full bg-slate-900/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <FileJson className="w-5 h-5 text-sky-400" />
                        </div>
                        <div className="text-left">
                            <div className="text-white font-bold text-sm">Load from file</div>
                            <div className="text-[10px] text-slate-400">.json or .jsonl arrays</div>
                        </div>
                        <div className="text-[10px] text-sky-400 font-medium bg-sky-900/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Multi-select Supported
                        </div>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".json,.jsonl" multiple />
                    </button>
                </div>

                <div className="flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.3em] text-slate-500">
                    <div className="h-px w-16 bg-slate-800/70" />
                    <span>- or -</span>
                    <div className="h-px w-16 bg-slate-800/70" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <DatabaseImportCard
                        selectedSessionFilter={selectedSessionFilter}
                        setSelectedSessionFilter={setSelectedSessionFilter}
                        availableSessions={availableSessions}
                        customSessionId={customSessionId}
                        setCustomSessionId={setCustomSessionId}
                        isLimitEnabled={isLimitEnabled}
                        setIsLimitEnabled={setIsLimitEnabled}
                        importLimit={importLimit}
                        setImportLimit={setImportLimit}
                        handleDbImport={handleDbImport}
                        isImporting={isImporting}
                    />

                    <HuggingFaceImportCard
                        hfConfig={hfConfig}
                        setHfConfig={setHfConfig}
                        hfStructure={hfStructure}
                        hfSearchResults={hfSearchResults}
                        isSearchingHF={isSearchingHF}
                        showHFResults={showHFResults}
                        setShowHFResults={setShowHFResults}
                        onHFSearch={onHFSearch}
                        onSelectHFDataset={onSelectHFDataset}
                        onConfigChange={onConfigChange}
                        onSplitChange={onSplitChange}
                        prefetchColumns={prefetchColumns}
                        isPrefetching={isPrefetching}
                        availableColumns={availableColumns}
                        detectedColumns={detectedColumns}
                        hfTotalRows={hfTotalRows}
                        hfPreviewData={hfPreviewData}
                        isLoadingHfPreview={isLoadingHfPreview}
                        rowsToFetch={hfRowsToFetch}
                        onRowsToFetchChange={setHfRowsToFetch}
                        skipRows={hfSkipRows}
                        onSkipRowsChange={setHfSkipRows}
                        isImporting={isImporting}
                        onImport={onHfImport}
                        importError={hfImportError}
                    />
                </div>
            </div>

            {/* Orphaned Logs Section - Manual check button or results */}
            <div className="mt-8 text-center">
                {!isCheckingOrphans && !orphanedLogsInfo?.hasOrphanedLogs && !isSyncing && (
                    <div className="animate-in fade-in">
                        <p className="text-xs text-slate-400 mb-3">Check if there are any logs without matching sessions.</p>
                        <div className="flex items-center justify-center gap-2">
                            <button
                                onClick={handleCheckOrphans}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/70 text-slate-200 text-xs font-medium transition-all border border-slate-700/70"
                            >
                                <Search className="w-3.5 h-3.5" />
                                Check for Orphaned Logs
                            </button>
                        </div>
                    </div>
                )}
                {!isCheckingOrphans && !orphanedLogsInfo?.hasOrphanedLogs && isSyncing && (
                    <div className="animate-in fade-in">
                        <div className="max-w-md mx-auto bg-slate-900/60 border border-slate-700/70 rounded-xl p-4">
                            <div className="flex items-center justify-center gap-3">
                                <RefreshCcw className="w-5 h-5 text-slate-300 animate-spin" />
                                <span className="text-xs text-slate-300">Syncing orphaned logs in background…</span>
                            </div>
                            {orphanSyncProgress && (
                                <div className="mt-3 text-[10px] text-slate-400">
                                    <div>Scanned {orphanSyncProgress.scannedCount?.toLocaleString?.() || 0} logs</div>
                                    <div>Orphaned sessions: {orphanSyncProgress.orphanedSessions?.toLocaleString?.() || 0}</div>
                                    <div>Updated logs: {orphanSyncProgress.updatedLogs?.toLocaleString?.() || 0}</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {isCheckingOrphans && (
                    <div className="animate-in fade-in">
                        <div className="max-w-md mx-auto bg-slate-900/60 border border-slate-700/70 rounded-xl p-4">
                            <div className="flex items-center justify-center gap-3">
                                <RefreshCcw className="w-5 h-5 text-slate-300 animate-spin" />
                                <span className="text-xs text-slate-300">Checking for orphaned logs...</span>
                            </div>
                            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
                                <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-sky-400/40 via-sky-400 to-sky-400/40" />
                            </div>
                            {orphanScanProgress && (
                                <div className="mt-3 text-[10px] text-slate-400">
                                    <div>Scanned {orphanScanProgress.scannedCount.toLocaleString()} logs</div>
                                    <div>Orphaned sessions: {orphanScanProgress.orphanedSessionCount.toLocaleString()}</div>
                                    <div>Orphaned logs: {orphanScanProgress.totalOrphanedLogs.toLocaleString()}</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {!isCheckingOrphans && orphanedLogsInfo?.hasOrphanedLogs && (
                    <div className="animate-in fade-in slide-in-from-bottom-2">
                        <div className="max-w-md mx-auto bg-amber-900/20 border border-amber-600/40 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-600/20 flex items-center justify-center flex-shrink-0">
                                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                                </div>
                                <div className="flex-1 text-left">
                                    <h4 className="text-amber-300 font-bold text-sm mb-1">Unsynced Logs Detected</h4>
                                    <p className="text-xs text-amber-200/70 mb-3">
                                        Found <span className="font-bold text-amber-300">{orphanedLogsInfo.totalOrphanedLogs} logs</span> across{' '}
                                        <span className="font-bold text-amber-300">{orphanedLogsInfo.orphanedSessionCount} sessions</span> without matching session records.
                                        {orphanedLogsInfo.isPartialScan && (
                                            <span className="block mt-2 text-[10px] text-amber-200/60">
                                                Partial scan: scanned {orphanedLogsInfo.scannedCount?.toLocaleString() || 0} logs. Results may be incomplete.
                                            </span>
                                        )}
                                    </p>
                                    <button
                                        onClick={handleSyncOrphanedLogs}
                                        disabled={isSyncing}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                                    >
                                        {isSyncing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                                        Sync Now
                                    </button>
                                    {isSyncing && orphanSyncProgress && (
                                        <div className="mt-3 text-[10px] text-amber-200/70 space-y-1">
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-900/40">
                                                <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-amber-400/40 via-amber-400 to-amber-400/40" />
                                            </div>
                                            <div>
                                                {orphanSyncProgress.phase === 'scan' ? 'Scanning logs' : 'Reassigning logs'} • Scanned {(orphanSyncProgress.scannedCount ?? 0).toLocaleString()}
                                            </div>
                                            <div>Orphaned sessions: {(orphanSyncProgress.orphanedSessions ?? 0).toLocaleString()}</div>
                                            {orphanSyncProgress.phase === 'reassign' && (
                                                <div>Updated logs: {(orphanSyncProgress.updatedLogs ?? 0).toLocaleString()}</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
