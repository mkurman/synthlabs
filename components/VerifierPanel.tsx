
import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
    Upload, Database, AlertTriangle, AlertCircle, Star, Trash2, CheckCircle2,
    GitBranch, Download, RefreshCcw, Filter, FileJson, ArrowRight,
    ShieldCheck, LayoutGrid, List, Search, Server, Plus,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileType, MessageCircle,
    ChevronUp, ChevronDown, Maximize2, Minimize2, Edit3, RotateCcw, Check, X, Loader2, Settings2, Save,
    Sparkles
} from 'lucide-react';
import { VerifierItem, ExternalProvider } from '../types';
import * as FirebaseService from '../services/firebaseService';
import * as HuggingFaceService from '../services/huggingFaceService';
import * as VerifierRewriterService from '../services/verifierRewriterService';
import * as ExternalApiService from '../services/externalApiService';
import * as GeminiService from '../services/geminiService';
import { SettingsService, AVAILABLE_PROVIDERS } from '../services/settingsService';
import ReasoningHighlighter from './ReasoningHighlighter';
import ConversationView from './ConversationView';
import ChatPanel from './ChatPanel';
import { PromptService } from '../services/promptService';
import { ToolExecutor } from '../services/toolService';
import AutoResizeTextarea from './AutoResizeTextarea';
import { AutoscoreConfig } from '../types';
import { toast } from '../services/toastService';
import { extractJsonFields } from '../utils/jsonFieldExtractor';
import GenerationParamsInput from './GenerationParamsInput';

interface VerifierPanelProps {
    onImportFromDb: () => Promise<void>;
    currentSessionUid: string;
    modelConfig: {
        provider: 'gemini' | 'external';
        externalProvider: ExternalProvider;
        externalModel: string;
        apiKey: string;
        externalApiKey: string;
    };
}

export default function VerifierPanel({ onImportFromDb, currentSessionUid, modelConfig }: VerifierPanelProps) {
    const [data, setData] = useState<VerifierItem[]>([]);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [dataSource, setDataSource] = useState<'file' | 'db' | null>(null);
    const [activeTab, setActiveTab] = useState<'import' | 'review' | 'export'>('import');

    // Import State
    const [importLimit, setImportLimit] = useState<number>(100);
    const [isLimitEnabled, setIsLimitEnabled] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // Chat Panel State
    const [showChat, setShowChat] = useState(false);

    const [availableSessions, setAvailableSessions] = useState<FirebaseService.SavedSession[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);  // Sync orphaned logs state
    const [isCheckingOrphans, setIsCheckingOrphans] = useState(false);  // Loading state for orphan check
    const [orphanedLogsInfo, setOrphanedLogsInfo] = useState<FirebaseService.OrphanedLogsInfo | null>(null);
    const [selectedSessionFilter, setSelectedSessionFilter] = useState<string>('all'); // 'all', 'current', 'custom', or session ID
    const [customSessionId, setCustomSessionId] = useState('');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Expanded conversations state (track by item ID)
    const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());

    const toggleConversationExpand = (id: string) => {
        setExpandedConversations((prev: Set<string>) => {
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
    const [showUnsavedOnly, setShowUnsavedOnly] = useState(false);
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
    const [streamingContent, setStreamingContent] = useState<string>('');  // Real-time streaming content

    // Regenerate Dropdown State
    const [showRegenerateDropdown, setShowRegenerateDropdown] = useState<string | null>(null);

    // Regenerate Dropdown State
    const [showRegenerateDropdown, setShowRegenerateDropdown] = useState<string | null>(null);

    // Rewriter Config State
    const [isRewriterPanelOpen, setIsRewriterPanelOpen] = useState(false);
    const [rewriterConfig, setRewriterConfig] = useState<VerifierRewriterService.RewriterConfig>(() => {
        const settings = SettingsService.getSettings();
        const externalProvider = settings.defaultProvider || 'openrouter';
        return {
            provider: 'external',
            externalProvider: externalProvider as any,
            apiKey: '',
            model: SettingsService.getDefaultModel(externalProvider) || '',
            customBaseUrl: '',
            maxRetries: 3,
            retryDelay: 2000,
            systemPrompt: PromptService.getPrompt('verifier', 'message_rewrite'),
            concurrency: 1,
            delayMs: 0,
            generationParams: SettingsService.getDefaultGenerationParams()
        };
    });
    const [isRewritingAll, setIsRewritingAll] = useState(false);
    const [rewriteProgress, setRewriteProgress] = useState({ current: 0, total: 0 });

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);

    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [itemStates, setItemStates] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
    const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);

    // Autoscore Config State
    const [isAutoscorePanelOpen, setIsAutoscorePanelOpen] = useState(false);
    const [autoscoreConfig, setAutoscoreConfig] = useState<AutoscoreConfig>(() => {
        const settings = SettingsService.getSettings();
        const gpModel = settings.generalPurposeModel;
        return {
            provider: (gpModel?.provider === 'external' ? 'external' : 'gemini') as any,
            externalProvider: (gpModel?.externalProvider || 'openrouter') as any,
            apiKey: '',
            model: gpModel?.model || 'gemini-1.5-pro',
            customBaseUrl: '',
            systemPrompt: PromptService.getPrompt('verifier', 'autoscore'),
            concurrency: 5,
            sleepTime: 0,
            maxRetries: 3,
            retryDelay: 2000,
            generationParams: SettingsService.getDefaultGenerationParams()
        };
    });
    const [isAutoscoring, setIsAutoscoring] = useState(false);
    const [autoscoreProgress, setAutoscoreProgress] = useState({ current: 0, total: 0 });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const toolExecutorRef = useRef<ToolExecutor | null>(null);
    const dataRef = useRef(data);
    const setDataRef = useRef(setData);
    const fetchMoreRef = useRef<any>(null);

    // Sync refs
    useEffect(() => {
        dataRef.current = data;
        setDataRef.current = setData;
    }, [data]);

    // Refs for ToolExecutor content access (must be declared at component level)
    const autoSaveEnabledRef = useRef(autoSaveEnabled);
    const handleDbUpdateRef = useRef<((item: VerifierItem) => Promise<void>) | null>(null);

    // Sync refs on render
    useEffect(() => {
        fetchMoreRef.current = handleFetchMore;
        autoSaveEnabledRef.current = autoSaveEnabled;
        handleDbUpdateRef.current = handleDbUpdate;
    });

    // Initialize ToolExecutor
    useEffect(() => {
        if (!toolExecutorRef.current) {
            toolExecutorRef.current = new ToolExecutor(() => ({
                data: dataRef.current,
                setData: setDataRef.current,
                autoSaveEnabled: autoSaveEnabledRef.current,
                handleDbUpdate: handleDbUpdateRef.current,
                fetchMoreFromDb: async (start: number, end: number) => {
                    if (fetchMoreRef.current) {
                        return fetchMoreRef.current(start, end);
                    }
                    throw new Error("Fetch handler not ready");
                }
            }));
        }
    }, []);

    // Load available sessions when Import tab is active
    useEffect(() => {
        if (activeTab === 'import' && FirebaseService.isFirebaseConfigured()) {
            // Fetch saved sessions only - orphan check is now manual
            FirebaseService.getSessionsFromFirebase()
                .then(setAvailableSessions)
                .catch(console.error);
        }
    }, [activeTab]);

    // Manual orphan check handler
    const handleCheckOrphans = async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error("Firebase not configured.");
            return;
        }
        setIsCheckingOrphans(true);
        setOrphanedLogsInfo(null);  // Clear previous result
        try {
            const result = await FirebaseService.getOrphanedLogsInfo();
            setOrphanedLogsInfo(result);
            if (!result.hasOrphanedLogs) {
                toast.success("No orphaned logs found. All logs are synced!");
            }
        } catch (e: any) {
            toast.error("Check failed: " + e.message);
        } finally {
            setIsCheckingOrphans(false);
        }
    };

    // Reset pagination when filters or data change
    useEffect(() => {
        setCurrentPage(1);
    }, [showDuplicatesOnly, filterScore, showUnsavedOnly, data.length]);

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
            isDiscarded: false,
            hasUnsavedChanges: false
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
                setDataSource('file');
                setActiveTab('review');
            } else {
                toast.error("No valid data found in selected files. Please check the format (JSON Array or JSONL).");
            }
            setIsImporting(false);
        });

        e.target.value = '';
    };

    const handleDbImport = async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error("Firebase not configured.");
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
                    toast.info("Please enter a Session ID.");
                    setIsImporting(false);
                    return;
                }
            } else if (selectedSessionFilter !== 'all') {
                sessionUidToUse = selectedSessionFilter;
            }

            const items = await FirebaseService.fetchAllLogs(limitToUse, sessionUidToUse);
            if (items.length === 0) {
                toast.info("No items found matching criteria.");
            } else {
                analyzeDuplicates(items);
                setData(items);
                setDataSource('db');
                setActiveTab('review');
            }
        } catch (e: any) {
            toast.error("Import failed: " + e.message);
        } finally {
            setIsImporting(false);
        }
    };



    const handleFetchMore = async (start: number, end: number) => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error("Firebase not configured.");
            return;
        }

        setIsImporting(true);
        try {
            // Find the last item to use as cursor
            const lastItem = data[data.length - 1];
            const lastDoc = lastItem?._doc;

            let sessionUidToUse: string | undefined = undefined;
            if (selectedSessionFilter === 'current') {
                sessionUidToUse = currentSessionUid;
            } else if (selectedSessionFilter === 'custom') {
                sessionUidToUse = customSessionId.trim();
            } else if (selectedSessionFilter !== 'all') {
                sessionUidToUse = selectedSessionFilter;
            }

            // Calculate needed items
            // If explicit start/end via tool, we might need logic, but for UI button we usually just fetch 'pageSize' more
            // For tool compatibility: the tool is asking for index X to Y.
            // If we have items up to index Z, and X > Z, we need to fetch.
            // But we can only fetch APPENDING to the end. We cannot invoke random access startAt(X).
            // So we just fetch next batch using fetchLogsAfter with lastDoc.

            const limitToFetch = (end && start) ? (end - start) : (importLimit || 100);

            const newItems = await FirebaseService.fetchLogsAfter({
                limitCount: limitToFetch,
                sessionUid: sessionUidToUse,
                lastDoc: lastDoc
            });

            if (newItems.length === 0) {
                toast.info("No more items to fetch.");
                return;
            }

            // Append to data
            setData(prev => {
                const next = [...prev, ...newItems];
                analyzeDuplicates(next); // Re-analyze duplicates with new data
                return next;
            });
            toast.success(`Fetched ${newItems.length} more items.`);

        } catch (e: any) {
            toast.error("Fetch more failed: " + e.message);
        } finally {
            setIsImporting(false);
        }
    };

    // --- Logic: Sync Orphaned Logs ---

    const handleSyncOrphanedLogs = async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error("Firebase not configured.");
            return;
        }
        setIsSyncing(true);
        try {
            const result = await FirebaseService.syncOrphanedLogsToSessions();
            if (result.sessionsCreated === 0) {
                toast.info("No orphaned logs found. All logs are already connected to sessions.");
            } else {
                toast.success(`Created ${result.sessionsCreated} sessions for ${result.logsAssigned} orphaned logs.`);
            }
            // Refresh session data after sync
            FirebaseService.getSessionsFromFirebase()
                .then(setAvailableSessions)
                .catch(console.error);
            // Re-check for orphaned logs (should now be empty)
            FirebaseService.getOrphanedLogsInfo()
                .then(setOrphanedLogsInfo)
                .catch(console.error);
        } catch (e: any) {
            toast.error("Sync failed: " + e.message);
        } finally {
            setIsSyncing(false);
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
        map.forEach((ids, _key) => {
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
        setData((prev: VerifierItem[]) => {
            const next = prev.map(i => ({ ...i })); // Shallow copy
            analyzeDuplicates(next);

            // Check for changes in duplicate status
            if (next.length === prev.length) {
                for (let i = 0; i < next.length; i++) {
                    if (next[i].isDuplicate !== prev[i].isDuplicate || next[i].duplicateGroupId !== prev[i].duplicateGroupId) {
                        next[i].hasUnsavedChanges = true;
                    }
                }
            }

            return next;
        });
    };

    const toggleDuplicateStatus = (id: string) => {
        setData((prev: VerifierItem[]) => prev.map(item => {
            if (item.id === id) {
                return { ...item, isDuplicate: !item.isDuplicate, hasUnsavedChanges: true };
            }
            return item;
        }));
    };

    const autoResolveDuplicates = () => {
        // For each duplicate group, keep the one with the highest score.
        // If scores tied, keep the longest answer.
        const groups = new Map<string, VerifierItem[]>();

        data.filter((i: VerifierItem) => i.isDuplicate && !i.isDiscarded).forEach((i: VerifierItem) => {
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

        setData((prev: VerifierItem[]) => prev.map(item =>
            idsToDiscard.has(item.id)
                ? { ...item, isDiscarded: true, hasUnsavedChanges: true }
                : item
        ));
    };

    // --- Logic: Review ---

    const setScore = (id: string, score: number) => {
        setData((prev: VerifierItem[]) => prev.map(i => i.id === id ? { ...i, score, hasUnsavedChanges: true } : i));
    };

    const toggleDiscard = (id: string) => {
        setData((prev: VerifierItem[]) => prev.map(i => i.id === id ? { ...i, isDiscarded: !i.isDiscarded, hasUnsavedChanges: true } : i));
    };

    // --- Logic: Export ---

    const getExportData = () => {
        return data.filter((i: VerifierItem) => !i.isDiscarded).map((item: VerifierItem) => {
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
            const itemsToSave = data.filter((i: VerifierItem) => !i.isDiscarded);
            const count = await FirebaseService.saveFinalDataset(itemsToSave, 'synth_verified');
            toast.success(`Saved ${count} items to 'synth_verified' collection.`);
        } catch (e: any) {
            toast.error("DB Save Failed: " + e.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDbUpdate = async (item: VerifierItem) => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error("Firebase not configured.");
            return;
        }

        setItemStates(prev => ({ ...prev, [item.id]: 'saving' }));

        try {
            await FirebaseService.updateLogItem(item.id, {
                query: item.query,
                reasoning: item.reasoning,
                answer: item.answer,
                // Note: 'score' and 'isDiscarded' are verifier-only fields, not part of the raw synth_log schema
            });
            setData(prev => prev.map(i => i.id === item.id ? { ...i, hasUnsavedChanges: false } : i));
            setItemStates(prev => ({ ...prev, [item.id]: 'saved' }));
            setTimeout(() => {
                setItemStates(prev => ({ ...prev, [item.id]: 'idle' }));
            }, 10000);
        } catch (e: any) {
            console.error("Failed to update item:", e);
            toast.error("Update failed: " + e.message);
            setItemStates(prev => ({ ...prev, [item.id]: 'idle' }));
        }
    };

    const handleDbRollback = async (item: VerifierItem) => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error("Firebase not configured.");
            return;
        }

        toast.info("Rolling back from DB...");

        try {
            const freshItem = await FirebaseService.fetchLogItem(item.id);
            if (freshItem) {
                // Preserve local UI flags that aren't in DB
                const restoredItem = {
                    ...freshItem,
                    isDuplicate: item.isDuplicate,        // Keep duplicate status (local analysis)
                    duplicateGroupId: item.duplicateGroupId,
                    hasUnsavedChanges: false
                };

                setData((prev: VerifierItem[]) => prev.map(i => i.id === item.id ? restoredItem : i));
                toast.success("Changes reverted to DB version.");
            } else {
                toast.error("Item not found in DB.");
            }
        } catch (e: any) {
            console.error("Failed to rollback item:", e);
            toast.error("Rollback failed: " + e.message);
        }
    };

    const handleHfPush = async () => {
        if (!hfToken || !hfRepo) {
            toast.info("Please provide HF Token and Repo ID.");
            return;
        }
        setIsUploading(true);
        try {
            const itemsToSave = getExportData();
            const filename = hfFormat === 'parquet' ? 'train.parquet' : 'data.jsonl';
            const url = await HuggingFaceService.uploadToHuggingFace(hfToken, hfRepo, itemsToSave, filename, true, hfFormat);
            toast.success("Successfully pushed to: " + url);
        } catch (e: any) {
            toast.error("HF Push Failed: " + e.message);
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

        let updatedItem: VerifierItem | null = null;

        setData((prev: VerifierItem[]) => prev.map(item => {
            if (item.id === editingField.itemId) {
                let newItem = { ...item };
                if (editingField.field === 'message' && editingField.messageIndex !== undefined && item.messages) {
                    const newMessages = [...item.messages];
                    if (newMessages[editingField.messageIndex]) {
                        // Parse <think> tags to update reasoning field as well
                        const thinkMatch = editValue.match(/<think>([\s\S]*?)<\/think>/);
                        const newReasoning = thinkMatch ? thinkMatch[1].trim() : undefined;

                        newMessages[editingField.messageIndex] = {
                            ...newMessages[editingField.messageIndex],
                            content: editValue,
                            // Update reasoning field to match <think> content, or clear it if no <think> tags
                            reasoning: newReasoning
                        };
                    }
                    newItem = { ...item, messages: newMessages };
                } else if (['query', 'reasoning', 'answer'].includes(editingField.field)) {
                    newItem = { ...item, [editingField.field]: editValue };
                }

                // Mark as unsaved
                newItem.hasUnsavedChanges = true;

                updatedItem = newItem;
                return newItem;
            }
            return item;
        }));

        setEditingField(null);
        setEditValue('');

        if (autoSaveEnabled && dataSource === 'db' && updatedItem) {
            handleDbUpdate(updatedItem);
        }
    };

    // Handler for rewriting user query messages with streaming
    const handleMessageQueryRewrite = async (itemId: string, messageIndex: number) => {
        console.log('handleMessageQueryRewrite called:', { itemId, messageIndex });
        const item = data.find(i => i.id === itemId);
        if (!item || !item.messages || !item.messages[messageIndex]) {
            console.log('Early return: item or message not found');
            return;
        }

        const targetMessage = item.messages[messageIndex];
        if (targetMessage.role !== 'user') {
            console.log('Not a user message, skipping');
            return;
        }

        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error('Please set a default model for ' + rewriterConfig.externalProvider + ' in Settings');
            return;
        }

        setRewritingField({ itemId, field: 'message_query', messageIndex });
        setStreamingContent('');

        try {
            console.log('Calling query rewrite streaming...');
            const systemPrompt = rewriterConfig.systemPrompt || `You are an expert at improving and clarifying user queries. 
Given a user's question or request, rewrite it to be clearer, more specific, and better structured.
Preserve the original intent while improving clarity.
Return ONLY the improved query text.`;

            const userPrompt = `Rewrite and improve this user query:

${targetMessage.content}

IMPORTANT: Respond with a VALID JSON object containing the improved query.

Expected Output Format:
{
  "response": "The improved, clearer version of the query..."
}`;

            // Direct streaming call
            const newValue = await VerifierRewriterService.callRewriterAIStreaming(
                systemPrompt,
                userPrompt,
                rewriterConfig,
                (_chunk, accumulated) => {
                    // Try to extract from JSON if LLM returns JSON
                    const extracted = extractJsonFields(accumulated);
                    if (extracted.answer) {
                        setStreamingContent(extracted.answer);
                    } else {
                        // Fall back to raw content
                        setStreamingContent(accumulated);
                    }
                }
            );
            console.log('Query rewrite result:', newValue);

            // Extract final value from JSON if present
            const extracted = extractJsonFields(newValue);
            // extractJsonFields maps 'response' to 'answer'
            const finalQuery = extracted.answer || newValue.trim();

            const updatedItem = { ...item };
            if (updatedItem.messages) {
                const newMessages = [...updatedItem.messages];
                newMessages[messageIndex] = {
                    ...newMessages[messageIndex],
                    content: finalQuery
                };
                updatedItem.messages = newMessages;
            }



            const finalItem = { ...updatedItem, hasUnsavedChanges: true };
            setData((prev: VerifierItem[]) => {
                return prev.map(i => i.id === itemId ? finalItem : i);
            });

            if (autoSaveEnabled && dataSource === 'db') {
                handleDbUpdate(finalItem);
            }
            toast.success('Query rewritten');
        } catch (error) {
            console.error("Query rewrite failed:", error);
            toast.error("Rewrite failed. See console for details.");
        } finally {
            setRewritingField(null);
            setStreamingContent('');
        }
    };

    const handleMessageRewrite = async (itemId: string, messageIndex: number) => {
        console.log('handleMessageRewrite called:', { itemId, messageIndex });
        const item = data.find(i => i.id === itemId);
        if (!item || !item.messages || !item.messages[messageIndex]) {
            console.log('Early return: item or message not found');
            return;
        }

        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error('Please set a default model for ' + rewriterConfig.externalProvider + ' in Settings');
            return;
        }

        setRewritingField({ itemId, field: 'message', messageIndex });
        setStreamingContent('');  // Clear previous streaming content

        try {
            console.log('Calling rewriteMessageStreaming...');
            const newValue = await VerifierRewriterService.rewriteMessageStreaming(
                {
                    item,
                    messageIndex,
                    config: rewriterConfig,
                    promptSet: SettingsService.getSettings().promptSet
                },
                (_chunk, accumulated) => {
                    // Parse JSON on-the-fly and extract answer field
                    const extracted = extractJsonFields(accumulated);
                    if (extracted.answer) {
                        setStreamingContent(extracted.answer);
                    } else {
                        // Fallback to raw content
                        setStreamingContent(accumulated);
                    }
                }
            );
            console.log('rewriteMessageStreaming result:', newValue);

            // Parse the final result to extract the answer field
            const extracted = extractJsonFields(newValue);
            const finalAnswer = extracted.answer || newValue;

            let updatedItem: VerifierItem | null = null;
            setData((prev: VerifierItem[]) => {
                console.log('Updating data...');
                return prev.map(i => {
                    if (i.id === itemId && i.messages) {
                        console.log('Found target item, updating message:', messageIndex);
                        const newMessages = [...i.messages];

                        // Robustly preserve existing reasoning
                        let existingReasoningBlock = '';
                        const thinkMatch = newMessages[messageIndex].content.match(/<think>([\s\S]*?)<\/think>/);

                        if (thinkMatch) {
                            // Found think tags in content, preserve them
                            existingReasoningBlock = thinkMatch[0];
                        } else if (newMessages[messageIndex].reasoning) {
                            // No tags in content but reasoning field exists, reconstruct it
                            existingReasoningBlock = `<think>${newMessages[messageIndex].reasoning}</think>`;
                        }

                        // Ensure proper spacing
                        const prefix = existingReasoningBlock ? existingReasoningBlock + '\n' : '';

                        newMessages[messageIndex] = {
                            ...newMessages[messageIndex],
                            content: prefix + finalAnswer.trim()
                        };
                        console.log('Updated message:', newMessages[messageIndex]);
                        updatedItem = { ...i, messages: newMessages, hasUnsavedChanges: true };
                        return updatedItem;
                    }
                    return i;
                });
            });
            console.log('Data updated successfully');

            if (autoSaveEnabled && dataSource === 'db' && updatedItem) {
                handleDbUpdate(updatedItem);
            }
        } catch (error) {
            console.error("Rewrite failed:", error);
            toast.error("Rewrite failed. See console for details.");
        } finally {
            setRewritingField(null);
            setStreamingContent('');
        }
    };

    const handleMessageReasoningRewrite = async (itemId: string, messageIndex: number) => {
        console.log('handleMessageReasoningRewrite called:', { itemId, messageIndex });
        const item = data.find(i => i.id === itemId);
        console.log('Found item:', item?.id, item?.messages?.length);
        if (!item || !item.messages || !item.messages[messageIndex]) {
            console.log('Early return: item or message not found');
            return;
        }

        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error('Please set a default model for ' + rewriterConfig.externalProvider + ' in Settings');
            return;
        }

        setRewritingField({ itemId, field: 'message_reasoning', messageIndex });
        setStreamingContent('');  // Clear previous streaming content

        try {
            console.log('Calling rewriteMessageReasoningStreaming...');
            // Use streaming with JSON field extraction for reasoning
            const rawResult = await VerifierRewriterService.rewriteMessageReasoningStreaming(
                {
                    item,
                    messageIndex,
                    config: rewriterConfig,
                    promptSet: SettingsService.getSettings().promptSet
                },
                (_chunk, accumulated) => {
                    // Parse JSON on-the-fly and extract reasoning field
                    const extracted = extractJsonFields(accumulated);
                    if (extracted.reasoning) {
                        setStreamingContent(extracted.reasoning);
                    } else if (extracted.answer) {
                        // Fallback to generic key content (response/text/etc)
                        setStreamingContent(extracted.answer);
                    } else {
                        // Fallback to raw content
                        setStreamingContent(accumulated);
                    }
                }
            );
            console.log('rewriteMessageReasoningStreaming result:', rawResult);

            // Parse the final result to extract reasoning and answer
            const extracted = extractJsonFields(rawResult);
            // Fallback to extracted.answer if reasoning key missing (handles 'response'/'text' keys)
            const finalReasoning = extracted.reasoning || extracted.answer || rawResult;
            // For reasoning only rewrite, we typically preserve the original answer, 
            // unless the model explicitly returned a NEW answer in the answer field (and reasoning field was present)
            // But if we used extracted.answer as reasoning, we should keep original answer.
            const modelGeneratedAnswer = extracted.reasoning && extracted.answer ? extracted.answer : undefined;
            const finalAnswer = modelGeneratedAnswer || item.messages![messageIndex].content.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();

            const updatedItem = { ...item };
            if (updatedItem.messages) {
                const newMessages = [...updatedItem.messages];
                const thinkTag = finalReasoning ? `<think>${finalReasoning}</think>\n` : '';
                newMessages[messageIndex] = {
                    ...newMessages[messageIndex],
                    content: thinkTag + finalAnswer,
                    reasoning: finalReasoning
                };
                updatedItem.messages = newMessages;
            }

            const finalUpdatedItem = { ...updatedItem, hasUnsavedChanges: true };
            setData((prev: VerifierItem[]) => {
                console.log('Updating data...');
                return prev.map(i => i.id === itemId ? finalUpdatedItem : i);
            });
            console.log('Data updated successfully');

            if (autoSaveEnabled && dataSource === 'db') {
                handleDbUpdate(updatedItem);
            }
        } catch (error) {
            console.error("Reasoning rewrite failed:", error);
            toast.error("Rewrite failed. See console for details.");
        } finally {
            setRewritingField(null);
            setStreamingContent('');
        }
    };

    const handleMessageBothRewrite = async (itemId: string, messageIndex: number) => {
        console.log('handleMessageBothRewrite called:', { itemId, messageIndex });
        const item = data.find(i => i.id === itemId);
        if (!item || !item.messages || !item.messages[messageIndex]) {
            console.error('Item or message not found:', { itemId, messageIndex });
            return;
        }

        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error('Please set a default model for ' + rewriterConfig.externalProvider + ' in Settings');
            return;
        }

        setRewritingField({ itemId, field: 'message_both', messageIndex });
        setStreamingContent('');  // Clear previous streaming content

        try {
            // Use streaming to show progress while generating both fields
            // Use specialized streaming function for both fields
            const rawResult = await VerifierRewriterService.rewriteMessageBothStreaming(
                {
                    item,
                    messageIndex,
                    config: rewriterConfig,
                    promptSet: SettingsService.getSettings().promptSet
                },
                (_chunk, accumulated) => {
                    // Parse JSON on-the-fly and show reasoning first, then answer
                    const extracted = extractJsonFields(accumulated);
                    // Show reasoning while it's being generated, then show combined
                    if (extracted.reasoning && !extracted.hasAnswerStart) {
                        setStreamingContent(extracted.reasoning);
                    } else if (extracted.answer) {
                        setStreamingContent(extracted.answer);
                    } else {
                        setStreamingContent(accumulated);
                    }
                }
            );

            console.log('handleMessageBothRewrite streaming result:', rawResult);

            // Parse final result for both fields
            const extracted = extractJsonFields(rawResult);
            const finalReasoning = extracted.reasoning || '';
            const finalAnswer = extracted.answer || rawResult;

            let updatedItem: VerifierItem | null = null;
            setData((prev: VerifierItem[]) => {
                const updated = prev.map(i => {
                    if (i.id === itemId && i.messages) {
                        const newMessages = [...i.messages];
                        const thinkTag = finalReasoning ? `<think>${finalReasoning}</think>\n` : '';
                        newMessages[messageIndex] = {
                            ...newMessages[messageIndex],
                            content: thinkTag + finalAnswer,
                            reasoning: finalReasoning
                        };
                        updatedItem = { ...i, messages: newMessages, hasUnsavedChanges: true };
                        return updatedItem;
                    }
                    return i;
                });
                console.log('Updated data:', updated.find(x => x.id === itemId)?.messages?.[messageIndex]);
                return updated;
            });
            console.log('Data updated successfully');

            if (autoSaveEnabled && dataSource === 'db' && updatedItem) {
                handleDbUpdate(updatedItem);
            }
            toast.success('Regenerated message reasoning and answer');
        } catch (error) {
            console.error("Both rewrite failed:", error);
            toast.error("Rewrite failed. See console for details.");
        } finally {
            setRewritingField(null);
            setStreamingContent('');
        }
    };

    const handleFieldRewrite = async (itemId: string, field: 'query' | 'reasoning' | 'answer') => {
        const item = data.find(i => i.id === itemId);
        if (!item) return;

        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error('Please set a default model for ' + rewriterConfig.externalProvider + ' in Settings');
            return;
        }

        // Ensure query is populated with fallback if empty, to match display logic
        const itemForRewrite = {
            ...item,
            query: item.query || (item as any).QUERY || item.full_seed || ''
        };

        setRewritingField({ itemId, field });
        setStreamingContent('');  // Clear previous streaming content

        try {
            // Use streaming variant for real-time display
            const newValue = await VerifierRewriterService.rewriteFieldStreaming(
                {
                    item: itemForRewrite,
                    field,
                    config: rewriterConfig,
                    promptSet: SettingsService.getSettings().promptSet
                },
                (_chunk, accumulated) => {
                    // Parse JSON on-the-fly and extract only the relevant field
                    const extracted = extractJsonFields(accumulated);

                    // Display the extracted field content based on what we're rewriting
                    if (field === 'reasoning') {
                        setStreamingContent(extracted.reasoning || extracted.answer || accumulated);
                    } else if (field === 'answer') {
                        setStreamingContent(extracted.answer || extracted.reasoning || accumulated);
                    } else if (field === 'query') {
                        setStreamingContent(extracted.answer || accumulated);
                    } else {
                        // Fallback: show raw content if can't extract field
                        setStreamingContent(accumulated);
                    }
                }
            );

            // After streaming completes, save the final value
            const extracted = extractJsonFields(newValue);
            let finalValue = newValue;
            if (field === 'reasoning') {
                finalValue = extracted.reasoning || extracted.answer || newValue;
            } else if (field === 'answer') {
                finalValue = extracted.answer || extracted.reasoning || newValue;
            } else if (field === 'query') {
                finalValue = extracted.answer || newValue;
            }

            const updatedItem = { ...itemForRewrite, [field]: finalValue, hasUnsavedChanges: true };

            setData((prev: VerifierItem[]) => prev.map(i =>
                i.id === itemId
                    ? updatedItem
                    : i
            ));

            if (autoSaveEnabled && dataSource === 'db') {
                handleDbUpdate(updatedItem);
            }
        } catch (err: any) {
            console.error('Rewrite failed:', err);
            toast.error('Rewrite failed: ' + err.message);
        } finally {
            setRewritingField(null);
            setStreamingContent('');
        }
    };

    const handleBothRewrite = async (itemId: string) => {
        const item = data.find(i => i.id === itemId);
        if (!item) return;

        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error('Please set a default model for ' + rewriterConfig.externalProvider + ' in Settings');
            return;
        }

        const itemForRewrite = {
            ...item,
            query: item.query || (item as any).QUERY || item.full_seed || ''
        };

        setRewritingField({ itemId, field: 'both' });
        setStreamingContent('');  // Clear previous streaming content

        try {
            // Use streaming for real-time display
            const rawResult = await VerifierRewriterService.rewriteFieldStreaming(
                {
                    item: itemForRewrite,
                    field: 'reasoning',  // Start with reasoning field prompt
                    config: rewriterConfig,
                    promptSet: SettingsService.getSettings().promptSet
                },
                (_chunk, accumulated) => {
                    // Parse JSON on-the-fly and show reasoning first, then answer
                    const extracted = extractJsonFields(accumulated);
                    if (extracted.reasoning && !extracted.hasAnswerStart) {
                        setStreamingContent(extracted.reasoning);
                    } else if (extracted.answer) {
                        setStreamingContent(extracted.answer);
                    } else {
                        setStreamingContent(accumulated);
                    }
                }
            );

            // Parse final result for both fields
            const extracted = extractJsonFields(rawResult);
            // Robustly handle generic keys, prioritizing specialized fields if present
            const finalReasoning = extracted.reasoning || extracted.answer || rawResult;
            // If extracted.answer was used for reasoning (because answer key was missing/generic), keep original answer
            // Logic: if we have both reasoning AND answer keys, assume answer key is Answer.
            // If we only have answer key (mapped from 'response'), assume it's Reasoning (since we asked for reasoning rewrite primarily).
            const finalAnswer = (extracted.reasoning && extracted.answer) ? extracted.answer : item.answer;

            const updatedItem = { ...item, reasoning: finalReasoning, answer: finalAnswer, hasUnsavedChanges: true };

            setData((prev: VerifierItem[]) => prev.map(i =>
                i.id === itemId
                    ? updatedItem
                    : i
            ));

            if (autoSaveEnabled && dataSource === 'db') {
                handleDbUpdate(updatedItem);
            }
            toast.success('Regenerated reasoning and answer');
        } catch (err: any) {
            console.error('Rewrite both failed:', err);
            toast.error('Rewrite failed: ' + err.message);
        } finally {
            setRewritingField(null);
            setStreamingContent('');
        }
    };

    // --- Logic: Autoscore ---

    const autoscoreSingleItem = async (item: VerifierItem, signal?: AbortSignal): Promise<number> => {
        const { provider, externalProvider, apiKey, model, customBaseUrl, systemPrompt, maxRetries, retryDelay, generationParams } = autoscoreConfig;

        const effectiveApiKey = apiKey || SettingsService.getApiKey(provider === 'external' ? externalProvider : 'gemini');
        const effectiveBaseUrl = customBaseUrl || SettingsService.getCustomBaseUrl();

        const userPrompt = `## ITEM TO SCORE
Query: ${item.query || (item as any).QUERY || item.full_seed || ''}
Reasoning Trace: ${item.reasoning}
Answer: ${item.answer}

---
Based on the criteria above, provide a 1-5 score.`;

        let rawResult: string = '';

        if (provider === 'gemini') {
            const result = await GeminiService.generateReasoningTrace(userPrompt, systemPrompt, {
                maxRetries: maxRetries,
                retryDelay: retryDelay,
                generationParams: generationParams || SettingsService.getDefaultGenerationParams()
            });
            rawResult = result.answer || result.reasoning || String(result);
        } else {
            const result = await ExternalApiService.callExternalApi({
                provider: externalProvider,
                apiKey: effectiveApiKey,
                model: model,
                customBaseUrl: effectiveBaseUrl,
                systemPrompt,
                userPrompt,
                signal,
                maxRetries: maxRetries,
                retryDelay: retryDelay,
                structuredOutput: false,
                generationParams: generationParams || SettingsService.getDefaultGenerationParams()
            });
            rawResult = typeof result === 'string' ? result : JSON.stringify(result);
        }

        // Parse score (1-5)
        const match = rawResult.match(/[1-5]/);
        if (match) {
            return parseInt(match[0]);
        }
        return 0;
    };

    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

    const toggleSelection = (id: string) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedItemIds.size === filteredData.length) {
            setSelectedItemIds(new Set());
        } else {
            setSelectedItemIds(new Set(filteredData.map(i => i.id)));
        }
    };

    const getSelectedItems = () => {
        return filteredData.filter(i => selectedItemIds.has(i.id));
    };

    const handleBulkRewrite = async (mode: 'query' | 'reasoning' | 'answer' | 'both') => {
        const itemsToProcess = getSelectedItems();
        if (itemsToProcess.length === 0) {
            toast.info("No items selected.");
            return;
        }

        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error('Please set a default model for ' + rewriterConfig.externalProvider + ' in Settings');
            return;
        }

        if (!confirm(`Rewrite ${mode.toUpperCase()} for ${itemsToProcess.length} SELECTED items using ${rewriterConfig.model}? This cannot be undone.`)) return;

        setIsRewritingAll(true);
        setRewriteProgress({ current: 0, total: itemsToProcess.length });

        const { concurrency = 1, delayMs = 0 } = rewriterConfig;
        let currentIndex = 0;

        const worker = async () => {
            while (currentIndex < itemsToProcess.length) {
                const myIndex = currentIndex++;
                if (myIndex >= itemsToProcess.length) break;

                const item = itemsToProcess[myIndex];

                // Prepare item with fallbacks
                const itemForRewrite = {
                    ...item,
                    query: item.query || (item as any).QUERY || item.full_seed || ''
                };

                try {
                    if (mode === 'both') {
                        // Both: Use the same strategy as handleBothRewrite (request reasoning, expect both)
                        const rawResult = await VerifierRewriterService.rewriteFieldStreaming(
                            {
                                item: itemForRewrite,
                                field: 'reasoning',
                                config: rewriterConfig,
                                promptSet: SettingsService.getSettings().promptSet
                            },
                            () => { } // No-op for streaming callback in bulk mode
                        );

                        const extracted = extractJsonFields(rawResult);
                        const finalReasoning = extracted.reasoning || extracted.answer || rawResult;
                        const finalAnswer = (extracted.reasoning && extracted.answer) ? extracted.answer : item.answer;

                        setData((prev: VerifierItem[]) => prev.map(i =>
                            i.id === item.id ? { ...i, reasoning: finalReasoning, answer: finalAnswer, hasUnsavedChanges: true } : i
                        ));
                    } else {
                        // Single field: Reasoning or Answer
                        const rawResult = await VerifierRewriterService.rewriteFieldStreaming(
                            {
                                item: itemForRewrite,
                                field: mode,
                                config: rewriterConfig,
                                promptSet: SettingsService.getSettings().promptSet
                            },
                            () => { }
                        );

                        const extracted = extractJsonFields(rawResult);
                        let finalValue = rawResult;
                        if (mode === 'reasoning') {
                            finalValue = extracted.reasoning || extracted.answer || rawResult;
                        } else if (mode === 'answer') {
                            finalValue = extracted.answer || extracted.reasoning || rawResult;
                        } else if (mode === 'query') {
                            // extractJsonFields maps 'response'/'query' keys to 'answer' property
                            finalValue = extracted.answer || rawResult;
                        }

                        // Prepare updated item for state and auto-save
                        const updatedItem = { ...item, [mode]: finalValue, hasUnsavedChanges: true };

                        setData((prev: VerifierItem[]) => prev.map(i =>
                            i.id === item.id ? updatedItem : i
                        ));

                        if (autoSaveEnabled && dataSource === 'db') {
                            handleDbUpdate(updatedItem);
                        }
                    }
                } catch (err) {
                    console.error(`Failed to rewrite item ${item.id}:`, err);
                }

                setRewriteProgress(prev => ({ ...prev, current: prev.current + 1 }));

                if (delayMs > 0 && currentIndex < itemsToProcess.length) {
                    await new Promise(r => setTimeout(r, delayMs));
                }
            }
        };

        const workers = Array.from({ length: Math.min(concurrency, itemsToProcess.length) }, () => worker());
        await Promise.all(workers);

        setIsRewritingAll(false);
        toast.success(`Bulk rewrite (${mode}) of ${itemsToProcess.length} items complete!`);
        // Optional: clear selection?
        // setSelectedItemIds(new Set());
    };

    const handleAutoscoreSelected = async () => {
        const selectedItems = getSelectedItems();
        // Option: Filter only unrated items? Or rescore all selected?
        // User just said "autoscore". Let's assume unrated only to be safe/consistent with "Auto", but maybe warn?
        // Actually, if I select items, I probably want to score them.
        // But the previous "Autoscore All" was specifically "itemsToScore = filteredData.filter(i => i.score === 0)".
        // I will keep ONLY unrated check for now.
        const itemsToScore = selectedItems.filter(i => i.score === 0);

        if (itemsToScore.length === 0) {
            toast.info("No unrated items in selection.");
            return;
        }

        if (!confirm(`Autoscore ${itemsToScore.length} unrated items from selection using ${autoscoreConfig.model}?`)) return;

        setIsAutoscoring(true);
        setAutoscoreProgress({ current: 0, total: itemsToScore.length });

        const { concurrency, sleepTime } = autoscoreConfig;
        let currentIndex = 0;

        const worker = async () => {
            while (currentIndex < itemsToScore.length) {
                const myIndex = currentIndex++;
                if (myIndex >= itemsToScore.length) break;

                const item = itemsToScore[myIndex];
                try {
                    const score = await autoscoreSingleItem(item);
                    if (score > 0) {
                        setData((prev: VerifierItem[]) => prev.map(i => i.id === item.id ? { ...i, score, hasUnsavedChanges: true } : i));
                    }
                } catch (err) {
                    console.error(`Failed to score item ${item.id}:`, err);
                }

                setAutoscoreProgress((prev: { current: number; total: number }) => ({ ...prev, current: prev.current + 1 }));

                if (sleepTime > 0 && currentIndex < itemsToScore.length) {
                    await new Promise(r => setTimeout(r, sleepTime));
                }
            }
        };

        const workers = Array.from({ length: Math.min(concurrency, itemsToScore.length) }, () => worker());
        await Promise.all(workers);

        setIsAutoscoring(false);
        toast.success(`Autoscoring complete! Processed ${itemsToScore.length} items.`);
    };

    const handleBulkDbUpdate = async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error("Firebase not configured.");
            return;
        }

        const itemsToUpdate = getSelectedItems();
        if (itemsToUpdate.length === 0) {
            toast.info("No items selected.");
            return;
        }

        if (!confirm(`Update ${itemsToUpdate.length} items in DB?`)) return;

        setIsBulkUpdating(true);
        let successCount = 0;
        let failCount = 0;

        // Use rewriter batch settings for DB update valid? Or just sequential/parallel?
        // Firebase handles concurrency well usually.
        // Let's do chunks of 10.
        const chunkSize = 10;

        for (let i = 0; i < itemsToUpdate.length; i += chunkSize) {
            const chunk = itemsToUpdate.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (item) => {
                try {
                    await FirebaseService.updateLogItem(item.id, {
                        reasoning: item.reasoning,
                        answer: item.answer,
                        score: item.score,
                        isDuplicate: item.isDuplicate
                    });
                    successCount++;
                } catch (e) {
                    console.error("Update failed", item.id, e);
                    failCount++;
                }
            }));
        }

        if (failCount > 0) {
            toast.warning(`Updated ${successCount} items. Failed: ${failCount}`);
        } else {
            toast.success(`Updated ${successCount} items in DB.`);
        }
        setIsBulkUpdating(false);
    };

    const initiateDelete = (ids: string[]) => {
        setItemsToDelete(ids);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        setIsDeleting(true);
        try {
            await Promise.all(itemsToDelete.map(id => FirebaseService.deleteLogItem(id)));

            // Remove from local state
            setData(prev => prev.filter(item => !itemsToDelete.includes(item.id)));
            // filteredData updates automatically derived from data

            // Clear selection of deleted items
            setSelectedItemIds(prev => {
                const next = new Set(prev);
                itemsToDelete.forEach(id => next.delete(id));
                return next;
            });

            setDeleteModalOpen(false);
            setItemsToDelete([]);
        } catch (e) {
            console.error("Failed to delete items", e);
            alert("Failed to delete items. See console for details.");
        } finally {
            setIsDeleting(false);
        }
    };

    // --- Render Helpers ---

    const filteredData = useMemo(() => {
        return data.filter(item => {
            // If showing unsaved only, allow discarded items if they have changes
            // Otherwise, hide discarded items
            if (item.isDiscarded && !(showUnsavedOnly && item.hasUnsavedChanges)) return false;

            if (showUnsavedOnly && !item.hasUnsavedChanges) return false;
            if (showDuplicatesOnly && !item.isDuplicate) return false;
            if (filterScore !== null && item.score !== filterScore) return false;
            return true;
        });
    }, [data, showDuplicatesOnly, filterScore, showUnsavedOnly]);

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
                                        onChange={e => {
                                            const newProvider = e.target.value as ExternalProvider;
                                            setRewriterConfig(prev => ({
                                                ...prev,
                                                externalProvider: newProvider,
                                                model: prev.model || SettingsService.getDefaultModel(newProvider) || prev.model
                                            }));
                                        }}
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
                                <div className="col-span-1 md:col-span-2 flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Concurrency</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={rewriterConfig.concurrency ?? 1}
                                            onChange={e => setRewriterConfig(prev => ({ ...prev, concurrency: Math.max(1, parseInt(e.target.value) || 1) }))}
                                            className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-teal-500"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Batch Delay (ms)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            value={rewriterConfig.delayMs ?? 0}
                                            onChange={e => setRewriterConfig(prev => ({ ...prev, delayMs: Math.max(0, parseInt(e.target.value) || 0) }))}
                                            className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-teal-500"
                                        />
                                    </div>
                                </div>
                                <div className="col-span-1 md:col-span-4">
                                    <details className="group">
                                        <summary className="flex items-center gap-2 cursor-pointer list-none text-[10px] text-slate-500 font-bold uppercase mb-1 select-none">
                                            <span>System Prompt (optional)</span>
                                            <span className="text-slate-600 group-open:rotate-90 transition-transform">▶</span>
                                        </summary>
                                        <textarea
                                            value={rewriterConfig.systemPrompt || ''}
                                            onChange={e => setRewriterConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                                            placeholder="Leave empty to use default prompt from selected prompt set..."
                                            className="w-full h-32 bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300 rounded px-2 py-1.5 outline-none focus:border-teal-500 resize-y mt-1"
                                            spellCheck={false}
                                        />
                                        <p className="text-[9px] text-slate-600 mt-1">
                                            Custom prompt overrides the verifier rewrite prompts from PromptService
                                        </p>
                                    </details>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Autoscore Settings Panel */}
                    <div className="bg-slate-950/50 rounded-xl border border-slate-800 overflow-hidden mb-4">
                        <button
                            onClick={() => setIsAutoscorePanelOpen(!isAutoscorePanelOpen)}
                            className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                        >
                            <span className="flex items-center gap-2 text-emerald-400">
                                <Star className="w-4 h-4" />
                                AUTOSCORE CONFIG
                            </span>
                            {isAutoscorePanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {isAutoscorePanelOpen && (
                            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-800 pt-4">
                                <div>
                                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Provider</label>
                                    <select
                                        value={autoscoreConfig.provider === 'external' ? autoscoreConfig.externalProvider : 'gemini'}
                                        onChange={e => {
                                            const val = e.target.value;
                                            const isExt = val !== 'gemini';
                                            setAutoscoreConfig(prev => ({
                                                ...prev,
                                                provider: isExt ? 'external' : 'gemini',
                                                externalProvider: isExt ? val as ExternalProvider : prev.externalProvider
                                            }));
                                        }}
                                        className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                    >
                                        <option value="gemini">Gemini</option>
                                        {AVAILABLE_PROVIDERS.map(p => (
                                            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Model</label>
                                    <input
                                        type="text"
                                        value={autoscoreConfig.model}
                                        onChange={e => setAutoscoreConfig(prev => ({ ...prev, model: e.target.value }))}
                                        placeholder="Model name"
                                        className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Concurrency</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={autoscoreConfig.concurrency}
                                        onChange={e => setAutoscoreConfig(prev => ({ ...prev, concurrency: Math.max(1, parseInt(e.target.value) || 1) }))}
                                        className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Sleep (ms)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="100"
                                        value={autoscoreConfig.sleepTime}
                                        onChange={e => setAutoscoreConfig(prev => ({ ...prev, sleepTime: Math.max(0, parseInt(e.target.value) || 0) }))}
                                        className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div className="col-span-1 md:col-span-2 flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Max Retries</label>
                                        <input
                                            type="number"
                                            value={autoscoreConfig.maxRetries}
                                            onChange={e => setAutoscoreConfig(prev => ({ ...prev, maxRetries: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Retry Delay (ms)</label>
                                        <input
                                            type="number"
                                            value={autoscoreConfig.retryDelay}
                                            onChange={e => setAutoscoreConfig(prev => ({ ...prev, retryDelay: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                </div>
                                <div className="col-span-1 md:col-span-4">
                                    <details className="group">
                                        <summary className="flex items-center gap-2 cursor-pointer list-none text-[10px] text-slate-500 font-bold uppercase mb-1 select-none">
                                            <span>Scoring Prompt</span>
                                            <span className="text-slate-600 group-open:rotate-90 transition-transform">▶</span>
                                        </summary>
                                        <textarea
                                            value={autoscoreConfig.systemPrompt}
                                            onChange={e => setAutoscoreConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                                            className="w-full h-32 bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300 rounded px-2 py-1.5 outline-none focus:border-emerald-500 resize-y mt-1"
                                            spellCheck={false}
                                        />
                                    </details>
                                </div>
                                <div className="col-span-1 md:col-span-4 border-t border-slate-800 pt-4">
                                    <GenerationParamsInput
                                        params={autoscoreConfig.generationParams}
                                        onChange={(newParams) => setAutoscoreConfig(prev => ({ ...prev, generationParams: newParams }))}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Toolbar */}
                    {/* Action Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-teal-950/10 border border-teal-900/30 p-3 rounded-xl mb-4">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 border-r border-teal-800/30 pr-4">
                                <input
                                    type="checkbox"
                                    checked={selectedItemIds.size > 0 && selectedItemIds.size === filteredData.length}
                                    ref={input => { if (input) input.indeterminate = selectedItemIds.size > 0 && selectedItemIds.size < filteredData.length; }}
                                    onChange={handleSelectAll}
                                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-offset-slate-900"
                                />
                                <span className="text-xs font-bold text-teal-400">
                                    {selectedItemIds.size} Selected
                                </span>
                            </div>

                            {/* Auto Save Toggle */}
                            {dataSource === 'db' && (
                                <div className="flex items-center gap-2 px-2 py-1 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Auto-Save</span>
                                    <button
                                        onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
                                        className={`w-8 h-4 rounded-full relative transition-colors ${autoSaveEnabled ? 'bg-teal-600' : 'bg-slate-600'}`}
                                        title="Automatically save changes to DB"
                                    >
                                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${autoSaveEnabled ? 'left-4.5 translate-x-0' : 'left-0.5'}`} style={autoSaveEnabled ? { left: '1.125rem' } : {}} ></div>
                                    </button>
                                </div>
                            )}

                            {/* Rewrite Selected Dropdown */}
                            <div className="relative group z-20">
                                <button
                                    onMouseEnter={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={isRewritingAll || selectedItemIds.size === 0}
                                    className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${isRewritingAll ? 'bg-teal-600 text-white' : 'bg-teal-600/10 text-teal-500 hover:bg-teal-600/20'} disabled:opacity-50`}
                                >
                                    {isRewritingAll ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Rewriting {rewriteProgress.current}/{rewriteProgress.total}
                                        </>
                                    ) : (
                                        <>
                                            <Edit3 className="w-3.5 h-3.5" />
                                            Rewrite
                                            <ChevronDown className="w-3 h-3" />
                                        </>
                                    )}
                                </button>
                                {!isRewritingAll && selectedItemIds.size > 0 && (
                                    <div className="hidden group-hover:block absolute top-full left-0 pt-1 w-48 z-50">
                                        <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                                            <button onClick={() => handleBulkRewrite('query')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
                                                Query Only
                                            </button>
                                            <button onClick={() => handleBulkRewrite('reasoning')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
                                                Reasoning Only
                                            </button>
                                            <button onClick={() => handleBulkRewrite('answer')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
                                                Answer Only
                                            </button>
                                            <div className="h-px bg-slate-800 my-1"></div>
                                            <button onClick={() => handleBulkRewrite('both')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 text-teal-400 hover:text-teal-300 font-bold transition-colors">
                                                Rewrite Both
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Autoscore Selected */}
                            <button
                                onClick={handleAutoscoreSelected}
                                disabled={isAutoscoring || selectedItemIds.size === 0}
                                className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${isAutoscoring ? 'bg-emerald-600 text-white' : 'bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20'} disabled:opacity-50`}
                            >
                                {isAutoscoring ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Scoring {autoscoreProgress.current}/{autoscoreProgress.total}
                                    </>
                                ) : (
                                    <>
                                        <Star className="w-3.5 h-3.5" />
                                        Autoscore
                                    </>
                                )}
                            </button>

                            {/* Update DB */}
                            {dataSource === 'db' && (
                                <>
                                    <button
                                        onClick={handleBulkDbUpdate}
                                        disabled={selectedItemIds.size === 0 || isBulkUpdating}
                                        className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                                    >
                                        {isBulkUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        {isBulkUpdating ? 'Updating...' : 'Update DB'}
                                    </button>
                                    <button
                                        onClick={() => initiateDelete(Array.from(selectedItemIds))}
                                        disabled={selectedItemIds.size === 0}
                                        className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-red-900/50 transition-colors disabled:opacity-50"
                                        title="Permanently Delete Selected from DB"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Filter Main Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-slate-400 uppercase tracking-wide px-2 border-r border-slate-800">{filteredData.length} Items</span>

                            <button onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)} className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${showDuplicatesOnly ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-white'}`}>
                                <GitBranch className="w-3.5 h-3.5" /> Duplicates
                            </button>

                            <button onClick={() => setShowUnsavedOnly(!showUnsavedOnly)} className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${showUnsavedOnly ? 'bg-orange-500/20 text-orange-400' : 'text-slate-500 hover:text-white'}`}>
                                <AlertCircle className="w-3.5 h-3.5" /> Unsaved
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
                            <button
                                onClick={() => setShowChat(!showChat)}
                                className={`p-1.5 rounded transition-colors ${showChat ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-purple-400'}`}
                                title="Toggle AI Assistant"
                            >
                                <Sparkles className="w-4 h-4" />
                            </button>
                            <div className="h-4 w-px bg-slate-800 mx-2"></div>
                            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-teal-600 text-white' : 'text-slate-500'}`}><List className="w-4 h-4" /></button>
                            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-teal-600 text-white' : 'text-slate-500'}`}><LayoutGrid className="w-4 h-4" /></button>
                        </div>
                    </div>

                    {/* Content Area with Chat Split View */}
                    {/* Content Area with Chat Split View */}
                    <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            <div className={`flex-1 overflow-y-auto pr-2 grid gap-4 ${viewMode === 'grid' ? 'grid-cols-2 lg:grid-cols-3 content-start' : 'grid-cols-1 content-start'}`}>

                                {currentItems.map(item => (
                                    <div key={item.id} className={`bg-slate-900 border relative group transition-all rounded-xl p-4 flex flex-col gap-3 ${item.hasUnsavedChanges
                                        ? 'border-orange-500/80 shadow-[0_0_15px_-3px_rgba(249,115,22,0.3)]'
                                        : item.isDuplicate
                                            ? 'border-amber-500/30'
                                            : 'border-slate-800 hover:border-teal-500/30'
                                        }`}>

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
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedItemIds.has(item.id)}
                                                    onChange={() => toggleSelection(item.id)}
                                                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-teal-600 focus:ring-offset-slate-900 cursor-pointer"
                                                />
                                                <span className="text-[10px] font-mono text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/50" title="Index in dataset (0-based)">
                                                    #{data.indexOf(item)}
                                                </span>
                                                <div className="flex gap-1">
                                                    {[1, 2, 3, 4, 5].map(star => (
                                                        <button key={star} onClick={() => setScore(item.id, star)} className="focus:outline-none transition-transform active:scale-90">
                                                            <Star className={`w-4 h-4 ${item.score >= star ? 'fill-yellow-400 text-yellow-400' : 'text-slate-700'}`} />
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                {dataSource === 'db' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleDbUpdate(item)}
                                                            disabled={itemStates[item.id] === 'saving'}
                                                            className={`transition-colors ${itemStates[item.id] === 'saved' ? 'text-emerald-500' : 'text-slate-600 hover:text-teal-400'}`}
                                                            title={itemStates[item.id] === 'saved' ? "Saved!" : "Update in DB"}
                                                        >
                                                            {itemStates[item.id] === 'saving' ? (
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                            ) : itemStates[item.id] === 'saved' ? (
                                                                <Check className="w-4 h-4 animate-in zoom-in spin-in-180" />
                                                            ) : (
                                                                <Save className="w-4 h-4" />
                                                            )}
                                                        </button>
                                                        <button onClick={() => handleDbRollback(item)} className="text-slate-600 hover:text-amber-400 transition-colors" title="Discard Changes (Reload from DB)">
                                                            <RotateCcw className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => initiateDelete([item.id])} className="text-slate-600 hover:text-red-500 transition-colors" title="Permanently Delete from DB">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                                {dataSource !== 'db' && (
                                                    <button onClick={() => toggleDiscard(item.id)} className="text-slate-600 hover:text-red-400 transition-colors" title="Remove from list">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
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
                                                            </div>
                                                            {showRegenerateDropdown === item.id && (
                                                                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); }} />
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            {editingField?.itemId === item.id && editingField.field === 'query' ? (
                                                <AutoResizeTextarea
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onBlur={saveEditing}
                                                    autoFocus
                                                    className="w-full bg-slate-900 border border-teal-500/50 rounded p-2 text-inherit outline-none min-h-[60px]"
                                                    placeholder="Enter query..."
                                                />
                                            ) : (<p className="text-xs text-slate-200 line-clamp-2 font-medium">{item.query || (item as any).QUERY || item.full_seed || '(No query)'}</p>
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
                                                        onRewriteReasoning={(idx) => handleMessageReasoningRewrite(item.id, idx)}
                                                        onRewriteBoth={(idx) => handleMessageBothRewrite(item.id, idx)}
                                                        onRewriteQuery={(idx) => handleMessageQueryRewrite(item.id, idx)}
                                                        editingIndex={editingField?.itemId === item.id && editingField.field === 'message' ? editingField.messageIndex : undefined}
                                                        editValue={editValue}
                                                        rewritingIndex={
                                                            rewritingField?.itemId === item.id &&
                                                                (rewritingField.field === 'message' || rewritingField.field === 'message_reasoning' || rewritingField.field === 'message_both' || rewritingField.field === 'message_query')
                                                                ? rewritingField.messageIndex
                                                                : undefined
                                                        }
                                                        streamingContent={rewritingField?.itemId === item.id ? streamingContent : undefined}
                                                        streamingField={
                                                            rewritingField?.field === 'message_reasoning' ? 'reasoning' :
                                                                rewritingField?.field === 'message' ? 'answer' :
                                                                    rewritingField?.field === 'message_both' ? 'both' :
                                                                        rewritingField?.field === 'message_query' ? 'query' : undefined
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Reasoning Section */}
                                                <div className="bg-slate-950/30 p-2 rounded border border-slate-800/50 my-2">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <h4 className="text-[10px] uppercase font-bold text-slate-500">Reasoning Trace</h4>
                                                        <div className="flex items-center gap-1 relative">
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
                                                                    <div className="relative">
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(showRegenerateDropdown === item.id ? null : item.id); }}
                                                                            disabled={rewritingField?.itemId === item.id}
                                                                            className="p-1 text-slate-500 hover:text-teal-400 hover:bg-teal-900/30 rounded disabled:opacity-50"
                                                                            title="AI Regenerate"
                                                                        >
                                                                            {rewritingField?.itemId === item.id ? (
                                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                                            ) : (
                                                                                <Sparkles className="w-3 h-3" />
                                                                            )}
                                                                        </button>
                                                                        {showRegenerateDropdown === item.id && (
                                                                            <div
                                                                                className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1 min-w-[140px]"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); handleFieldRewrite(item.id, 'reasoning'); }}
                                                                                    className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                                                                >
                                                                                    <RotateCcw className="w-3 h-3" /> Reasoning Only
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); handleFieldRewrite(item.id, 'answer'); }}
                                                                                    className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                                                                >
                                                                                    <RotateCcw className="w-3 h-3" /> Answer Only
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); handleBothRewrite(item.id); }}
                                                                                    className="w-full px-3 py-2 text-left text-xs text-teal-400 hover:bg-slate-700 flex items-center gap-2 border-t border-slate-700"
                                                                                >
                                                                                    <Sparkles className="w-3 h-3" /> Both Together
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {showRegenerateDropdown === item.id && (
                                                                        <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); }} />
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {editingField?.itemId === item.id && editingField.field === 'reasoning' ? (
                                                        <AutoResizeTextarea
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            onBlur={saveEditing}
                                                            autoFocus
                                                            className="w-full bg-slate-900 border border-teal-500/50 rounded p-2 text-inherit outline-none min-h-[100px] font-mono text-xs"
                                                        />
                                                    ) : (rewritingField?.itemId === item.id && rewritingField.field === 'reasoning' && streamingContent ? (
                                                        <div className="max-h-32 overflow-y-auto text-[10px] text-teal-300 font-mono animate-pulse">
                                                            {streamingContent}
                                                            <span className="inline-block w-2 h-3 bg-teal-400 ml-0.5 animate-pulse" />
                                                        </div>
                                                    ) : (
                                                        <div className="max-h-32 overflow-y-auto text-[10px] text-slate-400 font-mono">
                                                            <ReasoningHighlighter text={item.reasoning} />
                                                        </div>
                                                    ))}
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
                                                                <button onClick={() => startEditing(item.id, 'answer', item.answer)} className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded" title="Edit">
                                                                    <Edit3 className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {editingField?.itemId === item.id && editingField.field === 'answer' ? (
                                                        <AutoResizeTextarea
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            onBlur={saveEditing}
                                                            autoFocus
                                                            className="w-full bg-slate-900 border border-teal-500/50 rounded p-2 text-inherit outline-none min-h-[80px]"
                                                        />
                                                    ) : rewritingField?.itemId === item.id && rewritingField.field === 'answer' && streamingContent ? (
                                                        <div className="max-h-32 overflow-y-auto">
                                                            <p className="text-[10px] text-teal-300 font-mono whitespace-pre-wrap animate-pulse">
                                                                {streamingContent}
                                                                <span className="inline-block w-2 h-3 bg-teal-400 ml-0.5 animate-pulse" />
                                                            </p>
                                                        </div>
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


                            {/* Fetch More Button for DB */}
                            {dataSource === 'db' && (
                                <div className="flex justify-center p-4 mt-2 border-t border-slate-800 bg-slate-900/50 rounded-xl">
                                    <button
                                        onClick={() => handleFetchMore(0, 0)}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
                                        disabled={isImporting}
                                    >
                                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                        <span>Fetch More Rows</span>
                                    </button>
                                </div>
                            )}

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
                        {showChat && (
                            <div className="w-[400px] shrink-0 h-full border-l border-slate-800/50 pl-4">
                                <ChatPanel data={data} setData={setData} modelConfig={modelConfig} toolExecutor={toolExecutorRef.current || undefined} />
                            </div>
                        )}
                    </div>
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
                                    Save to 'synth_verified'
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

            {/* Delete Confirmation Modal */}
            {deleteModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl max-w-md w-full mx-4">
                        <div className="flex items-center gap-3 mb-4 text-red-500">
                            <div className="p-3 bg-red-500/10 rounded-full">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-white">Delete from Database?</h3>
                        </div>

                        <p className="text-slate-300 mb-6">
                            Are you sure you want to permanently delete <span className="font-bold text-white">{itemsToDelete.length}</span> item{itemsToDelete.length !== 1 ? 's' : ''}?
                            <br /><br />
                            This action cannot be undone.
                        </p>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteModalOpen(false)}
                                className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}