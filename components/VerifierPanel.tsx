
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Upload, AlertTriangle, AlertCircle, Star, Trash2,
    GitBranch, Download, RefreshCcw, Filter,
    ShieldCheck, LayoutGrid, List, Search,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MessageCircle,
    ChevronUp, ChevronDown, Maximize2, Minimize2, Edit3, RotateCcw, Check, X, Loader2, Settings2, Save, CheckCircle2, Flag,
    Sparkles
} from 'lucide-react';
import { VerifierItem, ExternalProvider, ProviderType, ModelListProvider } from '../types';
import { ChatRole, OutputFieldName, StreamingField, VerifierRewriteTarget } from '../interfaces/enums';
import { VerifierPanelTab } from '../interfaces/enums/VerifierPanelTab';
import { VerifierViewMode } from '../interfaces/enums/VerifierViewMode';
import { VerifierDataSource } from '../interfaces/enums/VerifierDataSource';
import * as FirebaseService from '../services/firebaseService';
import * as VerifierRewriterService from '../services/verifierRewriterService';
import * as ExternalApiService from '../services/externalApiService';
import * as GeminiService from '../services/geminiService';
import { SettingsService, AVAILABLE_PROVIDERS } from '../services/settingsService';
import ReasoningHighlighter from './ReasoningHighlighter';
import { parseThinkTagsForDisplay } from '../utils/thinkTagParser';
import ConversationView from './ConversationView';
import ChatPanel from './ChatPanel';
import { ToolExecutor } from '../services/toolService';
import AutoResizeTextarea from './AutoResizeTextarea';
import type { AutoscoreConfig, AutoscoreToolParams, AutoscoreToolResult } from '../types';
import { toast } from '../services/toastService';
import { confirmService } from '../services/confirmService';
import { extractJsonFields } from '../utils/jsonFieldExtractor';
import GenerationParamsInput from './GenerationParamsInput';
import { useVerifierToolExecutor } from '../hooks/useVerifierToolExecutor';
import { useVerifierSessions } from '../hooks/useVerifierSessions';
import { useVerifierOrphans } from '../hooks/useVerifierOrphans';
import { useVerifierExportColumns } from '../hooks/useVerifierExportColumns';
import { useVerifierImport } from '../hooks/useVerifierImport';
import { useVerifierDbImport } from '../hooks/useVerifierDbImport';
import { useVerifierPaginationReset } from '../hooks/useVerifierPaginationReset';
import { useVerifierDeduplication } from '../hooks/useVerifierDeduplication';
import { useVerifierReviewActions } from '../hooks/useVerifierReviewActions';
import { useVerifierExportActions } from '../hooks/useVerifierExportActions';
import { useVerifierDbActions } from '../hooks/useVerifierDbActions';
import { useVerifierInlineEditing } from '../hooks/useVerifierInlineEditing';
import { useHuggingFaceData } from '../hooks/useHuggingFaceData';
import { useVerifierHfImport } from '../hooks/useVerifierHfImport';
import { normalizeImportItem } from '../services/verifierImportService';
import ImportTab from './verifier/ImportTab';
import ExportTab from './verifier/ExportTab';
import type { SessionData } from '../interfaces';
import CollapsibleSection from './layout/CollapsibleSection';
import ModelSelector from './ModelSelector';
import { SessionVerificationStatus } from '../interfaces/enums/SessionVerificationStatus';

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
}

export default function VerifierPanel({ currentSessionUid, modelConfig, chatOpen, onChatToggle, onSessionSelect }: VerifierPanelProps) {
    const [data, setData] = useState<VerifierItem[]>([]);
    const [viewMode, setViewMode] = useState<VerifierViewMode>(VerifierViewMode.List);
    const [dataSource, setDataSource] = useState<VerifierDataSource | null>(null);
    const [activeTab, setActiveTab] = useState<VerifierPanelTab>(VerifierPanelTab.Import);
    const isImportReady = dataSource !== null;

    // Import State
    const [importLimit, setImportLimit] = useState<number>(100);
    const [isLimitEnabled, setIsLimitEnabled] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
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
    const [editingField, setEditingField] = useState<{ itemId: string; field: OutputFieldName.Query | OutputFieldName.Reasoning | OutputFieldName.Answer | VerifierRewriteTarget.MessageAnswer; messageIndex?: number; originalValue: string } | null>(null);
    const [editValue, setEditValue] = useState('');
    const [rewritingField, setRewritingField] = useState<{ itemId: string; field: VerifierRewriteTarget; messageIndex?: number } | null>(null);
    const [streamingContent, setStreamingContent] = useState<string>('');  // Real-time streaming content

    // Regenerate Dropdown State
    const [showRegenerateDropdown, setShowRegenerateDropdown] = useState<string | null>(null);

    // Rewriter Config State
    const [isRewriterPanelOpen, setIsRewriterPanelOpen] = useState(false);
    const [rewriterConfig, setRewriterConfig] = useState<VerifierRewriterService.RewriterConfig>(() => {
        const settings = SettingsService.getSettings();
        const externalProvider = settings.defaultProvider || ExternalProvider.OpenRouter;
        return {
            provider: ProviderType.External,
            externalProvider: externalProvider as ExternalProvider,
            apiKey: '',
            model: SettingsService.getDefaultModel(externalProvider) || '',
            customBaseUrl: '',
            maxRetries: 3,
            retryDelay: 2000,
            promptCategory: 'verifier', promptRole: 'message_rewrite',
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
            provider: gpModel?.provider === ProviderType.External ? ProviderType.External : ProviderType.Gemini,
            externalProvider: (gpModel?.externalProvider || 'openrouter') as any,
            apiKey: '',
            model: gpModel?.model || 'gemini-1.5-pro',
            customBaseUrl: '',
            promptCategory: 'verifier', promptRole: 'autoscore',
            concurrency: 5,
            sleepTime: 0,
            maxRetries: 3,
            retryDelay: 2000,
            generationParams: SettingsService.getDefaultGenerationParams()
        };
    });
    const [isAutoscoring, setIsAutoscoring] = useState(false);
    const [autoscoreProgress, setAutoscoreProgress] = useState({ current: 0, total: 0 });

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
        editingField,
        editValue,
        setEditingField,
        setEditValue,
        setData,
        autoSaveEnabled,
        dataSource,
        handleDbUpdate
    });
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
        const { sessions } = await FirebaseService.getSessionsFromFirebase();
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
        const items = await FirebaseService.fetchAllLogs(fetchCount, sessionId);
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

    const updateSessionStatus = useCallback(async (status: SessionVerificationStatus) => {
        const sessionId = resolveActiveSessionId();
        if (!sessionId) {
            toast.error('Select a specific session to update its status.');
            return;
        }
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
            return;
        }
        setIsUpdatingSessionStatus(true);
        try {
            await FirebaseService.updateSessionVerificationStatus(sessionId, status);
            setAvailableSessions(prev => prev.map(s => (s.id === sessionId || s.sessionUid === sessionId)
                ? { ...s, verificationStatus: status }
                : s
            ));
            toast.success(status === SessionVerificationStatus.Verified ? 'Session marked verified.' : 'Session marked as garbage.');
        } catch (err) {
            console.error('Failed to update session status', err);
            toast.error('Failed to update session status.');
        } finally {
            setIsUpdatingSessionStatus(false);
        }
    }, [resolveActiveSessionId]);

    const handleMarkGarbage = useCallback(async () => {
        const sessionId = resolveActiveSessionId();
        if (!sessionId) {
            toast.error('Select a specific session to update.');
            return;
        }
        const confirm = await confirmService.confirm({
            title: 'Mark session as garbage?',
            message: 'This will mark the session as garbage. You can still delete it separately.',
            confirmLabel: 'Mark Garbage',
            cancelLabel: 'Cancel',
            variant: 'warning'
        });
        if (!confirm) return;
        updateSessionStatus(SessionVerificationStatus.Garbage);
    }, [resolveActiveSessionId, updateSessionStatus]);

    const handleDeleteSession = useCallback(async () => {
        const sessionId = resolveActiveSessionId();
        if (!sessionId) {
            toast.error('Select a specific session to delete.');
            return;
        }
        const confirm = await confirmService.confirm({
            title: 'Delete session and logs?',
            message: 'This will permanently delete the session and all its logs. This cannot be undone.',
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'danger'
        });
        if (!confirm) return;

        setIsUpdatingSessionStatus(true);
        try {
            await FirebaseService.deleteSessionWithLogs(sessionId);
            setAvailableSessions(prev => prev.filter(s => s.id !== sessionId && s.sessionUid !== sessionId));
            setSelectedSessionFilter('all');
            setCustomSessionId('');
            setData([]);
            setDataSource(null);
            setActiveTab(VerifierPanelTab.Import);
            toast.success('Session and logs deleted.');
        } catch (err) {
            console.error('Failed to delete session', err);
            toast.error('Failed to delete session.');
        } finally {
            setIsUpdatingSessionStatus(false);
        }
    }, [resolveActiveSessionId]);

    const activeSessionStatus = useMemo(() => {
        const sessionId = resolveActiveSessionId();
        if (!sessionId) return null;
        const match = availableSessions.find(s => s.id === sessionId || s.sessionUid === sessionId);
        return match?.verificationStatus || SessionVerificationStatus.Unreviewed;
    }, [availableSessions, resolveActiveSessionId]);

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

    // --- Logic: Import ---

    // normalizeImportItem moved to verifierImportService


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

    // Handler for rewriting user query messages with streaming
    const handleMessageQueryRewrite = async (itemId: string, messageIndex: number) => {
        console.log('handleMessageQueryRewrite called:', { itemId, messageIndex });
        const item = data.find(i => i.id === itemId);
        if (!item || !item.messages || !item.messages[messageIndex]) {
            console.log('Early return: item or message not found');
            return;
        }

        const targetMessage = item.messages[messageIndex];
        if (targetMessage.role !== ChatRole.User) {
            console.log('Not a user message, skipping');
            return;
        }

        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error('Please set a default model for ' + rewriterConfig.externalProvider + ' in Settings');
            return;
        }

        setRewritingField({ itemId, field: VerifierRewriteTarget.MessageQuery, messageIndex });
        setStreamingContent('');

        try {
            console.log('Calling query rewrite streaming...');
            const userPrompt = `You are an expert at improving and clarifying user queries. 
Given a user's question or request, rewrite it to be clearer, more specific, and better structured.
Preserve the original intent while improving clarity.
Return ONLY the improved query text.

Rewrite and improve this user query:

${targetMessage.content}

IMPORTANT: Respond with a VALID JSON object containing the improved query.

Expected Output Format:
{
  "response": "The improved, clearer version of the query..."
}`;

            // Direct streaming call
            const newValue = await VerifierRewriterService.callRewriterAIStreaming(
                userPrompt,
                rewriterConfig,
                (_chunk: string, accumulated: string) => {
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

            if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
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

        setRewritingField({ itemId, field: VerifierRewriteTarget.MessageAnswer, messageIndex });
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

            if (autoSaveEnabled && dataSource === VerifierDataSource.Database && updatedItem) {
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

        setRewritingField({ itemId, field: VerifierRewriteTarget.MessageReasoning, messageIndex });
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

            if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
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

        setRewritingField({ itemId, field: VerifierRewriteTarget.MessageBoth, messageIndex });
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

            if (autoSaveEnabled && dataSource === VerifierDataSource.Database && updatedItem) {
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

    const handleFieldRewrite = async (
        itemId: string,
        field: VerifierRewriteTarget.Query | VerifierRewriteTarget.Reasoning | VerifierRewriteTarget.Answer
    ) => {
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
            const rewritableField = field === VerifierRewriteTarget.Query
                ? OutputFieldName.Query
                : field === VerifierRewriteTarget.Reasoning
                    ? OutputFieldName.Reasoning
                    : OutputFieldName.Answer;

            const newValue = await VerifierRewriterService.rewriteFieldStreaming(
                {
                    item: itemForRewrite,
                    field: rewritableField,
                    config: rewriterConfig,
                    promptSet: SettingsService.getSettings().promptSet
                },
                (_chunk, accumulated) => {
                    // Parse JSON on-the-fly and extract only the relevant field
                    const extracted = extractJsonFields(accumulated);

                    // Display the extracted field content based on what we're rewriting
                    if (field === VerifierRewriteTarget.Reasoning) {
                        setStreamingContent(extracted.reasoning || extracted.answer || accumulated);
                    } else if (field === VerifierRewriteTarget.Answer) {
                        setStreamingContent(extracted.answer || extracted.reasoning || accumulated);
                    } else if (field === VerifierRewriteTarget.Query) {
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
            if (field === VerifierRewriteTarget.Reasoning) {
                finalValue = extracted.reasoning || extracted.answer || newValue;
            } else if (field === VerifierRewriteTarget.Answer) {
                finalValue = extracted.answer || extracted.reasoning || newValue;
            } else if (field === VerifierRewriteTarget.Query) {
                finalValue = extracted.answer || newValue;
            }

            const updatedItem = { ...itemForRewrite, [field]: finalValue, hasUnsavedChanges: true };

            setData((prev: VerifierItem[]) => prev.map(i =>
                i.id === itemId
                    ? updatedItem
                    : i
            ));

            if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
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

        setRewritingField({ itemId, field: VerifierRewriteTarget.Both });
        setStreamingContent('');  // Clear previous streaming content

        try {
            // Use streaming for real-time display
            const rawResult = await VerifierRewriterService.rewriteFieldStreaming(
                {
                    item: itemForRewrite,
                    field: OutputFieldName.Reasoning,  // Start with reasoning field prompt
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

            if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
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
        const { provider, externalProvider, apiKey, model, customBaseUrl, maxRetries, retryDelay, generationParams } = autoscoreConfig;

        const effectiveApiKey = apiKey || SettingsService.getApiKey(provider === ProviderType.External ? externalProvider : ProviderType.Gemini);
        const effectiveBaseUrl = customBaseUrl || SettingsService.getCustomBaseUrl();

        const systemPrompt = `You are an expert evaluator. Score the quality of the reasoning and answer on a scale of 1-5, where 1 is poor and 5 is excellent.`;

        const userPrompt = `## ITEM TO SCORE
Query: ${item.query || (item as any).QUERY || item.full_seed || ''}
Reasoning Trace: ${item.reasoning}
Answer: ${item.answer}

---
Based on the criteria above, provide a 1-5 score.`;

        let rawResult: string = '';

        if (provider === ProviderType.Gemini) {
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
                userPrompt: systemPrompt + "\n\n" + userPrompt,
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

    const handleAutoscoreItems = useCallback(async (params: AutoscoreToolParams): Promise<AutoscoreToolResult> => {
        const indices = params.indices || [];
        const scores = params.scores || [];

        let scored = 0;
        let skipped = 0;
        let errors = 0;

        const limit = Math.min(indices.length, scores.length);

        for (let i = 0; i < limit; i += 1) {
            const index = indices[i];
            const score = scores[i];
            const item = data[index];
            if (!item) {
                skipped += 1;
                continue;
            }
            if (typeof score !== 'number' || Number.isNaN(score)) {
                errors += 1;
                continue;
            }
            setScore(item.id, score);
            if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
                handleDbUpdate({ ...item, score, hasUnsavedChanges: true });
            }
            scored += 1;
        }

        return { scored, skipped, errors };
    }, [autoSaveEnabled, data, dataSource, handleDbUpdate, setScore]);

    useVerifierToolExecutor({
        data,
        setData,
        autoSaveEnabled,
        handleFetchMore,
        handleDbUpdate,
        sessions: availableSessions,
        refreshSessions: refreshSessionsList,
        renameSession,
        autoscoreItems: handleAutoscoreItems,
        loadSessionById: handleLoadSessionById,
        loadSessionRows: handleLoadSessionRows,
        toolExecutorRef
    });

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

    const handleBulkRewrite = async (mode: VerifierRewriteTarget.Query | VerifierRewriteTarget.Reasoning | VerifierRewriteTarget.Answer | VerifierRewriteTarget.Both) => {
        const itemsToProcess = getSelectedItems();
        if (itemsToProcess.length === 0) {
            toast.info("No items selected.");
            return;
        }

        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error('Please set a default model for ' + rewriterConfig.externalProvider + ' in Settings');
            return;
        }

        const confirmRewrite = await confirmService.confirm({
            title: 'Confirm rewrite?',
            message: `Rewrite ${mode.toUpperCase()} for ${itemsToProcess.length} SELECTED items using ${rewriterConfig.model}? This cannot be undone.`,
            confirmLabel: 'Rewrite',
            cancelLabel: 'Cancel',
            variant: 'warning'
        });
        if (!confirmRewrite) return;

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
                    if (mode === VerifierRewriteTarget.Both) {
                        // Both: Use the same strategy as handleBothRewrite (request reasoning, expect both)
                        const rawResult = await VerifierRewriterService.rewriteFieldStreaming(
                            {
                                item: itemForRewrite,
                                field: OutputFieldName.Reasoning,
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
                        const rewritableField = mode === VerifierRewriteTarget.Query
                            ? OutputFieldName.Query
                            : mode === VerifierRewriteTarget.Reasoning
                                ? OutputFieldName.Reasoning
                                : OutputFieldName.Answer;

                        const rawResult = await VerifierRewriterService.rewriteFieldStreaming(
                            {
                                item: itemForRewrite,
                                field: rewritableField,
                                config: rewriterConfig,
                                promptSet: SettingsService.getSettings().promptSet
                            },
                            () => { }
                        );

                        const extracted = extractJsonFields(rawResult);
                        let finalValue = rawResult;
                        if (mode === VerifierRewriteTarget.Reasoning) {
                            finalValue = extracted.reasoning || extracted.answer || rawResult;
                        } else if (mode === VerifierRewriteTarget.Answer) {
                            finalValue = extracted.answer || extracted.reasoning || rawResult;
                        } else if (mode === VerifierRewriteTarget.Query) {
                            // extractJsonFields maps 'response'/'query' keys to 'answer' property
                            finalValue = extracted.answer || rawResult;
                        }

                        // Prepare updated item for state and auto-save
                        const updatedItem = { ...item, [mode]: finalValue, hasUnsavedChanges: true };

                        setData((prev: VerifierItem[]) => prev.map(i =>
                            i.id === item.id ? updatedItem : i
                        ));

                        if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
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

        const confirmAutoscore = await confirmService.confirm({
            title: 'Confirm autoscore?',
            message: `Autoscore ${itemsToScore.length} unrated items from selection using ${autoscoreConfig.model}?`,
            confirmLabel: 'Autoscore',
            cancelLabel: 'Cancel',
            variant: 'warning'
        });
        if (!confirmAutoscore) return;

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
                        if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
                            handleDbUpdate({ ...item, score, hasUnsavedChanges: true });
                        }
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

        const confirmUpdate = await confirmService.confirm({
            title: 'Update database?',
            message: `Update ${itemsToUpdate.length} items in DB?`,
            confirmLabel: 'Update',
            cancelLabel: 'Cancel',
            variant: 'warning'
        });
        if (!confirmUpdate) return;

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
            await confirmService.alert({
                title: 'Delete failed',
                message: 'Failed to delete items. See console for details.',
                variant: 'danger'
            });
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
        <div ref={verifierRootRef} className="bg-slate-950/70 rounded-xl border border-slate-800/70 p-6 h-full min-h-0 flex flex-col overflow-auto">
            {/* Header Tabs */}
            <div className="flex justify-center mb-8">
                <div className="bg-slate-950 p-1 rounded-lg border border-slate-800/70 flex gap-1">
                    {[VerifierPanelTab.Import, VerifierPanelTab.Review, VerifierPanelTab.Export].map((tab) => {
                        const isBlocked = !isImportReady && tab !== VerifierPanelTab.Import;
                        return (
                            <button
                                key={tab}
                                onClick={() => {
                                    if (isBlocked) {
                                        toast.error('Import data first to access this tab.');
                                        return;
                                    }
                                    setActiveTab(tab);
                                }}
                                disabled={isBlocked}
                                className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === tab
                                    ? 'bg-slate-100 text-slate-900 shadow-sm'
                                    : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
                                    } ${isBlocked ? 'opacity-40 cursor-not-allowed hover:bg-transparent hover:text-slate-300' : ''}`}
                            >
                                {tab === VerifierPanelTab.Import && <Upload className="w-4 h-4" />}
                                {tab === VerifierPanelTab.Review && <ShieldCheck className="w-4 h-4" />}
                                {tab === VerifierPanelTab.Export && <Download className="w-4 h-4" />}
                                {tab}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Session Status Actions */}
            {activeTab === VerifierPanelTab.Review && (
                <div className="mb-6 bg-slate-950/70 border border-slate-800/70 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        {activeSessionStatus && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full border border-slate-700/70 text-slate-300">
                                {activeSessionStatus === SessionVerificationStatus.Verified && 'Verified'}
                                {activeSessionStatus === SessionVerificationStatus.Garbage && 'Garbage'}
                                {activeSessionStatus === SessionVerificationStatus.Unreviewed && 'Unreviewed'}
                            </span>
                        )}
                        <span className="text-xs text-slate-400">Session status controls</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {activeSessionStatus === SessionVerificationStatus.Verified ? (
                            <button
                                onClick={async () => {
                                    const confirm = await confirmService.confirm({
                                        title: 'Mark session as unreviewed?',
                                        message: 'This will mark the current session as unreviewed.',
                                        confirmLabel: 'Mark Unreviewed',
                                        cancelLabel: 'Cancel',
                                        variant: 'info'
                                    });
                                    if (!confirm) return;
                                    updateSessionStatus(SessionVerificationStatus.Unreviewed);
                                }}
                                disabled={isUpdatingSessionStatus}
                                className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-900/60 text-slate-200 hover:bg-slate-800/70 disabled:opacity-50"
                                title="Mark session as unreviewed"
                            >
                                <Check className="w-3.5 h-3.5" />
                                Mark Unreviewed
                            </button>
                        ) : (
                            <button
                                onClick={async () => {
                                    const confirm = await confirmService.confirm({
                                        title: 'Mark session as verified?',
                                        message: 'This marks the current session as verified.',
                                        confirmLabel: 'Verify',
                                        cancelLabel: 'Cancel',
                                        variant: 'info'
                                    });
                                    if (!confirm) return;
                                    updateSessionStatus(SessionVerificationStatus.Verified);
                                }}
                                disabled={isUpdatingSessionStatus}
                                className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 disabled:opacity-50"
                                title="Mark session as verified"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Verify Session
                            </button>
                        )}

                        {activeSessionStatus === SessionVerificationStatus.Garbage ? (
                            <button
                                onClick={async () => {
                                    const confirm = await confirmService.confirm({
                                        title: 'Restore session?',
                                        message: 'This will mark the session as unreviewed.',
                                        confirmLabel: 'Restore',
                                        cancelLabel: 'Cancel',
                                        variant: 'info'
                                    });
                                    if (!confirm) return;
                                    updateSessionStatus(SessionVerificationStatus.Unreviewed);
                                }}
                                disabled={isUpdatingSessionStatus}
                                className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-900/60 text-slate-200 hover:bg-slate-800/70 disabled:opacity-50"
                                title="Restore session"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Restore Session
                            </button>
                        ) : (
                            <button
                                onClick={handleMarkGarbage}
                                disabled={isUpdatingSessionStatus}
                                className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-950/20 text-red-300 hover:bg-red-900/40 border border-red-900/50 disabled:opacity-50"
                                title="Mark session as garbage"
                            >
                                <Flag className="w-3.5 h-3.5" />
                                Mark Garbage
                            </button>
                        )}
                        <button
                            onClick={handleDeleteSession}
                            disabled={isUpdatingSessionStatus}
                            className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-900/60 border border-red-900/60 disabled:opacity-50"
                            title="Delete session and logs"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Session
                        </button>
                    </div>
                </div>
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
                    {/* Rewriter Settings Panel */}
                    <div className="bg-slate-950/70 rounded-xl border border-slate-800/70 overflow-visible">
                        <button
                            onClick={() => setIsRewriterPanelOpen(!isRewriterPanelOpen)}
                            className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <Settings2 className="w-4 h-4" />
                                REWRITER SETTINGS
                            </span>
                            {isRewriterPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {isRewriterPanelOpen && (
                            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-800/70 pt-4">
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Provider</label>
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
                                        className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                                    >
                                        {['gemini', ...AVAILABLE_PROVIDERS].map(p => (
                                            <option key={p} value={p}>
                                                {p === 'gemini' ? 'Native Gemini' : p.charAt(0).toUpperCase() + p.slice(1)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Model</label>
                                    <ModelSelector
                                        provider={(rewriterConfig.externalProvider === 'gemini'
                                            ? ProviderType.Gemini
                                            : rewriterConfig.externalProvider) as ModelListProvider}
                                        value={rewriterConfig.model}
                                        onChange={(model) => setRewriterConfig(prev => ({ ...prev, model }))}
                                        apiKey={rewriterConfig.apiKey || SettingsService.getApiKey(rewriterConfig.externalProvider)}
                                        customBaseUrl={rewriterConfig.customBaseUrl}
                                        placeholder="Select or enter model"
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={rewriterConfig.apiKey}
                                        onChange={e => setRewriterConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                                        placeholder="Use default from settings"
                                        className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Custom Base URL</label>
                                    <input
                                        type="text"
                                        value={rewriterConfig.customBaseUrl || ''}
                                        onChange={e => setRewriterConfig(prev => ({ ...prev, customBaseUrl: e.target.value }))}
                                        placeholder="Optional"
                                        className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                                    />
                                </div>
                                <div className="col-span-1 md:col-span-2 flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Max Retries</label>
                                        <input
                                            type="number"
                                            value={rewriterConfig.maxRetries ?? 3}
                                            onChange={e => setRewriterConfig(prev => ({ ...prev, maxRetries: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Retry Delay (ms)</label>
                                        <input
                                            type="number"
                                            value={rewriterConfig.retryDelay ?? 2000}
                                            onChange={e => setRewriterConfig(prev => ({ ...prev, retryDelay: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                                        />
                                    </div>
                                </div>
                                <div className="col-span-1 md:col-span-2 flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Concurrency</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={rewriterConfig.concurrency ?? 1}
                                            onChange={e => setRewriterConfig(prev => ({ ...prev, concurrency: Math.max(1, parseInt(e.target.value) || 1) }))}
                                            className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Batch Delay (ms)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            value={rewriterConfig.delayMs ?? 0}
                                            onChange={e => setRewriterConfig(prev => ({ ...prev, delayMs: Math.max(0, parseInt(e.target.value) || 0) }))}
                                            className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-sky-500"
                                        />
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>

                    {/* Autoscore Settings Panel */}
                    <div className="bg-slate-950/70 rounded-xl border border-slate-800/70 overflow-visible mb-4">
                        <button
                            onClick={() => setIsAutoscorePanelOpen(!isAutoscorePanelOpen)}
                            className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition-colors"
                        >
                            <span className="flex items-center gap-2 text-emerald-400">
                                <Star className="w-4 h-4" />
                                AUTOSCORE CONFIG
                            </span>
                            {isAutoscorePanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {isAutoscorePanelOpen && (
                            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-800/70 pt-4">
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Provider</label>
                                    <select
                                        value={autoscoreConfig.provider === ProviderType.External ? autoscoreConfig.externalProvider : ProviderType.Gemini}
                                        onChange={e => {
                                            const val = e.target.value;
                                            const isExt = val !== ProviderType.Gemini;
                                            setAutoscoreConfig(prev => ({
                                                ...prev,
                                                provider: isExt ? ProviderType.External : ProviderType.Gemini,
                                                externalProvider: isExt ? val as ExternalProvider : prev.externalProvider
                                            }));
                                        }}
                                        className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                    >
                                        <option value={ProviderType.Gemini}>Gemini</option>
                                        {AVAILABLE_PROVIDERS.map(p => (
                                            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Model</label>
                                    <ModelSelector
                                        provider={(autoscoreConfig.provider === ProviderType.External
                                            ? autoscoreConfig.externalProvider
                                            : ProviderType.Gemini) as ModelListProvider}
                                        value={autoscoreConfig.model}
                                        onChange={(model) => setAutoscoreConfig(prev => ({ ...prev, model }))}
                                        apiKey={autoscoreConfig.apiKey || SettingsService.getApiKey(autoscoreConfig.provider === ProviderType.External ? autoscoreConfig.externalProvider : ProviderType.Gemini)}
                                        placeholder="Select or enter model"
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Concurrency</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={autoscoreConfig.concurrency}
                                        onChange={e => setAutoscoreConfig(prev => ({ ...prev, concurrency: Math.max(1, parseInt(e.target.value) || 1) }))}
                                        className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Sleep (ms)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="100"
                                        value={autoscoreConfig.sleepTime}
                                        onChange={e => setAutoscoreConfig(prev => ({ ...prev, sleepTime: Math.max(0, parseInt(e.target.value) || 0) }))}
                                        className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div className="col-span-1 md:col-span-2 flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Max Retries</label>
                                        <input
                                            type="number"
                                            value={autoscoreConfig.maxRetries}
                                            onChange={e => setAutoscoreConfig(prev => ({ ...prev, maxRetries: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Retry Delay (ms)</label>
                                        <input
                                            type="number"
                                            value={autoscoreConfig.retryDelay}
                                            onChange={e => setAutoscoreConfig(prev => ({ ...prev, retryDelay: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-slate-950/70 border border-slate-700/70 text-xs text-white rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                </div>
                                <div className="col-span-1 md:col-span-4">

                                </div>
                                <div className="col-span-1 md:col-span-4 border-t border-slate-800/70 pt-4">
                                    <GenerationParamsInput
                                        params={autoscoreConfig.generationParams}
                                        onChange={(newParams) => setAutoscoreConfig(prev => ({ ...prev, generationParams: newParams }))}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <CollapsibleSection
                        title="Bulk Actions"
                        icon={<Settings2 className="w-3.5 h-3.5 text-sky-400" />}
                        summary={`${selectedItemIds.size} selected`}
                        defaultExpanded={false}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-4 bg-sky-950/10 border border-sky-900/30 p-3 rounded-xl">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 border-r border-sky-800/30 pr-4">
                                    <input
                                        type="checkbox"
                                        checked={selectedItemIds.size > 0 && selectedItemIds.size === filteredData.length}
                                        ref={input => { if (input) input.indeterminate = selectedItemIds.size > 0 && selectedItemIds.size < filteredData.length; }}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 rounded border-slate-600 bg-slate-900/60 text-sky-500 focus:ring-offset-slate-900"
                                    />
                                    <span className="text-xs font-bold text-sky-400">
                                        {selectedItemIds.size} Selected
                                    </span>
                                </div>

                                {/* Auto Save Toggle */}
                                {dataSource === VerifierDataSource.Database && (
                                    <div className="flex items-center gap-2 px-2 py-1 bg-slate-900/60 rounded-lg border border-slate-700/70">
                                        <span className="text-[10px] font-bold text-slate-300 uppercase">Auto-Save</span>
                                        <button
                                            onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
                                            className={`w-8 h-4 rounded-full relative transition-colors ${autoSaveEnabled ? 'bg-sky-600' : 'bg-slate-800/70'}`}
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
                                        className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${isRewritingAll ? 'bg-sky-600 text-white' : 'bg-sky-600/10 text-sky-500 hover:bg-sky-600/20'} disabled:opacity-50`}
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
                                            <div className="bg-slate-950/70 border border-slate-700/70 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                                                <button onClick={() => handleBulkRewrite(VerifierRewriteTarget.Query)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-900/60 text-slate-200 hover:text-white transition-colors">
                                                    Query Only
                                                </button>
                                                <button onClick={() => handleBulkRewrite(VerifierRewriteTarget.Reasoning)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-900/60 text-slate-200 hover:text-white transition-colors">
                                                    Reasoning Only
                                                </button>
                                                <button onClick={() => handleBulkRewrite(VerifierRewriteTarget.Answer)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-900/60 text-slate-200 hover:text-white transition-colors">
                                                    Answer Only
                                                </button>
                                                <div className="h-px bg-slate-900/60 my-1"></div>
                                                <button onClick={() => handleBulkRewrite(VerifierRewriteTarget.Both)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-900/60 text-sky-400 hover:text-sky-300 font-bold transition-colors">
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
                                {dataSource === VerifierDataSource.Database && (
                                    <>
                                        <button
                                            onClick={handleBulkDbUpdate}
                                            disabled={selectedItemIds.size === 0 || isBulkUpdating}
                                            className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800/70 text-slate-200 hover:text-white transition-colors disabled:opacity-50"
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
                    </CollapsibleSection>

                    {/* Filter Main Toolbar */}
                    <CollapsibleSection
                        title="Filters & View"
                        icon={<Filter className="w-3.5 h-3.5 text-sky-400" />}
                        summary={`${filteredData.length} items`}
                        defaultExpanded
                    >
                        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/70 p-3 rounded-xl border border-slate-800/70">
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-bold text-slate-300 uppercase tracking-wide px-2 border-r border-slate-800/70">{filteredData.length} Items</span>

                                <button onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)} className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${showDuplicatesOnly ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-white'}`}>
                                    <GitBranch className="w-3.5 h-3.5" /> Duplicates
                                </button>

                                <button onClick={() => setShowUnsavedOnly(!showUnsavedOnly)} className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${showUnsavedOnly ? 'bg-orange-500/20 text-orange-400' : 'text-slate-400 hover:text-white'}`}>
                                    <AlertCircle className="w-3.5 h-3.5" /> Unsaved
                                </button>

                                <div className="flex items-center gap-2">
                                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                                    <select value={filterScore === null ? 'all' : filterScore} onChange={e => setFilterScore(e.target.value === 'all' ? null : Number(e.target.value))} className="bg-slate-950/70 border border-slate-700/70 text-xs text-slate-200 rounded px-2 py-1 outline-none">
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
                                <button onClick={handleReScan} className="text-xs bg-slate-900/60 hover:bg-slate-800/70 text-slate-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2" title="Re-scan for duplicates (ignoring discarded)">
                                    <Search className="w-3.5 h-3.5" /> Re-Scan
                                </button>
                                <button onClick={autoResolveDuplicates} className="text-xs bg-slate-900/60 hover:bg-slate-800/70 text-slate-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2">
                                    <RefreshCcw className="w-3.5 h-3.5" /> Auto-Resolve Dupes
                                </button>
                                <div className="h-4 w-px bg-slate-900/60 mx-2"></div>
                                {/* Page Size Selector */}
                                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="bg-slate-950/70 border border-slate-700/70 text-xs text-slate-200 rounded px-2 py-1.5 outline-none">
                                    <option value="10">10 / page</option>
                                    <option value="25">25 / page</option>
                                    <option value="50">50 / page</option>
                                    <option value="100">100 / page</option>
                                </select>
                                <div className="h-4 w-px bg-slate-900/60 mx-2"></div>
                                <button
                                    onClick={() => {
                                        const next = !(chatOpen ?? showChat);
                                        if (onChatToggle) {
                                            onChatToggle(next);
                                        } else {
                                            setShowChat(next);
                                        }
                                    }}
                                    className={`p-1.5 rounded transition-colors ${(chatOpen ?? showChat) ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-blue-400'}`}
                                    title="Toggle AI Assistant"
                                >
                                    <Sparkles className="w-4 h-4" />
                                </button>
                                <div className="h-4 w-px bg-slate-900/60 mx-2"></div>
                                <button onClick={() => setViewMode(VerifierViewMode.List)} className={`p-1.5 rounded ${viewMode === VerifierViewMode.List ? 'bg-sky-600 text-white' : 'text-slate-400'}`}><List className="w-4 h-4" /></button>
                                <button onClick={() => setViewMode(VerifierViewMode.Grid)} className={`p-1.5 rounded ${viewMode === VerifierViewMode.Grid ? 'bg-sky-600 text-white' : 'text-slate-400'}`}><LayoutGrid className="w-4 h-4" /></button>
                            </div>
                        </div>
                    </CollapsibleSection>

                    {/* Content Area with Chat Split View */}
                    {/* Content Area with Chat Split View */}
                    <div className="flex gap-4 flex-1 min-h-0">
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            <div
                                ref={reviewScrollRef}
                                onScroll={handleReviewScroll}
                                className={`flex-1 overflow-y-auto pr-2 grid gap-4 ${viewMode === 'grid' ? 'grid-cols-2 lg:grid-cols-3 content-start' : 'grid-cols-1 content-start'}`}
                            >

                                {currentItems.map(item => {
                                    const parsedAnswer = parseThinkTagsForDisplay(item.answer || '');
                                    const displayReasoning = item.reasoning || parsedAnswer.reasoning || '';
                                    const displayAnswer = parsedAnswer.hasThinkTags ? parsedAnswer.answer : item.answer;

                                    return (
                                        <div key={item.id} className={`bg-slate-950/70 border relative group transition-all rounded-xl p-4 flex flex-col gap-3 ${item.hasUnsavedChanges
                                            ? 'border-orange-500/80 shadow-[0_0_15px_-3px_rgba(249,115,22,0.3)]'
                                            : item.isDuplicate
                                                ? 'border-amber-500/30'
                                                : 'border-slate-800/70 hover:border-sky-500/30'
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
                                                        className="w-4 h-4 rounded border-slate-600 bg-slate-900/60 text-sky-600 focus:ring-offset-slate-900 cursor-pointer"
                                                    />
                                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-700/70" title="Index in dataset (0-based)">
                                                        #{data.indexOf(item)}
                                                    </span>
                                                    <div className="flex gap-1">
                                                        {[1, 2, 3, 4, 5].map(star => (
                                                            <button key={star} onClick={() => handleScoreClick(item, star)} className="focus:outline-none transition-transform active:scale-90">
                                                                <Star className={`w-4 h-4 ${item.score >= star ? 'fill-yellow-400 text-yellow-400' : 'text-slate-700'}`} />
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    {dataSource === VerifierDataSource.Database && (
                                                        <>
                                                            <button
                                                                onClick={() => handleDbUpdate(item)}
                                                                disabled={itemStates[item.id] === 'saving'}
                                                                className={`transition-colors ${itemStates[item.id] === 'saved' ? 'text-emerald-500' : 'text-slate-500 hover:text-sky-400'}`}
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
                                                            <button onClick={() => handleDbRollback(item)} className="text-slate-500 hover:text-amber-400 transition-colors" title="Discard Changes (Reload from DB)">
                                                                <RotateCcw className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => initiateDelete([item.id])} className="text-slate-500 hover:text-red-500 transition-colors" title="Permanently Delete from DB">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                    {dataSource !== VerifierDataSource.Database && (
                                                        <button onClick={() => toggleDiscard(item.id)} className="text-slate-500 hover:text-red-400 transition-colors" title="Remove from list">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Query Section */}
                                            <div className="flex-1 min-h-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h4 className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                                                        Query
                                                        {item.isMultiTurn && <MessageCircle className="w-3 h-3 text-cyan-400" />}
                                                    </h4>
                                                    <div className="flex items-center gap-1">
                                                        {editingField?.itemId === item.id && editingField.field === OutputFieldName.Query ? (
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
                                                                <button onClick={() => startEditing(item.id, OutputFieldName.Query, item.query || (item as any).QUERY || item.full_seed || '')} className="p-1 text-slate-400 hover:text-white hover:bg-slate-900/60 rounded" title="Edit">
                                                                    <Edit3 className="w-3 h-3" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleFieldRewrite(item.id, VerifierRewriteTarget.Query)}
                                                                    disabled={rewritingField?.itemId === item.id && rewritingField.field === VerifierRewriteTarget.Query}
                                                                    className="p-1 text-slate-400 hover:text-sky-400 hover:bg-sky-900/30 rounded disabled:opacity-50"
                                                                    title="AI Rewrite"
                                                                >
                                                                    {rewritingField?.itemId === item.id && rewritingField.field === VerifierRewriteTarget.Query ? (
                                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                                    ) : (
                                                                        <RotateCcw className="w-3 h-3" />
                                                                    )}
                                                                </button>
                                                                {showRegenerateDropdown === item.id && (
                                                                    <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); }} />
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                {editingField?.itemId === item.id && editingField.field === OutputFieldName.Query ? (
                                                    <AutoResizeTextarea
                                                        value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        onBlur={saveEditing}
                                                        autoFocus
                                                        className="w-full bg-slate-950/70 border border-sky-500/50 rounded p-2 text-inherit outline-none min-h-[60px]"
                                                        placeholder="Enter query..."
                                                    />
                                                ) : (<p className="text-xs text-slate-100 line-clamp-2 font-medium">{item.query || (item as any).QUERY || item.full_seed || '(No query)'}</p>
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
                                                            className="flex items-center gap-1 text-[9px] text-slate-400 hover:text-cyan-400 transition-colors uppercase font-bold"
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
                                                                setEditingField({ itemId: item.id, field: VerifierRewriteTarget.MessageAnswer, messageIndex: idx, originalValue: content });
                                                                setEditValue(content);
                                                            }}
                                                            onEditSave={saveEditing}
                                                            onEditCancel={cancelEditing}
                                                            onEditChange={setEditValue}
                                                            onRewrite={(idx) => handleMessageRewrite(item.id, idx)}
                                                            onRewriteReasoning={(idx) => handleMessageReasoningRewrite(item.id, idx)}
                                                            onRewriteBoth={(idx) => handleMessageBothRewrite(item.id, idx)}
                                                            onRewriteQuery={(idx) => handleMessageQueryRewrite(item.id, idx)}
                                                            editingIndex={editingField?.itemId === item.id && editingField.field === VerifierRewriteTarget.MessageAnswer ? editingField.messageIndex : undefined}
                                                            editValue={editValue}
                                                            rewritingIndex={
                                                                rewritingField?.itemId === item.id &&
                                                                    (rewritingField.field === VerifierRewriteTarget.MessageAnswer || rewritingField.field === VerifierRewriteTarget.MessageReasoning || rewritingField.field === VerifierRewriteTarget.MessageBoth || rewritingField.field === VerifierRewriteTarget.MessageQuery)
                                                                    ? rewritingField.messageIndex
                                                                    : undefined
                                                            }
                                                            streamingContent={rewritingField?.itemId === item.id ? streamingContent : undefined}
                                                            streamingField={
                                                                rewritingField?.field === VerifierRewriteTarget.MessageReasoning ? StreamingField.Reasoning :
                                                                    rewritingField?.field === VerifierRewriteTarget.MessageAnswer ? StreamingField.Answer :
                                                                        rewritingField?.field === VerifierRewriteTarget.MessageBoth ? StreamingField.Both :
                                                                            rewritingField?.field === VerifierRewriteTarget.MessageQuery ? StreamingField.Query : undefined
                                                            }
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Reasoning Section */}
                                                    <div className="bg-slate-950/30 p-2 rounded border border-slate-800/70 my-2">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <h4 className="text-[10px] uppercase font-bold text-slate-400">Reasoning Trace</h4>
                                                            <div className="flex items-center gap-1 relative">
                                                                {editingField?.itemId === item.id && editingField.field === OutputFieldName.Reasoning ? (
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
                                                                        <button onClick={() => startEditing(item.id, OutputFieldName.Reasoning, item.reasoning)} className="p-1 text-slate-400 hover:text-white hover:bg-slate-900/60 rounded" title="Edit">
                                                                            <Edit3 className="w-3 h-3" />
                                                                        </button>
                                                                        <div className="relative">
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(showRegenerateDropdown === item.id ? null : item.id); }}
                                                                                disabled={rewritingField?.itemId === item.id}
                                                                                className="p-1 text-slate-400 hover:text-sky-400 hover:bg-sky-900/30 rounded disabled:opacity-50"
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
                                                                                    className="absolute right-0 top-full mt-1 bg-slate-900/60 border border-slate-700/70 rounded-lg shadow-xl z-20 py-1 min-w-[140px]"
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                >
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); handleFieldRewrite(item.id, VerifierRewriteTarget.Reasoning); }}
                                                                                        className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800/70 flex items-center gap-2"
                                                                                    >
                                                                                        <RotateCcw className="w-3 h-3" /> Reasoning Only
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); handleFieldRewrite(item.id, VerifierRewriteTarget.Answer); }}
                                                                                        className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800/70 flex items-center gap-2"
                                                                                    >
                                                                                        <RotateCcw className="w-3 h-3" /> Answer Only
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); setShowRegenerateDropdown(null); handleBothRewrite(item.id); }}
                                                                                        className="w-full px-3 py-2 text-left text-xs text-sky-400 hover:bg-slate-800/70 flex items-center gap-2 border-t border-slate-700/70"
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
                                                        {editingField?.itemId === item.id && editingField.field === OutputFieldName.Reasoning ? (
                                                            <AutoResizeTextarea
                                                                value={editValue}
                                                                onChange={e => setEditValue(e.target.value)}
                                                                onBlur={saveEditing}
                                                                autoFocus
                                                                className="w-full bg-slate-950/70 border border-sky-500/50 rounded p-2 text-inherit outline-none min-h-[100px] font-mono text-xs"
                                                            />
                                                        ) : (rewritingField?.itemId === item.id && rewritingField.field === VerifierRewriteTarget.Reasoning && streamingContent ? (
                                                            <div className="max-h-32 overflow-y-auto text-[10px] text-sky-300 font-mono animate-pulse">
                                                                {streamingContent}
                                                                <span className="inline-block w-2 h-3 bg-sky-400 ml-0.5 animate-pulse" />
                                                            </div>
                                                        ) : (
                                                            <div className="max-h-32 overflow-y-auto text-[10px] text-slate-300 font-mono">
                                                                <ReasoningHighlighter text={displayReasoning} />
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Answer Section */}
                                                    <div className="bg-slate-950/70 p-2 rounded border border-slate-800/70">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <h4 className="text-[10px] uppercase font-bold text-slate-400">Answer Preview</h4>
                                                            <div className="flex items-center gap-1">
                                                                {editingField?.itemId === item.id && editingField.field === OutputFieldName.Answer ? (
                                                                    <>
                                                                        <button onClick={saveEditing} className="p-1 text-green-400 hover:bg-green-900/30 rounded" title="Save">
                                                                            <Check className="w-3 h-3" />
                                                                        </button>
                                                                        <button onClick={cancelEditing} className="p-1 text-red-400 hover:bg-red-900/30 rounded" title="Cancel">
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <button onClick={() => startEditing(item.id, OutputFieldName.Answer, item.answer)} className="p-1 text-slate-400 hover:text-white hover:bg-slate-900/60 rounded" title="Edit">
                                                                        <Edit3 className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {editingField?.itemId === item.id && editingField.field === OutputFieldName.Answer ? (
                                                            <AutoResizeTextarea
                                                                value={editValue}
                                                                onChange={e => setEditValue(e.target.value)}
                                                                onBlur={saveEditing}
                                                                autoFocus
                                                                className="w-full bg-slate-950/70 border border-sky-500/50 rounded p-2 text-inherit outline-none min-h-[80px]"
                                                            />
                                                        ) : rewritingField?.itemId === item.id && rewritingField.field === VerifierRewriteTarget.Answer && streamingContent ? (
                                                            <div className="max-h-32 overflow-y-auto">
                                                                <p className="text-[10px] text-sky-300 font-mono whitespace-pre-wrap animate-pulse">
                                                                    {streamingContent}
                                                                    <span className="inline-block w-2 h-3 bg-sky-400 ml-0.5 animate-pulse" />
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <div className="max-h-32 overflow-y-auto">
                                                                <p className="text-[10px] text-slate-300 font-mono whitespace-pre-wrap">{displayAnswer}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </>
                                            )}

                                            <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-800/70 pt-2 mt-1">
                                                <span className="truncate max-w-[150px]">{item.modelUsed}</span>
                                                {item.deepMetadata && <span className="bg-sky-900/20 text-sky-400 px-1.5 py-0.5 rounded">Deep</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>


                            {/* Fetch More Button for DB */}
                            {dataSource === VerifierDataSource.Database && (
                                <div className="flex justify-center p-4 mt-2 border-t border-slate-800/70 bg-slate-950/70 rounded-xl">
                                    <button
                                        onClick={() => handleFetchMore(0, 0)}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-900/60 hover:bg-slate-800/70 text-slate-200 rounded-lg transition-colors border border-slate-700/70"
                                        disabled={isImporting}
                                    >
                                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                        <span>Fetch More Rows</span>
                                    </button>
                                </div>
                            )}

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-center gap-4 mt-2 p-3 bg-slate-950/70 rounded-xl border border-slate-800/70">
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="p-2 rounded-lg hover:bg-slate-900/60 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
                                        title="First Page"
                                    >
                                        <ChevronsLeft className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 rounded-lg hover:bg-slate-900/60 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
                                        title="Previous Page"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>

                                    <span className="text-xs font-mono text-slate-300">
                                        Page <span className="text-white font-bold">{currentPage}</span> of {totalPages}
                                    </span>

                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-2 rounded-lg hover:bg-slate-900/60 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
                                        title="Next Page"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="p-2 rounded-lg hover:bg-slate-900/60 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
                                        title="Last Page"
                                    >
                                        <ChevronsRight className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
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

            {(chatOpen ?? showChat) && typeof document !== 'undefined' && document.getElementById('verifier-assistant') &&
                createPortal(
                    <div className="h-full">
                        <ChatPanel data={data} setData={setData} modelConfig={modelConfig} toolExecutor={toolExecutorRef.current || undefined} />
                    </div>,
                    document.getElementById('verifier-assistant') as HTMLElement
                )}

            {/* Delete Confirmation Modal */}
            {deleteModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-950/70 border border-slate-700/70 p-6 rounded-xl shadow-2xl max-w-md w-full mx-4">
                        <div className="flex items-center gap-3 mb-4 text-red-500">
                            <div className="p-3 bg-red-500/10 rounded-full">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-white">Delete from Database?</h3>
                        </div>

                        <p className="text-slate-200 mb-6">
                            Are you sure you want to permanently delete <span className="font-bold text-white">{itemsToDelete.length}</span> item{itemsToDelete.length !== 1 ? 's' : ''}?
                            <br /><br />
                            This action cannot be undone.
                        </p>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteModalOpen(false)}
                                className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white transition-colors"
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
