import { RefObject } from 'react';
import {
    FileJson, Database, AlertTriangle, RefreshCcw, Download, GitBranch, Search, Plus
} from 'lucide-react';
import * as FirebaseService from '../../services/firebaseService';

interface ImportTabProps {
    fileInputRef: RefObject<HTMLInputElement | null>;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    selectedSessionFilter: string;
    setSelectedSessionFilter: (value: string) => void;
    availableSessions: FirebaseService.SavedSession[];
    customSessionId: string;
    setCustomSessionId: (value: string) => void;
    isLimitEnabled: boolean;
    setIsLimitEnabled: (value: boolean) => void;
    importLimit: number;
    setImportLimit: (value: number) => void;
    handleDbImport: () => void;
    isImporting: boolean;
    isCheckingOrphans: boolean;
    orphanedLogsInfo: FirebaseService.OrphanedLogsInfo | null;
    handleCheckOrphans: () => void;
    handleSyncOrphanedLogs: () => void;
    isSyncing: boolean;
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
    isCheckingOrphans,
    orphanedLogsInfo,
    handleCheckOrphans,
    handleSyncOrphanedLogs,
    isSyncing
}: ImportTabProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-2">Import Data for Verification</h2>
                <p className="text-slate-400 max-w-md mx-auto">Load raw synthetic logs from local JSON/JSONL files or fetch directly from the generated database.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl mt-4">
                <button onClick={() => fileInputRef.current?.click()} className="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-slate-700 hover:border-teal-500 hover:bg-slate-800/50 transition-all cursor-pointer relative overflow-hidden">
                    <div className="absolute inset-0 bg-teal-900/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform relative z-10">
                        <FileJson className="w-8 h-8 text-teal-400" />
                    </div>
                    <div className="text-center relative z-10">
                        <h3 className="text-white font-bold">Load Files</h3>
                        <p className="text-xs text-slate-500 mt-1">.json or .jsonl arrays</p>
                        <div className="mt-2 text-[10px] text-teal-400 font-medium bg-teal-900/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Multi-select Supported
                        </div>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".json,.jsonl" multiple />
                </button>

                <div className="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-slate-700 hover:border-pink-500 hover:bg-slate-800/50 transition-all relative">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-2">
                        <Database className="w-8 h-8 text-pink-400" />
                    </div>
                    <div className="text-center w-full space-y-3">
                        <h3 className="text-white font-bold">Fetch DB</h3>

                        {/* Session Selector */}
                        <div className="w-full text-left">
                            <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Source Session</label>
                            <select
                                value={selectedSessionFilter}
                                onChange={e => setSelectedSessionFilter(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-pink-500 outline-none mb-2"
                            >
                                <option value="all">All Sessions</option>
                                <option value="current">Current Session</option>
                                <option value="custom">Specific Session ID...</option>
                                {availableSessions.length > 0 && <optgroup label="💾 Saved Cloud Sessions">
                                    {availableSessions.map((s: FirebaseService.SavedSession) => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.logCount !== undefined ? `${s.logCount} items` : new Date(s.createdAt).toLocaleDateString()})</option>
                                    ))}
                                </optgroup>}
                            </select>

                            {selectedSessionFilter === 'custom' && (
                                <div className="animate-in fade-in slide-in-from-top-1">
                                    <input
                                        type="text"
                                        value={customSessionId}
                                        onChange={e => setCustomSessionId(e.target.value)}
                                        placeholder="Paste Session UID..."
                                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 focus:border-pink-500 outline-none"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Limit Controls */}
                        <div className="flex items-center justify-between gap-4 w-full bg-slate-900/50 p-2 rounded border border-slate-800">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={isLimitEnabled}
                                    onChange={e => setIsLimitEnabled(e.target.checked)}
                                    className="accent-pink-500"
                                    id="limitToggle"
                                />
                                <label htmlFor="limitToggle" className="text-xs text-slate-300 cursor-pointer">Limit Rows</label>
                            </div>

                            <input
                                type="number"
                                value={importLimit}
                                onChange={e => setImportLimit(Number(e.target.value))}
                                disabled={!isLimitEnabled}
                                className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white text-right focus:border-pink-500 outline-none disabled:opacity-50"
                            />
                        </div>

                        <button
                            onClick={handleDbImport}
                            disabled={isImporting}
                            className="w-full mt-2 bg-pink-600 hover:bg-pink-500 text-white py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        >
                            {isImporting ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            Fetch Data
                        </button>
                    </div>
                </div>
            </div>

            {/* Orphaned Logs Section - Manual check button or results */}
            <div className="mt-8 text-center">
                {!isCheckingOrphans && !orphanedLogsInfo?.hasOrphanedLogs && (
                    <div className="animate-in fade-in">
                        <p className="text-xs text-slate-500 mb-3">Check if there are any logs without matching sessions.</p>
                        <button
                            onClick={handleCheckOrphans}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all border border-slate-700"
                        >
                            <Search className="w-3.5 h-3.5" />
                            Check for Orphaned Logs
                        </button>
                    </div>
                )}
                {isCheckingOrphans && (
                    <div className="animate-in fade-in">
                        <div className="max-w-md mx-auto bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                            <div className="flex items-center justify-center gap-3">
                                <RefreshCcw className="w-5 h-5 text-slate-400 animate-spin" />
                                <span className="text-xs text-slate-400">Checking for orphaned logs...</span>
                            </div>
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
                                    </p>
                                    <button
                                        onClick={handleSyncOrphanedLogs}
                                        disabled={isSyncing}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                                    >
                                        {isSyncing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                                        Sync Now
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
