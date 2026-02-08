
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { VerifierItem, ExternalProvider, ProviderType } from '../../../types';
import { OutputFieldName, StreamingField, VerifierRewriteTarget } from '../../../interfaces/enums';
import { VerifierPanelTab } from '../../../interfaces/enums/VerifierPanelTab';
import { VerifierViewMode } from '../../../interfaces/enums/VerifierViewMode';
import { VerifierDataSource } from '../../../interfaces/enums/VerifierDataSource';
import * as FirebaseService from '../../../services/firebaseService';
import * as VerifierRewriterService from '../../../services/verifierRewriterService';
import { SettingsService } from '../../../services/settingsService';
import { ToolExecutor } from '../../../services/toolService';
import type { AutoscoreConfig } from '../../../types';
import { toast } from '../../../services/toastService';
import { confirmService } from '../../../services/confirmService';
import { useVerifierToolExecutor } from '../../../hooks/useVerifierToolExecutor';
import { useVerifierSessions } from '../../../hooks/useVerifierSessions';
import { useVerifierOrphans } from '../../../hooks/useVerifierOrphans';
import { useVerifierExportColumns } from '../../../hooks/useVerifierExportColumns';
import { useVerifierImport } from '../../../hooks/useVerifierImport';
import { useVerifierDbImport } from '../../../hooks/useVerifierDbImport';
import { useVerifierPaginationReset } from '../../../hooks/useVerifierPaginationReset';
import { useVerifierDeduplication } from '../../../hooks/useVerifierDeduplication';
import { useVerifierReviewActions } from '../../../hooks/useVerifierReviewActions';
import { useVerifierExportActions } from '../../../hooks/useVerifierExportActions';
import { useVerifierDbActions } from '../../../hooks/useVerifierDbActions';
import { useVerifierInlineEditing } from '../../../hooks/useVerifierInlineEditing';
import { useHuggingFaceData } from '../../../hooks/useHuggingFaceData';
import { useVerifierHfImport } from '../../../hooks/useVerifierHfImport';
import { normalizeImportItem } from '../../../services/verifierImportService';
import { normalizeItemsReasoning } from '../../../utils/messageNormalizer';
import ImportTab from '../ImportTab';
import ExportTab from '../ExportTab';
import type { SessionData } from '../../../interfaces';
import { DetailPanel } from '../DetailPanel';
import VerifierTabNavigation from '../navigation/VerifierTabNavigation';
import VerifierSessionStatusActions from '../status/VerifierSessionStatusActions';
import VerifierDeleteItemsModal from '../modals/VerifierDeleteItemsModal';
import VerifierAssistantPortal from '../review/VerifierAssistantPortal';
import VerifierReviewConfigPanels from '../review/VerifierReviewConfigPanels';
import VerifierReviewToolbar from '../review/VerifierReviewToolbar';
import VerifierReviewContent from '../review/VerifierReviewContent';
import { useVerifierMessageRewriteActions } from './hooks/useVerifierMessageRewriteActions';
import { useVerifierBulkActions } from './hooks/useVerifierBulkActions';
import { useVerifierSessionStatusActions } from './hooks/useVerifierSessionStatusActions';
import { useVerifierReviewViewState } from './hooks/useVerifierReviewViewState';

interface VerifierPanelProps {
    currentSessionUid: string;
    modelConfig: {
        provider: ProviderType;
        externalProvider: ExternalProvider;
        externalModel: string;
        apiKey: string;
        externalApiKey: string;
    };
    chatOpen?: boolean;
    onChatToggle?: (open: boolean) => void;
    onSessionSelect: (session: SessionData) => Promise<void>;
    onJobCreated?: (jobId: string, type: string) => void;
    refreshTrigger?: number;
}

export default function VerifierPanel({ currentSessionUid, modelConfig, chatOpen, onChatToggle, onSessionSelect, onJobCreated, refreshTrigger }: VerifierPanelProps) {
    const [data, _setData] = useState<VerifierItem[]>([]);
    
    // Wrapped setData that normalizes reasoning from think tags
    const setData = useCallback((items: VerifierItem[] | ((prev: VerifierItem[]) => VerifierItem[])) => {
        if (typeof items === 'function') {
            _setData(prev => normalizeItemsReasoning(items(prev)));
        } else {
            _setData(normalizeItemsReasoning(items));
        }
    }, []);
    
    const [viewMode, setViewMode] = useState<VerifierViewMode>(VerifierViewMode.List);
    const [dataSource, setDataSource] = useState<VerifierDataSource | null>(null);
    const [activeTab, setActiveTab] = useState<VerifierPanelTab>(VerifierPanelTab.Import);
    const isImportReady = dataSource !== null;

    // Import State
    const [importLimit, setImportLimit] = useState<number>(100);
    const [isLimitEnabled, setIsLimitEnabled] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [hfRowsToFetch, setHfRowsToFetch] = useState<number>(100);
    const [hfSkipRows, setHfSkipRows] = useState<number>(0);
    const [hfImportError, setHfImportError] = useState<string | null>(null);

    // Chat Panel State
    const [showChat, setShowChat] = useState(true);

    const [availableSessions, setAvailableSessions] = useState<SessionData[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);  // Sync orphaned logs state
    const [isCheckingOrphans, setIsCheckingOrphans] = useState(false);  // Loading state for orphan check
    const [orphanedLogsInfo, setOrphanedLogsInfo] = useState<FirebaseService.OrphanedLogsInfo | null>(null);
    const [orphanScanProgress, setOrphanScanProgress] = useState<FirebaseService.OrphanScanProgress | null>(null);
    const [orphanSyncProgress, setOrphanSyncProgress] = useState<FirebaseService.OrphanSyncProgress | null>(null);
    const [selectedSessionFilter, setSelectedSessionFilter] = useState<string>('all'); // 'all', 'current', 'custom', or session ID
    const [customSessionId, setCustomSessionId] = useState('');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Expanded conversations state (track by item ID)
    const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());
    
    // Expanded items state for inline expansion
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    
    // Detail panel state
    const [detailItem, setDetailItem] = useState<VerifierItem | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [detailSaving, setDetailSaving] = useState(false);
    
    // Sync detailItem with current data when panel is open and data changes
    useEffect(() => {
        if (isDetailOpen && detailItem) {
            const updatedItem = data.find(i => i.id === detailItem.id);
            if (updatedItem) {
                console.log('[VerifierPanel] Sync effect - updating detailItem from data:', updatedItem.id);
                console.log('[VerifierPanel] Sync effect - query:', updatedItem.query?.substring(0, 50));
                setDetailItem(updatedItem);
            }
        }
    }, [data, isDetailOpen, detailItem?.id]);
    
    // Keyboard navigation state
    const [focusedItemIndex, setFocusedItemIndex] = useState<number>(-1);
    const itemRefs = useRef<Record<string, HTMLDivElement>>({});

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
    
    const toggleItemExpand = (id: string) => {
        setExpandedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    
    const openDetailPanel = (item: VerifierItem) => {
        setDetailItem(item);
        setIsDetailOpen(true);
    };
    
    const closeDetailPanel = () => {
        setIsDetailOpen(false);
        setDetailItem(null);
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
    const [editingField, setEditingField] = useState<{ itemId: string; field: OutputFieldName.Query | OutputFieldName.Reasoning | OutputFieldName.Answer | VerifierRewriteTarget.MessageAnswer; messageIndex?: number; originalValue: string } | null>(null);
    const [editValue, setEditValue] = useState('');
    const [rewritingField, setRewritingField] = useState<{ itemId: string; field: VerifierRewriteTarget; messageIndex?: number } | null>(null);
    const [streamingContent, setStreamingContent] = useState<string>('');  // Real-time streaming content
    const [messageRewriteStates, setMessageRewriteStates] = useState<Record<string, { field: VerifierRewriteTarget; content: string; reasoningContent?: string }>>({});
    const messageRewriteAbortControllers = useRef<Record<string, AbortController>>({});

    // Regenerate Dropdown State
    const [showRegenerateDropdown, setShowRegenerateDropdown] = useState<string | null>(null);

    const getMessageRewriteKey = useCallback((itemId: string, messageIndex: number) => `${itemId}:${messageIndex}`, []);
    const setMessageRewriteStart = useCallback((itemId: string, messageIndex: number, field: VerifierRewriteTarget) => {
        const key = getMessageRewriteKey(itemId, messageIndex);
        setMessageRewriteStates(prev => ({ ...prev, [key]: { field, content: '', reasoningContent: '' } }));
    }, [getMessageRewriteKey]);
    const setMessageRewriteContent = useCallback((itemId: string, messageIndex: number, content: string) => {
        const key = getMessageRewriteKey(itemId, messageIndex);
        setMessageRewriteStates(prev => {
            const existing = prev[key];
            if (!existing) return prev;
            return { ...prev, [key]: { ...existing, content } };
        });
    }, [getMessageRewriteKey]);
    const setMessageRewriteBothContent = useCallback((itemId: string, messageIndex: number, reasoningContent: string, content: string) => {
        const key = getMessageRewriteKey(itemId, messageIndex);
        setMessageRewriteStates(prev => {
            const existing = prev[key];
            if (!existing) return prev;
            return { ...prev, [key]: { ...existing, content, reasoningContent } };
        });
    }, [getMessageRewriteKey]);
    const clearMessageRewriteState = useCallback((itemId: string, messageIndex: number) => {
        const key = getMessageRewriteKey(itemId, messageIndex);
        delete messageRewriteAbortControllers.current[key];
        setMessageRewriteStates(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, [getMessageRewriteKey]);
    const cancelMessageRewrite = useCallback((itemId: string, messageIndex: number) => {
        const key = getMessageRewriteKey(itemId, messageIndex);
        const controller = messageRewriteAbortControllers.current[key];
        if (controller) {
            controller.abort();
        }
        clearMessageRewriteState(itemId, messageIndex);
    }, [getMessageRewriteKey, clearMessageRewriteState]);
    const toStreamingField = useCallback((field: VerifierRewriteTarget | undefined): StreamingField | undefined => {
        if (field === VerifierRewriteTarget.MessageReasoning || field === VerifierRewriteTarget.Reasoning) return StreamingField.Reasoning;
        if (field === VerifierRewriteTarget.MessageAnswer || field === VerifierRewriteTarget.Answer) return StreamingField.Answer;
        if (field === VerifierRewriteTarget.MessageBoth || field === VerifierRewriteTarget.Both) return StreamingField.Both;
        if (field === VerifierRewriteTarget.MessageQuery || field === VerifierRewriteTarget.Query) return StreamingField.Query;
        return undefined;
    }, []);
    
    // Helper to check if currently rewriting a specific field for an item
    const isRewritingThis = (itemId: string, field: VerifierRewriteTarget): boolean => {
        return rewritingField?.itemId === itemId && rewritingField?.field === field;
    };

    // Rewriter Config State
    const [isRewriterPanelOpen, setIsRewriterPanelOpen] = useState(false);
    const [rewriterConfig, setRewriterConfig] = useState<VerifierRewriterService.RewriterConfig>(() => {
        const settings = SettingsService.getSettings();
        const externalProvider = settings.defaultProvider || ExternalProvider.OpenRouter;
        // Only use custom base URL for 'other' provider - other providers have their own URLs in PROVIDERS constant
        const customBaseUrl = externalProvider === ExternalProvider.Other
            ? (SettingsService.getCustomBaseUrl() || '')
            : '';
        return {
            provider: ProviderType.External,
            externalProvider: externalProvider as ExternalProvider,
            apiKey: '',
            model: SettingsService.getDefaultModel(externalProvider) || '',
            customBaseUrl,
            maxRetries: 3,
            retryDelay: 2000,
            promptCategory: 'verifier', promptRole: 'message_rewrite',
            concurrency: 1,
            delayMs: 0,
            generationParams: SettingsService.getDefaultGenerationParams()
        };
    });
    const [itemStates, setItemStates] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
    const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);

    // Autoscore Config State
    const [isAutoscorePanelOpen, setIsAutoscorePanelOpen] = useState(false);
    const getInitialAutoscoreConfig = () => {
        const settings = SettingsService.getSettings();
        const gpModel = settings.generalPurposeModel;
        const externalProvider = (gpModel?.externalProvider || ExternalProvider.OpenRouter) as ExternalProvider;
        const provider = ProviderType.External;
        const keyProvider = (externalProvider as ExternalProvider);
        const apiKey = SettingsService.getApiKey(keyProvider) || '';
        // Only use custom base URL for 'other' provider - other providers have their own URLs in PROVIDERS constant
        const customBaseUrl = externalProvider === ExternalProvider.Other
            ? (SettingsService.getCustomBaseUrl() || '')
            : '';
        const model = gpModel?.model
            || SettingsService.getDefaultModel(keyProvider)
            || 'deepseek/deepseek-v3.2';

        return {
            provider,
            externalProvider,
            apiKey,
            model,
            customBaseUrl,
            promptCategory: 'verifier', promptRole: 'autoscore',
            concurrency: 5,
            sleepTime: 0,
            maxRetries: 3,
            retryDelay: 2000,
            generationParams: SettingsService.getDefaultGenerationParams()
        };
    };
    const getInitialRewriterConfig = () => {
        const settings = SettingsService.getSettings();
        const gpModel = settings.generalPurposeModel;
        const externalProvider = (gpModel?.externalProvider || ExternalProvider.OpenRouter) as ExternalProvider;
        const provider = ProviderType.External;
        const keyProvider = (externalProvider as ExternalProvider);
        const apiKey = SettingsService.getApiKey(keyProvider) || '';
        // Only use custom base URL for 'other' provider - other providers have their own URLs in PROVIDERS constant
        const customBaseUrl = externalProvider === ExternalProvider.Other
            ? (SettingsService.getCustomBaseUrl() || '')
            : '';
        const model = gpModel?.model
            || SettingsService.getDefaultModel(keyProvider)
            || 'deepseek/deepseek-v3.2';
        return {
            provider,
            externalProvider,
            apiKey,
            model,
            customBaseUrl,
            promptCategory: 'verifier', promptRole: 'rewriter',
            concurrency: 5,
            sleepTime: 0,
            maxRetries: 3,
            retryDelay: 2000,
            generationParams: SettingsService.getDefaultGenerationParams()
        };
    };

    const [autoscoreConfig, setAutoscoreConfig] = useState<AutoscoreConfig>(getInitialAutoscoreConfig);
    const [autoscoreBaseUrlDraft, setAutoscoreBaseUrlDraft] = useState<string>(() => {
        return getInitialAutoscoreConfig().customBaseUrl || '';
    });
    const [rewriterBaseUrlDraft, setRewriterBaseUrlDraft] = useState<string>(() => {
        return getInitialRewriterConfig().customBaseUrl || '';
    });
    const [autoscoreModelRefreshTick, setAutoscoreModelRefreshTick] = useState(0);
    const [rewriterModelRefreshTick, setRewriterModelRefreshTick] = useState(0);
    useEffect(() => {
        setAutoscoreBaseUrlDraft(autoscoreConfig.customBaseUrl || '');
    }, [autoscoreConfig.customBaseUrl]);
    const {
        hfConfig,
        setHfConfig,
        hfStructure,
        hfSearchResults,
        isSearchingHF,
        showHFResults,
        setShowHFResults,
        availableColumns,
        detectedColumns,
        isPrefetching,
        hfPreviewData,
        hfTotalRows,
        isLoadingHfPreview,
        prefetchColumns,
        handleHFSearch,
        handleSelectHFDataset,
        handleConfigChange,
        handleSplitChange
    } = useHuggingFaceData(setHfImportError);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const toolExecutorRef = useRef<ToolExecutor | null>(null);
    const reviewScrollRef = useRef<HTMLDivElement>(null);
    const verifierRootRef = useRef<HTMLDivElement>(null);
    const [isUpdatingSessionStatus, setIsUpdatingSessionStatus] = useState(false);
    const isFetchingMoreRef = useRef(false);

    const { analyzeDuplicates, handleReScan, toggleDuplicateStatus, autoResolveDuplicates } = useVerifierDeduplication({
        data,
        setData
    });

    const { handleDbUpdate, handleDbRollback } = useVerifierDbActions({
        setItemStates,
        setData,
        toast
    });

    const { handleJsonExport, handleDbSave, handleHfPush } = useVerifierExportActions({
        data,
        exportColumns,
        setIsUploading,
        hfToken,
        hfRepo,
        hfFormat,
        toast
    });

    const { startEditing, cancelEditing, saveEditing } = useVerifierInlineEditing({
        data,
        editingField,
        editValue,
        setEditingField,
        setEditValue,
        setData,
        autoSaveEnabled,
        dataSource,
        handleDbUpdate
    });

    // Handle detail panel save
    const handleDetailSave = useCallback(async (item: VerifierItem, updates: Partial<VerifierItem>) => {
        setDetailSaving(true);
        try {
            const updatedItem = { ...item, ...updates, hasUnsavedChanges: true };
            console.log('[VerifierPanel] handleDetailSave - updating item:', item.id, 'updates:', Object.keys(updates));
            console.log('[VerifierPanel] old query:', item.query?.substring(0, 50));
            console.log('[VerifierPanel] new query:', updatedItem.query?.substring(0, 50));
            setData(prev => prev.map(i => i.id === item.id ? updatedItem : i));
            
            if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
                await handleDbUpdate(updatedItem);
            }
            
            // Update detail item reference
            setDetailItem(updatedItem);
        } finally {
            setDetailSaving(false);
        }
    }, [autoSaveEnabled, dataSource, handleDbUpdate]);

    const { handleDbImport, handleFetchMore } = useVerifierDbImport({
        currentSessionUid,
        selectedSessionFilter,
        customSessionId,
        isLimitEnabled,
        importLimit,
        data,
        setIsImporting,
        analyzeDuplicates,
        setData,
        setDataSource,
        setActiveTab,
        toast,
        confirmService,
        onSessionDeleted: (sessionId: string) => {
            setAvailableSessions(prev => prev.filter(s => s.id !== sessionId && s.sessionUid !== sessionId));
            setSelectedSessionFilter('all');
            setCustomSessionId('');
        }
    });

    const refreshSessionsList = useCallback(async (): Promise<SessionData[]> => {
        if (!FirebaseService.isFirebaseConfigured()) {
            return [];
        }
        const { sessions } = await FirebaseService.getSessionsFromFirebase(undefined, undefined, undefined, true);
        setAvailableSessions(sessions);
        return sessions;
    }, []);

    const renameSession = useCallback(async (sessionId: string, newName: string): Promise<void> => {
        if (!FirebaseService.isFirebaseConfigured()) {
            throw new Error('Firebase not configured.');
        }
        const trimmedName = newName.trim();
        if (!trimmedName) {
            throw new Error('Session name cannot be empty.');
        }
        const session = availableSessions.find(s => s.id === sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found.`);
        }
        await FirebaseService.saveSessionToFirebase(session, trimmedName);
        setAvailableSessions(prev => prev.map(s => s.id === sessionId ? { ...s, name: trimmedName, updatedAt: Date.now() } : s));
    }, [availableSessions]);

    const handleLoadSessionById = useCallback(async (sessionId: string): Promise<void> => {
        if (!FirebaseService.isFirebaseConfigured()) {
            throw new Error('Firebase not configured.');
        }
        let session = availableSessions.find(s => s.id === sessionId || s.sessionUid === sessionId);
        if (!session) {
            const { sessions } = await FirebaseService.getSessionsFromFirebase();
            setAvailableSessions(sessions);
            session = sessions.find(s => s.id === sessionId || s.sessionUid === sessionId);
        }
        if (!session) {
            throw new Error(`Session ${sessionId} not found.`);
        }
        await onSessionSelect(session);
    }, [availableSessions, onSessionSelect]);

    const handleLoadSessionRows = useCallback(async (sessionId: string, offset: number, limit: number): Promise<VerifierItem[]> => {
        if (!FirebaseService.isFirebaseConfigured()) {
            throw new Error('Firebase not configured.');
        }
        const fetchCount = Math.max(1, offset + limit);
        const items = await FirebaseService.fetchAllLogs(fetchCount, sessionId, true);
        if (items.length === 0) {
            const shouldDelete = await confirmService.confirm({
                title: 'Empty session found',
                message: 'This session has 0 rows. Do you want to delete the session and its logs?',
                confirmLabel: 'Delete Session',
                cancelLabel: 'Keep',
                variant: 'danger'
            });
            if (shouldDelete) {
                await FirebaseService.deleteSessionWithLogs(sessionId);
                setAvailableSessions(prev => prev.filter(s => s.id !== sessionId && s.sessionUid !== sessionId));
                setSelectedSessionFilter('all');
                setCustomSessionId('');
                toast.info('Empty session deleted.');
            }
            return [];
        }
        const sliced = items.slice(offset, offset + limit).map(normalizeImportItem);

        setSelectedSessionFilter(sessionId);
        setCustomSessionId('');
        setData(sliced);
        setDataSource(VerifierDataSource.Database);
        setActiveTab(VerifierPanelTab.Review);
        setCurrentPage(1);
        analyzeDuplicates(sliced);

        requestAnimationFrame(() => {
            reviewScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
        });

        return sliced;
    }, [analyzeDuplicates]);

    const resolveActiveSessionId = useCallback((): string | null => {
        if (selectedSessionFilter === 'current') {
            return currentSessionUid || null;
        }
        if (selectedSessionFilter === 'custom') {
            return customSessionId || null;
        }
        if (selectedSessionFilter === 'all') {
            return null;
        }
        return selectedSessionFilter || null;
    }, [customSessionId, currentSessionUid, selectedSessionFilter]);
    const {
        activeSessionStatus,
        handleMarkGarbage,
        handleDeleteSession,
        handleMarkUnreviewed,
        handleMarkVerified,
        handleRestoreSession
    } = useVerifierSessionStatusActions({
        resolveActiveSessionId,
        availableSessions,
        setAvailableSessions,
        setSelectedSessionFilter,
        setCustomSessionId,
        setData,
        setDataSource,
        setActiveTab,
        setIsUpdatingSessionStatus
    });

    useVerifierSessions({
        activeTab,
        setAvailableSessions
    });

    const { handleCheckOrphans, handleSyncOrphanedLogs, resumeOrphanSyncJobs } = useVerifierOrphans({
        setIsCheckingOrphans,
        setOrphanedLogsInfo,
        setIsSyncing,
        setAvailableSessions,
        setOrphanScanProgress,
        setOrphanSyncProgress
    });

    useEffect(() => {
        FirebaseService.hasOrphanSyncJobs()
            .then((hasJobs) => {
                if (hasJobs) {
                    setIsSyncing(true);
                }
            })
            .catch(() => {
                // no-op
            });
        resumeOrphanSyncJobs();
    }, [resumeOrphanSyncJobs]);

    useVerifierPaginationReset({
        showDuplicatesOnly,
        filterScore,
        showUnsavedOnly,
        dataLength: data.length,
        setCurrentPage
    });

    useVerifierExportColumns({
        data,
        setExportColumns
    });

    const { handleFileUpload } = useVerifierImport({
        setIsImporting,
        analyzeDuplicates,
        setData,
        setDataSource,
        setActiveTab,
        toast
    });

    const { handleHfImport } = useVerifierHfImport({
        hfConfig,
        rowsToFetch: hfRowsToFetch,
        skipRows: hfSkipRows,
        setIsImporting,
        analyzeDuplicates,
        setData,
        setDataSource,
        setActiveTab,
        setImportError: setHfImportError,
        toast
    });

    const { setScore, toggleDiscard } = useVerifierReviewActions({
        setData
    });

    const handleScoreClick = useCallback((item: VerifierItem, score: number) => {
        setScore(item.id, score);
        if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
            const updatedItem = { ...item, score, hasUnsavedChanges: true };
            handleDbUpdate(updatedItem);
        }
    }, [autoSaveEnabled, dataSource, handleDbUpdate, setScore]);

    const fetchMoreRows = useCallback(async () => {
        if (isImporting || isFetchingMoreRef.current) return;
        if (dataSource !== VerifierDataSource.Database) return;
        isFetchingMoreRef.current = true;
        try {
            await handleFetchMore(0, 0);
        } finally {
            isFetchingMoreRef.current = false;
        }
    }, [dataSource, handleFetchMore, isImporting]);

    const handleReviewScroll = useCallback(() => {
        if (dataSource !== VerifierDataSource.Database) return;
        const el = reviewScrollRef.current;
        if (!el) return;
        const threshold = 200;
        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceToBottom <= threshold) {
            fetchMoreRows();
        }
    }, [dataSource, fetchMoreRows]);
    const {
        handleDeleteMessagesFromHere,
        handleMessageQueryRewrite,
        handleMessageRewrite,
        handleMessageReasoningRewrite,
        handleMessageBothRewrite,
        handleFieldRewrite,
        handleBothRewrite
    } = useVerifierMessageRewriteActions({
        data,
        setData,
        rewriterConfig,
        autoSaveEnabled,
        dataSource,
        handleDbUpdate,
        setRewritingField,
        setStreamingContent,
        setMessageRewriteStart,
        setMessageRewriteContent,
        setMessageRewriteBothContent,
        clearMessageRewriteState,
        getMessageRewriteKey,
        messageRewriteAbortControllers
    });
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

    const {
        selectedItemIds,
        isRewritingAll,
        rewriteProgress,
        isAutoscoring,
        autoscoreProgress,
        isBulkUpdating,
        deleteModalOpen,
        itemsToDelete,
        isDeleting,
        handleAutoscoreItems,
        handleRefreshRowsFromDb,
        toggleSelection,
        handleSelectAll,
        handleBulkRewrite,
        handleAutoscoreSelected,
        handleAutoscoreSingleItem,
        handleBulkDbUpdate,
        initiateDelete,
        confirmDelete,
        setDeleteModalOpen
    } = useVerifierBulkActions({
        data,
        setData,
        filteredData,
        dataSource,
        autoSaveEnabled,
        rewriterConfig,
        autoscoreConfig,
        handleDbUpdate,
        resolveActiveSessionId,
        onJobCreated
    });

    const activeVerifierSessionId = resolveActiveSessionId() || data[0]?.sessionUid || currentSessionUid;

    useVerifierToolExecutor({
        data,
        setData,
        currentSessionUid: activeVerifierSessionId,
        autoSaveEnabled,
        handleFetchMore,
        handleDbUpdate,
        refreshRowsFromDb: handleRefreshRowsFromDb,
        sessions: availableSessions,
        refreshSessions: refreshSessionsList,
        renameSession,
        autoscoreItems: handleAutoscoreItems,
        loadSessionById: handleLoadSessionById,
        loadSessionRows: handleLoadSessionRows,
        autoscoreConfig,
        rewriterConfig,
        toolExecutorRef
    });

    const { totalPages, currentItems, handleRefreshCurrentPage } = useVerifierReviewViewState({
        data,
        setData,
        showDuplicatesOnly,
        showUnsavedOnly,
        filterScore,
        pageSize,
        currentPage,
        setCurrentPage,
        analyzeDuplicates,
        setIsRefreshing,
        refreshTrigger,
        dataSource,
        activeTab,
        isDetailOpen,
        focusedItemIndex,
        setFocusedItemIndex,
        itemRefs,
        toggleSelection,
        toggleItemExpand,
        openDetailPanel,
        toast
    });

    return (
        <div ref={verifierRootRef} className="bg-slate-950/70 rounded-xl border border-slate-800/70 p-6 h-full min-h-0 flex flex-col overflow-auto">
            <VerifierTabNavigation
                activeTab={activeTab}
                isImportReady={isImportReady}
                onTabClick={(tab, isBlocked) => {
                    if (isBlocked) {
                        toast.error('Import data first to access this tab.');
                        return;
                    }
                    setActiveTab(tab);
                }}
            />

            {/* Session Status Actions */}
            {activeTab === VerifierPanelTab.Review && (
                <VerifierSessionStatusActions
                    activeSessionStatus={activeSessionStatus}
                    isUpdatingSessionStatus={isUpdatingSessionStatus}
                    onMarkUnreviewed={handleMarkUnreviewed}
                    onMarkVerified={handleMarkVerified}
                    onRestoreSession={handleRestoreSession}
                    onMarkGarbage={handleMarkGarbage}
                    onDeleteSession={handleDeleteSession}
                />
            )}

            {/* IMPORT TAB */}
            {activeTab === VerifierPanelTab.Import && (
                <ImportTab
                    fileInputRef={fileInputRef}
                    handleFileUpload={handleFileUpload}
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
                    hfConfig={hfConfig}
                    setHfConfig={setHfConfig}
                    hfStructure={hfStructure}
                    hfSearchResults={hfSearchResults}
                    isSearchingHF={isSearchingHF}
                    showHFResults={showHFResults}
                    setShowHFResults={setShowHFResults}
                    onHFSearch={handleHFSearch}
                    onSelectHFDataset={handleSelectHFDataset}
                    onConfigChange={handleConfigChange}
                    onSplitChange={handleSplitChange}
                    prefetchColumns={prefetchColumns}
                    isPrefetching={isPrefetching}
                    availableColumns={availableColumns}
                    detectedColumns={detectedColumns}
                    hfTotalRows={hfTotalRows}
                    hfPreviewData={hfPreviewData}
                    isLoadingHfPreview={isLoadingHfPreview}
                    hfRowsToFetch={hfRowsToFetch}
                    setHfRowsToFetch={setHfRowsToFetch}
                    hfSkipRows={hfSkipRows}
                    setHfSkipRows={setHfSkipRows}
                    onHfImport={handleHfImport}
                    hfImportError={hfImportError}
                    isCheckingOrphans={isCheckingOrphans}
                    orphanedLogsInfo={orphanedLogsInfo}
                    orphanScanProgress={orphanScanProgress}
                    handleCheckOrphans={handleCheckOrphans}
                    handleSyncOrphanedLogs={handleSyncOrphanedLogs}
                    isSyncing={isSyncing}
                    orphanSyncProgress={orphanSyncProgress}
                />
            )}

            {/* REVIEW TAB */}
            {activeTab === VerifierPanelTab.Review && (
                <div className="flex-1 flex flex-col gap-4 animate-in fade-in">
                    <VerifierReviewConfigPanels
                        isRewriterPanelOpen={isRewriterPanelOpen}
                        setIsRewriterPanelOpen={setIsRewriterPanelOpen}
                        rewriterConfig={rewriterConfig}
                        setRewriterConfig={setRewriterConfig}
                        rewriterBaseUrlDraft={rewriterBaseUrlDraft}
                        setRewriterBaseUrlDraft={setRewriterBaseUrlDraft}
                        rewriterModelRefreshTick={rewriterModelRefreshTick}
                        setRewriterModelRefreshTick={setRewriterModelRefreshTick}
                        isAutoscorePanelOpen={isAutoscorePanelOpen}
                        setIsAutoscorePanelOpen={setIsAutoscorePanelOpen}
                        autoscoreConfig={autoscoreConfig}
                        setAutoscoreConfig={setAutoscoreConfig}
                        autoscoreBaseUrlDraft={autoscoreBaseUrlDraft}
                        setAutoscoreBaseUrlDraft={setAutoscoreBaseUrlDraft}
                        autoscoreModelRefreshTick={autoscoreModelRefreshTick}
                        setAutoscoreModelRefreshTick={setAutoscoreModelRefreshTick}
                    />

                    <VerifierReviewToolbar
                        selectedCount={selectedItemIds.size}
                        filteredCount={filteredData.length}
                        dataSource={dataSource}
                        autoSaveEnabled={autoSaveEnabled}
                        onToggleAutoSave={() => setAutoSaveEnabled(!autoSaveEnabled)}
                        onSelectAll={handleSelectAll}
                        isAllSelected={selectedItemIds.size > 0 && selectedItemIds.size === filteredData.length}
                        isPartiallySelected={selectedItemIds.size > 0 && selectedItemIds.size < filteredData.length}
                        isRewritingAll={isRewritingAll}
                        rewriteProgress={rewriteProgress}
                        onBulkRewrite={handleBulkRewrite}
                        isAutoscoring={isAutoscoring}
                        autoscoreProgress={autoscoreProgress}
                        onAutoscoreSelected={handleAutoscoreSelected}
                        isBulkUpdating={isBulkUpdating}
                        onBulkDbUpdate={handleBulkDbUpdate}
                        onDeleteSelected={() => initiateDelete(Array.from(selectedItemIds))}
                        showDuplicatesOnly={showDuplicatesOnly}
                        setShowDuplicatesOnly={setShowDuplicatesOnly}
                        showUnsavedOnly={showUnsavedOnly}
                        setShowUnsavedOnly={setShowUnsavedOnly}
                        filterScore={filterScore}
                        setFilterScore={setFilterScore}
                        onRescan={handleReScan}
                        onAutoResolveDuplicates={autoResolveDuplicates}
                        onRefreshCurrentPage={handleRefreshCurrentPage}
                        isRefreshing={isRefreshing}
                        pageSize={pageSize}
                        setPageSize={setPageSize}
                        isChatOpen={chatOpen ?? showChat}
                        onToggleChat={() => {
                            const next = !(chatOpen ?? showChat);
                            if (onChatToggle) {
                                onChatToggle(next);
                            } else {
                                setShowChat(next);
                            }
                        }}
                        viewMode={viewMode}
                        setViewMode={setViewMode}
                    />

                    <VerifierReviewContent
                        reviewScrollRef={reviewScrollRef}
                        handleReviewScroll={handleReviewScroll}
                        viewMode={viewMode}
                        currentItems={currentItems}
                        data={data}
                        focusedItemIndex={focusedItemIndex}
                        setFocusedItemIndex={setFocusedItemIndex}
                        itemRefs={itemRefs}
                        openDetailPanel={openDetailPanel}
                        expandedItems={expandedItems}
                        toggleItemExpand={toggleItemExpand}
                        selectedItemIds={selectedItemIds}
                        toggleSelection={toggleSelection}
                        toggleDuplicateStatus={toggleDuplicateStatus}
                        handleScoreClick={handleScoreClick}
                        dataSource={dataSource}
                        handleDbUpdate={handleDbUpdate}
                        handleDbRollback={handleDbRollback}
                        itemStates={itemStates}
                        initiateDelete={initiateDelete}
                        toggleDiscard={toggleDiscard}
                        editingField={editingField}
                        setEditingField={setEditingField}
                        startEditing={startEditing}
                        saveEditing={saveEditing}
                        cancelEditing={cancelEditing}
                        editValue={editValue}
                        setEditValue={setEditValue}
                        isRewritingThis={isRewritingThis}
                        rewritingField={rewritingField}
                        streamingContent={streamingContent}
                        handleFieldRewrite={handleFieldRewrite}
                        handleBothRewrite={handleBothRewrite}
                        showRegenerateDropdown={showRegenerateDropdown}
                        setShowRegenerateDropdown={setShowRegenerateDropdown}
                        expandedConversations={expandedConversations}
                        toggleConversationExpand={toggleConversationExpand}
                        messageRewriteStates={messageRewriteStates}
                        toStreamingField={toStreamingField}
                        handleMessageRewrite={handleMessageRewrite}
                        handleMessageReasoningRewrite={handleMessageReasoningRewrite}
                        handleMessageBothRewrite={handleMessageBothRewrite}
                        handleMessageQueryRewrite={handleMessageQueryRewrite}
                        cancelMessageRewrite={cancelMessageRewrite}
                        handleDeleteMessagesFromHere={handleDeleteMessagesFromHere}
                        handleFetchMore={handleFetchMore}
                        isImporting={isImporting}
                        totalPages={totalPages}
                        currentPage={currentPage}
                        setCurrentPage={setCurrentPage}
                    />
                </div>
            )}

            {/* EXPORT TAB */}
            {activeTab === VerifierPanelTab.Export && (
                <ExportTab
                    exportColumns={exportColumns}
                    setExportColumns={setExportColumns}
                    handleDbSave={handleDbSave}
                    handleJsonExport={handleJsonExport}
                    handleHfPush={handleHfPush}
                    isUploading={isUploading}
                    hfRepo={hfRepo}
                    setHfRepo={setHfRepo}
                    hfToken={hfToken}
                    setHfToken={setHfToken}
                    hfFormat={hfFormat}
                    setHfFormat={setHfFormat}
                />
            )}

            <VerifierAssistantPortal
                isOpen={chatOpen ?? showChat}
                data={data}
                setData={setData}
                modelConfig={modelConfig}
                toolExecutor={toolExecutorRef.current || undefined}
            />

            <VerifierDeleteItemsModal
                isOpen={deleteModalOpen}
                itemsToDeleteCount={itemsToDelete.length}
                isDeleting={isDeleting}
                onCancel={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
            />
            
            {/* Detail Panel */}
            <DetailPanel
                item={detailItem}
                items={filteredData}
                allData={data}
                isOpen={isDetailOpen}
                onClose={closeDetailPanel}
                onNavigate={(item) => {
                    setDetailItem(item);
                    setFocusedItemIndex(currentItems.findIndex(i => i.id === item.id));
                }}
                onSave={handleDetailSave}
                onScore={handleScoreClick}
                onRewriteField={(item, field) => {
                    if (field === VerifierRewriteTarget.Query) {
                        handleFieldRewrite(item.id, VerifierRewriteTarget.Query);
                    } else if (field === VerifierRewriteTarget.Reasoning) {
                        handleFieldRewrite(item.id, VerifierRewriteTarget.Reasoning);
                    } else if (field === VerifierRewriteTarget.Answer) {
                        handleFieldRewrite(item.id, VerifierRewriteTarget.Answer);
                    } else if (field === VerifierRewriteTarget.Both) {
                        handleBothRewrite(item.id);
                    }
                }}
                onRewriteMessage={(item: VerifierItem, idx: number) => handleMessageRewrite(item.id, idx)}
                onRewriteMessageReasoning={(item: VerifierItem, idx: number) => handleMessageReasoningRewrite(item.id, idx)}
                onRewriteMessageBoth={(item: VerifierItem, idx: number) => handleMessageBothRewrite(item.id, idx)}
                onRewriteQuery={(item: VerifierItem, idx: number) => handleMessageQueryRewrite(item.id, idx)}
                onDeleteMessageFromHere={(item: VerifierItem, idx: number) => handleDeleteMessagesFromHere(item.id, idx)}
                onDeleteItem={(item) => initiateDelete([item.id])}
                onDbUpdate={dataSource === VerifierDataSource.Database ? handleDbUpdate : undefined}
                onDbRollback={dataSource === VerifierDataSource.Database ? handleDbRollback : undefined}
                onFetchMore={dataSource === VerifierDataSource.Database ? fetchMoreRows : undefined}
                isFetchingMore={isImporting}
                hasMoreData={dataSource === VerifierDataSource.Database}
                totalInDb={data.length}
                onAutoscore={handleAutoscoreSingleItem}
                isAutoscoring={isAutoscoring}
                rewritingField={rewritingField}
                streamingContent={streamingContent}
                messageRewriteStates={messageRewriteStates}
                dataSource={dataSource || undefined}
            />
        </div>
    );
}
