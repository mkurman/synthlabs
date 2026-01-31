import { SynthLogItem, StreamChunkCallback, ChatMessage, StreamingConversationState, GenerationParams } from '../types';
import { LogStorageService } from './logStorageService';
import { SettingsService } from './settingsService';
import * as FirebaseService from './firebaseService';
import * as GeminiService from './geminiService';
import * as ExternalApiService from './externalApiService';
import * as DeepReasoningService from './deepReasoningService';
import { logger } from '../utils/logger';
import { toast } from './toastService';
import { confirmService } from './confirmService';
import { createPrefetchManager, PrefetchState } from './hfPrefetchService';
import { TaskClassifierService, TaskType } from './taskClassifierService';
import { PromptService } from './promptService';
import { DEFAULT_HF_PREFETCH_CONFIG } from '../types';
import { extractInputContent } from '../utils/contentExtractor';
import { DataSource, EngineMode, AppMode, Environment, ProviderType, ExternalProvider, ApiType, ChatRole, ResponderPhase, LogItemStatus, PromptCategory, PromptRole } from '../interfaces/enums';
import { ExtractContentFormat } from '../interfaces/services/DataTransformConfig';
import type { CompleteGenerationConfig as GenerationConfig, RuntimePromptConfig, WorkItem } from '../interfaces';

export interface GenerationConfigBuilderInput extends Omit<GenerationConfig, 'generationParams'> {
    generationParams: GenerationParams;
}

export const buildGenerationConfig = (input: GenerationConfigBuilderInput): GenerationConfig => {
    const normalizedParams = Object.keys(input.generationParams || {}).length > 0
        ? input.generationParams
        : undefined;

    return {
        ...input,
        generationParams: normalizedParams
    };
};

export class GenerationService {
    private config: GenerationConfig;

    constructor(config: GenerationConfig) {
        this.config = config;
    }

    async startGeneration(append = false): Promise<void> {
        const { config } = this;

        // Check Firebase in production
        if (config.environment === Environment.Production && !FirebaseService.isFirebaseConfigured()) {
            const confirmContinue = await confirmService.confirm({
                title: 'Firebase not configured',
                message: 'Production mode will not save data remotely. Continue anyway?',
                confirmLabel: 'Continue',
                cancelLabel: 'Cancel',
                variant: 'warning'
            });
            if (!confirmContinue) return;
        }

        // Initialize session
        if (!append) {
            await this.initializeSession();
        }

        // Validate settings
        await SettingsService.waitForSettingsInit();

        // Validate API keys
        if (!this.validateApiKeys()) {
            return;
        }

        // Validate input
        if (config.dataSourceMode === DataSource.Manual && !config.converterInputText.trim()) {
            config.setError("Please provide input text or upload a file.");
            return;
        }

        config.setError(null);
        config.setIsRunning(true);
        config.abortControllerRef.current = new AbortController();
        toast.info('Generation started');

        try {
            const workItems = await this.prepareWorkItems();

            if (workItems.length === 0 && config.dataSourceMode !== DataSource.HuggingFace) {
                throw new Error("No inputs generated or parsed.");
            }

            // Auto-generate session name if needed
            if (!config.sessionName) {
                const autoName = `${config.engineMode}-${new Date().toISOString().slice(0, 10)}`;
                config.setSessionName(autoName);
                config.sessionNameRef.current = autoName;
            }

            // Build runtime config with auto-routing
            const runtimeConfig = await this.buildRuntimeConfig(workItems);

            // Run generation
            await this.runGeneration(workItems, runtimeConfig);

        } catch (err: any) {
            if (err.name !== 'AbortError') {
                config.setError(err.message);
            }
        } finally {
            this.cleanup();
            config.setIsRunning(false);
        }
    }

    private async initializeSession(): Promise<void> {
        const { config } = this;

        const sourceLabel = config.dataSourceMode === DataSource.HuggingFace
            ? `hf:${config.hfConfig.dataset}`
            : config.dataSourceMode === DataSource.Manual
                ? `manual:${config.manualFileName || 'unknown'}`
                : 'synthetic';

        let newUid: string;

        const isCurrentSessionFirebase = config.sessionUidRef.current.length === 20 &&
            /^[a-zA-Z0-9]+$/.test(config.sessionUidRef.current);

        if (config.environment === Environment.Production && FirebaseService.isFirebaseConfigured() && !isCurrentSessionFirebase) {
            try {
                const sessionName = `${config.appMode === AppMode.Generator ? 'Generation' : 'Conversion'} - ${new Date().toLocaleString()}`;
                const sessionConfig = config.getSessionData();
                newUid = await FirebaseService.createSessionInFirebase(sessionName, sourceLabel, sessionConfig);
                logger.log(`Created Firebase session: ${newUid}`);
            } catch (e) {
                logger.warn("Failed to create Firebase session, using local UUID", e);
                newUid = this.generateUUID();
            }
        } else {
            newUid = this.generateUUID();
        }

        config.setSessionUid(newUid);
        config.sessionUidRef.current = newUid;
        config.setVisibleLogs([]);
        config.setTotalLogCount(0);
        config.setFilteredLogCount(0);
        config.setSparklineHistory([]);

        if (config.sessionName === "Local File Session" || !config.sessionName) {
            config.setSessionName(null);
        }
    }

    private generateUUID(): string {
        return typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    private validateApiKeys(): boolean {
        const { config } = this;

        const resolvedApiKey = config.externalApiKey?.trim() || SettingsService.getApiKey(config.externalProvider);

        if (config.engineMode === EngineMode.Regular && config.provider === ProviderType.External && !resolvedApiKey && config.externalProvider !== ExternalProvider.Ollama) {
            config.setError("API Key is required for external providers (except Ollama). Click the Settings icon in the header or enter a key here.");
            return false;
        }

        if (config.engineMode === EngineMode.Deep) {
            const writer = config.deepConfig.phases.writer;
            const writerApiKey = writer.apiKey?.trim() || (writer.externalProvider ? SettingsService.getApiKey(writer.externalProvider) : '');
            if (writer.provider !== ProviderType.Gemini && !writerApiKey && writer.externalProvider !== ExternalProvider.Ollama) {
                config.setError(`Writer Agent requires an API Key for ${writer.externalProvider}. Click the Settings icon in the header to configure, or enter a key inline in the Writer phase.`);
                return false;
            }
        }

        return true;
    }

    private async prepareWorkItems(): Promise<WorkItem[]> {
        const { config } = this;
        let workItems: WorkItem[] = [];

        if (config.dataSourceMode === DataSource.HuggingFace) {
            await this.setupPrefetchMode();
            return workItems; // Empty for prefetch mode
        } else if (config.dataSourceMode === DataSource.Manual) {
            workItems = await this.parseManualInput();
        } else {
            // Synthetic
            workItems = await this.generateSyntheticSeeds();
        }

        return workItems;
    }

    private async setupPrefetchMode(): Promise<void> {
        const { config } = this;

        config.setProgress({ current: 0, total: config.rowsToFetch, activeWorkers: 1 });

        const prefetchConfig = config.hfConfig.prefetchConfig || DEFAULT_HF_PREFETCH_CONFIG;
        config.prefetchManagerRef.current = createPrefetchManager(
            config.hfConfig,
            config.skipRows,
            config.rowsToFetch,
            config.concurrency,
            prefetchConfig
        );

        config.prefetchManagerRef.current.setOnStateChange((state: PrefetchState) => {
            config.setPrefetchState(state);
        });

        logger.log(`[Generation] Starting prefetch with config: batches=${prefetchConfig.prefetchBatches}, threshold=${prefetchConfig.prefetchThreshold}, concurrency=${config.concurrency}`);
        await config.prefetchManagerRef.current.initialPrefetch();
    }

    private async parseManualInput(): Promise<WorkItem[]> {
        const { config } = this;
        let parsedRows: any[] = [];
        const trimmedInput = config.converterInputText.trim();

        // Try parsing as JSON array
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

        // Fallback to JSONL format
        if (parsedRows.length === 0) {
            const allLines = config.converterInputText.split('\n').filter(line => line.trim().length > 0);
            parsedRows = allLines.map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return line;
                }
            });
        }

        const rowsToProcess = parsedRows.slice(config.skipRows, config.skipRows + config.rowsToFetch);
        config.setProgress({ current: 0, total: rowsToProcess.length, activeWorkers: 1 });

        const workItems = rowsToProcess.map(row => {
            if (typeof row === 'object' && row !== null) {
                return { content: config.getRowContent(row), row: row };
            } else {
                return { content: String(row), row: null };
            }
        });

        if (workItems.length === 0) {
            throw new Error("No rows to process after applying skip/limit. Check your settings.");
        }

        return workItems;
    }

    private async generateSyntheticSeeds(): Promise<WorkItem[]> {
        const { config } = this;
        const MAX_SEEDS_PER_BATCH = 10;
        const totalNeeded = config.rowsToFetch;
        let collectedSeeds: string[] = [];
        const batchCount = Math.ceil(totalNeeded / MAX_SEEDS_PER_BATCH);

        config.setProgress({ current: 0, total: totalNeeded, activeWorkers: 1 });

        for (let i = 0; i < batchCount; i++) {
            if (config.abortControllerRef.current?.signal.aborted) break;

            const countForBatch = Math.min(MAX_SEEDS_PER_BATCH, totalNeeded - collectedSeeds.length);
            let batchSeeds: string[] = [];

            if (config.provider === ProviderType.Gemini) {
                batchSeeds = await GeminiService.generateSyntheticSeeds(config.geminiTopic, countForBatch, config.externalModel);
            } else {
                const useStructuredOutput = config.externalProvider !== ExternalProvider.Ollama;
                batchSeeds = await ExternalApiService.generateSyntheticSeeds({
                    provider: config.externalProvider,
                    apiKey: config.externalApiKey || SettingsService.getApiKey(config.externalProvider),
                    model: config.externalModel,
                    customBaseUrl: config.customBaseUrl || SettingsService.getCustomBaseUrl(),
                    signal: config.abortControllerRef.current?.signal || undefined,
                    structuredOutput: useStructuredOutput,
                }, config.geminiTopic, countForBatch);
            }

            collectedSeeds = [...collectedSeeds, ...batchSeeds];
            config.setProgress((p: { current: number; total: number; activeWorkers: number }) => ({ ...p, current: collectedSeeds.length, total: totalNeeded }));
        }

        return collectedSeeds.map(s => ({ content: s, row: null }));
    }

    private async buildRuntimeConfig(workItems: WorkItem[]): Promise<RuntimePromptConfig | undefined> {
        const { config } = this;
        const settings = SettingsService.getSettings();
        const confidenceThreshold = settings.autoRouteConfidenceThreshold ?? 0.3;
        const defaultPromptSet = config.sessionPromptSet || settings.promptSet || 'default';

        const buildConfig = (promptSet: string): RuntimePromptConfig => ({
            systemPrompt: PromptService.getSystemPrompt(PromptCategory.Generator, PromptRole.System, promptSet, true),
            converterPrompt: PromptService.getSystemPrompt(PromptCategory.Converter, PromptRole.System, promptSet, true),
            deepConfig: config.deepConfig,
            promptSet: promptSet
        });

        let runtimeConfig: RuntimePromptConfig | undefined = undefined;

        if (settings.autoRouteEnabled && workItems.length > 0) {
            runtimeConfig = await this.performAutoRouting(workItems, defaultPromptSet, confidenceThreshold, buildConfig);
        } else {
            config.setDetectedTaskType(null);
            config.setAutoRoutedPromptSet(null);
        }

        return runtimeConfig;
    }

    private async performAutoRouting(
        workItems: WorkItem[],
        defaultPromptSet: string,
        confidenceThreshold: number,
        buildConfig: (promptSet: string) => RuntimePromptConfig
    ): Promise<RuntimePromptConfig | undefined> {
        const settings = SettingsService.getSettings();

        if (settings.autoRouteMethod === 'heuristic') {
            return this.performHeuristicRouting(workItems, defaultPromptSet, confidenceThreshold, buildConfig);
        } else if (settings.autoRouteMethod === 'llm') {
            return this.performLlmRouting(workItems, defaultPromptSet, confidenceThreshold, buildConfig);
        }

        return undefined;
    }

    private performHeuristicRouting(
        workItems: WorkItem[],
        defaultPromptSet: string,
        confidenceThreshold: number,
        buildConfig: (promptSet: string) => RuntimePromptConfig
    ): RuntimePromptConfig | undefined {
        const { config } = this;
        const settings = SettingsService.getSettings();

        const sampleSize = Math.min(5, workItems.length);
        const samples = workItems.slice(0, sampleSize);
        const votes = samples.map(s => TaskClassifierService.classifyHeuristic(s.content));

        const typeScores: Record<string, number> = {};
        for (const vote of votes) {
            typeScores[vote.type] = (typeScores[vote.type] || 0) + vote.confidence;
        }

        let bestType: TaskType = 'unknown';
        let bestScore = 0;
        for (const [type, score] of Object.entries(typeScores)) {
            if (score > bestScore) {
                bestScore = score;
                bestType = type as TaskType;
            }
        }

        const winningVotes = votes.filter(v => v.type === bestType);
        const avgConfidence = winningVotes.length > 0
            ? winningVotes.reduce((sum, v) => sum + v.confidence, 0) / winningVotes.length
            : 0;

        config.setDetectedTaskType(bestType);

        if (bestType !== 'unknown' && avgConfidence >= confidenceThreshold) {
            const recommendedSet = TaskClassifierService.getRecommendedPromptSet(bestType, defaultPromptSet, settings.taskPromptMapping);
            config.setAutoRoutedPromptSet(recommendedSet);
            const runtimeConfig = buildConfig(recommendedSet);

            config.setSystemPrompt(runtimeConfig.systemPrompt);
            config.setConverterPrompt(runtimeConfig.converterPrompt);
            config.setDeepConfig(runtimeConfig.deepConfig);

            logger.log(`[Auto-Route] Detected task: ${bestType} (${winningVotes.length}/${sampleSize} votes, avg confidence: ${(avgConfidence * 100).toFixed(0)}%) -> Using prompt set: ${recommendedSet}`);
            return runtimeConfig;
        } else {
            config.setAutoRoutedPromptSet(null);
            logger.log(`[Auto-Route] Confidence below threshold (${bestType}: ${(avgConfidence * 100).toFixed(0)}% < ${(confidenceThreshold * 100).toFixed(0)}%) -> Fallback to: ${defaultPromptSet}`);
            return undefined;
        }
    }

    private async performLlmRouting(
        workItems: WorkItem[],
        defaultPromptSet: string,
        confidenceThreshold: number,
        buildConfig: (promptSet: string) => RuntimePromptConfig
    ): Promise<RuntimePromptConfig | undefined> {
        const { config } = this;
        const settings = SettingsService.getSettings();
        const sampleQuery = workItems[0].content;

        try {
            const classifierPrompt = TaskClassifierService.getClassifierPrompt(sampleQuery);

            const classifierProvider = settings.autoRouteLlmProvider || ProviderType.Gemini;
            const classifierExternalProvider = settings.autoRouteLlmExternalProvider || config.externalProvider;
            const classifierModel = settings.autoRouteLlmModel || config.externalModel;
            const classifierApiKey = settings.autoRouteLlmApiKey || SettingsService.getApiKey(classifierExternalProvider);
            const classifierBaseUrl = settings.autoRouteLlmCustomBaseUrl || SettingsService.getCustomBaseUrl();

            let response: string;

            if (classifierProvider === ProviderType.Gemini) {
                const classifyResult = await GeminiService.generateReasoningTrace(
                    classifierPrompt,
                    'You are a task classifier. Reply with ONLY the category name.',
                    { maxRetries: 1, retryDelay: 1000, generationParams: {} }
                );
                response = classifyResult.answer || classifyResult.reasoning || '';
            } else {
                const classifyResult = await ExternalApiService.callExternalApi({
                    provider: classifierExternalProvider as ExternalProvider,
                    apiKey: classifierApiKey,
                    model: classifierModel,
                    customBaseUrl: classifierBaseUrl,
                    userPrompt: "You are a task classifier. Output exactly ONE word.\n\n" + classifierPrompt,
                    maxRetries: 1,
                    retryDelay: 1000,
                    generationParams: {},
                    structuredOutput: true
                });
                response = classifyResult?.answer || classifyResult?.reasoning || JSON.stringify(classifyResult) || '';
            }

            const { type: taskType, confidence: llmConfidence } = TaskClassifierService.parseClassifierResponse(response);
            config.setDetectedTaskType(taskType);

            if (taskType !== 'unknown' && llmConfidence >= confidenceThreshold) {
                const recommendedSet = TaskClassifierService.getRecommendedPromptSet(taskType, defaultPromptSet, settings.taskPromptMapping);
                config.setAutoRoutedPromptSet(recommendedSet);
                const runtimeConfig = buildConfig(recommendedSet);

                config.setSystemPrompt(runtimeConfig.systemPrompt);
                config.setConverterPrompt(runtimeConfig.converterPrompt);
                config.setDeepConfig(runtimeConfig.deepConfig);

                logger.log(`[Auto-Route/LLM] Detected task: ${taskType} (confidence: ${(llmConfidence * 100).toFixed(0)}%) -> Using prompt set: ${recommendedSet}`);
                return runtimeConfig;
            } else if (taskType === 'unknown') {
                config.setAutoRoutedPromptSet(null);
                logger.log(`[Auto-Route/LLM] Classification returned 'unknown' -> Fallback to: ${defaultPromptSet}`);
                return undefined;
            } else {
                config.setAutoRoutedPromptSet(null);
                logger.log(`[Auto-Route/LLM] Confidence below threshold (${taskType}: ${(llmConfidence * 100).toFixed(0)}% < ${(confidenceThreshold * 100).toFixed(0)}%) -> Fallback to: ${defaultPromptSet}`);
                return undefined;
            }
        } catch (e: any) {
            logger.warn(`[Auto-Route/LLM] Classification failed: ${e.message || e} -> Fallback to: ${defaultPromptSet}`);
            config.setDetectedTaskType(null);
            config.setAutoRoutedPromptSet(null);
            return buildConfig(defaultPromptSet);
        }
    }

    private async runGeneration(workItems: WorkItem[], runtimeConfig: RuntimePromptConfig | undefined): Promise<void> {
        const { config } = this;
        const usePrefetch = config.dataSourceMode === DataSource.HuggingFace;
        const totalItems = usePrefetch ? config.rowsToFetch : workItems.length;

        config.setProgress({ current: 0, total: totalItems, activeWorkers: 0 });

        let currentIndex = 0;
        let processedCount = 0;

        const worker = async (id: number) => {
            while (true) {
                if (config.abortControllerRef.current?.signal.aborted) break;

                await this.waitIfPaused();
                if (config.abortControllerRef.current?.signal.aborted) break;

                let item: WorkItem | null = null;

                if (usePrefetch && config.prefetchManagerRef.current) {
                    const row = await config.prefetchManagerRef.current.getNextItem();
                    if (!row) break;

                    item = {
                        content: config.getRowContent(row),
                        row: row
                    };
                } else {
                    const myIndex = currentIndex++;
                    if (myIndex >= workItems.length) break;
                    item = workItems[myIndex];
                }

                if (!item) break;

                await this.waitIfPaused();
                if (config.abortControllerRef.current?.signal.aborted) break;

                const { originalQuestion, originalAnswer, originalReasoning } = this.extractOriginals(item.row);

                config.setProgress((p: { current: number; total: number; activeWorkers: number }) => ({ ...p, activeWorkers: p.activeWorkers + 1 }));

                const result = await this.generateSingleItem(item.content, id, {
                    originalQuestion,
                    originalAnswer,
                    originalReasoning,
                    row: item.row,
                    runtimeConfig
                });

                processedCount++;
                config.setProgress((p: { current: number; total: number; activeWorkers: number }) => ({
                    ...p,
                    current: processedCount,
                    activeWorkers: p.activeWorkers - 1
                }));

                if (result) {
                    await this.processResult(result);
                }

                if (config.sleepTime > 0) {
                    await new Promise(r => setTimeout(r, config.sleepTime));
                }
            }
        };

        const workerCount = usePrefetch ? config.concurrency : Math.min(config.concurrency, workItems.length);
        const workers = Array.from({ length: workerCount }, (_, i) => worker(i));
        await Promise.all(workers);
    }

    private async waitIfPaused(): Promise<void> {
        const { config } = this;
        while (config.isPausedRef.current && !config.abortControllerRef.current?.signal.aborted) {
            await new Promise(r => setTimeout(r, 200));
        }
    }

    private extractOriginals(row: any): { originalQuestion?: string; originalAnswer?: string; originalReasoning?: string } {
        const { config } = this;
        let originalQuestion: string | undefined;
        let originalAnswer: string | undefined;
        let originalReasoning: string | undefined;

        if (row && config.hfConfig.inputColumns && config.hfConfig.inputColumns.length > 0) {
            const parts: string[] = [];
            for (const col of config.hfConfig.inputColumns) {
                const val = row[col];
                if (val !== undefined && val !== null) {
                    parts.push(typeof val === 'string' ? val : JSON.stringify(val));
                }
            }
            if (parts.length > 0) {
                originalQuestion = parts.join('\n\n');
            }
        }

        if (row && config.hfConfig.outputColumns && config.hfConfig.outputColumns.length > 0) {
            const parts: string[] = [];
            for (const col of config.hfConfig.outputColumns) {
                const val = row[col];
                if (val !== undefined && val !== null) {
                    parts.push(typeof val === 'string' ? val : JSON.stringify(val));
                }
            }
            if (parts.length > 0) {
                originalAnswer = parts.join('\n\n');
            }
        }

        if (row && config.hfConfig.reasoningColumns && config.hfConfig.reasoningColumns.length > 0) {
            const parts: string[] = [];
            for (const col of config.hfConfig.reasoningColumns) {
                const val = row[col];
                if (val !== undefined && val !== null) {
                    parts.push(typeof val === 'string' ? val : JSON.stringify(val));
                }
            }
            if (parts.length > 0) {
                originalReasoning = parts.join('\n\n');
            }
        }

        return { originalQuestion, originalAnswer, originalReasoning };
    }

    /**
     * Generate a single item - core generation logic
     */
    async generateSingleItem(
        inputText: string,
        workerId: number,
        opts: {
            retryId?: string;
            originalQuestion?: string;
            originalAnswer?: string;
            originalReasoning?: string;
            row?: any;
            runtimeConfig?: RuntimePromptConfig;
        } = {}
    ): Promise<SynthLogItem | null> {
        const { config } = this;
        const { retryId, originalQuestion, originalAnswer, originalReasoning, row, runtimeConfig } = opts;
        const startTime = Date.now();

        // Determine source for tracking
        const source = config.dataSourceMode === DataSource.HuggingFace
            ? `hf:${config.hfConfig.dataset}`
            : config.dataSourceMode === DataSource.Manual
                ? `manual:${config.manualFileName || 'unknown'}`
                : 'synthetic';

        const settings = SettingsService.getSettings();
        const timeoutSeconds = Math.max(1, settings.generationTimeoutSeconds ?? 300);
        const timeoutMs = timeoutSeconds * 1000;
        const generationId = retryId || crypto.randomUUID();

        // Setup abort controller for this item
        const itemAbortController = new AbortController();
        config.streamingAbortControllersRef?.current.set(generationId, itemAbortController);

        const globalSignal = config.abortControllerRef.current?.signal;
        const handleGlobalAbort = () => itemAbortController.abort();
        if (globalSignal) {
            if (globalSignal.aborted) {
                itemAbortController.abort();
            } else {
                globalSignal.addEventListener('abort', handleGlobalAbort);
            }
        }

        let timeoutId: number | undefined;
        let didTimeout = false;

        const runWithTimeout = async <T,>(operation: () => Promise<T>): Promise<T> => {
            if (timeoutMs <= 0) {
                return operation();
            }
            return new Promise<T>((resolve, reject) => {
                timeoutId = window.setTimeout(() => {
                    didTimeout = true;
                    itemAbortController.abort();
                    const err = new Error(`Timed out after ${timeoutSeconds} seconds`);
                    err.name = 'TimeoutError';
                    reject(err);
                }, timeoutMs);
                operation()
                    .then(resolve)
                    .catch(reject)
                    .finally(() => {
                        if (timeoutId) {
                            window.clearTimeout(timeoutId);
                        }
                    });
            });
        };

        const clearStreamingState = () => {
            config.streamingConversationsRef.current.delete(generationId);
            config.bumpStreamingConversations();
            config.streamingAbortControllersRef.current.delete(generationId);
        };

        try {
            return await runWithTimeout(async () => {
                const safeInput = typeof inputText === 'string' ? inputText : String(inputText);
                let result;

                // Use runtime config if provided (from auto-routing), otherwise fall back to config
                const effectiveSystemPrompt = runtimeConfig?.systemPrompt ?? config.systemPrompt;
                const effectiveConverterPrompt = runtimeConfig?.converterPrompt ?? config.converterPrompt;
                const effectiveDeepConfig = runtimeConfig?.deepConfig ?? config.deepConfig;
                const activePrompt = config.appMode === AppMode.Generator ? effectiveSystemPrompt : effectiveConverterPrompt;
                const genParams = config.generationParams;
                const retryConfig = { maxRetries: config.maxRetries, retryDelay: config.retryDelay, generationParams: genParams };

                // Import JSON field extractor
                const { extractJsonFields } = await import('../utils/jsonFieldExtractor');

                // Initialize streaming conversation state
                const initStreamingState = (totalMessages: number, userMessage?: string, isSinglePrompt: boolean = false): StreamingConversationState => ({
                    id: generationId,
                    phase: 'waiting_for_response',
                    currentMessageIndex: 0,
                    totalMessages,
                    completedMessages: [],
                    currentUserMessage: userMessage,
                    currentReasoning: '',
                    currentAnswer: '',
                    useOriginalAnswer: false,
                    rawAccumulated: '',
                    isSinglePrompt
                });

                // Progressive streaming callback that parses JSON fields
                const MAX_STREAM_RAW_CHARS = 5000;
                const handleStreamChunk: StreamChunkCallback = (_chunk, accumulated, _phase) => {
                    const extracted = extractJsonFields(accumulated);

                    const current = config.streamingConversationsRef.current.get(generationId);
                    if (!current) return;

                    let newPhase = current.phase;
                    if (extracted.hasReasoningStart && !extracted.hasReasoningEnd) {
                        newPhase = 'extracting_reasoning';
                    } else if (extracted.hasReasoningEnd && (!extracted.hasAnswerEnd || !current.useOriginalAnswer)) {
                        newPhase = 'extracting_answer';
                    }

                    const updated: StreamingConversationState = {
                        ...current,
                        phase: newPhase,
                        currentReasoning: extracted.reasoning || current.currentReasoning,
                        currentAnswer: extracted.answer || current.currentAnswer,
                        rawAccumulated: accumulated.slice(-MAX_STREAM_RAW_CHARS)
                    };
                    config.streamingConversationsRef.current.set(generationId, updated);
                    config.scheduleStreamingUpdate();
                };

                // --- Conversation Trace Rewriting Mode ---
                const potentialMessagesArray = row?.messages || row?.conversation || row?.conversations;
                const hasMessagesColumn = Array.isArray(potentialMessagesArray) && potentialMessagesArray.length > 0 &&
                    potentialMessagesArray[0] && typeof potentialMessagesArray[0] === 'object' &&
                    ('role' in potentialMessagesArray[0] || 'from' in potentialMessagesArray[0]);

                if ((config.conversationRewriteMode || hasMessagesColumn) && row) {
                    const messagesArray = row.messages || row.conversation || row.conversations;
                    if (Array.isArray(messagesArray) && messagesArray.length > 0) {
                        const chatMessages: ChatMessage[] = messagesArray
                            .map((m: any) => {
                                const content = m.content || m.value || (typeof m === 'string' ? m : '');
                                const roleStr = m.role || (m.from === 'human' ? 'user' : m.from === 'gpt' ? 'assistant' : m.from);
                                // Map string role to ChatRole enum
                                let role: ChatRole;
                                switch(roleStr) {
                                    case 'user': role = ChatRole.User; break;
                                    case 'assistant': role = ChatRole.Assistant; break;
                                    case 'system': role = ChatRole.System; break;
                                    case 'model': role = ChatRole.Model; break;
                                    case 'tool': role = ChatRole.Tool; break;
                                    default: role = ChatRole.User; // fallback
                                }
                                return {
                                    role,
                                    content: content,
                                    reasoning: m.reasoning
                                };
                            })
                            .filter((m: ChatMessage) => m.content.trim().length > 0);

                        const firstUserMsg = chatMessages.find(m => m.role === ChatRole.User);
                        const assistantCount = chatMessages.filter(m => m.role === ChatRole.Assistant).length;
                        const newStreamState = initStreamingState(assistantCount, firstUserMsg?.content);

                        logger.log('[STREAMING] Initializing streaming state:', {
                            generationId,
                            totalMessages: chatMessages.length,
                            assistantCount,
                            phase: newStreamState.phase,
                            currentUserMessage: newStreamState.currentUserMessage?.substring(0, 50)
                        });

                        config.streamingConversationsRef.current.set(generationId, newStreamState);
                        config.bumpStreamingConversations();

                        const rewriteResult = await DeepReasoningService.orchestrateConversationRewrite({
                            messages: chatMessages,
                            config: effectiveDeepConfig,
                            engineMode: config.engineMode,
                            converterPrompt: effectiveConverterPrompt,
                            signal: itemAbortController.signal,
                            maxRetries: config.maxRetries,
                            retryDelay: config.retryDelay,
                            generationParams: genParams,
                            structuredOutput: genParams?.forceStructuredOutput ?? true,
                            maxTraces: config.hfConfig.maxMultiTurnTraces,
                            regularModeConfig: config.engineMode === EngineMode.Regular ? {
                                provider: config.provider,
                                externalProvider: config.externalProvider,
                                apiKey: config.externalApiKey,
                                model: config.externalModel,
                                customBaseUrl: config.customBaseUrl
                            } : undefined,
                            stream: config.isStreamingEnabled,
                            onStreamChunk: handleStreamChunk,
                            onMessageRewritten: (index: number, total: number) => {
                                const current = config.streamingConversationsRef.current.get(generationId);
                                if (!current) return;

                                const userMsgs = chatMessages.filter(m => m.role === ChatRole.User);
                                const assistantMsgs = chatMessages.filter(m => m.role === ChatRole.Assistant);

                                const completedUser = userMsgs[index];
                                const completedAssistant = assistantMsgs[index];

                                const cleanEmptyThinkTags = (text: string) =>
                                    text?.replace(/<think>\s*<\/think>\s*/gi, '').trim();

                                const newCompleted = [...current.completedMessages];
                                if (completedUser) {
                                    newCompleted.push({ ...completedUser });
                                }
                                if (completedAssistant) {
                                    const cleanContent = cleanEmptyThinkTags(
                                        current.currentAnswer || completedAssistant.content || ''
                                    );
                                    newCompleted.push({
                                        role: ChatRole.Assistant,
                                        content: cleanContent,
                                        reasoning: current.currentReasoning || completedAssistant.reasoning
                                    });
                                }

                                const nextUserMsg = userMsgs[index + 1];

                                logger.log('[STREAMING] Message rewritten:', {
                                    generationId,
                                    index,
                                    total,
                                    completedCount: newCompleted.length,
                                    nextUser: nextUserMsg?.content?.substring(0, 30)
                                });

                                const updatedState: StreamingConversationState = {
                                    ...current,
                                    phase: index + 1 < total ? 'waiting_for_response' : 'message_complete',
                                    currentMessageIndex: index + 1,
                                    completedMessages: newCompleted,
                                    currentUserMessage: nextUserMsg?.content,
                                    currentReasoning: '',
                                    currentAnswer: '',
                                    rawAccumulated: ''
                                };
                                config.streamingConversationsRef.current.set(generationId, updatedState);
                                config.bumpStreamingConversations();
                            }
                        });

                        clearStreamingState();
                        return {
                            ...rewriteResult,
                            id: generationId,
                            sessionUid: config.sessionUid,
                            source: source,
                            status: LogItemStatus.DONE
                        };
                    }
                }

                // Regular generation mode
                if (config.engineMode === EngineMode.Regular) {
                    if (config.provider === ProviderType.Gemini) {
                        let enhancedPrompt = activePrompt;
                        if (!enhancedPrompt.toLowerCase().includes("json")) {
                            enhancedPrompt += "\n\nCRITICAL: You must output ONLY valid JSON with 'query', 'reasoning', and 'answer' fields.";
                        }

                        if (config.appMode === AppMode.Generator) {
                            result = await GeminiService.generateReasoningTrace(safeInput, enhancedPrompt, { ...retryConfig, model: config.externalModel });
                        } else {
                            const contentToConvert = extractInputContent(safeInput);
                            result = await GeminiService.convertReasoningTrace(contentToConvert, enhancedPrompt, { ...retryConfig, model: config.externalModel });
                        }
                    } else {
                        let promptInput = "";
                        if (config.appMode === AppMode.Generator) {
                            promptInput = `[SEED TEXT START]\n${safeInput}\n[SEED TEXT END]`;
                        } else {
                            const contentToConvert = extractInputContent(safeInput);
                            promptInput = `[INPUT LOGIC START]\n${contentToConvert}\n[INPUT LOGIC END]`;
                        }

                        let enhancedPrompt = activePrompt;
                        if (!enhancedPrompt.toLowerCase().includes("json")) {
                            enhancedPrompt += "\n\nCRITICAL: You must output ONLY valid JSON with 'query', 'reasoning', and 'answer' fields.";
                        }

                        const regularStreamState = initStreamingState(1, promptInput, true);
                        config.streamingConversationsRef.current.set(generationId, regularStreamState);
                        config.bumpStreamingConversations();

                        result = await ExternalApiService.callExternalApi({
                            provider: config.externalProvider,
                            apiKey: config.externalApiKey || SettingsService.getApiKey(config.externalProvider),
                            model: config.externalModel,
                            apiType: config.apiType,
                            customBaseUrl: config.customBaseUrl || SettingsService.getCustomBaseUrl(),
                            systemPrompt: enhancedPrompt,
                            userPrompt: promptInput,
                            signal: itemAbortController.signal,
                            maxRetries: config.maxRetries,
                            retryDelay: config.retryDelay,
                            generationParams: genParams,
                            structuredOutput: genParams?.forceStructuredOutput ?? true,
                            responsesSchema: 'reasoningTrace',
                            stream: config.isStreamingEnabled,
                            onStreamChunk: handleStreamChunk,
                            streamPhase: 'regular'
                        });
                        clearStreamingState();
                    }

                    const ensureString = (val: any) => {
                        if (val === null || val === undefined) return "";
                        if (typeof val === 'string') return val;
                        return JSON.stringify(val);
                    };

                    const answer = ensureString(result.answer);
                    const reasoning = ensureString(result.reasoning);
                    const finalAnswer = (config.appMode === AppMode.Converter && originalAnswer) ? originalAnswer : answer;

                    return {
                        id: generationId,
                        sessionUid: config.sessionUid,
                        source: source,
                        seed_preview: safeInput.substring(0, 150) + "...",
                        full_seed: safeInput,
                        query: originalQuestion || (config.appMode === AppMode.Converter ? extractInputContent(safeInput, { format: ExtractContentFormat.Display }) : safeInput),
                        reasoning: reasoning,
                        original_reasoning: originalReasoning,
                        answer: finalAnswer,
                        original_answer: originalAnswer,
                        timestamp: new Date().toISOString(),
                        duration: Date.now() - startTime,
                        tokenCount: Math.round((finalAnswer.length + reasoning.length) / 4),
                        modelUsed: config.provider === ProviderType.Gemini ? 'Gemini 3 Flash' : `${config.externalProvider}/${config.externalModel}`,
                        provider: config.externalProvider,
                        status: LogItemStatus.DONE
                    };
                } else {
                    // Deep mode
                    let inputPayload = safeInput;
                    if (config.appMode === AppMode.Converter) {
                        inputPayload = extractInputContent(safeInput);
                    }

                    if (config.appMode === AppMode.Generator && originalAnswer && originalAnswer.trim().length > 0) {
                        inputPayload = `${inputPayload}\n\n[EXPECTED ANSWER]\n${originalAnswer.trim()}`;
                    }

                    const runtimeDeepConfig = JSON.parse(JSON.stringify(effectiveDeepConfig));

                    const deepStreamState = initStreamingState(1, inputPayload, true);
                    config.streamingConversationsRef.current.set(generationId, deepStreamState);
                    config.bumpStreamingConversations();

                    const deepResult = await DeepReasoningService.orchestrateDeepReasoning({
                        input: inputPayload,
                        originalQuery: originalQuestion || (config.appMode === AppMode.Converter ? extractInputContent(safeInput, { format: ExtractContentFormat.Display }) : safeInput),
                        expectedAnswer: originalAnswer,
                        config: runtimeDeepConfig,
                        signal: itemAbortController.signal,
                        maxRetries: config.maxRetries,
                        retryDelay: config.retryDelay,
                        generationParams: genParams,
                        stream: config.isStreamingEnabled,
                        onStreamChunk: handleStreamChunk
                    });

                    clearStreamingState();

                    if (deepResult.isError) {
                        return {
                            ...deepResult,
                            id: generationId,
                            original_reasoning: originalReasoning,
                            original_answer: originalAnswer,
                            sessionUid: config.sessionUid,
                            source: source,
                            duration: Date.now() - startTime,
                            tokenCount: 0,
                            status: LogItemStatus.ERROR
                        };
                    }

                    // Multi-turn conversation if enabled
                    if (config.userAgentConfig.enabled && config.userAgentConfig.followUpCount > 0) {
                        const responderPhase = config.userAgentConfig.responderPhase || ResponderPhase.Writer;
                        const responderConfig = responderPhase === ResponderPhase.Responder
                            ? {
                                provider: config.userAgentConfig.provider,
                                externalProvider: config.userAgentConfig.externalProvider,
                                apiType: config.userAgentConfig.apiType || ApiType.Chat,
                                apiKey: config.userAgentConfig.apiKey,
                                model: config.userAgentConfig.model,
                                customBaseUrl: config.userAgentConfig.customBaseUrl,
                                systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Responder, runtimeConfig?.promptSet)
                            }
                            : runtimeDeepConfig.phases[responderPhase as keyof typeof runtimeDeepConfig.phases];

                        const multiTurnResult = await DeepReasoningService.orchestrateMultiTurnConversation({
                            initialInput: inputPayload,
                            initialQuery: originalQuestion || deepResult.query || inputPayload,
                            initialResponse: deepResult.answer || '',
                            initialReasoning: deepResult.reasoning || '',
                            userAgentConfig: config.userAgentConfig,
                            responderConfig: responderConfig,
                            signal: itemAbortController.signal,
                            maxRetries: config.maxRetries,
                            retryDelay: config.retryDelay,
                            generationParams: genParams,
                            structuredOutput: genParams?.forceStructuredOutput ?? true
                        });

                        return {
                            ...multiTurnResult,
                            id: generationId,
                            sessionUid: config.sessionUid,
                            source: source,
                            duration: Date.now() - startTime,
                            tokenCount: Math.round((multiTurnResult.answer?.length || 0 + (multiTurnResult.reasoning?.length || 0)) / 4),
                            isMultiTurn: true,
                            status: LogItemStatus.DONE
                        };
                    }

                    const answer = deepResult.answer || "";
                    const reasoning = deepResult.reasoning || "";
                    return {
                        ...deepResult,
                        id: generationId,
                        original_reasoning: originalReasoning,
                        original_answer: originalAnswer,
                        sessionUid: config.sessionUid,
                        source: source,
                        duration: Date.now() - startTime,
                        tokenCount: Math.round((answer.length + reasoning.length) / 4),
                        status: LogItemStatus.DONE
                    };
                }
            });
        } catch (err: any) {
            if (err.name === 'AbortError' && !didTimeout) {
                clearStreamingState();
                const safeErrInput = typeof inputText === 'string' ? inputText : JSON.stringify(inputText);
                return {
                    id: generationId,
                    sessionUid: config.sessionUid,
                    source: source,
                    seed_preview: safeErrInput.substring(0, 50),
                    full_seed: safeErrInput,
                    query: originalQuestion || 'HALTED',
                    reasoning: "",
                    answer: "Halted",
                    original_reasoning: originalReasoning,
                    original_answer: originalAnswer,
                    timestamp: new Date().toISOString(),
                    duration: Date.now() - startTime,
                    modelUsed: config.engineMode === EngineMode.Deep ? 'DEEP ENGINE' : "System",
                    isError: true,
                    status: LogItemStatus.ERROR,
                    error: 'Halted by user'
                };
            }
            if (err.name === 'TimeoutError' || didTimeout) {
                clearStreamingState();
                const safeErrInput = typeof inputText === 'string' ? inputText : JSON.stringify(inputText);
                return {
                    id: generationId,
                    sessionUid: config.sessionUid,
                    source: source,
                    seed_preview: safeErrInput.substring(0, 50),
                    full_seed: safeErrInput,
                    query: originalQuestion || 'TIMEOUT',
                    reasoning: "",
                    answer: "Timed out",
                    original_reasoning: originalReasoning,
                    original_answer: originalAnswer,
                    timestamp: new Date().toISOString(),
                    duration: Date.now() - startTime,
                    modelUsed: config.engineMode === EngineMode.Deep ? 'DEEP ENGINE' : "System",
                    isError: true,
                    status: LogItemStatus.TIMEOUT,
                    error: `Timed out after ${timeoutSeconds} seconds`
                };
            }
            console.error(`Worker ${workerId} failed`, err);
            const safeErrInput = typeof inputText === 'string' ? inputText : JSON.stringify(inputText);
            return {
                id: generationId,
                sessionUid: config.sessionUid,
                source: source,
                seed_preview: safeErrInput.substring(0, 50),
                full_seed: safeErrInput,
                query: originalQuestion || 'ERROR',
                reasoning: "",
                answer: "Failed",
                original_reasoning: originalReasoning,
                original_answer: originalAnswer,
                timestamp: new Date().toISOString(),
                duration: Date.now() - startTime,
                modelUsed: config.engineMode === EngineMode.Deep ? 'DEEP ENGINE' : "System",
                isError: true,
                status: LogItemStatus.ERROR,
                error: err.message
            };
        } finally {
            if (globalSignal) {
                globalSignal.removeEventListener('abort', handleGlobalAbort);
            }
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
            config.streamingAbortControllersRef.current.delete(generationId);
        }
    }

    private async processResult(result: SynthLogItem): Promise<void> {
        const { config } = this;

        result.sessionUid = config.sessionUidRef.current;
        if (config.sessionNameRef.current) {
            result.sessionName = config.sessionNameRef.current;
        }

        await LogStorageService.saveLog(config.sessionUidRef.current, result);
        config.setLogsTrigger((prev: number) => prev + 1);

        if (config.currentPage === 1) {
            config.refreshLogs();
        }

        const currentEnv = config.environmentRef.current;
        if (currentEnv === Environment.Production && !result.isError && FirebaseService.isFirebaseConfigured()) {
            try {
                await FirebaseService.saveLogToFirebase(result);
                result.savedToDb = true;
                await LogStorageService.updateLog(config.sessionUidRef.current, result);
                config.updateDbStats();
            } catch (saveErr: any) {
                console.error("Firebase Sync Error", saveErr);
                const updated = { ...result, storageError: saveErr.message || "Save failed" };
                await LogStorageService.updateLog(config.sessionUidRef.current, updated);
            }
        }
    }

    private cleanup(): void {
        const { config } = this;

        if (config.prefetchManagerRef.current) {
            config.prefetchManagerRef.current.abort();
            config.prefetchManagerRef.current = null;
            config.setPrefetchState(null);
        }
    }

    stopGeneration(): void {
        const { config } = this;

        config.abortControllerRef.current?.abort();

        config.streamingAbortControllersRef.current.forEach((controller, generationId) => {
            config.haltedStreamingIdsRef.current.add(generationId);
            controller.abort();
        });
        config.streamingAbortControllersRef.current.clear();
        config.streamingConversationsRef.current.clear();

        config.bumpStreamingConversations();

        this.cleanup();
        config.setIsRunning(false);
        toast.warning('Generation stopped');
    }

    // Static retry methods that can be called without instantiation

    /**
     * Retry a single failed item.
     */
    static async retryItem(
        id: string,
        sessionUid: string,
        environment: string,
        visibleLogs: SynthLogItem[],
        generateSingleItem: (inputText: string, workerId: number, opts: any) => Promise<SynthLogItem | null>,
        setRetryingIds: (fn: (prev: Set<string>) => Set<string>) => void,
        refreshLogs: () => void,
        updateDbStats: () => void
    ): Promise<void> {
        const logItem = visibleLogs.find(l => l.id === id);
        if (!logItem) return;

        setRetryingIds(prev => new Set(prev).add(id));
        try {
            const result = await generateSingleItem(logItem.full_seed, 0, { retryId: id });
            if (result) {
                // Save to Firebase in production
                if (environment === Environment.Production && !result.isError) {
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
    }

    /**
     * Retry saving a single item to Firebase.
     */
    static async retrySave(
        id: string,
        sessionUid: string,
        visibleLogs: SynthLogItem[],
        setRetryingIds: (fn: (prev: Set<string>) => Set<string>) => void,
        refreshLogs: () => void,
        updateDbStats: () => void
    ): Promise<void> {
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
    }

    /**
     * Retry all failed items with concurrency control.
     */
    static async retryAllFailed(
        sessionUid: string,
        environment: string,
        concurrency: number,
        visibleLogs: SynthLogItem[],
        isInvalidLog: (log: SynthLogItem) => boolean,
        setRetryingIds: (fn: (prev: Set<string>) => Set<string>) => void,
        generateSingleItem: (inputText: string, workerId: number, opts: any) => Promise<SynthLogItem | null>,
        refreshLogs: () => void
    ): Promise<void> {
        const failedItems = visibleLogs.filter((l: SynthLogItem) => isInvalidLog(l));
        if (failedItems.length === 0) return;

        const failedIds = failedItems.map((l: SynthLogItem) => l.id);
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

                generateSingleItem(item.full_seed, 0, { retryId: item.id })
                    .then(async (result) => {
                        activeWorkers--;
                        if (result) {
                            if (environment === Environment.Production && !result.isError) {
                                try {
                                    await FirebaseService.saveLogToFirebase(result);
                                    result.savedToDb = true;
                                } catch (e) { }
                            }
                            LogStorageService.updateLog(sessionUid, result);
                            refreshLogs();
                        }
                    })
                    .catch(() => { activeWorkers--; });
            }
        };

        processQueue();
    }

    /**
     * Sync all unsaved items to Firebase.
     */
    static async syncAllUnsavedToDb(
        sessionUid: string,
        isInvalidLog: (log: SynthLogItem) => boolean,
        refreshLogs: () => void,
        updateDbStats: () => void
    ): Promise<void> {
        if (!FirebaseService.isFirebaseConfigured()) {
            await confirmService.alert({
                title: 'Firebase not configured',
                message: 'Please configure Firebase in Settings to enable cloud sync.',
                variant: 'warning'
            });
            return;
        }

        const allLogs = await LogStorageService.getAllLogs(sessionUid);
        const unsavedLogs = allLogs.filter((l: SynthLogItem) => !l.savedToDb && !isInvalidLog(l));

        if (unsavedLogs.length === 0) {
            await confirmService.alert({
                title: 'Nothing to sync',
                message: 'No unsaved items to sync.',
                variant: 'info'
            });
            return;
        }

        const confirmSync = await confirmService.confirm({
            title: 'Sync unsaved items?',
            message: `Sync ${unsavedLogs.length} unsaved items to Firebase?`,
            confirmLabel: 'Sync',
            cancelLabel: 'Cancel',
            variant: 'warning'
        });

        if (!confirmSync) return;

        let synced = 0;
        let failed = 0;

        for (const log of unsavedLogs) {
            try {
                const logToSave = { ...log, sessionUid: sessionUid };
                await FirebaseService.saveLogToFirebase(logToSave);
                log.savedToDb = true;
                log.sessionUid = sessionUid;
                await LogStorageService.updateLog(sessionUid, log);
                synced++;
            } catch (e: any) {
                logger.warn(`Failed to sync item ${log.id}:`, e);
                failed++;
            }
        }

        updateDbStats();
        refreshLogs();

        await confirmService.alert({
            title: 'Sync complete',
            message: `Synced ${synced} items to Firebase.${failed > 0 ? ` ${failed} failed.` : ''}`,
            variant: failed > 0 ? 'warning' : 'info'
        });
    }

    /**
     * Save a single item to Firebase.
     */
    static async saveItemToDb(
        id: string,
        sessionUid: string,
        visibleLogs: SynthLogItem[],
        refreshLogs: () => void,
        updateDbStats: () => void
    ): Promise<void> {
        if (!FirebaseService.isFirebaseConfigured()) {
            await confirmService.alert({
                title: 'Firebase not configured',
                message: 'Please configure Firebase in Settings to enable cloud sync.',
                variant: 'warning'
            });
            return;
        }

        const logItem = visibleLogs.find(l => l.id === id);
        if (!logItem) return;

        try {
            const logToSave = { ...logItem, sessionUid: sessionUid };
            await FirebaseService.saveLogToFirebase(logToSave);
            const updated = { ...logItem, savedToDb: true, sessionUid: sessionUid };
            await LogStorageService.updateLog(sessionUid, updated);
            refreshLogs();
            updateDbStats();
            toast.success('Saved to Firebase');
        } catch (e: any) {
            console.error("Save to Firebase Failed", e);
            const updated = { ...logItem, storageError: e.message || "Save failed" };
            await LogStorageService.updateLog(sessionUid, updated);
            refreshLogs();
            toast.error(`Save failed: ${e.message}`);
        }
    }
}

// Factory function for easier use
export function createGenerationService(config: GenerationConfig): GenerationService {
    return new GenerationService(config);
}

// Re-export extractInputContent for use elsewhere
export { extractInputContent } from '../utils/contentExtractor';
