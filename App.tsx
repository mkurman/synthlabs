import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Play, Pause, Download, Settings, Database, Cpu, Terminal,
    AlertCircle, CheckCircle2, ArrowRight, RefreshCw, Code,
    Sparkles, Wand2, Dice5, Trash2, Upload, Save, FileJson, ArrowLeftRight,
    Cloud, Laptop, ShieldCheck, Globe, Archive, FileText, Server, BrainCircuit,
    Timer, RotateCcw, MessageSquare, Table, Layers, Search, PenTool, GitBranch,
    PlusCircle, FileX, RefreshCcw, Copy, X, FileEdit, CloudUpload, CloudDownload, Calendar,
    LayoutDashboard, Bookmark, Beaker, List, Info
} from 'lucide-react';

import {
    SynthLogItem, ProviderType, AppMode, ExternalProvider,
    GenerationConfig, ProgressStats, HuggingFaceConfig, DetectedColumns,
    CATEGORIES, EngineMode, DeepConfig, DeepPhaseConfig, GenerationParams, FirebaseConfig, UserAgentConfig, ChatMessage
} from './types';
import { EXTERNAL_PROVIDERS } from './constants';
import { logger, setVerbose } from './utils/logger';
import { PromptService } from './services/promptService';
import * as GeminiService from './services/geminiService';
import * as FirebaseService from './services/firebaseService';
import * as ExternalApiService from './services/externalApiService';
import * as DeepReasoningService from './services/deepReasoningService';
import { LogStorageService } from './services/logStorageService';
import { SettingsService } from './services/settingsService';
import { TaskClassifierService, TaskType } from './services/taskClassifierService';
import { fetchHuggingFaceRows, searchDatasets, getDatasetStructure, getDatasetInfo } from './services/huggingFaceService';
import LogFeed from './components/LogFeed';
import ReasoningHighlighter from './components/ReasoningHighlighter';
import MiniDbPanel from './components/MiniDbPanel';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import VerifierPanel from './components/VerifierPanel';
import DataPreviewTable from './components/DataPreviewTable';
import SettingsPanel from './components/SettingsPanel';
import ColumnSelector from './components/ColumnSelector';

export default function App() {
    // --- State: Modes ---
    const [appView, setAppView] = useState<'creator' | 'verifier'>('creator'); // Top Level View
    const [appMode, setAppMode] = useState<AppMode>('generator');
    const [engineMode, setEngineMode] = useState<EngineMode>('regular');
    const [environment, setEnvironment] = useState<'development' | 'production'>('development');
    const [viewMode, setViewMode] = useState<'feed' | 'analytics'>('feed');

    // --- State: Session & DB ---
    const [sessionUid, setSessionUid] = useState<string>(crypto.randomUUID());
    const sessionUidRef = useRef(sessionUid);

    useEffect(() => {
        sessionUidRef.current = sessionUid;
    }, [sessionUid]);

    const [sessionName, setSessionName] = useState<string | null>(null);
    const sessionNameRef = useRef(sessionName);

    useEffect(() => {
        sessionNameRef.current = sessionName;
    }, [sessionName]);

    const [dbStats, setDbStats] = useState<{ total: number, session: number }>({ total: 0, session: 0 });
    const [sparklineHistory, setSparklineHistory] = useState<number[]>([]);

    // ... (Rest of state declarations identical to previous file, omitted for brevity but conceptually present) ...
    // --- State: Regular Config ---
    const [provider, setProvider] = useState<ProviderType>('gemini');
    const [externalProvider, setExternalProvider] = useState<ExternalProvider>('openrouter');
    const [externalApiKey, setExternalApiKey] = useState('');
    const [externalModel, setExternalModel] = useState('anthropic/claude-3.5-sonnet');
    const [customBaseUrl, setCustomBaseUrl] = useState('');

    // --- State: Generation Params ---
    const [temperature, setTemperature] = useState<string>('');
    const [topP, setTopP] = useState<string>('');
    const [topK, setTopK] = useState<string>('');
    const [frequencyPenalty, setFrequencyPenalty] = useState<string>('');
    const [presencePenalty, setPresencePenalty] = useState<string>('');

    // --- State: Deep Config ---
    const [deepConfig, setDeepConfig] = useState<DeepConfig>({
        phases: {
            meta: {
                id: 'meta', enabled: true, provider: 'gemini', externalProvider: 'openrouter', apiKey: '', model: 'gemini-3-flash-preview', customBaseUrl: '', systemPrompt: PromptService.getPrompt('generator', 'meta')
            },
            retrieval: {
                id: 'retrieval', enabled: true, provider: 'gemini', externalProvider: 'openrouter', apiKey: '', model: 'gemini-3-flash-preview', customBaseUrl: '', systemPrompt: PromptService.getPrompt('generator', 'retrieval')
            },
            derivation: {
                id: 'derivation', enabled: true, provider: 'gemini', externalProvider: 'openrouter', apiKey: '', model: 'gemini-3-flash-preview', customBaseUrl: '', systemPrompt: PromptService.getPrompt('generator', 'derivation')
            },
            writer: {
                id: 'writer', enabled: true, provider: 'gemini', externalProvider: 'openrouter', apiKey: '', model: 'gemini-3-flash-preview', customBaseUrl: '', systemPrompt: PromptService.getPrompt('converter', 'writer')
            },
            rewriter: {
                id: 'rewriter', enabled: false, provider: 'gemini', externalProvider: 'openrouter', apiKey: '', model: 'gemini-3-flash-preview', customBaseUrl: '', systemPrompt: PromptService.getPrompt('converter', 'rewriter')
            }
        }
    });

    const [concurrency, setConcurrency] = useState(1);
    const [rowsToFetch, setRowsToFetch] = useState(10);
    const [skipRows, setSkipRows] = useState(0);

    // Rate Limits & Retry Config
    const [sleepTime, setSleepTime] = useState(500); // ms
    const [maxRetries, setMaxRetries] = useState(5);
    const [retryDelay, setRetryDelay] = useState(2000); // ms

    // Feed Config
    const [feedPageSize, setFeedPageSize] = useState<number>(25);

    // --- State: Multi-Turn Conversation ---
    const [userAgentConfig, setUserAgentConfig] = useState<UserAgentConfig>({
        enabled: false,
        followUpCount: 2,
        responderPhase: 'responder',
        provider: 'gemini',
        externalProvider: 'openrouter',
        apiKey: '',
        model: 'gemini-3-flash-preview',
        customBaseUrl: '',
        systemPrompt: PromptService.getPrompt('generator', 'user_agent')
    });

    // --- State: Conversation Trace Rewriting ---
    // When enabled, processes existing conversation columns and rewrites <think> content
    const [conversationRewriteMode, setConversationRewriteMode] = useState(false);


    // --- State: Data Source ---
    const [dataSourceMode, setDataSourceMode] = useState<'synthetic' | 'huggingface' | 'manual'>('synthetic');

    // 1. Synthetic
    const [geminiTopic, setGeminiTopic] = useState('Advanced Quantum Mechanics');
    const [topicCategory, setTopicCategory] = useState('Random (Any)');
    const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);

    // 2. Hugging Face
    const [hfConfig, setHfConfig] = useState<HuggingFaceConfig>({
        dataset: 'fka/awesome-chatgpt-prompts',
        config: 'default',
        split: 'train',
        columnName: '',
        inputColumns: [],
        outputColumns: [],
        messageTurnIndex: 0
    });

    // HF Search & Structure
    const [hfSearchResults, setHfSearchResults] = useState<string[]>([]);
    const [isSearchingHF, setIsSearchingHF] = useState(false);
    const [hfStructure, setHfStructure] = useState<{ configs: string[], splits: Record<string, string[]> }>({ configs: [], splits: {} });
    const [showHFResults, setShowHFResults] = useState(false);
    const searchTimeoutRef = useRef<number | null>(null);

    // 3. Manual Input
    const [converterInputText, setConverterInputText] = useState('');

    // --- State: Firebase Config UI ---
    const [firebaseConfigInput, setFirebaseConfigInput] = useState<FirebaseConfig>({
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: ''
    });

    // --- State: Cloud Session Management ---
    const [showCloudLoadModal, setShowCloudLoadModal] = useState(false);
    const [cloudSessions, setCloudSessions] = useState<FirebaseService.SavedSession[]>([]);
    const [isCloudLoading, setIsCloudLoading] = useState(false);

    // --- State: Task Classification / Auto-routing ---
    const [detectedTaskType, setDetectedTaskType] = useState<TaskType | null>(null);
    const [autoRoutedPromptSet, setAutoRoutedPromptSet] = useState<string | null>(null);

    // --- State: Session-level Prompt Set (overrides user preferences for this session only) ---
    const [sessionPromptSet, setSessionPromptSet] = useState<string | null>(null);
    const [availablePromptSets, setAvailablePromptSets] = useState<string[]>([]);

    // --- State: Hugging Face Prefetch ---
    const [availableColumns, setAvailableColumns] = useState<string[]>([]);
    const [detectedColumns, setDetectedColumns] = useState<DetectedColumns>({ input: [], output: [], all: [], reasoning: [] });
    const [isPrefetching, setIsPrefetching] = useState(false);
    const [hfPreviewData, setHfPreviewData] = useState<any[]>([]);
    const [hfTotalRows, setHfTotalRows] = useState<number>(0);
    const [isLoadingHfPreview, setIsLoadingHfPreview] = useState(false);

    // Column detection utility with expanded patterns
    const detectColumns = (columns: string[]): DetectedColumns => {
        const inputPatterns = [
            'query', 'question', 'prompt', 'input', 'instruction', 'text', 'problem', 'request',
            'context', 'document', 'passage', 'user', 'human', 'message', 'conversation',
            'dialog', 'task'
        ];
        const outputPatterns = [
            'response', 'answer', 'output', 'completion', 'chosen', 'target', 'solution', 'reply',
            'assistant', 'gold', 'label', 'expected', 'ground_truth', 'groundtruth', 'reference',
            'correct', 'synthetic_answer', 'gpt', 'model_output'
        ];
        const reasoningPatterns = [
            'reasoning', 'thought', 'think', 'rationale', 'chain', 'brain', 'logic', 'cot',
            'explanation', 'analysis', 'steps', 'work', 'process', 'derivation', 'justification',
            'scratchpad', 'synthetic_reasoning', 'trace'
        ];

        // Score-based detection: exact matches rank higher
        const scoreMatch = (col: string, patterns: string[]): number => {
            const name = col.toLowerCase();
            if (patterns.includes(name)) return 1.0; // Exact match
            if (patterns.some(p => name.startsWith(p))) return 0.8; // Starts with
            if (patterns.some(p => name.includes(p))) return 0.5; // Contains
            return 0;
        };

        const input = columns
            .map(c => ({ col: c, score: scoreMatch(c, inputPatterns) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(x => x.col);

        const output = columns
            .map(c => ({ col: c, score: scoreMatch(c, outputPatterns) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(x => x.col);

        const reasoning = columns
            .map(c => ({ col: c, score: scoreMatch(c, reasoningPatterns) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(x => x.col);

        return { input, output, reasoning, all: columns };
    };

    // --- State: Runtime ---
    const [systemPrompt, setSystemPrompt] = useState(PromptService.getPrompt('generator', 'system'));
    const [converterPrompt, setConverterPrompt] = useState(PromptService.getPrompt('converter', 'system'));

    // Log Management
    const [visibleLogs, setVisibleLogs] = useState<SynthLogItem[]>([]);
    const [totalLogCount, setTotalLogCount] = useState(0);
    const [logsTrigger, setLogsTrigger] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);

    const [isRunning, setIsRunning] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [progress, setProgress] = useState<ProgressStats>({ current: 0, total: 0, activeWorkers: 0 });
    const [error, setError] = useState<string | null>(null);
    const [showOverwriteModal, setShowOverwriteModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Retry State
    const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

    // UI State for Deep Config
    const [activeDeepTab, setActiveDeepTab] = useState<'meta' | 'retrieval' | 'derivation' | 'writer' | 'rewriter'>('meta');

    const abortControllerRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sessionFileInputRef = useRef<HTMLInputElement>(null);
    const sourceFileInputRef = useRef<HTMLInputElement>(null);
    const environmentRef = useRef(environment);



    // --- Effects ---
    useEffect(() => {
        // Attempt to load Firebase Config from local storage on mount
        const savedConfig = localStorage.getItem('synth_firebase_config');
        if (savedConfig) {
            try {
                const parsed = JSON.parse(savedConfig);
                setFirebaseConfigInput(parsed);
                FirebaseService.initializeFirebase(parsed).then(success => {
                    if (success) {
                        logger.log("Restored Firebase config from storage");
                        updateDbStats(); // Initial fetch
                    }
                });
            } catch (e) {
                console.error("Failed to parse saved firebase config");
            }
        }
    }, []);

    // Load available prompt sets on mount
    useEffect(() => {
        const sets = PromptService.getAvailableSets();
        setAvailablePromptSets(sets);
    }, []);

    // Reload all prompts when session prompt set changes
    useEffect(() => {
        // Determine which prompt set to use (session override or user's default)
        const activeSet = sessionPromptSet || SettingsService.getSettings().promptSet || 'default';

        // Update regular mode prompts (SYSTEM RUBRIC)
        setSystemPrompt(PromptService.getPrompt('generator', 'system', activeSet));
        setConverterPrompt(PromptService.getPrompt('converter', 'system', activeSet));

        // Update deepConfig phases with prompts from the active set
        setDeepConfig((prev: DeepConfig) => ({
            ...prev,
            phases: {
                meta: { ...prev.phases.meta, systemPrompt: PromptService.getPrompt('generator', 'meta', activeSet) },
                retrieval: { ...prev.phases.retrieval, systemPrompt: PromptService.getPrompt('generator', 'retrieval', activeSet) },
                derivation: { ...prev.phases.derivation, systemPrompt: PromptService.getPrompt('generator', 'derivation', activeSet) },
                writer: { ...prev.phases.writer, systemPrompt: PromptService.getPrompt('converter', 'writer', activeSet) },
                rewriter: { ...prev.phases.rewriter, systemPrompt: PromptService.getPrompt('converter', 'rewriter', activeSet) }
            }
        }));

        // Update userAgentConfig
        setUserAgentConfig((prev: UserAgentConfig) => ({
            ...prev,
            systemPrompt: PromptService.getPrompt('generator', 'user_agent', activeSet)
        }));
    }, [sessionPromptSet]);

    // Load logs from local storage when session changes or pagination upgrades
    const refreshLogs = useCallback(async () => {
        // Use ref to ensure we read from the same session the worker is writing to
        const currentSessionId = sessionUidRef.current;
        const storedLogs = await LogStorageService.getLogs(currentSessionId, currentPage, feedPageSize);
        setVisibleLogs(storedLogs);
        const total = await LogStorageService.getTotalCount(currentSessionId);
        setTotalLogCount(total);
    }, [currentPage, feedPageSize, logsTrigger]);

    // Initial Load & Session Switch
    useEffect(() => {
        refreshLogs();
    }, [refreshLogs]);

    // Reset to page 1 on session switch if not handled otherwise
    useEffect(() => {
        setCurrentPage(1);
    }, [sessionUid]);

    // Toggle verbose logging based on environment mode
    // Toggle verbose logging based on environment mode
    useEffect(() => {
        environmentRef.current = environment;
        // In production mode, disable verbose logging
        setVerbose(environment === 'development');
    }, [environment]);

    // Update DB Stats Periodically or when logs change
    const updateDbStats = useCallback(async () => {
        if (environment === 'production' && FirebaseService.isFirebaseConfigured()) {
            const stats = await FirebaseService.getDbStats(sessionUid);
            setDbStats(stats);
        }
    }, [environment, sessionUid]);

    useEffect(() => {
        // Poll stats every 10 seconds in prod
        if (environment === 'production') {
            const interval = setInterval(updateDbStats, 10000);
            return () => clearInterval(interval);
        }
    }, [environment, updateDbStats]);

    // Update sparkline history when progress changes
    useEffect(() => {
        if (isRunning && progress.current > 0) {
            setSparklineHistory(prev => {
                const next = [...prev, progress.current];
                if (next.length > 20) return next.slice(next.length - 20);
                return next;
            });
        }
    }, [progress.current, isRunning]);

    // ... (Helper Extraction, RowContent, Action functions same as before) ...
    // Re-pasting the core helpers to ensure file integrity

    const extractInputContent = (text: string, options: { format?: 'llm' | 'display' } = {}): string => {
        const queryMatch = text.match(/<input_query>([\s\S]*?)<\/input_query>/);
        const responseMatch = text.match(/<model_response>([\s\S]*?)<\/model_response>/);

        if (queryMatch && responseMatch) {
            const query = queryMatch[1].trim();
            const rawResponse = responseMatch[1].trim();
            const thinkMatch = rawResponse.match(/<think>([\s\S]*?)<\/think>/i);
            const logic = thinkMatch ? thinkMatch[1].trim() : rawResponse;

            if (options.format === 'display') {
                return query; // Just return the query for UI summary
            }
            return `[USER QUERY]:\n${query}\n\n[RAW REASONING TRACE]:\n${logic}`;
        }

        const match = text.match(/<think>([\s\S]*?)<\/think>/i);
        if (match && match[1]) {
            return match[1].trim();
        }
        return text.trim();
    };

    const getRowContent = (row: any): string => {
        const COLUMN_SEPARATOR = '\n\n' + '-'.repeat(50) + '\n\n';

        // Helper to format MCQ options from dict or list into readable string
        const formatMcqOptions = (options: any): string => {
            if (!options) return '';

            // Handle dictionary format: {"A": "option text", "B": "option text"}
            if (typeof options === 'object' && !Array.isArray(options)) {
                return Object.entries(options)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('\n');
            }

            // Handle array format: ["option A", "option B"] - add A, B, C labels
            if (Array.isArray(options)) {
                const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                return options
                    .map((opt: any, idx: number) => `${labels[idx] || idx + 1}: ${typeof opt === 'object' ? JSON.stringify(opt) : opt}`)
                    .join('\n');
            }

            // Fallback for string (already formatted)
            if (typeof options === 'string') return options;

            return JSON.stringify(options);
        };

        const getText = (node: any): string => {
            if (!node) return "";
            if (typeof node === 'string') return node;
            if (Array.isArray(node)) return node.map(getText).join('\n');
            return node.content || node.value || node.text || JSON.stringify(node);
        };

        // Helper to get content from a column
        const getColumnContent = (columnName: string): string => {
            const value = row[columnName];
            if (value === undefined || value === null) return '';

            // Return string values as-is (what's in the dataset is what you get)
            if (typeof value === 'string') return value;

            // Handle array content (e.g., chat messages)
            if (Array.isArray(value)) {
                const turnIndex = hfConfig.messageTurnIndex || 0;
                const firstItem = value[0];
                const isChat = firstItem && typeof firstItem === 'object' && ('role' in firstItem || 'from' in firstItem);
                if (isChat) {
                    if (appMode === 'converter') {
                        const userIndex = turnIndex * 2;
                        const assistantIndex = turnIndex * 2 + 1;
                        const userMsg = value[userIndex];
                        const assistantMsg = value[assistantIndex];
                        if (userMsg && assistantMsg) {
                            return `<input_query>${getText(userMsg)}</input_query><model_response>${getText(assistantMsg)}</model_response>`;
                        }
                    }
                    return getText(value[turnIndex * 2]);
                } else {
                    return getText(value[turnIndex]);
                }
            }

            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
        };

        // Try inputColumns first (new multi-column approach)
        if (hfConfig.inputColumns && hfConfig.inputColumns.length > 0) {
            const contents = hfConfig.inputColumns
                .map((col: string) => getColumnContent(col))
                .filter((c: string) => c.trim() !== '');

            // Append MCQ options if mcqColumn is configured
            if (hfConfig.mcqColumn && row[hfConfig.mcqColumn]) {
                const formattedOptions = formatMcqOptions(row[hfConfig.mcqColumn]);
                if (formattedOptions) {
                    contents.push('\nOptions:\n' + formattedOptions);
                }
            }

            // Append reasoning if reasoningColumns are configured
            if (hfConfig.reasoningColumns && hfConfig.reasoningColumns.length > 0) {
                const reasoning = hfConfig.reasoningColumns
                    .map((col: string) => getColumnContent(col))
                    .filter((c: string) => c.trim() !== '')
                    .join('\n\n');

                if (reasoning) {
                    // If we have input content (query), we wrap both for extractInputContent
                    const inputQuery = contents.join(COLUMN_SEPARATOR);
                    return `<input_query>${inputQuery}</input_query><model_response><think>${reasoning}</think></model_response>`;
                }
            }

            if (contents.length > 0) {
                return contents.join(COLUMN_SEPARATOR);
            }
        }

        // Fallback to legacy columnName
        if (hfConfig.columnName && row[hfConfig.columnName] !== undefined) {
            return getColumnContent(hfConfig.columnName);
        }

        // Auto-detect fallback
        const autoContent = row.messages || row.conversations || row.conversation ||
            row.prompt || row.instruction || row.text || row.content || row.input || row;

        if (Array.isArray(autoContent)) {
            const turnIndex = hfConfig.messageTurnIndex || 0;
            const firstItem = autoContent[0];
            const isChat = firstItem && typeof firstItem === 'object' && ('role' in firstItem || 'from' in firstItem);
            if (appMode === 'converter') {
                if (isChat) {
                    const userIndex = turnIndex * 2;
                    const assistantIndex = turnIndex * 2 + 1;
                    const userMsg = autoContent[userIndex];
                    const assistantMsg = autoContent[assistantIndex];
                    if (userMsg && assistantMsg) {
                        return `<input_query>${getText(userMsg)}</input_query><model_response>${getText(assistantMsg)}</model_response>`;
                    }
                }
                return getText(autoContent[turnIndex]);
            } else {
                if (isChat) {
                    return getText(autoContent[turnIndex * 2]);
                } else {
                    return getText(autoContent[turnIndex]);
                }
            }
        }
        if (typeof autoContent === 'object') return JSON.stringify(autoContent);
        return String(autoContent);
    };

    const getRowExpectedOutput = (row: any): string => {
        if (!row) return "";

        const getText = (node: any): string => {
            if (!node) return "";
            if (typeof node === 'string') return node;
            if (Array.isArray(node)) return node.map(getText).join('\n');
            return node.content || node.value || node.text || JSON.stringify(node);
        };

        const getColumnContent = (columnName: string): string => {
            const value = row[columnName];
            if (value === undefined || value === null) return '';

            if (Array.isArray(value)) {
                const turnIndex = hfConfig.messageTurnIndex || 0;
                const firstItem = value[0];
                const isChat = firstItem && typeof firstItem === 'object' && ('role' in firstItem || 'from' in firstItem);
                if (isChat) {
                    // For output, we usually want the assistant response if it's chat
                    return getText(value[turnIndex * 2 + 1] || value[turnIndex * 2]);
                }
                return getText(value[turnIndex]);
            }

            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
        };

        // Try outputColumns if configured
        if (hfConfig.outputColumns && hfConfig.outputColumns.length > 0) {
            return hfConfig.outputColumns
                .map((col: string) => getColumnContent(col))
                .filter((c: string) => c.trim() !== '')
                .join('\n\n');
        }

        // Auto-detect fallback for answer
        const candidates = ['answer', 'output', 'response', 'target', 'label', 'gpt', 'assistant'];
        for (const c of candidates) {
            if (row[c]) return getColumnContent(c);
        }

        // Try messages/conversation format
        const msgs = row.messages || row.conversation || row.conversations;
        if (Array.isArray(msgs)) {
            const turnIndex = hfConfig.messageTurnIndex || 0;
            const assistantMsg = msgs.find((m: any, idx: number) =>
                (m.role === 'assistant' || m.from === 'gpt') && idx >= turnIndex * 2
            );
            if (assistantMsg) return getText(assistantMsg);
        }

        return "";
    };

    const prefetchColumns = async (overrideConfig?: HuggingFaceConfig) => {
        const configToUse = overrideConfig || hfConfig;
        if (!configToUse.dataset) {
            setError("Please enter a Dataset ID first.");
            return;
        }
        setIsPrefetching(true);
        setAvailableColumns([]);
        setDetectedColumns({ input: [], output: [], all: [], reasoning: [] });
        setError(null);
        try {
            const rows = await fetchHuggingFaceRows(configToUse, 0, 1);
            if (rows.length > 0 && rows[0]) {
                if (typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
                    const cols = Object.keys(rows[0]);
                    setAvailableColumns(cols);

                    // Detect and auto-populate columns
                    const detected = detectColumns(cols);
                    setDetectedColumns(detected);

                    // Auto-select detected columns if none are already selected
                    if ((!configToUse.inputColumns || configToUse.inputColumns.length === 0) && detected.input.length > 0) {
                        setHfConfig(prev => ({ ...prev, inputColumns: detected.input.slice(0, 1) })); // Select first detected input
                    }
                    if ((!configToUse.outputColumns || configToUse.outputColumns.length === 0) && detected.output.length > 0) {
                        setHfConfig(prev => ({ ...prev, outputColumns: detected.output.slice(0, 1) })); // Select first detected output
                    }
                    if ((!configToUse.reasoningColumns || configToUse.reasoningColumns.length === 0) && detected.reasoning.length > 0) {
                        setHfConfig(prev => ({ ...prev, reasoningColumns: detected.reasoning.slice(0, 1) })); // Select first detected reasoning
                    }
                } else {
                    setError("Row is not an object, cannot detect columns.");
                }
            } else {
                setError("No rows returned from dataset.");
            }
        } catch (e: any) {
            console.error(e);
            setError("Failed to fetch row: " + (e.message || "Unknown error"));
        } finally {
            setIsPrefetching(false);
        }
    };

    const handleHFSearch = (query: string) => {
        setHfConfig(prev => ({ ...prev, dataset: query }));
        if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
        if (query.length < 3) {
            setHfSearchResults([]);
            setShowHFResults(false);
            return;
        }
        setIsSearchingHF(true);
        searchTimeoutRef.current = window.setTimeout(async () => {
            const results = await searchDatasets(query);
            setHfSearchResults(results);
            setShowHFResults(true);
            setIsSearchingHF(false);
        }, 500);
    };

    const handleSelectHFDataset = async (datasetId: string) => {
        setHfConfig(prev => ({ ...prev, dataset: datasetId, config: '', split: '' }));
        setShowHFResults(false);
        setHfPreviewData([]);
        setHfTotalRows(0);

        const structure = await getDatasetStructure(datasetId);
        setHfStructure(structure);
        if (structure.configs.length > 0) {
            const defaultConfig = structure.configs.includes('default') ? 'default' : structure.configs[0];
            const splits = structure.splits[defaultConfig] || [];
            const defaultSplit = splits.includes('train') ? 'train' : (splits[0] || '');
            const newConfig = { ...hfConfig, dataset: datasetId, config: defaultConfig, split: defaultSplit };
            setHfConfig(newConfig);

            // Fetch preview data and row count
            setIsLoadingHfPreview(true);
            try {
                const [previewRows, datasetInfo] = await Promise.all([
                    fetchHuggingFaceRows(newConfig, 0, 5),
                    getDatasetInfo(datasetId, defaultConfig, defaultSplit)
                ]);
                setHfPreviewData(previewRows);
                setHfTotalRows(datasetInfo.totalRows);
            } catch (e) {
                console.error('Failed to fetch HF preview:', e);
            } finally {
                setIsLoadingHfPreview(false);
            }

            prefetchColumns(newConfig);
        }
    };

    const handleConfigChange = (newConfig: string) => {
        const splits = hfStructure.splits[newConfig] || [];
        const newSplit = splits.includes('train') ? 'train' : (splits[0] || '');
        setHfConfig({ ...hfConfig, config: newConfig, split: newSplit });
        setAvailableColumns([]);
    };

    const handleDataSourceModeChange = (mode: 'synthetic' | 'huggingface' | 'manual') => {
        setDataSourceMode(mode);
        // Clear column selections when switching data sources
        setAvailableColumns([]);
        setDetectedColumns({ input: [], output: [], all: [], reasoning: [] });
        setHfConfig(prev => ({ ...prev, inputColumns: [], outputColumns: [], reasoningColumns: [] }));
    };


    const generateRandomTopic = async () => {
        setIsGeneratingTopic(true);
        try {
            const cat = topicCategory === 'Random (Any)'
                ? CATEGORIES[Math.floor(Math.random() * (CATEGORIES.length - 1)) + 1]
                : topicCategory;
            const topic = await GeminiService.generateGeminiTopic(cat);
            setGeminiTopic(topic);
        } catch (e) {
            setError("Topic generation failed.");
        } finally {
            setIsGeneratingTopic(false);
        }
    };

    const optimizePrompt = async () => {
        setIsOptimizing(true);
        try {
            const activePrompt = appMode === 'generator' ? systemPrompt : converterPrompt;
            const settings = SettingsService.getSettings();
            const generalPurposeModel = settings.generalPurposeModel;

            console.log('[Optimize] General purpose model:', generalPurposeModel);
            console.log('[Optimize] Provider keys:', settings.providerKeys);
            console.log('[Optimize] Custom endpoint URL:', settings.customEndpointUrl);

            let config: GeminiService.OptimizePromptConfig | undefined;

            if (generalPurposeModel && generalPurposeModel.model) {
                const isExternal = generalPurposeModel.provider === 'external';
                const isOther = generalPurposeModel.provider === 'other';
                let apiKey = '';

                console.log('[Optimize] provider:', generalPurposeModel.provider, 'isExternal:', isExternal, 'isOther:', isOther, 'externalProvider:', generalPurposeModel.externalProvider);

                let externalProvider = generalPurposeModel.externalProvider;

                if (isOther) {
                    externalProvider = 'other';
                }

                if (isExternal || isOther) {
                    apiKey = SettingsService.getApiKey(externalProvider);
                    console.log('[Optimize] API key for', externalProvider, ':', apiKey ? '***' : '(empty)');
                } else {
                    apiKey = SettingsService.getApiKey('gemini');
                    console.log('[Optimize] Gemini API key:', apiKey ? '***' : '(empty)');
                }

                const customBaseUrl = SettingsService.getCustomBaseUrl();
                console.log('[Optimize] Custom base URL:', customBaseUrl);

                if ((isExternal || isOther) && externalProvider && generalPurposeModel.model && apiKey) {
                    config = {
                        provider: 'external',
                        externalProvider: externalProvider,
                        model: generalPurposeModel.model,
                        customBaseUrl: customBaseUrl,
                        apiKey
                    };
                    console.log('[Optimize] Config built for external provider:', config);
                } else if (!isExternal && !isOther && apiKey) {
                    config = {
                        provider: 'gemini',
                        model: generalPurposeModel.model
                    };
                    console.log('[Optimize] Config built for Gemini:', config);
                }
            }

            if (!config) {
                console.error('[Optimize] No config built! generalPurposeModel:', generalPurposeModel);
                throw new Error(generalPurposeModel?.provider === 'external' || generalPurposeModel?.provider === 'other'
                    ? 'General purpose model is incomplete. Please set: Provider, Model, and API Key in Settings → API Keys.'
                    : 'No model configured. Please set a model in Settings → Default Models → General purpose model.');
            }


            config.structuredOutput = false

            const refined = await GeminiService.optimizeSystemPrompt(activePrompt, config);
            if (appMode === 'generator') setSystemPrompt(refined);
            else setConverterPrompt(refined);
        } catch (e) {
            setError(`Prompt optimization failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleLoadRubric = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            if (typeof event.target?.result === 'string') {
                if (appMode === 'generator') setSystemPrompt(event.target.result);
                else setConverterPrompt(event.target.result);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleLoadSourceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            if (typeof event.target?.result === 'string') {
                const inputText = event.target.result;
                setConverterInputText(inputText);

                // Detect columns from JSON data (array or JSONL)
                const trimmedText = inputText.trim();
                let detectedCols: string[] = [];
                let rowCount = 0;

                // First try parsing as JSON array
                if (trimmedText.startsWith('[') && trimmedText.endsWith(']')) {
                    try {
                        const arr = JSON.parse(trimmedText);
                        if (Array.isArray(arr)) {
                            rowCount = arr.length;
                            if (arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
                                detectedCols = Object.keys(arr[0]);
                            }
                        }
                    } catch {
                        // Not valid JSON array, try JSONL
                    }
                }

                // Fallback row count for JSONL/text format
                if (rowCount === 0) {
                    rowCount = inputText.split('\n').filter(l => l.trim()).length;
                }

                // Set the correct row count
                setRowsToFetch(rowCount);

                // Fallback to JSONL format if no columns detected
                if (detectedCols.length === 0) {
                    const lines = inputText.split('\n').filter(l => l.trim());
                    for (const line of lines) {
                        try {
                            const obj = JSON.parse(line);
                            if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
                                detectedCols = Object.keys(obj);
                                break;
                            }
                        } catch {
                            // Not valid JSON, continue
                        }
                    }
                }

                // Apply detected columns
                if (detectedCols.length > 0) {
                    setAvailableColumns(detectedCols);
                    const detected = detectColumns(detectedCols);
                    setDetectedColumns(detected);
                    // Auto-select first detected input column if none selected
                    if ((!hfConfig.inputColumns || hfConfig.inputColumns.length === 0) && detected.input.length > 0) {
                        setHfConfig(prev => ({ ...prev, inputColumns: detected.input.slice(0, 1) }));
                    }
                    // Auto-select detected reasoning columns if none selected
                    if ((!hfConfig.reasoningColumns || hfConfig.reasoningColumns.length === 0) && detected.reasoning.length > 0) {
                        setHfConfig(prev => ({ ...prev, reasoningColumns: detected.reasoning }));
                    }
                }
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleSaveRubric = () => {
        const content = appMode === 'generator' ? systemPrompt : converterPrompt;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${appMode}_rubric_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const updateDeepPhase = (phase: keyof DeepConfig['phases'], updates: Partial<DeepPhaseConfig>) => {
        setDeepConfig(prev => ({
            ...prev,
            phases: {
                ...prev.phases,
                [phase]: { ...prev.phases[phase], ...updates }
            }
        }));
    };

    const copyDeepConfigToAll = (sourcePhase: keyof DeepConfig['phases']) => {
        const source = deepConfig.phases[sourcePhase];
        setDeepConfig(prev => {
            const newPhases = { ...prev.phases };
            (Object.keys(newPhases) as Array<keyof DeepConfig['phases']>).forEach(key => {
                newPhases[key] = {
                    ...newPhases[key],
                    provider: source.provider,
                    externalProvider: source.externalProvider,
                    apiKey: source.apiKey,
                    model: source.model,
                    customBaseUrl: source.customBaseUrl
                };
            });
            return { ...prev, phases: newPhases };
        });
        // Also apply to User Agent config
        setUserAgentConfig(prev => ({
            ...prev,
            provider: source.provider,
            externalProvider: source.externalProvider,
            apiKey: source.apiKey,
            model: source.model,
            customBaseUrl: source.customBaseUrl
        }));
    };

    const getGenerationParams = (): GenerationParams | undefined => {
        const params: GenerationParams = {};
        let hasParams = false;
        if (temperature !== '') { params.temperature = parseFloat(temperature); hasParams = true; }
        if (topP !== '') { params.topP = parseFloat(topP); hasParams = true; }
        if (topK !== '') { params.topK = parseInt(topK); hasParams = true; }
        if (frequencyPenalty !== '') { params.frequencyPenalty = parseFloat(frequencyPenalty); hasParams = true; }
        if (presencePenalty !== '') { params.presencePenalty = parseFloat(presencePenalty); hasParams = true; }
        return hasParams ? params : undefined;
    };

    const handleSaveFirebaseConfig = async () => {
        const success = await FirebaseService.initializeFirebase(firebaseConfigInput);
        if (success) {
            localStorage.setItem('synth_firebase_config', JSON.stringify(firebaseConfigInput));
            setError(null);
            updateDbStats();
        } else {
            setError("Failed to initialize Firebase with these settings. Check console.");
        }
    };

    // --- Session Management ---

    const getSessionData = () => {
        return {
            version: 2,
            createdAt: new Date().toISOString(),
            sessionUid: sessionUid, // Include sessionUid to track logs across sessions
            config: {
                appMode, engineMode, environment, provider, externalProvider, externalApiKey, externalModel,
                customBaseUrl, deepConfig, userAgentConfig, concurrency, rowsToFetch, skipRows, sleepTime, maxRetries, retryDelay,
                feedPageSize, dataSourceMode, hfConfig, geminiTopic, topicCategory, systemPrompt, converterPrompt, conversationRewriteMode,
                converterInputText, generationParams: { temperature, topP, topK, frequencyPenalty, presencePenalty }
            }
        };
    };

    const restoreSession = (session: any, savedSessionUid?: string) => {
        try {
            // Restore sessionUid if provided (for cloud sessions)
            if (savedSessionUid) {
                setSessionUid(savedSessionUid);
            }
            if (session.config) {
                const c = session.config;
                if (c.appMode) setAppMode(c.appMode);
                if (c.engineMode) setEngineMode(c.engineMode);
                if (c.environment) setEnvironment(c.environment);
                if (c.provider) setProvider(c.provider);
                if (c.externalProvider) setExternalProvider(c.externalProvider);
                if (c.externalApiKey !== undefined) setExternalApiKey(c.externalApiKey);
                if (c.externalModel) setExternalModel(c.externalModel);
                if (c.customBaseUrl !== undefined) setCustomBaseUrl(c.customBaseUrl);
                if (c.deepConfig) {
                    // Backfill missing rewriter phase for older sessions
                    const mergedDeepConfig = { ...c.deepConfig };
                    if (!mergedDeepConfig.phases.rewriter) {
                        mergedDeepConfig.phases.rewriter = {
                            id: 'rewriter',
                            enabled: false,
                            provider: 'gemini',
                            externalProvider: 'openrouter',
                            apiKey: '',
                            model: 'gemini-3-flash-preview',
                            customBaseUrl: '',
                            systemPrompt: PromptService.getPrompt('converter', 'rewriter')
                        };
                    }
                    setDeepConfig(mergedDeepConfig);
                }
                if (c.userAgentConfig) {
                    setUserAgentConfig(c.userAgentConfig);
                }
                if (c.concurrency) setConcurrency(c.concurrency);
                if (c.rowsToFetch) setRowsToFetch(c.rowsToFetch);
                if (c.skipRows !== undefined) setSkipRows(c.skipRows);
                if (c.sleepTime !== undefined) setSleepTime(c.sleepTime);
                if (c.maxRetries !== undefined) setMaxRetries(c.maxRetries);
                if (c.retryDelay !== undefined) setRetryDelay(c.retryDelay);
                if (c.feedPageSize !== undefined) setFeedPageSize(c.feedPageSize);
                if (c.dataSourceMode) setDataSourceMode(c.dataSourceMode);
                if (c.hfConfig) setHfConfig(c.hfConfig);
                if (c.geminiTopic) setGeminiTopic(c.geminiTopic);
                if (c.topicCategory) setTopicCategory(c.topicCategory);
                if (c.systemPrompt) setSystemPrompt(c.systemPrompt);
                if (c.converterPrompt) setConverterPrompt(c.converterPrompt);
                if (c.conversationRewriteMode !== undefined) setConversationRewriteMode(c.conversationRewriteMode);
                if (c.converterInputText) setConverterInputText(c.converterInputText);
                if (c.generationParams) {
                    if (c.generationParams.temperature !== undefined) setTemperature(String(c.generationParams.temperature));
                    if (c.generationParams.topP !== undefined) setTopP(String(c.generationParams.topP));
                    if (c.generationParams.topK !== undefined) setTopK(String(c.generationParams.topK));
                    if (c.generationParams.frequencyPenalty !== undefined) setFrequencyPenalty(String(c.generationParams.frequencyPenalty));
                    if (c.generationParams.presencePenalty !== undefined) setPresencePenalty(String(c.generationParams.presencePenalty));
                }
                setError(null);
            }
        } catch (err) {
            console.error("Failed to restore session", err);
            setError("Failed to restore session data.");
        }
    };

    const handleSaveSession = () => {
        const sessionData = getSessionData();
        const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `synth_session_${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleLoadSession = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                if (typeof event.target?.result === 'string') {
                    const session = JSON.parse(event.target.result);
                    restoreSession(session);
                    setSessionName("Local File Session");
                }
            } catch (err) {
                console.error("Failed to load session", err);
                setError("Failed to load session file. Invalid JSON.");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleCloudSave = async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            alert("Firebase not configured!");
            return;
        }
        const name = prompt("Enter a name for this session snapshot:");
        if (!name) return;
        try {
            const sessionData = getSessionData();
            await FirebaseService.saveSessionToFirebase(sessionData, name);
            setSessionName(name);
            alert("Session saved to cloud!");
        } catch (e: any) {
            alert("Failed to save to cloud: " + e.message);
        }
    };

    const handleCloudLoadOpen = async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            alert("Firebase not configured!");
            return;
        }
        setIsCloudLoading(true);
        setShowCloudLoadModal(true);
        try {
            const sessions = await FirebaseService.getSessionsFromFirebase();
            setCloudSessions(sessions);
        } catch (e: any) {
            alert("Failed to fetch sessions: " + e.message);
            setShowCloudLoadModal(false);
        } finally {
            setIsCloudLoading(false);
        }
    };

    const handleCloudSessionSelect = async (session: FirebaseService.SavedSession) => {
        setSessionName(session.name);
        // Pass sessionUid from the saved session to restore it
        const savedSessionUid = (session as any).sessionUid;
        restoreSession(session.config, savedSessionUid);
        setShowCloudLoadModal(false);

        // Sync existing log count from Firestore for this session
        if (savedSessionUid && FirebaseService.isFirebaseConfigured()) {
            try {
                const stats = await FirebaseService.getDbStats(savedSessionUid);
                setDbStats(stats);
            } catch (e) {
                logger.warn("Failed to fetch session stats on load", e);
            }
        }
    };

    const handleCloudSessionDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this session?")) return;
        try {
            await FirebaseService.deleteSessionFromFirebase(id);
            setCloudSessions(prev => prev.filter(s => s.id !== id));
        } catch (e: any) {
            alert("Failed to delete session: " + e.message);
        }
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    // --- Core Generation Logic ---
    // Runtime prompt configuration for auto-routing (avoids React state race condition)
    interface RuntimePromptConfig {
        systemPrompt: string;
        converterPrompt: string;
        deepConfig: DeepConfig;
        promptSet: string;
    }

    const generateSingleItem = async (inputText: string, workerId: number, opts: { retryId?: string, originalQuestion?: string, row?: any, runtimeConfig?: RuntimePromptConfig } = {}): Promise<SynthLogItem | null> => {
        const { retryId, originalQuestion, row, runtimeConfig } = opts;
        const startTime = Date.now();
        // Determine source for tracking (outside try for catch access)
        const source = dataSourceMode === 'huggingface'
            ? `hf:${hfConfig.dataset}`
            : dataSourceMode === 'manual'
                ? 'manual'
                : 'synthetic';
        try {
            const safeInput = typeof inputText === 'string' ? inputText : String(inputText);
            let result;
            // Use runtime config if provided (from auto-routing), otherwise fall back to state
            const effectiveSystemPrompt = runtimeConfig?.systemPrompt ?? systemPrompt;
            const effectiveConverterPrompt = runtimeConfig?.converterPrompt ?? converterPrompt;
            const effectiveDeepConfig = runtimeConfig?.deepConfig ?? deepConfig;
            const activePrompt = appMode === 'generator' ? effectiveSystemPrompt : effectiveConverterPrompt;
            const genParams = getGenerationParams();
            const retryConfig = { maxRetries, retryDelay, generationParams: genParams };

            // --- Conversation Trace Rewriting Mode ---
            // When enabled, extract messages from row and rewrite/generate <think> content
            if (conversationRewriteMode && row) {
                const messagesArray = row.messages || row.conversation || row.conversations;
                if (Array.isArray(messagesArray) && messagesArray.length > 0) {
                    // Convert to ChatMessage format if needed, filtering out empty messages
                    const chatMessages: ChatMessage[] = messagesArray
                        .map((m: any) => {
                            const content = m.content || m.value || (typeof m === 'string' ? m : '');
                            return {
                                role: (m.role || (m.from === 'human' ? 'user' : m.from === 'gpt' ? 'assistant' : m.from)) as 'user' | 'assistant' | 'system',
                                content: content,
                                reasoning: m.reasoning
                            };
                        })
                        .filter((m: ChatMessage) => m.content.trim().length > 0); // Skip empty messages

                    const rewriteResult = await DeepReasoningService.orchestrateConversationRewrite({
                        messages: chatMessages,
                        config: effectiveDeepConfig,
                        engineMode: engineMode,
                        converterPrompt: effectiveConverterPrompt,
                        signal: abortControllerRef.current?.signal,
                        maxRetries,
                        retryDelay,
                        generationParams: genParams,
                        structuredOutput: true,
                        maxTraces: hfConfig.maxMultiTurnTraces,
                        regularModeConfig: engineMode === 'regular' ? {
                            provider: provider,
                            externalProvider: externalProvider,
                            apiKey: externalApiKey,
                            model: externalModel,
                            customBaseUrl: customBaseUrl
                        } : undefined
                    });

                    return {
                        ...rewriteResult,
                        id: retryId || rewriteResult.id,
                        sessionUid: sessionUid,
                        source: source
                    };
                }
            }



            // Extract expected answer from dataset row - available for both regular and deep modes
            const expectedAnswer = opts.row ? getRowExpectedOutput(opts.row) : undefined;

            if (engineMode === 'regular') {
                if (provider === 'gemini') {
                    // Reinforce JSON structure for regular mode to ensure service parsing works
                    let enhancedPrompt = activePrompt;
                    if (!enhancedPrompt.toLowerCase().includes("json")) {
                        enhancedPrompt += "\n\nCRITICAL: You must output ONLY valid JSON with 'query', 'reasoning', and 'answer' fields. If you are a writer/refiner, use the provided trace/logic as the 'reasoning' and output your result as the 'answer'.";
                    }

                    if (appMode === 'generator') {
                        result = await GeminiService.generateReasoningTrace(safeInput, enhancedPrompt, { ...retryConfig, model: externalModel });
                    } else {
                        const contentToConvert = extractInputContent(safeInput);
                        result = await GeminiService.convertReasoningTrace(contentToConvert, enhancedPrompt, { ...retryConfig, model: externalModel });
                    }
                } else {
                    let promptInput = "";
                    if (appMode === 'generator') {
                        promptInput = `[SEED TEXT START]\n${safeInput}\n[SEED TEXT END]`;
                    } else {
                        const contentToConvert = extractInputContent(safeInput);
                        promptInput = `[INPUT LOGIC START]\n${contentToConvert}\n[INPUT LOGIC END]`;
                    }

                    // Reinforce JSON structure for external providers too
                    let enhancedPrompt = activePrompt;
                    if (!enhancedPrompt.toLowerCase().includes("json")) {
                        enhancedPrompt += "\n\nCRITICAL: You must output ONLY valid JSON with 'query', 'reasoning', and 'answer' fields.";
                    }

                    result = await ExternalApiService.callExternalApi({
                        provider: externalProvider,
                        apiKey: externalApiKey || SettingsService.getApiKey(externalProvider),
                        model: externalModel,
                        customBaseUrl: customBaseUrl || SettingsService.getCustomBaseUrl(),
                        systemPrompt: enhancedPrompt,
                        userPrompt: promptInput,
                        signal: abortControllerRef.current?.signal || undefined,
                        maxRetries,
                        retryDelay,
                        generationParams: genParams,
                        structuredOutput: true
                    });
                }
                const ensureString = (val: any) => {
                    if (val === null || val === undefined) return "";
                    if (typeof val === 'string') return val;
                    return JSON.stringify(val);
                };
                const answer = ensureString(result.answer);
                const reasoning = ensureString(result.reasoning);

                // If in converter mode and we have a ground truth expectedAnswer, prioritize it?
                // Actually, if the user is RUNNING a converter, they might want to see the CONVERTED answer.
                // However, the user said "no answer from ground truth", implying they WANT the ground truth preserved.
                // In converter mode, usually the "answer" field in the dataset is the ground truth.
                const finalAnswer = (appMode === 'converter' && expectedAnswer) ? expectedAnswer : answer;

                return {
                    id: retryId || crypto.randomUUID(),
                    sessionUid: sessionUid,
                    source: source,
                    seed_preview: safeInput.substring(0, 150) + "...",
                    full_seed: safeInput,
                    query: originalQuestion || (appMode === 'converter' ? extractInputContent(safeInput, { format: 'display' }) : safeInput), // Use raw column value if available
                    reasoning: reasoning,
                    answer: finalAnswer,
                    timestamp: new Date().toISOString(),
                    duration: Date.now() - startTime,
                    tokenCount: Math.round((finalAnswer.length + reasoning.length) / 4), // Rough estimate
                    modelUsed: provider === 'gemini' ? 'Gemini 3 Flash' : `${externalProvider}/${externalModel}`,
                    provider: externalProvider
                };
            } else {
                let inputPayload = safeInput;
                if (appMode === 'converter') {
                    inputPayload = extractInputContent(safeInput);
                }

                // In generator mode, append the gold answer to the seed so all agents see it
                if (appMode === 'generator' && expectedAnswer && expectedAnswer.trim().length > 0) {
                    inputPayload = `${inputPayload}\n\n[EXPECTED ANSWER]\n${expectedAnswer.trim()}`;
                }

                // Deep copy to prevent mutation of state (use effectiveDeepConfig for auto-routing)
                const runtimeDeepConfig = JSON.parse(JSON.stringify(effectiveDeepConfig));

                // REMOVED: Intelligent Sync. We now strictly respect the deepConfig.phases.writer.systemPrompt
                // to avoid confusing behavior where the Main Prompt overwrites the Deep Mode prompt.
                const deepResult = await DeepReasoningService.orchestrateDeepReasoning({
                    input: inputPayload,
                    originalQuery: originalQuestion || (appMode === 'converter' ? extractInputContent(safeInput, { format: 'display' }) : safeInput), // Use raw column value if available
                    expectedAnswer: expectedAnswer,
                    config: runtimeDeepConfig,
                    signal: abortControllerRef.current?.signal || undefined,
                    maxRetries,
                    retryDelay,
                    generationParams: genParams
                });

                // If User Agent is enabled, run multi-turn conversation
                if (userAgentConfig.enabled && userAgentConfig.followUpCount > 0) {
                    // Determine which responder to use based on user selection
                    const responderPhase = userAgentConfig.responderPhase || 'writer';
                    const responderConfig = responderPhase === 'responder'
                        ? {
                            provider: userAgentConfig.provider,
                            externalProvider: userAgentConfig.externalProvider,
                            apiKey: userAgentConfig.apiKey,
                            model: userAgentConfig.model,
                            customBaseUrl: userAgentConfig.customBaseUrl,
                            systemPrompt: PromptService.getPrompt('generator', 'responder', runtimeConfig?.promptSet)
                        }
                        : runtimeDeepConfig.phases[responderPhase as keyof typeof runtimeDeepConfig.phases];

                    const multiTurnResult = await DeepReasoningService.orchestrateMultiTurnConversation({
                        initialInput: inputPayload,
                        initialQuery: originalQuestion || deepResult.query || inputPayload, // Use detected question or query or fallback
                        initialResponse: deepResult.answer || '',
                        initialReasoning: deepResult.reasoning || '',
                        userAgentConfig: {
                            ...userAgentConfig,
                            // Override with auto-routed prompt set if available
                            systemPrompt: PromptService.getPrompt('generator', 'user_agent', runtimeConfig?.promptSet)
                        },
                        responderConfig: responderConfig,
                        signal: abortControllerRef.current?.signal || undefined,
                        maxRetries,
                        retryDelay,
                        generationParams: genParams,
                        structuredOutput: true
                    });

                    return {
                        ...multiTurnResult,
                        sessionUid: sessionUid,
                        source: source,
                        duration: Date.now() - startTime,
                        tokenCount: Math.round((multiTurnResult.answer?.length || 0 + (multiTurnResult.reasoning?.length || 0)) / 4),
                        isMultiTurn: true
                    };
                }

                const answer = deepResult.answer || "";
                const reasoning = deepResult.reasoning || "";
                return {
                    ...deepResult,
                    sessionUid: sessionUid,
                    source: source,
                    duration: Date.now() - startTime,
                    tokenCount: Math.round((answer.length + reasoning.length) / 4)
                };
            }
        } catch (err: any) {
            if (err.name === 'AbortError') throw err;
            console.error(`Worker ${workerId} failed`, err);
            const safeErrInput = typeof inputText === 'string' ? inputText : JSON.stringify(inputText);
            return {
                id: retryId || crypto.randomUUID(),
                sessionUid: sessionUid,
                source: source,
                seed_preview: safeErrInput.substring(0, 50),
                full_seed: safeErrInput,
                query: "ERROR",
                reasoning: "",
                answer: "Failed",
                timestamp: new Date().toISOString(),
                duration: Date.now() - startTime,
                modelUsed: engineMode === 'deep' ? 'DEEP ENGINE' : "System",
                isError: true,
                error: err.message
            };
        }
    };

    const retryItem = async (id: string) => {
        // We only retry visible logs for UX simplicity
        const logItem = visibleLogs.find(l => l.id === id);
        if (!logItem) return;
        setRetryingIds(prev => new Set(prev).add(id));
        try {
            // Re-generate but keep same ID for UI continuity so we replace the card
            const result = await generateSingleItem(logItem.full_seed, 0, { retryId: id });
            if (result) {
                // Determine if we should save to Firebase
                if (environment === 'production' && !result.isError) {
                    try {
                        await FirebaseService.saveLogToFirebase(result);
                        updateDbStats();
                    } catch (saveErr: any) {
                        console.error("Firebase Sync Error on Retry", saveErr);
                        result.storageError = saveErr.message || "Save failed";
                    }
                }

                // Update Local Storage
                await LogStorageService.updateLog(sessionUid, result);

                // Refresh View
                refreshLogs();
            }
        } catch (e) {
            console.error("Retry failed for item", id, e);
        } finally {
            setRetryingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const retrySave = async (id: string) => {
        const logItem = visibleLogs.find(l => l.id === id);
        if (!logItem) return;
        setRetryingIds(prev => new Set(prev).add(id));
        try {
            await FirebaseService.saveLogToFirebase(logItem);
            const updated = { ...logItem, storageError: undefined };
            await LogStorageService.updateLog(sessionUid, updated);
            refreshLogs();
            updateDbStats();
        } catch (e: any) {
            console.error("Retry Save Failed", e);
            const updated = { ...logItem, storageError: e.message || "Retry save failed" };
            await LogStorageService.updateLog(sessionUid, updated);
            refreshLogs();
        } finally {
            setRetryingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const retryAllFailed = async () => {
        const failedItems = visibleLogs.filter(l => l.isError);
        if (failedItems.length === 0) return;
        const failedIds = failedItems.map(l => l.id);
        setRetryingIds(prev => new Set([...prev, ...failedIds]));
        const queue = [...failedItems];
        let activeWorkers = 0;

        const processQueue = async () => {
            while (queue.length > 0) {
                if (activeWorkers >= concurrency) {
                    await new Promise(r => setTimeout(r, 100));
                    continue;
                }
                const item = queue.shift();
                if (!item) break;
                activeWorkers++;
                generateSingleItem(item.full_seed, 0, { retryId: item.id }).then(async (result) => {
                    activeWorkers--;
                    if (result) {
                        if (environment === 'production' && !result.isError) {
                            try { await FirebaseService.saveLogToFirebase(result); } catch (e) { }
                        }
                        LogStorageService.updateLog(sessionUid, result);
                        refreshLogs();
                    }
                }).catch(() => { activeWorkers--; });
            }
        };
        processQueue();
    };

    const startGeneration = async (append = false) => {
        if (environment === 'production' && !FirebaseService.isFirebaseConfigured()) {
            const confirm = window.confirm("Firebase is not configured. Production mode will not save data remotely. Continue anyway?");
            if (!confirm) return;
        }
        if (!append) {
            // Determine source for session naming
            const sourceLabel = dataSourceMode === 'huggingface'
                ? `hf:${hfConfig.dataset}`
                : dataSourceMode === 'manual'
                    ? 'manual'
                    : 'synthetic';

            let newUid: string;

            // In production mode with Firebase, create session first and use its ID
            if (environment === 'production' && FirebaseService.isFirebaseConfigured()) {
                try {
                    const sessionName = `${appMode === 'generator' ? 'Generation' : 'Conversion'} - ${new Date().toLocaleString()}`;
                    newUid = await FirebaseService.createSessionInFirebase(sessionName, sourceLabel);
                    logger.log(`Created Firebase session: ${newUid}`);
                } catch (e) {
                    logger.warn("Failed to create Firebase session, using local UUID", e);
                    newUid = crypto.randomUUID();
                }
            } else {
                newUid = crypto.randomUUID();
            }

            setSessionUid(newUid);
            sessionUidRef.current = newUid; // Sync immediately for worker
            setVisibleLogs([]);
            setTotalLogCount(0);
            setSparklineHistory([]);
            if (sessionName === "Local File Session" || !sessionName) {
                setSessionName(null);
            }
        }
        // Ensure settings are loaded before validation
        await SettingsService.waitForSettingsInit();

        // Check for API key - use inline, settings, or require it
        const resolvedApiKey = externalApiKey?.trim() || SettingsService.getApiKey(externalProvider);
        if (engineMode === 'regular' && provider === 'external' && !resolvedApiKey && externalProvider !== 'ollama') {
            setError("API Key is required for external providers (except Ollama). Click the Settings icon (⚙) in the header or enter a key here.");
            return;
        }
        if (engineMode === 'deep') {
            const writer = deepConfig.phases.writer;
            const writerApiKey = writer.apiKey?.trim() || (writer.externalProvider ? SettingsService.getApiKey(writer.externalProvider) : '');
            if (writer.provider !== 'gemini' && !writerApiKey && writer.externalProvider !== 'ollama') {
                setError(`Writer Agent requires an API Key for ${writer.externalProvider}. Click the Settings icon (⚙) in the header to configure, or enter a key inline in the Writer phase.`);
                return;
            }
        }
        if (dataSourceMode === 'manual' && !converterInputText.trim()) {
            setError("Please provide input text or upload a file.");
            return;
        }
        setError(null);
        setIsRunning(true);
        abortControllerRef.current = new AbortController();
        try {
            // Updated item structure to preserve original row context
            interface WorkItem {
                content: string;
                row?: any;
            }
            let workItems: WorkItem[] = [];

            if (dataSourceMode === 'huggingface') {
                setProgress({ current: 0, total: rowsToFetch, activeWorkers: 1 });
                const rows = await fetchHuggingFaceRows(hfConfig, skipRows, rowsToFetch);
                workItems = rows.map(row => ({
                    content: getRowContent(row),
                    row: row
                }));
            } else if (dataSourceMode === 'manual') {
                let parsedRows: any[] = [];
                const trimmedInput = converterInputText.trim();

                // First try parsing as JSON array
                if (trimmedInput.startsWith('[') && trimmedInput.endsWith(']')) {
                    try {
                        const arr = JSON.parse(trimmedInput);
                        if (Array.isArray(arr)) {
                            parsedRows = arr;
                        }
                    } catch {
                        // Not valid JSON array, try JSONL
                    }
                }

                // Fallback to JSONL format if no rows parsed
                if (parsedRows.length === 0) {
                    const allLines = converterInputText.split('\n').filter(line => line.trim().length > 0);
                    parsedRows = allLines.map(line => {
                        try {
                            return JSON.parse(line);
                        } catch {
                            return line; // Raw string
                        }
                    });
                }

                // Apply skip and limit
                const rowsToProcess = parsedRows.slice(skipRows, skipRows + rowsToFetch);
                setProgress({ current: 0, total: rowsToProcess.length, activeWorkers: 1 });

                workItems = rowsToProcess.map(row => {
                    if (typeof row === 'object' && row !== null) {
                        return { content: getRowContent(row), row: row };
                    } else {
                        return { content: String(row), row: null }; // Raw string
                    }
                });
                if (workItems.length === 0) throw new Error("No rows to process after applying skip/limit. Check your settings.");

            } else {
                // Synthetic
                const MAX_SEEDS_PER_BATCH = 10;
                const totalNeeded = rowsToFetch;
                let collectedSeeds: string[] = [];
                const batchCount = Math.ceil(totalNeeded / MAX_SEEDS_PER_BATCH);
                setProgress({ current: 0, total: totalNeeded, activeWorkers: 1 });
                for (let i = 0; i < batchCount; i++) {
                    if (abortControllerRef.current?.signal.aborted) break;
                    const countForBatch = Math.min(MAX_SEEDS_PER_BATCH, totalNeeded - collectedSeeds.length);
                    let batchSeeds: string[] = [];
                    if (provider === 'gemini') {
                        // Pass externalModel (which acts as the active model input) to Gemini
                        batchSeeds = await GeminiService.generateSyntheticSeeds(geminiTopic, countForBatch, externalModel);
                    } else {
                        batchSeeds = await ExternalApiService.generateSyntheticSeeds({
                            provider: externalProvider,
                            apiKey: externalApiKey || SettingsService.getApiKey(externalProvider),
                            model: externalModel,
                            customBaseUrl: customBaseUrl || SettingsService.getCustomBaseUrl(),
                            signal: abortControllerRef.current?.signal || undefined,
                            structuredOutput: true,
                        }, geminiTopic, countForBatch);
                    }
                    collectedSeeds = [...collectedSeeds, ...batchSeeds];
                    setProgress(p => ({ ...p, current: collectedSeeds.length, total: totalNeeded }));
                }
                workItems = collectedSeeds.map(s => ({ content: s, row: null }));
            }

            if (workItems.length === 0) throw new Error("No inputs generated or parsed.");

            if (!append) {
                // Clear existing for this session? No, keeping session log
                // But if user wants new "Run", maybe clear?
                // Logic: Start Generation keeps appending to session.
            }

            // Auto-generate session name if default/empty
            if (!sessionName) {
                const autoName = `${engineMode}-${new Date().toISOString().slice(0, 10)}`;
                setSessionName(autoName);
                sessionNameRef.current = autoName;
            }

            // --- Auto-routing: Classify task and build runtime prompt config ---
            // This builds a runtime config to avoid React state race conditions
            const settings = SettingsService.getSettings();
            const confidenceThreshold = settings.autoRouteConfidenceThreshold ?? 0.3;
            // Session-level prompt set takes priority, then settings, then 'default'
            const defaultPromptSet = sessionPromptSet || settings.promptSet || 'default';

            // Helper to build runtime config for a prompt set
            const buildRuntimeConfig = (promptSet: string): RuntimePromptConfig => ({
                systemPrompt: PromptService.getPrompt('generator', 'system', promptSet),
                converterPrompt: PromptService.getPrompt('converter', 'system', promptSet),
                deepConfig: {
                    ...deepConfig,
                    phases: {
                        meta: { ...deepConfig.phases.meta, systemPrompt: PromptService.getPrompt('generator', 'meta', promptSet) },
                        retrieval: { ...deepConfig.phases.retrieval, systemPrompt: PromptService.getPrompt('generator', 'retrieval', promptSet) },
                        derivation: { ...deepConfig.phases.derivation, systemPrompt: PromptService.getPrompt('generator', 'derivation', promptSet) },
                        writer: { ...deepConfig.phases.writer, systemPrompt: PromptService.getPrompt('converter', 'writer', promptSet) },
                        rewriter: { ...deepConfig.phases.rewriter, systemPrompt: PromptService.getPrompt('converter', 'rewriter', promptSet) }
                    }
                },
                promptSet: promptSet
            });

            // Start with default config (will be overwritten if auto-routing succeeds)
            let runtimeConfig: RuntimePromptConfig | undefined = undefined;

            if (settings.autoRouteEnabled && workItems.length > 0) {
                if (settings.autoRouteMethod === 'heuristic') {
                    // Multi-sample heuristic classification with voting
                    const sampleSize = Math.min(5, workItems.length);
                    const samples = workItems.slice(0, sampleSize);
                    const votes: { type: TaskType; confidence: number }[] = samples.map(s =>
                        TaskClassifierService.classifyHeuristic(s.content)
                    );

                    // Count votes by type, weighted by confidence
                    const typeScores: Record<string, number> = {};
                    for (const vote of votes) {
                        typeScores[vote.type] = (typeScores[vote.type] || 0) + vote.confidence;
                    }

                    // Find the winning type
                    let bestType: TaskType = 'unknown';
                    let bestScore = 0;
                    for (const [type, score] of Object.entries(typeScores)) {
                        if (score > bestScore) {
                            bestScore = score;
                            bestType = type as TaskType;
                        }
                    }

                    // Calculate average confidence for the winning type
                    const winningVotes = votes.filter(v => v.type === bestType);
                    const avgConfidence = winningVotes.length > 0
                        ? winningVotes.reduce((sum, v) => sum + v.confidence, 0) / winningVotes.length
                        : 0;

                    setDetectedTaskType(bestType);

                    if (bestType !== 'unknown' && avgConfidence >= confidenceThreshold) {
                        const recommendedSet = TaskClassifierService.getRecommendedPromptSet(bestType, defaultPromptSet, settings.taskPromptMapping);
                        setAutoRoutedPromptSet(recommendedSet);
                        runtimeConfig = buildRuntimeConfig(recommendedSet);

                        // Also update React state for UI consistency on next render
                        setSystemPrompt(runtimeConfig.systemPrompt);
                        setConverterPrompt(runtimeConfig.converterPrompt);
                        setDeepConfig(runtimeConfig.deepConfig);
                        logger.log(`[Auto-Route] Detected task: ${bestType} (${winningVotes.length}/${sampleSize} votes, avg confidence: ${(avgConfidence * 100).toFixed(0)}%) → Using prompt set: ${recommendedSet}`);
                    } else {
                        setAutoRoutedPromptSet(null);
                        logger.log(`[Auto-Route] Confidence below threshold (${bestType}: ${(avgConfidence * 100).toFixed(0)}% < ${(confidenceThreshold * 100).toFixed(0)}%) → Fallback to: ${defaultPromptSet}`);
                    }
                } else if (settings.autoRouteMethod === 'llm') {
                    // LLM classification uses first sample (to minimize API calls)
                    const sampleQuery = workItems[0].content;
                    try {
                        const classifierPrompt = TaskClassifierService.getClassifierPrompt(sampleQuery);

                        // Use classifier-specific settings if configured, otherwise fallback to main provider
                        const classifierProvider = settings.autoRouteLlmProvider || 'gemini';
                        const classifierExternalProvider = settings.autoRouteLlmExternalProvider || externalProvider;
                        const classifierModel = settings.autoRouteLlmModel || externalModel;
                        const classifierApiKey = settings.autoRouteLlmApiKey || SettingsService.getApiKey(classifierExternalProvider);
                        const classifierBaseUrl = settings.autoRouteLlmCustomBaseUrl || SettingsService.getCustomBaseUrl();

                        let response: string;

                        // Use the classifier-configured provider
                        if (classifierProvider === 'gemini') {
                            // Use Gemini for classification
                            const classifyResult = await GeminiService.generateReasoningTrace(
                                classifierPrompt,
                                'You are a task classifier. Reply with ONLY the category name.',
                                { maxRetries: 1, retryDelay: 1000, generationParams: {} }
                            );
                            response = classifyResult.answer || classifyResult.reasoning || '';
                        } else {
                            // Use external provider configured for classifier
                            const classifyResult = await ExternalApiService.callExternalApi({
                                provider: classifierExternalProvider as ExternalProvider,
                                apiKey: classifierApiKey,
                                model: classifierModel,
                                customBaseUrl: classifierBaseUrl,
                                systemPrompt: 'You are a task classifier. Output exactly ONE word.',
                                userPrompt: classifierPrompt,
                                maxRetries: 1,
                                retryDelay: 1000,
                                generationParams: {},
                                structuredOutput: true
                            });
                            response = classifyResult?.answer || classifyResult?.reasoning || JSON.stringify(classifyResult) || '';
                        }

                        const { type: taskType, confidence: llmConfidence } = TaskClassifierService.parseClassifierResponse(response);
                        setDetectedTaskType(taskType);

                        if (taskType !== 'unknown' && llmConfidence >= confidenceThreshold) {
                            const recommendedSet = TaskClassifierService.getRecommendedPromptSet(taskType, defaultPromptSet, settings.taskPromptMapping);
                            setAutoRoutedPromptSet(recommendedSet);
                            runtimeConfig = buildRuntimeConfig(recommendedSet);

                            // Also update React state for UI consistency
                            setSystemPrompt(runtimeConfig.systemPrompt);
                            setConverterPrompt(runtimeConfig.converterPrompt);
                            setDeepConfig(runtimeConfig.deepConfig);
                            logger.log(`[Auto-Route/LLM] Detected task: ${taskType} (confidence: ${(llmConfidence * 100).toFixed(0)}%) → Using prompt set: ${recommendedSet}`);
                        } else if (taskType === 'unknown') {
                            setAutoRoutedPromptSet(null);
                            logger.log(`[Auto-Route/LLM] Classification returned 'unknown' → Fallback to: ${defaultPromptSet}`);
                        } else {
                            setAutoRoutedPromptSet(null);
                            logger.log(`[Auto-Route/LLM] Confidence below threshold (${taskType}: ${(llmConfidence * 100).toFixed(0)}% < ${(confidenceThreshold * 100).toFixed(0)}%) → Fallback to: ${defaultPromptSet}`);
                        }
                    } catch (e: any) {
                        logger.warn(`[Auto-Route/LLM] Classification failed: ${e.message || e} → Fallback to: ${defaultPromptSet}`);
                        setDetectedTaskType(null);
                        setAutoRoutedPromptSet(null);
                        // Build runtimeConfig with default to avoid stale state from previous successful classification
                        runtimeConfig = buildRuntimeConfig(defaultPromptSet);
                    }
                }
            } else {
                // Auto-routing disabled - clear any previous detection
                setDetectedTaskType(null);
                setAutoRoutedPromptSet(null);
            }

            setProgress({ current: 0, total: workItems.length, activeWorkers: 0 });
            let currentIndex = 0;

            const detectOriginalQuestion = (row: any): string | undefined => {
                if (!row) return undefined;

                let question = "";

                // PRIORITY 1: Use explicitly selected input columns if available
                // This ensures we get the RAW value from the dataset exactly as the user selected
                if (hfConfig.inputColumns && hfConfig.inputColumns.length > 0) {
                    const parts: string[] = [];
                    for (const col of hfConfig.inputColumns) {
                        const val = row[col];
                        if (val !== undefined && val !== null) {
                            if (typeof val === 'string') {
                                parts.push(val);
                            } else if (typeof val === 'object') {
                                parts.push(JSON.stringify(val));
                            } else {
                                parts.push(String(val));
                            }
                        }
                    }
                    if (parts.length > 0) {
                        question = parts.join('\n\n');
                    }
                }

                // PRIORITY 2: Fallback to auto-detection if no explicit columns selected
                if (!question) {
                    const candidates = ['question', 'instruction', 'prompt', 'input', 'query', 'task'];
                    for (const c of candidates) {
                        if (row[c] && typeof row[c] === 'string' && row[c].length < 2000) {
                            question = row[c];
                            break;
                        }
                    }
                }

                // Try array formats (ShareGPT/ChatML) if no simple column found
                if (!question) {
                    const msgs = row.messages || row.conversation || row.conversations;
                    if (Array.isArray(msgs)) {
                        const firstUser = msgs.find((m: any) => m.role === 'user' || m.from === 'human');
                        if (firstUser) question = firstUser.content || firstUser.value;
                    }
                }

                if (!question) return undefined;

                // Append Options if available (for multiple choice datasets)
                // Check for 'options', 'choices'
                // Format: Map/Object {"A": "...", "B": "..."} or Array ["...", "..."]
                const optionsField = row['options'] || row['choices'];
                if (optionsField) {
                    let formattedOptions = "";
                    if (typeof optionsField === 'string') {
                        formattedOptions = "\n\nOptions:\n" + optionsField;
                    } else if (Array.isArray(optionsField)) {
                        formattedOptions = "\n\nOptions:\n" + optionsField.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
                    } else if (typeof optionsField === 'object') {
                        // entries [key, value]
                        const entries = Object.entries(optionsField);
                        if (entries.length > 0) {
                            formattedOptions = "\n\nOptions:\n" + entries.map(([k, v]) => `${k}: ${v}`).join('\n');
                        }
                    }
                    if (formattedOptions) question += formattedOptions;
                }

                return question;
            };

            const worker = async (id: number) => {
                while (currentIndex < workItems.length) {
                    if (abortControllerRef.current?.signal.aborted) break;
                    const myIndex = currentIndex++;
                    if (myIndex >= workItems.length) break;

                    const item = workItems[myIndex];

                    // Get the RAW input from the user's EXPLICITLY SELECTED columns - no detection!
                    let originalQuestion: string | undefined;
                    if (item.row && hfConfig.inputColumns && hfConfig.inputColumns.length > 0) {
                        const parts: string[] = [];
                        for (const col of hfConfig.inputColumns) {
                            const val = item.row[col];
                            if (val !== undefined && val !== null) {
                                parts.push(typeof val === 'string' ? val : JSON.stringify(val));
                            }
                        }
                        if (parts.length > 0) {
                            originalQuestion = parts.join('\n\n');
                        }
                    }

                    setProgress(p => ({ ...p, activeWorkers: p.activeWorkers + 1 }));

                    const result = await generateSingleItem(item.content, id, { originalQuestion, row: item.row, runtimeConfig });


                    setProgress(p => ({
                        ...p,
                        current: p.current + 1,
                        activeWorkers: p.activeWorkers - 1
                    }));

                    if (result) {
                        // Inject session name and uid
                        result.sessionUid = sessionUidRef.current;
                        if (sessionNameRef.current) {
                            result.sessionName = sessionNameRef.current;
                        }

                        // Save to Local Storage
                        await LogStorageService.saveLog(sessionUidRef.current, result);
                        setLogsTrigger(prev => prev + 1);
                        // setTotalLogCount(prev => prev + 1); // Removed optimistic update to avoid drift

                        const currentEnv = environmentRef.current;
                        if (currentEnv === 'production' && !result.isError && FirebaseService.isFirebaseConfigured()) {
                            try {
                                await FirebaseService.saveLogToFirebase(result);
                                updateDbStats();
                            } catch (saveErr: any) {
                                console.error("Firebase Sync Error", saveErr);
                                const updated = { ...result, storageError: saveErr.message || "Save failed" };
                                await LogStorageService.updateLog(sessionUidRef.current, updated);
                            }
                        }

                        // Updates UI if on first page
                        if (currentPage === 1) {
                            refreshLogs();
                        }
                    }
                    if (sleepTime > 0) {
                        await new Promise(r => setTimeout(r, sleepTime));
                    }
                }
            };
            const workers = Array.from({ length: Math.min(concurrency, workItems.length) }, (_, i) => worker(i));
            await Promise.all(workers);
        } catch (err: any) {
            if (err.name !== 'AbortError') setError(err.message);
        } finally {
            setIsRunning(false);
        }

    };

    const stopGeneration = () => {
        abortControllerRef.current?.abort();
        setIsRunning(false);
    };

    const handleStart = () => {
        if (totalLogCount > 0) setShowOverwriteModal(true);
        else startGeneration(false);
    };

    const exportJsonl = async () => {
        if (totalLogCount === 0) return;
        // Export all logs from storage is better. But for now invalid.
        // Let's load all logs (warning: memory!)
        const confirm = window.confirm(`Exporting ${totalLogCount} logs. This might take a moment.`);
        if (!confirm) return;

        console.log('[Export] Session UID:', sessionUid);
        console.log('[Export] Total Log Count:', totalLogCount);

        const allLogs = await LogStorageService.getAllLogs(sessionUid);
        console.log('[Export] Retrieved logs:', allLogs.length);

        if (allLogs.length === 0) {
            alert('No logs found to export. Check console for details.');
            return;
        }

        // allLogs is SynthLogItem[] because getLogs returns array
        const jsonl = allLogs.map((log: SynthLogItem) => JSON.stringify(log)).join('\n');
        const blob = new Blob([jsonl], { type: 'application/x-jsonlines' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `synth_dataset_${new Date().toISOString().slice(0, 10)}.jsonl`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const renderDeepPhaseConfig = (phaseId: keyof DeepConfig['phases'], title: string, icon: React.ReactNode) => {
        const phase = deepConfig.phases[phaseId];
        if (!phase) return null;
        return (
            <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 animate-in fade-in slide-in-from-bottom-2 mt-2">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
                        {icon} {title}
                    </h4>
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Enabled</label>
                        <input type="checkbox" checked={phase.enabled} onChange={e => updateDeepPhase(phaseId, { enabled: e.target.checked })} className="accent-indigo-500" />
                    </div>
                </div>
                {phase.enabled && (
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-bold uppercase">Provider</label>
                            <select
                                value={phase.provider === 'gemini' ? 'gemini' : phase.externalProvider}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val === 'gemini') {
                                        updateDeepPhase(phaseId, { provider: 'gemini', model: 'gemini-2.0-flash-exp' });
                                    } else {
                                        const newProvider = val as ExternalProvider;
                                        const settings = SettingsService.getSettings();
                                        const defaultModel = settings.providerDefaultModels?.[newProvider] || '';
                                        updateDeepPhase(phaseId, {
                                            provider: 'external',
                                            externalProvider: newProvider,
                                            apiKey: SettingsService.getApiKey(newProvider) || '',
                                            model: defaultModel
                                        });
                                    }
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
                            >
                                <option value="gemini">Native Gemini</option>
                                {EXTERNAL_PROVIDERS.map(ep => (
                                    <option key={ep} value={ep}>{ep === 'other' ? 'Custom Endpoint (other)' : ep.charAt(0).toUpperCase() + ep.slice(1)}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-bold uppercase">Model ID</label>
                            <input
                                type="text"
                                value={phase.model}
                                onChange={e => updateDeepPhase(phaseId, { model: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
                                placeholder="Model ID (e.g. gemini-2.0-flash-exp)"
                            />
                        </div>

                        {phase.provider === 'external' && (
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold uppercase">API Key</label>
                                <input
                                    type="password"
                                    value={phase.apiKey}
                                    onChange={e => updateDeepPhase(phaseId, { apiKey: e.target.value })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
                                    placeholder={SettingsService.getApiKey(phase.externalProvider) ? "Using Global Key (Settings)" : "Enter API Key..."}
                                />
                            </div>
                        )}

                        {phase.provider === 'external' && phase.externalProvider === 'other' && (
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold uppercase">Base URL</label>
                                <input
                                    type="text"
                                    value={phase.customBaseUrl}
                                    onChange={e => updateDeepPhase(phaseId, { customBaseUrl: e.target.value })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
                                    placeholder={SettingsService.getCustomBaseUrl() || "https://api.example.com/v1"}
                                />
                            </div>
                        )}
                    </div>
                )}
                <div className="space-y-1">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Phase System Prompt</label>
                        <button onClick={() => copyDeepConfigToAll(phaseId)} className="text-[9px] text-indigo-400 hover:text-indigo-300 underline">Apply Config to All Phases</button>
                    </div>
                    <textarea value={phase.systemPrompt} onChange={e => updateDeepPhase(phaseId, { systemPrompt: e.target.value })} className="w-full h-32 bg-slate-950 border border-slate-700 rounded p-2 text-[10px] font-mono text-slate-300 focus:border-indigo-500 outline-none resize-y" spellCheck={false} />
                </div>
            </div>
        )
    }




    // --- Effect: Load Settings & Prompts on Mount ---
    const refreshPrompts = useCallback(() => {
        setSystemPrompt(PromptService.getPrompt('generator', 'system'));
        setConverterPrompt(PromptService.getPrompt('converter', 'system'));

        setDeepConfig((prev: DeepConfig) => ({
            ...prev,
            phases: {
                meta: { ...prev.phases.meta, systemPrompt: PromptService.getPrompt('generator', 'meta') },
                retrieval: { ...prev.phases.retrieval, systemPrompt: PromptService.getPrompt('generator', 'retrieval') },
                derivation: { ...prev.phases.derivation, systemPrompt: PromptService.getPrompt('generator', 'derivation') },
                writer: { ...prev.phases.writer, systemPrompt: PromptService.getPrompt('converter', 'writer') },
                rewriter: { ...prev.phases.rewriter, systemPrompt: PromptService.getPrompt('converter', 'rewriter') }
            }
        }));

        setUserAgentConfig((prev: UserAgentConfig) => ({
            ...prev,
            systemPrompt: PromptService.getPrompt('generator', 'user_agent')
        }));
    }, []);

    useEffect(() => {
        // Wait for settings to load from IndexedDB, then refresh prompts
        SettingsService.waitForSettingsInit().then(() => {
            refreshPrompts();
        });
    }, [refreshPrompts]);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
            {/* ... (Cloud Load Modal) ... */}
            {showCloudLoadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Cloud className="w-5 h-5 text-indigo-500" /> Cloud Sessions
                            </h3>
                            <button onClick={() => setShowCloudLoadModal(false)} className="text-slate-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        {isCloudLoading ? (
                            <div className="flex-1 flex items-center justify-center py-12">
                                <RefreshCcw className="w-8 h-8 text-indigo-500 animate-spin" />
                            </div>
                        ) : cloudSessions.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-500">
                                <Archive className="w-12 h-12 mb-2 opacity-50" />
                                <p>No saved sessions found in cloud.</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                                {cloudSessions.map(session => (
                                    <div key={session.id}
                                        onClick={() => handleCloudSessionSelect(session)}
                                        className="group bg-slate-950/50 border border-slate-800 hover:border-indigo-500/50 p-3 rounded-lg cursor-pointer transition-all flex justify-between items-center"
                                    >
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">{session.name}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" /> {new Date(session.createdAt).toLocaleString()}
                                                </span>
                                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                                    {session.config.appMode === 'generator' ? 'GEN' : 'CONV'}
                                                </span>
                                                {session.config.engineMode === 'deep' && (
                                                    <span className="text-[10px] bg-indigo-900/30 text-indigo-400 px-1.5 py-0.5 rounded">
                                                        DEEP
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => handleCloudSessionDelete(session.id, e)}
                                            className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
                                            title="Delete Session"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ... (Continue/Overwrite Modal) ... */}
            {showOverwriteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-indigo-500" /> Continue Generation?
                        </h3>
                        <p className="text-slate-400 text-sm mb-6">
                            You have <b>{totalLogCount}</b> generated items. You can continue adding to this session or download the data first.
                        </p>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => { exportJsonl(); setTimeout(() => { setShowOverwriteModal(false); startGeneration(true); }, 500); }}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all">
                                <Download className="w-4 h-4" /> Download & Continue
                            </button>
                            <button onClick={() => { setShowOverwriteModal(false); startGeneration(true); }}
                                className="bg-slate-800 text-white border border-slate-700 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-700 flex items-center justify-center gap-2 transition-all">
                                <PlusCircle className="w-4 h-4" /> Continue (Append)
                            </button>
                            <div className="h-px bg-slate-800 my-1 w-full"></div>
                            <button onClick={() => { setShowOverwriteModal(false); startGeneration(false); }}
                                className="bg-red-950/30 text-red-400 border border-red-500/20 py-2 rounded-lg font-medium text-xs hover:bg-red-900/50 flex items-center justify-center gap-2 transition-all">
                                <FileX className="w-3.5 h-3.5" /> Start New (Clear Data)
                            </button>
                            <button onClick={() => setShowOverwriteModal(false)} className="text-xs text-slate-500 mt-1 hover:text-slate-400">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Navbar */}
            <header className={`sticky top-0 z-20 backdrop-blur border-b transition-colors duration-300 ${environment === 'production' ? 'bg-indigo-950/80 border-indigo-800' : 'bg-slate-950/80 border-slate-800'}`}>
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.4)] ${environment === 'production' ? 'bg-pink-600' : 'bg-indigo-600'}`}>
                                <Cpu className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="font-bold text-lg text-white tracking-tight">SYNTH<span className="text-slate-500 font-light">LABS</span></h1>
                            </div>
                        </div>

                        {/* Main View Switcher */}
                        <div className="hidden md:flex bg-slate-900/80 p-1 rounded-lg border border-slate-700/50">
                            <button
                                onClick={() => setAppView('creator')}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${appView === 'creator' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                            >
                                <Beaker className="w-3.5 h-3.5" /> Creator
                            </button>
                            <button
                                onClick={() => setAppView('verifier')}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${appView === 'verifier' ? 'bg-teal-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                            >
                                <ShieldCheck className="w-3.5 h-3.5" /> Verifier
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="bg-slate-900 rounded-full p-1 border border-slate-700 flex items-center relative">
                            <button
                                onClick={() => setEnvironment('development')}
                                className={`relative z-10 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all ${environment === 'development' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <Laptop className="w-3 h-3" /> Dev
                            </button>
                            <button
                                onClick={() => setEnvironment('production')}
                                className={`relative z-10 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all ${environment === 'production' ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <Cloud className="w-3 h-3" /> Prod
                            </button>
                        </div>

                        {appView === 'creator' && (
                            <>
                                <div className="hidden sm:flex flex-col items-end text-xs">
                                    <span className="text-slate-400">Generated Items</span>
                                    <span className="font-mono text-indigo-400 font-bold text-lg leading-none">{totalLogCount}</span>
                                </div>
                                <button
                                    onClick={exportJsonl}
                                    disabled={totalLogCount === 0}
                                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Download className="w-4 h-4" /> Export
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => setShowSettings(true)}
                            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white p-2 rounded-lg transition-colors"
                            title="Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            {appView === 'verifier' ? (
                <main className="max-w-7xl mx-auto p-4 mt-4 pb-20">
                    <VerifierPanel
                        onImportFromDb={async () => { /* Managed internally by VerifierPanel but could be lifted */ }}
                        currentSessionUid={sessionUid}
                    />
                </main>
            ) : (
                <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4 pb-20">

                    {/* Sidebar Controls (CREATOR MODE) */}
                    <div className="lg:col-span-4 space-y-6">

                        {/* Session Manager (Same as before) */}
                        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-3 px-4 flex flex-col gap-3 group hover:border-indigo-500/30 transition-colors">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <Archive className="w-3.5 h-3.5" /> Session Config
                                </span>
                                {sessionName && (
                                    <span className="text-[10px] font-bold text-indigo-300 bg-indigo-900/30 border border-indigo-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 truncate max-w-[150px]">
                                        <Bookmark className="w-3 h-3" /> {sessionName}
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <input type="file" ref={sessionFileInputRef} onChange={handleLoadSession} className="hidden" accept=".json" />
                                <button onClick={() => sessionFileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] px-2.5 py-2 rounded-md transition-colors">
                                    <Upload className="w-3 h-3" /> Load File
                                </button>
                                <button onClick={handleSaveSession} className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] px-2.5 py-2 rounded-md transition-colors">
                                    <Save className="w-3 h-3" /> Save File
                                </button>
                            </div>

                            {environment === 'production' && (
                                <div className="flex gap-2 pt-2 border-t border-slate-800 animate-in fade-in slide-in-from-top-1">
                                    <button onClick={handleCloudLoadOpen} className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-300 border border-indigo-500/20 text-[10px] px-2.5 py-2 rounded-md transition-colors">
                                        <CloudDownload className="w-3 h-3" /> Cloud Load
                                    </button>
                                    <button onClick={handleCloudSave} className="flex-1 flex items-center justify-center gap-1.5 bg-pink-950/40 hover:bg-pink-900/40 text-pink-300 border border-pink-500/20 text-[10px] px-2.5 py-2 rounded-md transition-colors">
                                        <CloudUpload className="w-3 h-3" /> Cloud Save
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Control Panel */}
                        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5 shadow-sm relative overflow-hidden group">
                            {/* Mode Switcher */}
                            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 mb-6">
                                <button onClick={() => setAppMode('generator')}
                                    className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-all uppercase tracking-wide ${appMode === 'generator' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                                    <FileJson className="w-3.5 h-3.5" /> Generator
                                </button>
                                <button onClick={() => setAppMode('converter')}
                                    className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-all uppercase tracking-wide ${appMode === 'converter' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                                    <ArrowLeftRight className="w-3.5 h-3.5" /> Converter
                                </button>
                            </div>

                            {environment === 'production' && (
                                <div className="mb-4 p-2 bg-pink-950/30 border border-pink-500/20 rounded-lg text-[10px] text-pink-300 flex items-center gap-2">
                                    <ShieldCheck className="w-3 h-3 text-pink-500" />
                                    Production Mode: Data will be synced to Firebase.
                                </div>
                            )}

                            {isRunning && (
                                <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 z-10"
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                            )}

                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <Terminal className="w-4 h-4 text-indigo-400" /> CONTROLS
                                </h2>
                                <div className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${isRunning ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-indigo-400 animate-pulse' : 'bg-slate-500'}`} />
                                    {isRunning ? `Processing (${progress.activeWorkers})` : 'Idle'}
                                </div>
                            </div>

                            {error && (
                                <div className="mb-4 p-3 bg-red-950/30 border border-red-500/20 rounded-lg text-xs text-red-300 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    {error}
                                </div>
                            )}

                            <div className="flex gap-2">
                                {!isRunning ? (
                                    <button onClick={handleStart} className={`flex-1 hover:brightness-110 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${environment === 'production' ? 'bg-pink-600 shadow-pink-500/20' : 'bg-indigo-600 shadow-indigo-500/20'}`}>
                                        {totalLogCount > 0 ? (
                                            <>
                                                <Play className="w-4 h-4 fill-current" /> Continue
                                            </>
                                        ) : (
                                            <>
                                                <Play className="w-4 h-4 fill-current" /> Start
                                            </>
                                        )}
                                    </button>
                                ) : (
                                    <button onClick={stopGeneration} className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all">
                                        <Pause className="w-4 h-4 fill-current" /> Stop
                                    </button>
                                )}
                            </div>

                            {/* Retry All Button */}
                            {!isRunning && visibleLogs.some(l => l.isError) && (
                                <button onClick={retryAllFailed} className="w-full mt-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-600/30 py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all">
                                    <RefreshCcw className="w-3.5 h-3.5" /> Retry {visibleLogs.filter(l => l.isError).length} Failed Items
                                </button>
                            )}

                            <div className="mt-4 flex justify-between text-xs text-slate-500 font-mono">
                                <span>Completed: {progress.current}</span>
                                <span>Target: {progress.total}</span>
                            </div>

                            {/* Auto-routing status indicator */}
                            {(detectedTaskType || autoRoutedPromptSet) && (
                                <div className="mt-2 px-2 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded text-[10px] text-purple-300">
                                    <span className="opacity-70">Auto-routed:</span>{' '}
                                    {detectedTaskType && <span className="font-semibold">{detectedTaskType}</span>}
                                    {autoRoutedPromptSet && <span className="text-purple-400"> → {autoRoutedPromptSet}</span>}
                                </div>
                            )}

                            {/* Mini DB Panel (Only in Prod) */}
                            {environment === 'production' && (
                                <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                                    <MiniDbPanel
                                        totalRecords={dbStats.total}
                                        sessionRecords={dbStats.session}
                                        recentHistory={sparklineHistory}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Model Config, Source Config, Prompt Editor... (Same as before) */}
                        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5 space-y-4">
                            {/* ... (Engine, Deep Config, Gen Params logic same as before, simplified for brevity in this update) ... */}
                            {/* Re-injecting previous render logic for brevity since it didn't change materially other than being in the sidebar */}
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <Cpu className="w-4 h-4 text-slate-400" /> ENGINE
                                </h3>
                                <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                                    <button onClick={() => setEngineMode('regular')} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${engineMode === 'regular' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>REGULAR</button>
                                    <button onClick={() => setEngineMode('deep')} className={`px-2 py-1 text-[10px] font-bold rounded transition-all flex items-center gap-1 ${engineMode === 'deep' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>
                                        <Layers className="w-3 h-3" /> DEEP
                                    </button>
                                </div>
                            </div>

                            {/* Session-level Prompt Set Override */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                    <FileText className="w-3 h-3" /> Prompts (Session)
                                </label>
                                <div className="flex gap-1">
                                    <select
                                        value={sessionPromptSet || ''}
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSessionPromptSet(e.target.value || null)}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                    >
                                        <option value="">{SettingsService.getSettings().promptSet || 'default'} (your default)</option>
                                        {availablePromptSets.filter((s: string) => s !== (SettingsService.getSettings().promptSet || 'default')).map((setId: string) => (
                                            <option key={setId} value={setId}>{setId}</option>
                                        ))}
                                    </select>
                                    {sessionPromptSet && (
                                        <button
                                            onClick={() => setSessionPromptSet(null)}
                                            className="px-2 py-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 transition-colors"
                                            title="Reset to your default prompt set"
                                        >
                                            Reset
                                        </button>
                                    )}
                                </div>
                                {sessionPromptSet && (
                                    <p className="text-[9px] text-amber-400/70">
                                        Session override active — will not persist after reload
                                    </p>
                                )}
                            </div>
                            {engineMode === 'regular' ? (
                                <div className="animate-in fade-in slide-in-from-left-2 duration-300 space-y-4">
                                    <div className="bg-slate-950 p-1 rounded-lg border border-slate-800">
                                        <select
                                            value={provider === 'gemini' ? 'gemini' : externalProvider}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const settings = SettingsService.getSettings();

                                                if (val === 'gemini') {
                                                    setProvider('gemini');
                                                    // Set default Gemini model if switching to it
                                                    setExternalModel('gemini-2.0-flash-exp');
                                                } else {
                                                    const newProvider = val as ExternalProvider;
                                                    setProvider('external');
                                                    setExternalProvider(newProvider);

                                                    // Auto-load API Key and Base URL
                                                    const savedKey = SettingsService.getApiKey(newProvider);
                                                    setExternalApiKey(savedKey || '');

                                                    // Auto-load default model
                                                    const defaultModel = settings.providerDefaultModels?.[newProvider] || '';
                                                    setExternalModel(defaultModel);

                                                    if (newProvider === 'other') {
                                                        const savedBaseUrl = SettingsService.getCustomBaseUrl();
                                                        setCustomBaseUrl(savedBaseUrl || '');
                                                    }
                                                }
                                            }}
                                            className="w-full bg-transparent text-xs font-bold text-white outline-none px-2 py-1 cursor-pointer"
                                        >
                                            <option value="gemini" className="bg-slate-950 text-indigo-400 font-bold">Native Gemini</option>
                                            {EXTERNAL_PROVIDERS.map(ep => (
                                                <option key={ep} value={ep} className="bg-slate-950 text-slate-200">
                                                    {ep === 'other' ? 'Custom Endpoint (other)' : ep.charAt(0).toUpperCase() + ep.slice(1)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-slate-500 font-bold uppercase">Model ID</label>
                                            <input
                                                type="text"
                                                value={externalModel}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExternalModel(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                                                placeholder={provider === 'gemini' ? 'gemini-2.0-flash-exp' : 'Model ID'}
                                            />
                                        </div>

                                        {provider === 'external' && (
                                            <>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-slate-500 font-bold uppercase">API Key</label>
                                                    <input type="password" value={externalApiKey} placeholder="Required here unless a main key is set in Settings" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExternalApiKey(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none" />
                                                </div>
                                                {externalProvider === 'other' && (
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] text-slate-500 font-bold uppercase">Base URL</label>
                                                        <input type="text" value={customBaseUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomBaseUrl(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none" placeholder={SettingsService.getCustomBaseUrl() || "https://api.example.com/v1"} />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* System Prompt */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                                <Settings className="w-3 h-3" /> System Prompt
                                            </label>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-[9px] px-1.5 py-1 rounded transition-colors">
                                                    <Upload className="w-2.5 h-2.5" /> Load
                                                </button>
                                                <input type="file" ref={fileInputRef} onChange={handleLoadRubric} className="hidden" accept=".txt,.md,.json" />
                                                <button onClick={handleSaveRubric} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-[9px] px-1.5 py-1 rounded transition-colors">
                                                    <Save className="w-2.5 h-2.5" /> Save
                                                </button>
                                                <button onClick={optimizePrompt} disabled={isOptimizing} className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-[9px] px-1.5 py-1 rounded flex items-center gap-1 transition-all">
                                                    {isOptimizing ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />} Optimize
                                                </button>
                                            </div>
                                        </div>
                                        <textarea
                                            value={appMode === 'generator' ? systemPrompt : converterPrompt}
                                            onChange={e => appMode === 'generator' ? setSystemPrompt(e.target.value) : setConverterPrompt(e.target.value)}
                                            className="w-full h-40 bg-slate-950 border border-slate-700 rounded-lg p-2 text-[9px] font-mono text-slate-400 focus:border-indigo-500 outline-none resize-y leading-relaxed"
                                            spellCheck={false}
                                            placeholder={appMode === 'generator' ? "# ROLE..." : "# CONVERTER ROLE..."}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                                    <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 mb-4 overflow-x-auto no-scrollbar">
                                        <button onClick={() => setActiveDeepTab('meta')} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === 'meta' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-white'}`}><BrainCircuit className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => setActiveDeepTab('retrieval')} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === 'retrieval' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-white'}`}><Search className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => setActiveDeepTab('derivation')} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === 'derivation' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-white'}`}><GitBranch className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => setActiveDeepTab('writer')} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === 'writer' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}><PenTool className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => setActiveDeepTab('rewriter')} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === 'rewriter' ? 'bg-pink-600 text-white' : 'text-slate-500 hover:text-white'}`}><FileEdit className="w-3.5 h-3.5" /></button>
                                    </div>
                                    {activeDeepTab === 'writer' && renderDeepPhaseConfig('writer', 'Step 4: The Writer (Synthesis)', <PenTool className="w-4 h-4" />)}
                                    {activeDeepTab === 'meta' && renderDeepPhaseConfig('meta', 'Step 1: Meta-Analysis', <BrainCircuit className="w-4 h-4" />)}
                                    {activeDeepTab === 'retrieval' && renderDeepPhaseConfig('retrieval', 'Step 2: Retrieval & Constraints', <Search className="w-4 h-4" />)}
                                    {activeDeepTab === 'derivation' && renderDeepPhaseConfig('derivation', 'Step 3: Logical Derivation', <GitBranch className="w-4 h-4" />)}
                                    {activeDeepTab === 'rewriter' && renderDeepPhaseConfig('rewriter', 'Step 5: Response Rewriter (Optional)', <FileEdit className="w-4 h-4" />)}

                                    {/* Conversation Trace Rewriting Section - supported in both converter and generator modes */}
                                    {(appMode === 'converter' || appMode === 'generator') && (dataSourceMode === 'huggingface' || dataSourceMode === 'manual') && (
                                        <div className="mt-4 pt-4 border-t border-slate-700">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <RefreshCcw className="w-4 h-4 text-amber-400" />
                                                    <span className="text-sm font-medium text-white">Generate/Rewrite Conversation Traces</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newValue = !conversationRewriteMode;
                                                        setConversationRewriteMode(newValue);
                                                        // Auto-disable multi-turn if enabling conversation rewrite
                                                        if (newValue) {
                                                            setUserAgentConfig(prev => ({ ...prev, enabled: false }));
                                                        }
                                                    }}
                                                    className={`w-10 h-5 rounded-full transition-all relative ${conversationRewriteMode ? 'bg-amber-600' : 'bg-slate-700'}`}
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${conversationRewriteMode ? 'left-5' : 'left-0.5'}`} />
                                                </button>
                                            </div>
                                            {conversationRewriteMode && (
                                                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg animate-in fade-in duration-200 space-y-3">
                                                    <p className="text-[10px] text-amber-300/70">
                                                        Process existing conversation columns (messages/conversation) and rewrite only the {'<think>...</think>'} reasoning traces using symbolic notation.
                                                        User messages and final answers are preserved unchanged.
                                                    </p>
                                                    <div className="flex items-center gap-3">
                                                        <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                                            <Layers className="w-3 h-3" /> Max Traces
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={hfConfig.maxMultiTurnTraces || ''}
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHfConfig({ ...hfConfig, maxMultiTurnTraces: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0) })}
                                                            className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-amber-500 outline-none"
                                                            placeholder="All"
                                                        />
                                                        <span className="text-[10px] text-slate-500">Empty = process all traces</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* User Agent (Multi-Turn) Section */}

                                    <div className="mt-4 pt-4 border-t border-slate-700">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <MessageSquare className="w-4 h-4 text-cyan-400" />
                                                <span className="text-sm font-medium text-white">User Agent (Multi-Turn)</span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const newEnabled = !userAgentConfig.enabled;
                                                    setUserAgentConfig(prev => ({ ...prev, enabled: newEnabled }));
                                                    // Auto-disable conversation rewrite mode if enabling multi-turn
                                                    if (newEnabled) {
                                                        setConversationRewriteMode(false);
                                                    }
                                                }}
                                                className={`w-10 h-5 rounded-full transition-all relative ${userAgentConfig.enabled ? 'bg-cyan-600' : 'bg-slate-700'}`}
                                            >
                                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${userAgentConfig.enabled ? 'left-5' : 'left-0.5'}`} />
                                            </button>

                                        </div>
                                        {userAgentConfig.enabled && (
                                            <div className="space-y-3 p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg animate-in fade-in duration-200">
                                                <p className="text-[10px] text-cyan-300/70">Generates follow-up questions from a simulated user after DEEP reasoning.</p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] text-slate-500 font-bold uppercase flex justify-between">
                                                            <span>Follow-up Turns</span>
                                                            <span className="text-cyan-400">{userAgentConfig.followUpCount}</span>
                                                        </label>
                                                        <input
                                                            type="range"
                                                            min={1}
                                                            max={10}
                                                            value={userAgentConfig.followUpCount}
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserAgentConfig(prev => ({ ...prev, followUpCount: parseInt(e.target.value) }))}
                                                            className="w-full accent-cyan-500"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] text-slate-500 font-bold uppercase">Responder</label>
                                                        <select
                                                            value={userAgentConfig.responderPhase}
                                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUserAgentConfig(prev => ({ ...prev, responderPhase: e.target.value }))}
                                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-cyan-500 outline-none"
                                                        >
                                                            <option value="writer">Writer</option>
                                                            <option value="rewriter">Rewriter</option>
                                                            <option value="responder">Custom Responder</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-slate-500 font-bold uppercase">User Agent Provider</label>
                                                    <div className="flex bg-slate-950 p-0.5 rounded border border-slate-700">
                                                        <button onClick={() => setUserAgentConfig(prev => ({ ...prev, provider: 'gemini' }))} className={`flex-1 py-1 text-[10px] font-medium rounded transition-all ${userAgentConfig.provider === 'gemini' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>Gemini</button>
                                                        <button onClick={() => setUserAgentConfig(prev => ({ ...prev, provider: 'external' }))} className={`flex-1 py-1 text-[10px] font-medium rounded transition-all ${userAgentConfig.provider === 'external' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>External</button>
                                                    </div>
                                                </div>
                                                {userAgentConfig.provider === 'external' && (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-slate-500 font-bold uppercase">Provider</label>
                                                            <select
                                                                value={userAgentConfig.externalProvider}
                                                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUserAgentConfig(prev => ({ ...prev, externalProvider: e.target.value as ExternalProvider }))}
                                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                                                            >
                                                                {EXTERNAL_PROVIDERS.map(ep => <option key={ep} value={ep}>{ep}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-slate-500 font-bold uppercase">Model</label>
                                                            <input
                                                                type="text"
                                                                value={userAgentConfig.model}
                                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserAgentConfig(prev => ({ ...prev, model: e.target.value }))}
                                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                                                            />
                                                        </div>
                                                        <div className="col-span-2 space-y-1">
                                                            <label className="text-[10px] text-slate-500 font-bold uppercase">API Key</label>
                                                            <input
                                                                type="password"
                                                                value={userAgentConfig.apiKey}
                                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserAgentConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                                                            />
                                                        </div>
                                                        {userAgentConfig.externalProvider === 'other' && (
                                                            <div className="col-span-2 space-y-1">
                                                                <label className="text-[10px] text-slate-500 font-bold uppercase">Base URL</label>
                                                                <input
                                                                    type="text"
                                                                    value={userAgentConfig.customBaseUrl}
                                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserAgentConfig(prev => ({ ...prev, customBaseUrl: e.target.value }))}
                                                                    placeholder="https://api.example.com/v1"
                                                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {/* Generation Params & Retry Config */}
                            <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-3">
                                <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Concurrency</label><input type="number" min="1" max="50" value={concurrency} onChange={e => setConcurrency(Math.max(1, parseInt(e.target.value) || 1))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none" /></div>
                                <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Sleep (ms)</label><input type="number" min="0" step="100" value={sleepTime} onChange={e => setSleepTime(Math.max(0, parseInt(e.target.value) || 0))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none" /></div>
                                <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Max Retries</label><input type="number" min="0" max="10" value={maxRetries} onChange={e => setMaxRetries(Math.max(0, parseInt(e.target.value) || 0))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none" /></div>
                                <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Retry Delay</label><input type="number" min="500" step="500" value={retryDelay} onChange={e => setRetryDelay(Math.max(500, parseInt(e.target.value) || 500))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none" /></div>
                            </div>
                        </div>

                        {/* Source Config (Simplified display) */}
                        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5 space-y-4">
                            <div className="flex justify-between items-center mb-2"><h3 className="text-sm font-semibold text-white flex items-center gap-2"><Database className="w-4 h-4 text-slate-400" /> SOURCE</h3></div>
                            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                                <button onClick={() => handleDataSourceModeChange('synthetic')} className={`flex-1 py-2 text-[10px] font-bold rounded flex flex-col items-center justify-center gap-1 transition-all uppercase tracking-wide ${dataSourceMode === 'synthetic' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}><BrainCircuit className="w-3.5 h-3.5" /> Synthetic</button>
                                <button onClick={() => handleDataSourceModeChange('huggingface')} className={`flex-1 py-2 text-[10px] font-bold rounded flex flex-col items-center justify-center gap-1 transition-all uppercase tracking-wide ${dataSourceMode === 'huggingface' ? 'bg-amber-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}><Server className="w-3.5 h-3.5" /> HuggingFace</button>
                                <button onClick={() => handleDataSourceModeChange('manual')} className={`flex-1 py-2 text-[10px] font-bold rounded flex flex-col items-center justify-center gap-1 transition-all uppercase tracking-wide ${dataSourceMode === 'manual' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}><FileText className="w-3.5 h-3.5" /> Manual</button>
                            </div>

                            {dataSourceMode === 'synthetic' && (
                                <div className="space-y-3 animate-in fade-in">
                                    <div className="flex gap-2">
                                        <select value={topicCategory} onChange={e => setTopicCategory(e.target.value)} className="bg-slate-950 border border-slate-700 text-[10px] text-slate-300 rounded px-2 py-1 flex-1 outline-none">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                        <button onClick={generateRandomTopic} disabled={isGeneratingTopic} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded p-1.5 text-slate-300 transition-colors disabled:opacity-50"><Dice5 className={`w-3.5 h-3.5 ${isGeneratingTopic ? 'animate-spin' : ''}`} /></button>
                                    </div>
                                    <textarea value={geminiTopic} onChange={e => setGeminiTopic(e.target.value)} className="w-full h-20 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none resize-none" placeholder="Enter topic..." />
                                    <div className="space-y-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Items to Generate</label><input type="number" value={rowsToFetch} onChange={e => setRowsToFetch(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none" /></div>
                                </div>
                            )}
                            {dataSourceMode === 'huggingface' && (
                                <div className="space-y-3 animate-in fade-in relative">
                                    <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-200">Fetches rows from a public HF dataset.</div>
                                    <div className="space-y-1 relative" onBlur={() => setTimeout(() => setShowHFResults(false), 200)}>
                                        <label className="text-[10px] text-slate-500 font-bold uppercase">Dataset ID</label>
                                        <div className="relative"><input type="text" value={hfConfig.dataset} onChange={e => handleHFSearch(e.target.value)} onFocus={() => hfSearchResults.length > 0 && setShowHFResults(true)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none pr-8" placeholder="Search e.g. fka/awesome-chatgpt-prompts" /><div className="absolute right-2 top-1.5 text-slate-500 pointer-events-none">{isSearchingHF ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}</div></div>
                                        {showHFResults && hfSearchResults.length > 0 && (<div className="absolute z-10 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto mt-1">{hfSearchResults.map(result => (<button key={result} onClick={() => handleSelectHFDataset(result)} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors border-b border-slate-800 last:border-0">{result}</button>))}</div>)}
                                    </div>
                                    {/* ... (HF Config Inputs) ... */}
                                    <div className="flex gap-2">
                                        <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Config</label>{hfStructure.configs.length > 0 ? (<select value={hfConfig.config} onChange={e => handleConfigChange(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none appearance-none">{hfStructure.configs.map(c => <option key={c} value={c}>{c}</option>)}</select>) : (<input type="text" value={hfConfig.config} onChange={e => setHfConfig({ ...hfConfig, config: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none" />)}</div>
                                        <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Split</label>{hfStructure.splits[hfConfig.config]?.length > 0 ? (<select value={hfConfig.split} onChange={e => setHfConfig({ ...hfConfig, split: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none appearance-none">{hfStructure.splits[hfConfig.config].map(s => <option key={s} value={s}>{s}</option>)}</select>) : (<input type="text" value={hfConfig.split} onChange={e => setHfConfig({ ...hfConfig, split: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none" />)}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Rows to Fetch</label><input type="number" value={rowsToFetch} onChange={e => setRowsToFetch(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none" /></div>
                                        <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-500 font-bold uppercase">Skip Rows</label><input type="number" value={skipRows} onChange={e => setSkipRows(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none" /></div>
                                    </div>
                                    {/* Column Selection */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                                <Table className="w-3 h-3" /> Column Mapping
                                            </label>
                                            <button onClick={() => prefetchColumns()} disabled={isPrefetching} className="text-[9px] text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-colors disabled:opacity-50">
                                                {isPrefetching ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} Scan Columns
                                            </button>
                                        </div>
                                        <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded text-[10px] text-amber-200 mb-2 flex gap-2 items-start">
                                            <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="font-bold">Column Mapping Guide:</span>
                                                <ul className="list-disc ml-4 mt-1 space-y-0.5 text-amber-200/80">
                                                    <li><b>Input Column:</b> Content maps to the <code className="bg-black/30 px-1 rounded mx-0.5">query</code> field. This acts as the prompt for the reasoning engine.</li>
                                                    <li><b>Ground Truth:</b> Content maps to the <code className="bg-black/30 px-1 rounded mx-0.5">answer</code> field. Used for reference/verification.</li>
                                                    <li><b>Reasoning Column (optional):</b> Explicitly map a column containing pre-existing reasoning.</li>
                                                </ul>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <ColumnSelector
                                                label="Input Column (Maps to 'query')"
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
                                                    label="Ground Truth (Maps to 'answer')"
                                                    columns={availableColumns}
                                                    selected={hfConfig.outputColumns || []}
                                                    onSelect={(cols) => setHfConfig(prev => ({ ...prev, outputColumns: cols }))}
                                                    autoDetected={detectedColumns.output}
                                                    placeholder="Select output column(s)"
                                                />
                                            </div>
                                        </div>
                                        {/* MCQ Column Selector */}
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                                <List className="w-3 h-3" /> MCQ Options Column (optional)
                                            </label>
                                            <select
                                                value={hfConfig.mcqColumn || ''}
                                                onChange={(e) => setHfConfig(prev => ({ ...prev, mcqColumn: e.target.value || undefined }))}
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none"
                                            >
                                                <option value="">None</option>
                                                {availableColumns.map(col => (
                                                    <option key={col} value={col}>{col}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {/* MCQ Column Selector */}
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                                <List className="w-3 h-3" /> MCQ Options Column (optional)
                                            </label>
                                            <select
                                                value={hfConfig.mcqColumn || ''}
                                                onChange={(e) => setHfConfig(prev => ({ ...prev, mcqColumn: e.target.value || undefined }))}
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none"
                                            >
                                                <option value="">None</option>
                                                {availableColumns.map(col => (
                                                    <option key={col} value={col}>{col}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Turn Index</label><input type="number" min="0" value={hfConfig.messageTurnIndex || 0} onChange={e => setHfConfig({ ...hfConfig, messageTurnIndex: Math.max(0, parseInt(e.target.value) || 0) })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none" placeholder="0" /></div>
                                        <div className="space-y-1 flex-1"><label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1"><Layers className="w-3 h-3" /> Max Traces</label><input type="number" min="0" value={hfConfig.maxMultiTurnTraces || ''} onChange={e => setHfConfig({ ...hfConfig, maxMultiTurnTraces: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0) })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none" placeholder="All" /></div>
                                    </div>

                                    {/* Dataset Info & Preview */}
                                    {hfConfig.dataset && (
                                        <div className="space-y-2 mt-3">
                                            {/* Row count badge */}
                                            {hfTotalRows > 0 && (
                                                <div className="flex items-center gap-2 text-[10px]">
                                                    <span className="text-slate-500">Total rows in dataset:</span>
                                                    <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono">
                                                        {hfTotalRows.toLocaleString()}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Preview Table */}
                                            {isLoadingHfPreview ? (
                                                <div className="flex items-center justify-center py-4 text-slate-500 text-xs">
                                                    <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> Loading preview...
                                                </div>
                                            ) : hfPreviewData.length > 0 && (
                                                <DataPreviewTable
                                                    rawText={JSON.stringify(hfPreviewData)}
                                                    onClose={() => setHfPreviewData([])}
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {dataSourceMode === 'manual' && (
                                <div className="space-y-3 animate-in fade-in">
                                    <div className="flex gap-2">
                                        <button onClick={() => sourceFileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs py-2 rounded transition-colors">
                                            <Upload className="w-3.5 h-3.5" /> Upload File
                                        </button>
                                        <input type="file" ref={sourceFileInputRef} onChange={handleLoadSourceFile} className="hidden" accept=".json,.jsonl,.txt" />
                                    </div>

                                    {/* Rows to Fetch and Skip Rows controls */}
                                    <div className="flex gap-2">
                                        <div className="space-y-1 flex-1">
                                            <label className="text-[10px] text-slate-500 font-bold uppercase">Rows to Fetch</label>
                                            <input type="number" value={rowsToFetch} onChange={e => setRowsToFetch(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none" />
                                        </div>
                                        <div className="space-y-1 flex-1">
                                            <label className="text-[10px] text-slate-500 font-bold uppercase">Skip Rows</label>
                                            <input type="number" value={skipRows} onChange={e => setSkipRows(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none" />
                                        </div>
                                    </div>

                                    {/* Data Preview Table or Raw Input */}
                                    {converterInputText.trim() ? (
                                        <DataPreviewTable
                                            rawText={converterInputText}
                                            onClose={() => setConverterInputText('')}
                                        />
                                    ) : (
                                        <textarea
                                            value={converterInputText}
                                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                                                setConverterInputText(e.target.value);
                                                setRowsToFetch(e.target.value.split('\n').filter((l: string) => l.trim()).length);
                                            }}
                                            className="w-full h-32 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-[10px] font-mono text-slate-400 focus:border-indigo-500 outline-none resize-none"
                                            placeholder="Paste text or JSON lines here..."
                                        />
                                    )}

                                    {/* Column Selection for Manual Input */}
                                    {availableColumns.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                                    <Table className="w-3 h-3" /> Column Mapping
                                                </label>
                                            </div>
                                            <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded text-[10px] text-amber-200 mb-2 flex gap-2 items-start">
                                                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                                <div>
                                                    <span className="font-bold">Column Mapping Guide:</span>
                                                    <ul className="list-disc ml-4 mt-1 space-y-0.5 text-amber-200/80">
                                                        <li><b>Input Column:</b> Content maps to the <code className="bg-black/30 px-1 rounded mx-0.5">query</code> field.</li>
                                                        <li><b>Ground Truth:</b> Content maps to the <code className="bg-black/30 px-1 rounded mx-0.5">answer</code> field. Used for reference/verification.</li>
                                                        <li><b>Reasoning Column (optional):</b> Explicitly map a column containing pre-existing reasoning.</li>
                                                    </ul>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <ColumnSelector
                                                    label="Input Column (Maps to 'query')"
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
                                                        label="Ground Truth (Maps to 'answer')"
                                                        columns={availableColumns}
                                                        selected={hfConfig.outputColumns || []}
                                                        onSelect={(cols) => setHfConfig(prev => ({ ...prev, outputColumns: cols }))}
                                                        autoDetected={detectedColumns.output}
                                                        placeholder="Select output column(s)"
                                                    />
                                                </div>
                                            </div>
                                            {/* MCQ Column Selector for Manual Data */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                                    <List className="w-3 h-3" /> MCQ Options Column (optional)
                                                </label>
                                                <select
                                                    value={hfConfig.mcqColumn || ''}
                                                    onChange={(e) => setHfConfig(prev => ({ ...prev, mcqColumn: e.target.value || undefined }))}
                                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none"
                                                >
                                                    <option value="">None</option>
                                                    {availableColumns.map(col => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {/* MCQ Column Selector for Manual Data */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                                    <List className="w-3 h-3" /> MCQ Options Column (optional)
                                                </label>
                                                <select
                                                    value={hfConfig.mcqColumn || ''}
                                                    onChange={(e) => setHfConfig(prev => ({ ...prev, mcqColumn: e.target.value || undefined }))}
                                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500 outline-none"
                                                >
                                                    <option value="">None</option>
                                                    {availableColumns.map(col => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between text-[10px] text-slate-600">
                                        <span>{converterInputText.split('\n').filter((l: string) => l.trim()).length} lines detected</span>
                                        {converterInputText.trim() && (
                                            <button
                                                onClick={() => setConverterInputText('')}
                                                className="text-slate-500 hover:text-red-400 transition-colors"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Prompt Editor (Same) */}

                    </div>

                    {/* Feed / Analytics (CREATOR MODE) */}
                    <div className="lg:col-span-8">
                        <div className="flex justify-between items-end mb-4">
                            {/* View Switcher */}
                            <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
                                <button
                                    onClick={() => setViewMode('feed')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'feed' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                                >
                                    <Terminal className="w-4 h-4" /> Live Feed
                                </button>
                                <button
                                    onClick={() => setViewMode('analytics')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'analytics' ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/20' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                                >
                                    <LayoutDashboard className="w-4 h-4" /> Analytics
                                </button>
                            </div>

                            {viewMode === 'feed' && (
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Page Size</label>
                                    <select
                                        value={feedPageSize}
                                        onChange={(e) => setFeedPageSize(Number(e.target.value))}
                                        className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg px-2 py-1 outline-none focus:border-indigo-500"
                                    >
                                        <option value="5">5</option>
                                        <option value="25">25</option>
                                        <option value="50">50</option>
                                        <option value="100">100</option>
                                        <option value="1000">1000</option>
                                        <option value="-1">All</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {viewMode === 'feed' ? (
                            <LogFeed
                                logs={visibleLogs}
                                pageSize={feedPageSize}
                                totalLogCount={totalLogCount}
                                currentPage={currentPage}
                                onPageChange={handlePageChange}
                                onRetry={retryItem}
                                onRetrySave={retrySave}
                                retryingIds={retryingIds}
                            />
                        ) : (
                            <AnalyticsDashboard logs={visibleLogs} />
                        )}
                    </div>
                </main>
            )}

            {/* Settings Panel */}
            <SettingsPanel
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                onSettingsChanged={async () => {
                    refreshPrompts();
                    // Refresh logs to pick up any storage changes
                    await refreshLogs();
                }}
            />
        </div >
    );
}