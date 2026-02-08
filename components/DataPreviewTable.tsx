import { useState, useMemo } from 'react';
import { Maximize2, Minimize2, X, Table, ChevronLeft, ChevronRight, Search, Columns } from 'lucide-react';
import ConversationView from './ConversationView';
import MarkdownRenderer from './MarkdownRenderer';
import { ChatMessage } from '../types';

interface DataPreviewTableProps {
    rawText: string;
    onClose?: () => void;
}

interface ParsedRow {
    [key: string]: unknown;
}

interface ColumnInfo {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'mixed';
    values: unknown[];
}

function detectType(value: unknown): ColumnInfo['type'] {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
}

function getColumnType(values: unknown[]): ColumnInfo['type'] {
    const types = new Set(values.map(v => detectType(v)));
    types.delete('null'); // Ignore nulls for type detection
    if (types.size === 0) return 'null';
    if (types.size === 1) return (types.values().next().value ?? 'mixed') as ColumnInfo['type'];
    return 'mixed';
}

function truncateString(str: string, maxLen: number = 50): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + '...';
}

function formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        // Check if it's a messages array
        if (value[0] && typeof value[0] === 'object' && 'role' in value[0]) {
            return `[${value.length} messages]`;
        }
        return JSON.stringify(value);
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

export default function DataPreviewTable({ rawText, onClose }: DataPreviewTableProps) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRow, setSelectedRow] = useState<ParsedRow | null>(null);
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
    const [showColumnPicker, setShowColumnPicker] = useState(false);

    const pageSize = isFullscreen ? 25 : 5;

    // Parse the raw text into rows
    const { rows, columns, parseError } = useMemo(() => {
        if (!rawText.trim()) {
            return { rows: [], columns: [], parseError: null };
        }

        try {
            const lines = rawText.trim().split('\n').filter(l => l.trim());
            let parsedRows: ParsedRow[] = [];

            // Try parsing as JSON array first
            const trimmed = rawText.trim();
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                const arr = JSON.parse(trimmed);
                if (Array.isArray(arr)) {
                    parsedRows = arr;
                }
            } else {
                // Try JSONL
                parsedRows = lines.map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        // If not valid JSON, treat as plain text
                        return { content: line };
                    }
                });
            }

            if (parsedRows.length === 0) {
                return { rows: [], columns: [], parseError: 'No valid data found' };
            }

            // Extract all unique column names
            const columnNames = new Set<string>();
            parsedRows.forEach(row => {
                if (typeof row === 'object' && row !== null) {
                    Object.keys(row).forEach(key => columnNames.add(key));
                }
            });

            // Build column info
            const cols: ColumnInfo[] = Array.from(columnNames).map(name => ({
                name,
                type: getColumnType(parsedRows.map(r => r[name])),
                values: parsedRows.map(r => r[name])
            }));

            return { rows: parsedRows, columns: cols, parseError: null };
        } catch (e) {
            return { rows: [], columns: [], parseError: 'Failed to parse data' };
        }
    }, [rawText]);

    // Initialize visible columns
    useMemo(() => {
        if (visibleColumns.size === 0 && columns.length > 0) {
            // Show first 6 columns by default
            setVisibleColumns(new Set(columns.slice(0, 6).map(c => c.name)));
        }
    }, [columns, visibleColumns.size]);

    // Filter rows by search
    const filteredRows = useMemo(() => {
        if (!searchTerm.trim()) return rows;
        const term = searchTerm.toLowerCase();
        return rows.filter(row =>
            Object.values(row).some(val =>
                formatCellValue(val).toLowerCase().includes(term)
            )
        );
    }, [rows, searchTerm]);

    // Pagination
    const totalPages = Math.ceil(filteredRows.length / pageSize);
    const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Get visible columns in order
    const displayColumns = columns.filter(c => visibleColumns.has(c.name));

    if (parseError) {
        return (
            <div className="bg-slate-950 border border-red-500/30 rounded-lg p-4 text-center">
                <p className="text-red-400 text-xs">{parseError}</p>
            </div>
        );
    }

    if (rows.length === 0) {
        return null;
    }

    const typeColors: Record<ColumnInfo['type'], string> = {
        string: 'text-emerald-400',
        number: 'text-blue-400',
        boolean: 'text-blue-400',
        array: 'text-amber-400',
        object: 'text-amber-400',
        null: 'text-slate-400',
        mixed: 'text-slate-300'
    };

    const TableContent = () => (
        <div className={`overflow-x-auto ${isFullscreen ? 'max-h-[calc(100vh-200px)]' : 'max-h-64'} overflow-y-auto`}>
            <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-950/70 z-10">
                    <tr>
                        {displayColumns.map(col => (
                            <th key={col.name} className="text-left px-3 py-2 border-b border-slate-700/70 min-w-[120px]">
                                <div className="flex flex-col gap-0.5">
                                    <span className="font-bold text-slate-100 truncate">{col.name}</span>
                                    <span className={`text-[10px] font-normal ${typeColors[col.type]}`}>
                                        {col.type}
                                    </span>
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {paginatedRows.map((row, idx) => (
                        <tr
                            key={idx}
                            className="hover:bg-slate-900/60 cursor-pointer transition-colors border-b border-slate-800/70"
                            onClick={() => setSelectedRow(row)}
                        >
                            {displayColumns.map(col => {
                                const value = row[col.name];
                                const formatted = formatCellValue(value);
                                return (
                                    <td key={col.name} className="px-3 py-2 text-slate-300 font-mono">
                                        <span className="block truncate max-w-[200px]" title={formatted}>
                                            {truncateString(formatted, 40)}
                                        </span>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const RowDetailModal = () => {
        if (!selectedRow) return null;

        // Check if this row has messages array
        const messages = selectedRow.messages as ChatMessage[] | undefined;

        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-slate-950/70 border border-slate-700/70 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between p-4 border-b border-slate-800/70">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Table className="w-4 h-4 text-sky-400" /> Row Details
                        </h3>
                        <button onClick={() => setSelectedRow(null)} className="text-slate-300 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages && messages.length > 0 ? (
                            <div className="bg-slate-950/70 rounded-lg p-4 border border-cyan-800/30">
                                <h4 className="text-xs font-bold text-cyan-400 uppercase mb-3 flex items-center gap-1">
                                    Conversation ({messages.length} messages)
                                </h4>
                                <ConversationView messages={messages} />
                            </div>
                        ) : (
                            Object.entries(selectedRow).map(([key, value]) => (
                                <div key={key} className="bg-slate-950/70 rounded-lg p-3 border border-slate-800/70">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-bold text-slate-200">{key}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeColors[detectType(value)]} bg-slate-900/60`}>
                                            {detectType(value)}
                                        </span>
                                    </div>
                                    {typeof value === 'string' && (key === 'answer' || key === 'reasoning' || key === 'content' || key === 'query') ? (
                                        <div className="text-xs text-slate-300 max-h-48 overflow-y-auto">
                                            <MarkdownRenderer content={value} />
                                        </div>
                                    ) : (
                                        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                        </pre>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const ColumnPicker = () => {
        if (!showColumnPicker) return null;
        return (
            <div className="absolute right-0 top-8 z-20 bg-slate-950/70 border border-slate-700/70 rounded-lg shadow-xl p-3 min-w-[180px]">
                <div className="text-[10px] font-bold text-slate-300 uppercase mb-2">Visible Columns</div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                    {columns.map(col => (
                        <label key={col.name} className="flex items-center gap-2 cursor-pointer hover:bg-slate-900/60 p-1 rounded">
                            <input
                                type="checkbox"
                                checked={visibleColumns.has(col.name)}
                                onChange={() => {
                                    const newSet = new Set(visibleColumns);
                                    if (newSet.has(col.name)) {
                                        newSet.delete(col.name);
                                    } else {
                                        newSet.add(col.name);
                                    }
                                    setVisibleColumns(newSet);
                                }}
                                className="accent-sky-500"
                            />
                            <span className="text-xs text-slate-200 truncate">{col.name}</span>
                        </label>
                    ))}
                </div>
            </div>
        );
    };

    // Fullscreen modal
    if (isFullscreen) {
        return (
            <>
                <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-slate-800/70 bg-slate-950/70">
                        <div className="flex items-center gap-4">
                            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                <Table className="w-4 h-4 text-sky-400" /> Data Preview
                            </h2>
                            <span className="text-xs text-slate-400 bg-slate-900/60 px-2 py-1 rounded">
                                {filteredRows.length} rows × {columns.length} columns
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                    placeholder="Search data..."
                                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-900/60 border border-slate-700/70 rounded-lg text-slate-200 w-64 focus:border-sky-500 outline-none"
                                />
                            </div>
                            <div className="relative">
                                <button
                                    onClick={() => setShowColumnPicker(!showColumnPicker)}
                                    className="p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/70 text-slate-300 hover:text-white transition-colors"
                                >
                                    <Columns className="w-4 h-4" />
                                </button>
                                <ColumnPicker />
                            </div>
                            <button
                                onClick={() => setIsFullscreen(false)}
                                className="p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/70 text-slate-300 hover:text-white transition-colors"
                                title="Exit fullscreen"
                            >
                                <Minimize2 className="w-4 h-4" />
                            </button>
                            {onClose && (
                                <button
                                    onClick={() => {
                                        setIsFullscreen(false);
                                        onClose();
                                    }}
                                    className="p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/70 text-slate-300 hover:text-white transition-colors"
                                    title="Close preview"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-hidden p-4">
                        <TableContent />
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-4 p-4 border-t border-slate-800/70 bg-slate-950/70">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg hover:bg-slate-900/60 disabled:opacity-30 text-slate-300"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs text-slate-300">
                                Page <span className="text-white font-bold">{currentPage}</span> of {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg hover:bg-slate-900/60 disabled:opacity-30 text-slate-300"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
                <RowDetailModal />
            </>
        );
    }

    // Compact view (in sidebar)
    return (
        <>
            <div className="bg-slate-950 border border-slate-700/70 rounded-lg overflow-hidden">
                {/* Mini header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/70 bg-slate-950/70">
                    <span className="text-[10px] text-slate-300">
                        {filteredRows.length} rows × {displayColumns.length} cols
                    </span>
                    <button
                        onClick={() => setIsFullscreen(true)}
                        className="text-slate-400 hover:text-sky-400 transition-colors"
                        title="Expand to fullscreen"
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                </div>

                <TableContent />

                {/* Mini pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800/70 bg-slate-950/70">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="text-xs text-slate-400 hover:text-white disabled:opacity-30"
                        >
                            ‹ Prev
                        </button>
                        <span className="text-[10px] text-slate-400">{currentPage}/{totalPages}</span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="text-xs text-slate-400 hover:text-white disabled:opacity-30"
                        >
                            Next ›
                        </button>
                    </div>
                )}
            </div>
            <RowDetailModal />
        </>
    );
}
