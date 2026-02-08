import { useMemo, useState } from 'react';
import { CheckCircle2, Database, Download, Flag, RefreshCcw } from 'lucide-react';

import * as FirebaseService from '../../services/firebaseService';
import { SessionVerificationStatus } from '../../interfaces/enums/SessionVerificationStatus';

interface DatabaseImportCardProps {
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
}

export default function DatabaseImportCard({
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
    isImporting
}: DatabaseImportCardProps): JSX.Element {
    const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);
    const [onlySessionsWithRows, setOnlySessionsWithRows] = useState(false);

    const sessionOptions = useMemo(() => {
        const sessionsList = Array.isArray(availableSessions)
            ? availableSessions
            : (availableSessions as unknown as { sessions?: FirebaseService.SavedSession[] })?.sessions || [];
        const baseOptions = [
            { value: 'all', name: 'All Sessions', sublabel: 'All data sources' },
            { value: 'current', name: 'Current Session', sublabel: 'Only current session' },
            { value: 'custom', name: 'Specific Session ID', sublabel: customSessionId ? customSessionId : 'Enter session UID' }
        ];

        const filteredSessions = onlySessionsWithRows
            ? sessionsList.filter(session => (session.logCount ?? session.itemCount ?? 0) > 0)
            : sessionsList;

        const cloudOptions = filteredSessions.map((session) => ({
            value: session.id,
            name: session.name || 'Untitled Session',
            sublabel: `${session.logCount ?? 0} items`,
            status: session.verificationStatus || SessionVerificationStatus.Unreviewed
        }));

        return { baseOptions, cloudOptions };
    }, [availableSessions, customSessionId, onlySessionsWithRows]);

    const selectedOption = useMemo(() => {
        if (selectedSessionFilter === 'all') return sessionOptions.baseOptions[0];
        if (selectedSessionFilter === 'current') return sessionOptions.baseOptions[1];
        if (selectedSessionFilter === 'custom') return sessionOptions.baseOptions[2];

        const match = sessionOptions.cloudOptions.find(option => option.value === selectedSessionFilter);
        return match || { value: selectedSessionFilter, name: 'Unknown Session', sublabel: 'Not found', status: SessionVerificationStatus.Unreviewed };
    }, [selectedSessionFilter, sessionOptions]);

    return (
        <div className="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-slate-700/70 hover:border-amber-500 hover:bg-slate-900/60 transition-all relative">
            <div className="w-16 h-16 rounded-full bg-slate-900/60 flex items-center justify-center mb-2">
                <Database className="w-8 h-8 text-amber-400" />
            </div>
            <div className="text-center w-full space-y-3">
                <h3 className="text-white font-bold">Fetch DB</h3>

                <div className="w-full text-left relative">
                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Source Session</label>
                    <button
                        type="button"
                        onClick={() => setIsSessionMenuOpen(prev => !prev)}
                        className="w-full bg-slate-950/70 border border-slate-700/70 rounded px-2 py-2 text-left text-xs text-white focus:border-amber-500 outline-none flex items-center justify-between"
                    >
                        <div className="flex flex-col text-left">
                            <div className="flex items-center gap-2">
                                {selectedOption.status === SessionVerificationStatus.Verified && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                                {selectedOption.status === SessionVerificationStatus.Garbage && (
                                    <Flag className="w-3.5 h-3.5 text-red-400" />
                                )}
                                <span className="text-xs font-semibold text-slate-100">{selectedOption.name}</span>
                            </div>
                            <span className="text-[10px] text-slate-400">{selectedOption.sublabel}</span>
                        </div>
                        <span className="text-slate-400">▾</span>
                    </button>

                    {isSessionMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setIsSessionMenuOpen(false)} />
                            <div className="absolute z-20 mt-2 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-700/70 bg-slate-950/95 shadow-xl">
                                <div className="px-3 py-2 text-[10px] uppercase text-slate-400 border-b border-slate-800/70 flex items-center justify-between">
                                    <span>Sessions</span>
                                    <label className="flex items-center gap-2 text-[10px] text-slate-400">
                                        <input
                                            type="checkbox"
                                            checked={onlySessionsWithRows}
                                            onChange={(e) => setOnlySessionsWithRows(e.target.checked)}
                                            className="accent-sky-500"
                                        />
                                        Only with rows
                                    </label>
                                </div>
                                {sessionOptions.baseOptions.map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            setSelectedSessionFilter(option.value);
                                            setIsSessionMenuOpen(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 hover:bg-slate-900/60 transition-colors ${selectedSessionFilter === option.value ? 'bg-slate-900/60' : ''}`}
                                    >
                                        <div className="text-xs font-semibold text-slate-100">{option.name}</div>
                                        <div className="text-[10px] text-slate-400">{option.sublabel}</div>
                                    </button>
                                ))}
                                {sessionOptions.cloudOptions.length > 0 && (
                                    <>
                                        <div className="px-3 py-2 text-[10px] uppercase text-slate-400 border-t border-b border-slate-800/70">Saved Cloud Sessions</div>
                                        {sessionOptions.cloudOptions.map(option => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedSessionFilter(option.value);
                                                    setIsSessionMenuOpen(false);
                                                }}
                                                className={`w-full text-left px-3 py-2 hover:bg-slate-900/60 transition-colors ${selectedSessionFilter === option.value ? 'bg-slate-900/60' : ''}`}
                                            >
                                                <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                                                    {option.status === SessionVerificationStatus.Verified && (
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                    )}
                                                    {option.status === SessionVerificationStatus.Garbage && (
                                                        <Flag className="w-3.5 h-3.5 text-red-400" />
                                                    )}
                                                    <span>{option.name}</span>
                                                </div>
                                                <div className="text-[10px] text-slate-400">{option.sublabel}</div>
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    <select
                        value={selectedSessionFilter}
                        onChange={e => setSelectedSessionFilter(e.target.value)}
                        className="sr-only"
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
                                className="w-full bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none"
                            />
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-4 w-full bg-slate-950/70 p-2 rounded border border-slate-800/70">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={isLimitEnabled}
                            onChange={e => setIsLimitEnabled(e.target.checked)}
                            className="accent-amber-500"
                            id="limitToggle"
                        />
                        <label htmlFor="limitToggle" className="text-xs text-slate-200 cursor-pointer">Limit Rows</label>
                    </div>

                    <input
                        type="number"
                        value={importLimit}
                        onChange={e => setImportLimit(Number(e.target.value))}
                        disabled={!isLimitEnabled}
                        className="w-20 bg-slate-950 border border-slate-700/70 rounded px-2 py-1 text-xs text-white text-right focus:border-amber-500 outline-none disabled:opacity-50"
                    />
                </div>

                <button
                    onClick={handleDbImport}
                    disabled={isImporting}
                    className="w-full mt-2 bg-amber-600 hover:bg-amber-500 text-white py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                    {isImporting ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Fetch Data
                </button>
            </div>
        </div>
    );
}
