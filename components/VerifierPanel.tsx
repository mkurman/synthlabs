
import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
    Upload, Database, AlertTriangle, Star, Trash2, CheckCircle2,
    GitBranch, Download, RefreshCcw, Filter, FileJson, ArrowRight,
    ShieldCheck, LayoutGrid, List, Search, Server, Clock, Bookmark, Plus,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileType, MessageCircle,
    ChevronUp, ChevronDown, Maximize2, Minimize2, Edit3, RotateCcw, Check, X, Loader2, Settings2
} from 'lucide-react';
import { VerifierItem, ExternalProvider } from '../types';
import * as FirebaseService from '../services/firebaseService';
import * as HuggingFaceService from '../services/huggingFaceService';
import * as VerifierRewriterService from '../services/verifierRewriterService';
import { SettingsService, AVAILABLE_PROVIDERS } from '../services/settingsService';
import ReasoningHighlighter from './ReasoningHighlighter';
import ConversationView from './ConversationView';

interface VerifierPanelProps {
    onImportFromDb: () => Promise<void>;
    currentSessionUid: string;
}

export default function VerifierPanel({ onImportFromDb, currentSessionUid }: VerifierPanelProps) {
    const [data, setData] = useState<VerifierItem[]>([]);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [activeTab, setActiveTab] = useState<'import' | 'review' | 'export'>('import');

    // Import State
    const [importLimit, setImportLimit] = useState<number>(100);
    const [isLimitEnabled, setIsLimitEnabled] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [availableSessions, setAvailableSessions] = useState<FirebaseService.SavedSession[]>([]);
    const [discoveredSessions, setDiscoveredSessions] = useState<FirebaseService.DiscoveredSession[]>([]);
    const [isLoadingDiscoveredSessions, setIsLoadingDiscoveredSessions] = useState(false);
    const [selectedSessionFilter, setSelectedSessionFilter] = useState<string>('all'); // 'all', 'current', 'custom', or session ID
    const [customSessionId, setCustomSessionId] = useState('');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Expanded conversations state (track by item ID)
    const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());

    const toggleConversationExpand = (id: string) => {
        setExpandedConversations(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Dedupe State
    const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
    const [filterScore, setFilterScore] = useState<number | null>(null); // null = all

    // Export State
    const [hfToken, setHfToken] = useState('');
    const [hfRepo, setHfRepo] = useState('');
    const [hfFormat, setHfFormat] = useState<'jsonl' | 'parquet'>('parquet'); // Default to Parquet
    const [isUploading, setIsUploading] = useState(false);
    const [exportColumns, setExportColumns] = useState<Record<string, boolean>>({});

    // Inline Editing State
    const [editingField, setEditingField] = useState<{ itemId: string; field: string; messageIndex?: number; originalValue: string } | null>(null);
    const [editValue, setEditValue] = useState('');
    const [rewritingField, setRewritingField] = useState<{ itemId: string; field: string; messageIndex?: number } | null>(null);

    // Rewriter Config State
    const [isRewriterPanelOpen, setIsRewriterPanelOpen] = useState(false);
    const [rewriterConfig, setRewriterConfig] = useState<VerifierRewriterService.RewriterConfig>({
        provider: 'external',
        externalProvider: 'openrouter',
        apiKey: '',
        model: 'openai/gpt-4o-mini',
        customBaseUrl: '',
        maxRetries: 3,
        retryDelay: 2000
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load available sessions when Import tab is active
    useEffect(() => {
        if (activeTab === 'import' && FirebaseService.isFirebaseConfigured()) {
            // Fetch saved sessions
            FirebaseService.getSessionsFromFirebase()
                .then(setAvailableSessions)
                .catch(console.error);
            // Fetch discovered sessions from logs
            setIsLoadingDiscoveredSessions(true);
            FirebaseService.getUniqueSessionUidsFromLogs()
                .then(setDiscoveredSessions)
                .catch(console.error)
                .finally(() => setIsLoadingDiscoveredSessions(false));
        }
    }, [activeTab]);

    // Reset pagination when filters or data change
    useEffect(() => {
        setCurrentPage(1);
    }, [showDuplicatesOnly, filterScore, data.length]);

    // Dynamically discover columns from loaded data
    useEffect(() => {
        if (data.length === 0) return;

        // Collect all unique keys from all items
        const allKeys = new Set<string>();
        // Internal fields to exclude from export options
        const excludeKeys = ['id', 'isDuplicate', 'duplicateGroupId', 'isDiscarded', 'verifiedTimestamp'];
        // Priority fields that should be checked by default
        const defaultChecked = ['query', 'reasoning', 'answer', 'full_seed', 'score', 'modelUsed', 'source', 'messages'];

        data.forEach(item => {
            Object.keys(item).forEach(key => {
                if (!excludeKeys.includes(key)) {
                    allKeys.add(key);
                }
            });
        });

        // Build new export columns state
        const newColumns: Record<string, boolean> = {};
        allKeys.forEach(key => {
            newColumns[key] = defaultChecked.includes(key);
        });

        setExportColumns(newColumns);
    }, [data]);

    // --- Logic: Import ---

    const normalizeImportItem = (raw: any): VerifierItem => {
        // 1. Query/Input Mapping
        let query = raw.query || raw.instruction || raw.question || raw.prompt || raw.input || "";
        if (!query && Array.isArray(raw.messages)) {
            const lastUser = raw.messages.findLast((m: any) => m.role === 'user');
            if (lastUser) query = lastUser.content;
        }

        // 2. Answer/Output Mapping
        let answer = raw.answer || raw.output || raw.response || raw.completion || "";
        if (Array.isArray(raw.messages)) {
            const lastAssistant = raw.messages.findLast((m: any) => m.role === 'assistant');
            if (lastAssistant) answer = lastAssistant.content;
        }

        // 3. Reasoning Mapping (Added reasoning_trace)
        const reasoning = raw.reasoning || raw.reasoning_trace || raw.thought || raw.thoughts || raw.scratchpad || raw.rationale || raw.trace || "";

        // 4. Ensure strings
        const ensureString = (val: any) => {
            if (val === null || val === undefined) return "";
            if (typeof val === 'string') return val;
            return JSON.stringify(val);
        };

        // 5. Model Detection
        // Checking raw.generator as requested
        let modelUsed = raw.modelUsed || raw.model || raw.generator || 'Imported';

        if (modelUsed === 'Imported' && raw.deepMetadata && raw.deepMetadata.writer) {
            modelUsed = `DEEP: ${raw.deepMetadata.writer}`;
        }

        if (typeof modelUsed !== 'string') {
            modelUsed = String(modelUsed);
        }

        return {
            ...raw, // Keep original data fields
            id: raw.id || crypto.randomUUID(),
            query: ensureString(query),
            answer: ensureString(answer),
            reasoning: ensureString(reasoning),
            // Preserve multi-turn conversation data
            messages: Array.isArray(raw.messages) ? raw.messages : undefined,
            isMultiTurn: Array.isArray(raw.messages) && raw.messages.length > 0,
            // Defaults for VerifierItem
            seed_preview: raw.seed_preview || ensureString(query).substring(0, 100),
            full_seed: raw.full_seed || ensureString(query),
            timestamp: raw.timestamp || new Date().toISOString(),
            modelUsed: modelUsed,
            score: raw.score || 0,
            isDuplicate: false,
            isDiscarded: false
        };
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsImporting(true);
        const readers: Promise<VerifierItem[]>[] = [];

        Array.from(files).forEach((file: File) => {
            readers.push(new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (typeof event.target?.result === 'string') {
                        let items: VerifierItem[] = [];
                        try {
                            const content = event.target.result.trim();
                            if (content.startsWith('[') && content.endsWith(']')) {
                                // JSON Array
                                const parsed = JSON.parse(content);
                                if (Array.isArray(parsed)) {
                                    items = parsed.map(normalizeImportItem);
                                }
                            } else {
                                // JSONL (Line-delimited JSON)
                                const lines = content.split('\n');
                                items = lines
                                    .filter(line => line.trim().length > 0)
                                    .map(line => {
                                        try {
                                            return normalizeImportItem(JSON.parse(line));
                                        } catch (e) {
                                            return null;
                                        }
                                    })
                                    .filter((i): i is VerifierItem => i !== null);
                            }
                        } catch (err) {
                            console.error("Failed to parse file", file.name, err);
                        }
                        resolve(items);
                    } else {
                        resolve([]);
                    }
                };
                reader.readAsText(file);
            }));
        });

        Promise.all(readers).then(results => {
            const allItems = results.flat();
            if (allItems.length > 0) {
                analyzeDuplicates(allItems);
                setData(allItems);
                setActiveTab('review');
            } else {
                alert("No valid data found in selected files. Please check the format (JSON Array or JSONL).");
            }
            setIsImporting(false);
        });

        e.target.value = '';
    };

    const handleDbImport = async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            alert("Firebase not configured.");
            return;
        }
        setIsImporting(true);
        try {
            // Determine parameters
            const limitToUse = isLimitEnabled ? importLimit : undefined;
            let sessionUidToUse: string | undefined = undefined;

            if (selectedSessionFilter === 'current') {
                sessionUidToUse = currentSessionUid;
            } else if (selectedSessionFilter === 'custom') {
                sessionUidToUse = customSessionId.trim();
                if (!sessionUidToUse) {
                    alert("Please enter a Session ID.");
                    setIsImporting(false);
                    return;
                }
            } else if (selectedSessionFilter !== 'all') {
                sessionUidToUse = selectedSessionFilter;
            }

            const items = await FirebaseService.fetchAllLogs(limitToUse, sessionUidToUse);
            if (items.length === 0) {
                alert("No items found matching criteria.");
            } else {
                analyzeDuplicates(items);
                setData(items);
                setActiveTab('review');
            }
        } catch (e: any) {
            alert("Import failed: " + e.message);
        } finally {
            setIsImporting(false);
        }
    };

    // --- Logic: Deduplication ---

    const analyzeDuplicates = (items: VerifierItem[]) => {
        const map = new Map<string, string[]>(); // Hash -> ID[]

        // Reset flags first
        items.forEach(i => {
            i.isDuplicate = false;
            i.duplicateGroupId = undefined;
        });

        // Group by Input hash (simple string matching for now)
        items.forEach(item => {
            if (item.isDiscarded) return; // Skip discarded items from colliding

            const key = (item.query || item.full_seed || '').trim().toLowerCase();
            if (!map.has(key)) map.set(key, []);
            map.get(key)?.push(item.id);
        });

        // Mark duplicates
        map.forEach((ids, key) => {
            if (ids.length > 1) {
                const groupId = crypto.randomUUID();
                ids.forEach(id => {
                    const item = items.find(i => i.id === id);
                    if (item) {
                        item.isDuplicate = true;
                        item.duplicateGroupId = groupId;
                    }
                });
            }
        });
    };

    const handleReScan = () => {
        setData(prev => {
            const next = prev.map(i => ({ ...i })); // Shallow copy
            analyzeDuplicates(next);
            return next;
        });
    };

    const toggleDuplicateStatus = (id: string) => {
        setData(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, isDuplicate: !item.isDuplicate };
            }
            return item;
        }));
    };

    const autoResolveDuplicates = () => {
        // For each duplicate group, keep the one with the highest score.
        // If scores tied, keep the longest answer.
        const groups = new Map<string, VerifierItem[]>();

        data.filter(i => i.isDuplicate && !i.isDiscarded).forEach(i => {
            if (i.duplicateGroupId) {
                if (!groups.has(i.duplicateGroupId)) groups.set(i.duplicateGroupId, []);
                groups.get(i.duplicateGroupId)?.push(i);
            }
        });

        const idsToDiscard = new Set<string>();

        groups.forEach((groupItems) => {
            // Sort desc by score, then answer length
            groupItems.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return (b.answer?.length || 0) - (a.answer?.length || 0);
            });

            // Keep [0], discard rest
            for (let i = 1; i < groupItems.length; i++) {
                idsToDiscard.add(groupItems[i].id);
            }
        });

        setData(prev => prev.map(item => idsToDiscard.has(item.id) ? { ...item, isDiscarded: true } : item));
    };

    // --- Logic: Review ---

    const setScore = (id: string, score: number) => {
        setData(prev => prev.map(i => i.id === id ? { ...i, score } : i));
    };

    const toggleDiscard = (id: string) => {
        setData(prev => prev.map(i => i.id === id ? { ...i, isDiscarded: !i.isDiscarded } : i));
    };

    // --- Logic: Export ---

    const getExportData = () => {
        return data.filter(i => !i.isDiscarded).map(item => {
            const exportItem: any = {};
            Object.keys(exportColumns).forEach(key => {
                if (exportColumns[key]) {
                    exportItem[key] = (item as any)[key];
                }
            });
            return exportItem;
        });
    };

    const handleJsonExport = () => {
        const exportData = getExportData();
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `synth_verified_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDbSave = async () => {
        setIsUploading(true);
        try {
            const itemsToSave = data.filter(i => !i.isDiscarded);
            const count = await FirebaseService.saveFinalDataset(itemsToSave, 'synth_final');
            alert(`Saved ${count} items to 'synth_final' collection.`);
        } catch (e: any) {
            alert("DB Save Failed: " + e.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleHfPush = async () => {
        if (!hfToken || !hfRepo) {
            alert("Please provide HF Token and Repo ID.");
            return;
        }
        setIsUploading(true);
        try {
            const itemsToSave = getExportData();
            const filename = hfFormat === 'parquet' ? 'train.parquet' : 'data.jsonl';
            const url = await HuggingFaceService.uploadToHuggingFace(hfToken, hfRepo, itemsToSave, filename, true, hfFormat);
            alert("Successfully pushed to: " + url);
        } catch (e: any) {
            alert("HF Push Failed: " + e.message);
        } finally {
            setIsUploading(false);
        }
    };

    // --- Inline Editing Handlers ---

    const startEditing = (itemId: string, field: 'query' | 'reasoning' | 'answer', currentValue: string) => {
        setEditingField({ itemId, field, originalValue: currentValue });
        setEditValue(currentValue);
    };

    const cancelEditing = () => {
        setEditingField(null);
        setEditValue('');
    };

    const saveEditing = () => {
        if (!editingField) return;

        setData(prev => prev.map(item => {
            if (item.id === editingField.itemId) {
                if (editingField.field === 'message' && editingField.messageIndex !== undefined && item.messages) {
                    const newMessages = [...item.messages];
                    if (newMessages[editingField.messageIndex]) {
                        newMessages[editingField.messageIndex] = {
                            ...newMessages[editingField.messageIndex],
                            content: editValue
                        };
                    }
                    return { ...item, messages: newMessages };
                } else if (['query', 'reasoning', 'answer'].includes(editingField.field)) {
                    return { ...item, [editingField.field]: editValue };
                }
            }
            return item;
        }));

        setEditingField(null);
        setEditValue('');
    };

    const handleMessageRewrite = async (itemId: string, messageIndex: number) => {
        const item = data.find(i => i.id === itemId);
        if (!item || !item.messages || !item.messages[messageIndex]) return;

        setRewritingField({ itemId, field: 'message', messageIndex });
        try {
            const newValue = await VerifierRewriterService.rewriteMessage({
                item,
                messageIndex,
                config: rewriterConfig,
                promptSet: SettingsService.getSettings().promptSet
            });

            setData(prev => prev.map(i => {
                if (i.id === itemId && i.messages) {
                    const newMessages = [...i.messages];
                    newMessages[messageIndex] = {
                        ...newMessages[messageIndex],
                        content: newValue
                    };
                    return { ...i, messages: newMessages };
                }
                return i;
            }));
        } catch (error) {
            console.error("Rewrite failed:", error);
            alert("Rewrite failed. See console for details.");
        } finally {
            setRewritingField(null);
        }
    };

    const handleFieldRewrite = async (itemId: string, field: 'query' | 'reasoning' | 'answer') => {
        const item = data.find(i => i.id === itemId);
        if (!item) return;

        // Ensure query is populated with fallback if empty, to match display logic
        const itemForRewrite = {
            ...item,
            query: item.query || (item as any).QUERY || item.full_seed || ''
        };

        setRewritingField({ itemId, field });
        try {
            const newValue = await VerifierRewriterService.rewriteField({
                item: itemForRewrite,
                field,
                config: rewriterConfig,
                promptSet: SettingsService.getSettings().promptSet
            });
            setData(prev => prev.map(i =>
                i.id === itemId
                    ? { ...i, [field]: newValue }
                    : i
            ));
        } catch (err: any) {
            console.error('Rewrite failed:', err);
            alert('Rewrite failed: ' + err.message);
        } finally {
            setRewritingField(null);
        }
    };

    // --- Render Helpers ---

    const filteredData = useMemo(() => {
        return data.filter(item => {
            if (item.isDiscarded) return false;
            if (showDuplicatesOnly && !item.isDuplicate) return false;
            if (filterScore !== null && item.score !== filterScore) return false;
            return true;
        });
    }, [data, showDuplicatesOnly, filterScore]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredData.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const currentItems = filteredData.slice(startIndex, startIndex + pageSize);

    return (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 min-h-[600px] flex flex-col">
            {/* Header Tabs */}
            <div className="flex justify-center mb-8">
                <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex gap-1">
                    {['import', 'review', 'export'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === tab ? 'bg-teal-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {tab === 'import' && <Upload className="w-4 h-4" />}
                            {tab === 'review' && <ShieldCheck className="w-4 h-4" />}
                            {tab === 'export' && <Download className="w-4 h-4" />}
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* IMPORT TAB */}
            {activeTab === 'import' && (
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
                                        {isLoadingDiscoveredSessions && <optgroup label="⏳ Loading sessions from logs..."></optgroup>}
                                        {!isLoadingDiscoveredSessions && discoveredSessions.length > 0 && <optgroup label="📊 Sessions from Logs">
                                            {discoveredSessions.map(s => (
                                                <option key={`log-${s.uid}`} value={s.uid}>
                                                    {s.uid.substring(0, 8)}... ({s.count} logs)
                                                </option>
                                            ))}
                                        </optgroup>}
                                        {availableSessions.length > 0 && <optgroup label="💾 Saved Cloud Sessions">
                                            {availableSessions.map(s => (
                                                <option key={s.id} value={s.id}>{s.name} ({new Date(s.createdAt).toLocaleDateString()})</option>
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
                </div>
            )}

            {/* REVIEW TAB */}
            {activeTab === 'review' && (
                <div className="flex-1 flex flex-col gap-4 animate-in fade-in">
                    {/* Rewriter Settings Panel */}
                    <div className="bg-slate-950/50 rounded-xl border border-slate-800 overflow-hidden">
                        <button
                            onClick={() => setIsRewriterPanelOpen(!isRewriterPanelOpen)}
                            className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <Settings2 className="w-4 h-4" />
                                REWRITER SETTINGS
                            </span>
                            {isRewriterPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {isRewriterPanelOpen && (
                            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-800 pt-4">
                                <div>
                                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Provider</label>
                                    <select
                                        value={rewriterConfig.externalProvider}
                                        onChange={e => setRewriterConfig(prev => ({ ...prev, externalProvider: e.target.value as ExternalProvider }))}
                                        className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-teal-500"
                                    >
                                        {['gemini', ...AVAILABLE_PROVIDERS].map(p => (
                                            <option key={p} value={p}>
                                                {p === 'gemini' ? 'Native Gemini' : p.charAt(0).toUpperCase() + p.slice(1)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Model</label>
                                    <input
                                        type="text"
                                        value={rewriterConfig.model}
                                        onChange={e => setRewriterConfig(prev => ({ ...prev, model: e.target.value }))}
                                        placeholder="Model name"
                                        className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={rewriterConfig.apiKey}
                                        onChange={e => setRewriterConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                                        placeholder="Use default from settings"
                                        className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Custom Base URL</label>
                                    <input
                                        type="text"
                                        value={rewriterConfig.customBaseUrl || ''}
                                        onChange={e => setRewriterConfig(prev => ({ ...prev, customBaseUrl: e.target.value }))}
                                        placeholder="Optional"
                                        className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-teal-500"
                                    />
                                </div>
                                <div className="col-span-1 md:col-span-2 flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Max Retries</label>
                                        <input
                                            type="number"
                                            value={rewriterConfig.maxRetries ?? 3}
                                            onChange={e => setRewriterConfig(prev => ({ ...prev, maxRetries: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-teal-500"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Retry Delay (ms)</label>
                                        <input
                                            type="number"
                                            value={rewriterConfig.retryDelay ?? 2000}
                                            onChange={e => setRewriterConfig(prev => ({ ...prev, retryDelay: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-teal-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-slate-400 uppercase tracking-wide px-2 border-r border-slate-800">{filteredData.length} Items</span>

                            <button onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)} className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${showDuplicatesOnly ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-white'}`}>
                                <GitBranch className="w-3.5 h-3.5" /> Duplicates
                            </button>

                            <div className="flex items-center gap-2">
                                <Filter className="w-3.5 h-3.5 text-slate-500" />
                                <select value={filterScore === null ? 'all' : filterScore} onChange={e => setFilterScore(e.target.value === 'all' ? null : Number(e.target.value))} className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1 outline-none">
                                    <option value="all">All Scores</option>
                                    <option value="0">Unrated</option>
                                    <option value="1">1 Star</option>
                                    <option value="2">2 Stars</option>
                                    <option value="3">3 Stars</option>
                                    <option value="4">4 Stars</option>
                                    <option value="5">5 Stars</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={handleReScan} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2" title="Re-scan for duplicates (ignoring discarded)">
                                <Search className="w-3.5 h-3.5" /> Re-Scan
                            </button>
                            <button onClick={autoResolveDuplicates} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2">
                                <RefreshCcw className="w-3.5 h-3.5" /> Auto-Resolve Dupes
                            </button>
                            <div className="h-4 w-px bg-slate-800 mx-2"></div>
                            {/* Page Size Selector */}
                            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 outline-none">
                                <option value="10">10 / page</option>
                                <option value="25">25 / page</option>
                                <option value="50">50 / page</option>
                                <option value="100">100 / page</option>
                            </select>
                            <div className="h-4 w-px bg-slate-800 mx-2"></div>
                            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-teal-600 text-white' : 'text-slate-500'}`}><List className="w-4 h-4" /></button>
                            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-teal-600 text-white' : 'text-slate-500'}`}><LayoutGrid className="w-4 h-4" /></button>
                        </div>
                    </div>

                    {/* Grid / List */}
                    <div className={`grid gap-4 overflow-y-auto max-h-[600px] pr-2 ${viewMode === 'grid' ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                        {currentItems.map(item => (
                            <div key={item.id} className={`bg-slate-900 border relative group transition-all rounded-xl p-4 flex flex-col gap-3 ${item.isDuplicate ? 'border-amber-500/30' : 'border-slate-800 hover:border-teal-500/30'}`}>
                                {item.isDuplicate && (
                                    <button
                                        onClick={() => toggleDuplicateStatus(item.id)}
                                        className="absolute top-2 right-2 text-amber-500 hover:text-amber-400 transition-colors z-10"
                                        title="Duplicate Detected. Click to unmark."
                                    >
                                        <AlertTriangle className="w-4 h-4" />
                                    </button>
                                )}

                                <div className="flex justify-between items-start">
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <button key={star} onClick={() => setScore(item.id, star)} className="focus:outline-none transition-transform active:scale-90">
                                                <Star className={`w-4 h-4 ${item.score >= star ? 'fill-yellow-400 text-yellow-400' : 'text-slate-700'}`} />
                                            </button>
                                        ))}
                                    </div>
                                    <button onClick={() => toggleDiscard(item.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Query Section */}
                                <div className="flex-1 min-h-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                                            Query
                                            {item.isMultiTurn && <MessageCircle className="w-3 h-3 text-cyan-400" />}
                                        </h4>
                                        <div className="flex items-center gap-1">
                                            {editingField?.itemId === item.id && editingField.field === 'query' ? (
                                                <>
                                                    <button onClick={saveEditing} className="p-1 text-green-400 hover:bg-green-900/30 rounded" title="Save">
                                                        <Check className="w-3 h-3" />
                                                    </button>
                                                    <button onClick={cancelEditing} className="p-1 text-red-400 hover:bg-red-900/30 rounded" title="Cancel">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => startEditing(item.id, 'query', item.query || (item as any).QUERY || item.full_seed || '')} className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded" title="Edit">
                                                        <Edit3 className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleFieldRewrite(item.id, 'query')}
                                                        disabled={rewritingField?.itemId === item.id && rewritingField.field === 'query'}
                                                        className="p-1 text-slate-500 hover:text-teal-400 hover:bg-teal-900/30 rounded disabled:opacity-50"
                                                        title="AI Rewrite"
                                                    >
                                                        {rewritingField?.itemId === item.id && rewritingField.field === 'query' ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <RotateCcw className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {editingField?.itemId === item.id && editingField.field === 'query' ? (
                                        <textarea
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onBlur={saveEditing}
                                            autoFocus
                                            className="w-full bg-slate-900 border border-teal-500 rounded p-2 text-xs text-slate-200 font-medium resize-none min-h-[60px] outline-none"
                                        />
                                    ) : (
                                        <p className="text-xs text-slate-200 line-clamp-2 font-medium">{item.query || (item as any).QUERY || item.full_seed || '(No query)'}</p>
                                    )}
                                </div>

                                {/* Multi-turn Conversation View */}
                                {item.isMultiTurn && item.messages && item.messages.length > 0 ? (
                                    <div className="bg-slate-950/30 p-3 rounded border border-cyan-800/30 my-2">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-[10px] uppercase font-bold text-cyan-500 flex items-center gap-1">
                                                <MessageCircle className="w-3 h-3" /> Conversation ({item.messages.length} messages)
                                            </h4>
                                            <button
                                                onClick={() => toggleConversationExpand(item.id)}
                                                className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-cyan-400 transition-colors uppercase font-bold"
                                            >
                                                {expandedConversations.has(item.id) ? (
                                                    <><Minimize2 className="w-3 h-3" /> Collapse</>
                                                ) : (
                                                    <><Maximize2 className="w-3 h-3" /> Expand</>
                                                )}
                                            </button>
                                        </div>
                                        <div className={expandedConversations.has(item.id) ? '' : 'max-h-48 overflow-y-auto'}>
                                            <ConversationView
                                                messages={item.messages}
                                                onEditStart={(idx, content) => {
                                                    setEditingField({ itemId: item.id, field: 'message', messageIndex: idx, originalValue: content });
                                                    setEditValue(content);
                                                }}
                                                onEditSave={saveEditing}
                                                onEditCancel={cancelEditing}
                                                onEditChange={setEditValue}
                                                onRewrite={(idx) => handleMessageRewrite(item.id, idx)}
                                                editingIndex={editingField?.itemId === item.id && editingField.field === 'message' ? editingField.messageIndex : undefined}
                                                editValue={editValue}
                                                rewritingIndex={rewritingField?.itemId === item.id && rewritingField.field === 'message' ? rewritingField.messageIndex : undefined}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Reasoning Section */}
                                        <div className="bg-slate-950/30 p-2 rounded border border-slate-800/50 my-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <h4 className="text-[10px] uppercase font-bold text-slate-500">Reasoning Trace</h4>
                                                <div className="flex items-center gap-1">
                                                    {editingField?.itemId === item.id && editingField.field === 'reasoning' ? (
                                                        <>
                                                            <button onClick={saveEditing} className="p-1 text-green-400 hover:bg-green-900/30 rounded" title="Save">
                                                                <Check className="w-3 h-3" />
                                                            </button>
                                                            <button onClick={cancelEditing} className="p-1 text-red-400 hover:bg-red-900/30 rounded" title="Cancel">
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => startEditing(item.id, 'reasoning', item.reasoning)} className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded" title="Edit">
                                                                <Edit3 className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleFieldRewrite(item.id, 'reasoning')}
                                                                disabled={rewritingField?.itemId === item.id && rewritingField.field === 'reasoning'}
                                                                className="p-1 text-slate-500 hover:text-teal-400 hover:bg-teal-900/30 rounded disabled:opacity-50"
                                                                title="AI Rewrite"
                                                            >
                                                                {rewritingField?.itemId === item.id && rewritingField.field === 'reasoning' ? (
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                ) : (
                                                                    <RotateCcw className="w-3 h-3" />
                                                                )}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            {editingField?.itemId === item.id && editingField.field === 'reasoning' ? (
                                                <textarea
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onBlur={saveEditing}
                                                    autoFocus
                                                    className="w-full bg-slate-900 border border-teal-500 rounded p-2 text-[10px] text-slate-400 font-mono resize-none min-h-[100px] outline-none"
                                                />
                                            ) : (
                                                <div className="max-h-32 overflow-y-auto text-[10px] text-slate-400 font-mono">
                                                    <ReasoningHighlighter text={item.reasoning} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Answer Section */}
                                        <div className="bg-slate-950/50 p-2 rounded border border-slate-800/50">
                                            <div className="flex items-center justify-between mb-1">
                                                <h4 className="text-[10px] uppercase font-bold text-slate-500">Answer Preview</h4>
                                                <div className="flex items-center gap-1">
                                                    {editingField?.itemId === item.id && editingField.field === 'answer' ? (
                                                        <>
                                                            <button onClick={saveEditing} className="p-1 text-green-400 hover:bg-green-900/30 rounded" title="Save">
                                                                <Check className="w-3 h-3" />
                                                            </button>
                                                            <button onClick={cancelEditing} className="p-1 text-red-400 hover:bg-red-900/30 rounded" title="Cancel">
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => startEditing(item.id, 'answer', item.answer)} className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded" title="Edit">
                                                                <Edit3 className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleFieldRewrite(item.id, 'answer')}
                                                                disabled={rewritingField?.itemId === item.id && rewritingField.field === 'answer'}
                                                                className="p-1 text-slate-500 hover:text-teal-400 hover:bg-teal-900/30 rounded disabled:opacity-50"
                                                                title="AI Rewrite"
                                                            >
                                                                {rewritingField?.itemId === item.id && rewritingField.field === 'answer' ? (
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                ) : (
                                                                    <RotateCcw className="w-3 h-3" />
                                                                )}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            {editingField?.itemId === item.id && editingField.field === 'answer' ? (
                                                <textarea
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onBlur={saveEditing}
                                                    autoFocus
                                                    className="w-full bg-slate-900 border border-teal-500 rounded p-2 text-[10px] text-slate-400 font-mono resize-none min-h-[80px] outline-none"
                                                />
                                            ) : (
                                                <div className="max-h-32 overflow-y-auto">
                                                    <p className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap">{item.answer}</p>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                <div className="flex justify-between items-center text-[10px] text-slate-600 border-t border-slate-800/50 pt-2 mt-1">
                                    <span className="truncate max-w-[150px]">{item.modelUsed}</span>
                                    {item.deepMetadata && <span className="bg-teal-900/20 text-teal-400 px-1.5 py-0.5 rounded">Deep</span>}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-4 mt-2 p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 transition-colors"
                                title="First Page"
                            >
                                <ChevronsLeft className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 transition-colors"
                                title="Previous Page"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>

                            <span className="text-xs font-mono text-slate-400">
                                Page <span className="text-white font-bold">{currentPage}</span> of {totalPages}
                            </span>

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 transition-colors"
                                title="Next Page"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 transition-colors"
                                title="Last Page"
                            >
                                <ChevronsRight className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* EXPORT TAB */}
            {activeTab === 'export' && (
                <div className="flex-1 flex flex-col gap-8 animate-in fade-in max-w-4xl mx-auto w-full">
                    <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-400" /> 1. Select Columns</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {Object.keys(exportColumns).map(col => (
                                <label key={col} className="flex items-center gap-2 cursor-pointer group">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${exportColumns[col] ? 'bg-teal-600 border-teal-600' : 'bg-slate-900 border-slate-700 group-hover:border-slate-500'}`}>
                                        {exportColumns[col] && <ArrowRight className="w-3 h-3 text-white" />}
                                    </div>
                                    <input type="checkbox" checked={exportColumns[col]} onChange={e => setExportColumns(prev => ({ ...prev, [col]: e.target.checked }))} className="hidden" />
                                    <span className="text-xs text-slate-300 font-mono">{col}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Local/DB Actions */}
                        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 flex flex-col justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Database className="w-4 h-4 text-pink-400" /> 2. Save / Download</h3>
                                <p className="text-xs text-slate-500 mb-6">Save the curated dataset to the 'synth_final' collection or download as JSON.</p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <button onClick={handleDbSave} disabled={isUploading} className="bg-pink-600/10 hover:bg-pink-600/20 border border-pink-600/20 text-pink-400 py-2.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2">
                                    {isUploading ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                                    Save to 'synth_final'
                                </button>
                                <button onClick={handleJsonExport} className="bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2">
                                    <FileJson className="w-3.5 h-3.5" />
                                    Download JSON
                                </button>
                            </div>
                        </div>

                        {/* HF Actions */}
                        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 flex flex-col justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Server className="w-4 h-4 text-amber-400" /> 3. Push to HuggingFace</h3>
                                <div className="space-y-3 mt-4">
                                    <input type="text" value={hfRepo} onChange={e => setHfRepo(e.target.value)} placeholder="Repo ID (e.g. user/my-dataset)" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-amber-500 outline-none" />
                                    <input type="password" value={hfToken} onChange={e => setHfToken(e.target.value)} placeholder="HF Token (Write Access)" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-amber-500 outline-none" />

                                    <div className="pt-2">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Format</label>
                                        <div className="flex bg-slate-900 border border-slate-700 rounded overflow-hidden">
                                            <button onClick={() => setHfFormat('jsonl')} className={`flex-1 py-1.5 text-[10px] font-bold ${hfFormat === 'jsonl' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>JSONL</button>
                                            <div className="w-px bg-slate-700"></div>
                                            <button onClick={() => setHfFormat('parquet')} className={`flex-1 py-1.5 text-[10px] font-bold flex items-center justify-center gap-1 ${hfFormat === 'parquet' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                                                <FileType className="w-3 h-3" /> Parquet
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button onClick={handleHfPush} disabled={isUploading} className="mt-4 bg-amber-600/10 hover:bg-amber-600/20 border border-amber-600/20 text-amber-400 py-2.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2">
                                {isUploading ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                Push to Hub
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}