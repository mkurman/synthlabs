import { SynthLogItem, StreamChunkCallback, ChatMessage, StreamingConversationState, GenerationParams } from '../../types';
import { LogStorageService } from '../logStorageService';
import { SettingsService } from '../settingsService';
import * as FirebaseService from '../firebaseService';
import * as GeminiService from '../geminiService';
import * as ExternalApiService from '../externalApiService';
import * as DeepReasoningService from '../deepReasoningService';
import { logger } from '../../utils/logger';
import { toast } from '../toastService';
import { confirmService } from '../confirmService';
import { createPrefetchManager, PrefetchState } from '../hfPrefetchService';
import { TaskClassifierService } from '../taskClassifierService';
import { TaskType } from '../../interfaces/enums';
import { PromptService } from '../promptService';
import { DEFAULT_HF_PREFETCH_CONFIG } from '../../types';
import { extractInputContent } from '../../utils/contentExtractor';
import { parseThinkTagsForDisplay, parseNativeOutput } from '../../utils/thinkTagParser';
import { DataSource, EngineMode, CreatorMode, Environment, ProviderType, ExternalProvider, ApiType, ChatRole, ResponderPhase, LogItemStatus, PromptCategory, PromptRole, StreamingPhase, OutputFieldName, SynthLogFieldName, ResponsesSchemaName } from '../../interfaces/enums';
import { ExtractContentFormat } from '../../interfaces/services/DataTransformConfig';
import type { CompleteGenerationConfig as GenerationConfig, RuntimePromptConfig, WorkItem } from '../../interfaces';
import { mergeWithExistingFields } from '../fieldSelectionService';

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
    private isAppendRun: boolean = false;

    constructor(config: GenerationConfig) {
        this.config = config;
    }

    async startGeneration(append = false): Promise<void> {
        const { config } = this;
        this.isAppendRun = append;

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
            // Final refresh to sync visible logs with IndexedDB after generation completes
            config.refreshLogs();
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
                const sessionName = `${config.appMode === CreatorMode.Generator ? 'Generation' : 'Conversion'} - ${new Date().toLocaleString()}`;
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
        const effectiveSkipRows = this.getEffectiveSkipRows();

        config.setProgress({ current: 0, total: config.rowsToFetch, activeWorkers: 1 });

        const prefetchConfig = config.hfConfig.prefetchConfig || DEFAULT_HF_PREFETCH_CONFIG;
        config.prefetchManagerRef.current = createPrefetchManager(
            config.hfConfig,
            effectiveSkipRows,
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
        const effectiveSkipRows = this.getEffectiveSkipRows();
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

        const rowsToProcess = parsedRows.slice(effectiveSkipRows, effectiveSkipRows + config.rowsToFetch);
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

    private getEffectiveSkipRows(): number {
        const { config } = this;
        if (!this.isAppendRun) {
            return config.skipRows;
        }
        const existingItemCount = Math.max(0, config.existingItemCount || 0);
        return Math.max(0, config.skipRows + existingItemCount);
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

        let bestType: TaskType = TaskType.Unknown;
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

        const sampleSize = Math.min(3, workItems.length);
        const samples = workItems.slice(0, sampleSize);
        const votes: { type: TaskType; confidence: number }[] = [];

        for (const sample of samples) {
            try {
                const classification = await this.classifyWithLlm(sample.content, settings);
                votes.push(classification);
            } catch (e) {
                logger.warn('LLM classification failed for sample:', e);
                votes.push({ type: TaskType.Unknown, confidence: 0 });
            }
        }

        const typeScores: Record<string, number> = {};
        for (const vote of votes) {
            typeScores[vote.type] = (typeScores[vote.type] || 0) + vote.confidence;
        }

        let bestType: TaskType = TaskType.Unknown;
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

            logger.log(`[Auto-Route LLM] Detected task: ${bestType} (${winningVotes.length}/${sampleSize} votes, avg confidence: ${(avgConfidence * 100).toFixed(0)}%) -> Using prompt set: ${recommendedSet}`);
            return runtimeConfig;
        } else {
            config.setAutoRoutedPromptSet(null);
            logger.log(`[Auto-Route LLM] Confidence below threshold (${bestType}: ${(avgConfidence * 100).toFixed(0)}% < ${(confidenceThreshold * 100).toFixed(0)}%) -> Fallback to: ${defaultPromptSet}`);
            return undefined;
        }
    }

    private async classifyWithLlm(content: string, settings: any): Promise<{ type: TaskType; confidence: number }> {
        const { TaskClassifierService } = await import('../taskClassifierService');
        const classifierPrompt = TaskClassifierService.getClassifierPrompt(content);

        // Use configured LLM classifier model
        const llmProvider = settings.autoRouteLlmProvider || ProviderType.Gemini;
        const llmModel = settings.autoRouteLlmModel;

        let classificationResponse: string;

        if (llmProvider === ProviderType.Gemini) {
            const result = await GeminiService.generateGenericJSON(classifierPrompt, '', {
                maxRetries: 1,
                retryDelay: 1000,
                model: llmModel
            });
            classificationResponse = JSON.stringify(result);
        } else {
            const externalProvider = settings.autoRouteLlmExternalProvider;
            const apiKey = settings.autoRouteLlmApiKey || SettingsService.getApiKey(externalProvider);
            const customBaseUrl = settings.autoRouteLlmCustomBaseUrl || SettingsService.getCustomBaseUrl();

            const result = await ExternalApiService.callExternalApi({
                provider: externalProvider,
                apiKey,
                model: llmModel || SettingsService.getDefaultModel(externalProvider),
                customBaseUrl,
                systemPrompt: 'You are a task classifier. Respond with JSON only.',
                userPrompt: classifierPrompt,
                maxRetries: 1,
                retryDelay: 1000,
                structuredOutput: true
            });
            classificationResponse = JSON.stringify(result);
        }

        return TaskClassifierService.parseClassifierResponse(classificationResponse);
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

        // If reasoning_content exists on the row, use it as original reasoning
        if (!originalReasoning && row && (row[OutputFieldName.ReasoningContent] || row[OutputFieldName.Reasoning])) {
            const reasoningValue = row[OutputFieldName.ReasoningContent] || row[OutputFieldName.Reasoning];
            if (reasoningValue !== undefined && reasoningValue !== null) {
                originalReasoning = typeof reasoningValue === 'string' ? reasoningValue : JSON.stringify(reasoningValue);
            }
        }

        // If answer includes <think> tags, split into reasoning_content + clean answer
        if (originalAnswer) {
            const parsed = parseThinkTagsForDisplay(originalAnswer);
            if (parsed.hasThinkTags) {
                originalAnswer = parsed.answer;
                if (!originalReasoning && parsed.reasoning) {
                    originalReasoning = parsed.reasoning;
                }
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
        const timeoutSeconds = Math.max(0, settings.generationTimeoutSeconds ?? 300);
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
                const activePrompt = config.appMode === CreatorMode.Generator ? effectiveSystemPrompt : effectiveConverterPrompt;
                const genParams = config.generationParams;
                const useNativeOutput = genParams?.useNativeOutput ?? false;
                const retryConfig = { maxRetries: config.maxRetries, retryDelay: config.retryDelay, generationParams: genParams };

                // Get prompt schema for field selection
                const promptCategory = config.appMode === CreatorMode.Generator ? PromptCategory.Generator : PromptCategory.Converter;
                const promptRole = PromptRole.System;
                const promptSchema = PromptService.getPromptSchema(promptCategory, promptRole, config.sessionPromptSet || undefined);
                const selectedFields = genParams?.selectedFields;

                logger.log('[Non-Conversation Mode] Field selection debug:', {
                    selectedFields,
                    hasPromptSchema: !!promptSchema,
                    promptSchemaOutputLength: promptSchema?.output?.length,
                    promptCategory,
                    promptRole
                });

                // Import JSON field extractor
                const { extractJsonFields } = await import('../../utils/jsonFieldExtractor');

                // Initialize streaming conversation state
                const initStreamingState = (totalMessages: number, userMessage?: string, isSinglePrompt: boolean = false): StreamingConversationState => ({
                    id: generationId,
                    phase: StreamingPhase.WaitingForResponse,
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

                // Capture API-reported usage data for accurate token counting
                interface CapturedUsage { prompt_tokens: number; completion_tokens: number; total_tokens: number; reasoning_tokens?: number }
                const usageRef: { current: CapturedUsage | null } = { current: null };
                const captureUsage = (rawUsage: any) => {
                    if (!rawUsage || typeof rawUsage !== 'object') return;
                    const reasoningTokens = rawUsage.completion_tokens_details?.reasoning_tokens
                        ?? rawUsage.reasoning_tokens
                        ?? 0;
                    usageRef.current = {
                        prompt_tokens: rawUsage.prompt_tokens || rawUsage.input_tokens || 0,
                        completion_tokens: rawUsage.completion_tokens || rawUsage.output_tokens || 0,
                        total_tokens: rawUsage.total_tokens || ((rawUsage.prompt_tokens || 0) + (rawUsage.completion_tokens || 0)),
                        reasoning_tokens: reasoningTokens || undefined
                    };
                };

                // Progressive streaming callback that parses JSON fields
                const MAX_STREAM_RAW_CHARS = 5000;
                const handleStreamChunk: StreamChunkCallback = (_chunk, accumulated, _phase, usage) => {
                    // Capture usage data when the API sends it (typically in the final chunk)
                    if (usage) captureUsage(usage);
                    const current = config.streamingConversationsRef.current.get(generationId);
                    if (!current) return;

                    // Check if reasoning is expected based on selectedFields
                    const selectedFields = genParams?.selectedFields;
                    const expectReasoning = !selectedFields || selectedFields.includes(OutputFieldName.Reasoning);
                    const expectAnswer = !selectedFields || selectedFields.includes(OutputFieldName.Answer);

                    let newPhase = current.phase;
                    let nextReasoning = current.currentReasoning;
                    let nextAnswer = current.currentAnswer;

                    if (useNativeOutput) {
                        const thinkStart = /<think>/i.test(accumulated);
                        const thinkEnd = /<\/think>/i.test(accumulated);

                        if (expectReasoning && expectAnswer) {
                            // Both reasoning and answer expected: normal native flow
                            if (thinkStart && !thinkEnd) {
                                newPhase = StreamingPhase.ExtractingReasoning;
                                const partial = accumulated.match(/<think>([\s\S]*)$/i);
                                nextReasoning = partial?.[1] || nextReasoning;
                            } else if (thinkStart && thinkEnd) {
                                newPhase = StreamingPhase.ExtractingAnswer;
                                const parsed = parseThinkTagsForDisplay(accumulated);
                                nextReasoning = parsed.reasoning || nextReasoning;
                                nextAnswer = parsed.answer || nextAnswer;
                            }
                        } else if (expectReasoning && !expectAnswer) {
                            // Only reasoning expected: collect reasoning, stop when done
                            if (thinkStart && !thinkEnd) {
                                newPhase = StreamingPhase.ExtractingReasoning;
                                const partial = accumulated.match(/<think>([\s\S]*)$/i);
                                nextReasoning = partial?.[1] || nextReasoning;
                            } else if (thinkStart && thinkEnd) {
                                // Reasoning complete — extract it and signal stop
                                const parsed = parseThinkTagsForDisplay(accumulated);
                                nextReasoning = parsed.reasoning || nextReasoning;
                                newPhase = StreamingPhase.MessageComplete;

                                const updated: StreamingConversationState = {
                                    ...current,
                                    phase: newPhase,
                                    currentReasoning: nextReasoning,
                                    currentAnswer: current.currentAnswer,
                                    rawAccumulated: accumulated.slice(-MAX_STREAM_RAW_CHARS)
                                };
                                config.streamingConversationsRef.current.set(generationId, updated);
                                config.scheduleStreamingUpdate();
                                return false; // Stop streaming early
                            }
                        } else if (expectAnswer && !expectReasoning) {
                            // Only answer expected: skip reasoning, extract content after </think>
                            if (thinkStart && thinkEnd) {
                                newPhase = StreamingPhase.ExtractingAnswer;
                                const parsed = parseThinkTagsForDisplay(accumulated);
                                nextAnswer = parsed.answer || nextAnswer;
                            } else if (!thinkStart) {
                                // No think tags at all — entire content is the answer
                                newPhase = StreamingPhase.ExtractingAnswer;
                                nextAnswer = accumulated;
                            }
                            // If think started but not ended, wait for reasoning to finish
                        }
                    } else {
                        const extracted = extractJsonFields(accumulated);

                        if (expectReasoning) {
                            // Normal flow: expect reasoning first, then answer
                            if (extracted.hasReasoningStart && !extracted.hasReasoningEnd) {
                                newPhase = StreamingPhase.ExtractingReasoning;
                            } else if (extracted.hasReasoningEnd && (!extracted.hasAnswerEnd || !current.useOriginalAnswer)) {
                                newPhase = StreamingPhase.ExtractingAnswer;
                            }
                        } else if (expectAnswer) {
                            // No reasoning expected, go straight to answer
                            if (extracted.hasAnswerStart && !extracted.hasAnswerEnd) {
                                newPhase = StreamingPhase.ExtractingAnswer;
                            }
                        }

                        nextReasoning = extracted.reasoning || nextReasoning;
                        nextAnswer = extracted.answer || nextAnswer;
                    }

                    const updated: StreamingConversationState = {
                        ...current,
                        phase: newPhase,
                        currentReasoning: nextReasoning,
                        currentAnswer: nextAnswer,
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
                                switch (roleStr) {
                                    case 'user': role = ChatRole.User; break;
                                    case 'assistant': role = ChatRole.Assistant; break;
                                    case 'system': role = ChatRole.System; break;
                                    case 'model': role = ChatRole.Model; break;
                                    case 'tool': role = ChatRole.Tool; break;
                                    default: role = ChatRole.User; // fallback
                                }
                                if (role === ChatRole.Assistant) {
                                    const parsed = parseThinkTagsForDisplay(content);
                                    return {
                                        role,
                                        content: parsed.hasThinkTags ? parsed.answer : content,
                                        reasoning_content: m.reasoning_content || m.reasoning || parsed.reasoning || undefined
                                    };
                                }

                                return {
                                    role,
                                    content: content
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
                            systemPrompt: effectiveSystemPrompt,
                            appMode: config.appMode,
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
                                    const reasoningContent = current.currentReasoning || completedAssistant.reasoning || '';
                                    newCompleted.push({
                                        role: ChatRole.Assistant,
                                        content: cleanContent,
                                        reasoning_content: reasoningContent
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
                                    phase: index + 1 < total ? StreamingPhase.WaitingForResponse : StreamingPhase.MessageComplete,
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
                    let promptInput = "";
                    if (config.appMode === CreatorMode.Generator) {
                        promptInput = `[SEED TEXT START]\n${safeInput}\n[SEED TEXT END]`;
                    } else {
                        const contentToConvert = extractInputContent(safeInput);
                        promptInput = `[INPUT LOGIC START]\n${contentToConvert}\n[INPUT LOGIC END]`;
                    }

                    let enhancedPrompt = activePrompt;
                    if (!useNativeOutput && !enhancedPrompt.toLowerCase().includes("json")) {
                        enhancedPrompt += `\n\nCRITICAL: You must output ONLY valid JSON with '${OutputFieldName.Query}', '${OutputFieldName.Reasoning}', and '${OutputFieldName.Answer}' fields.`;
                    }

                    if (config.provider === ProviderType.Gemini) {
                        if (useNativeOutput) {
                            result = await GeminiService.generateNativeText(promptInput, enhancedPrompt, { ...retryConfig, model: config.externalModel });
                        } else if (config.appMode === CreatorMode.Generator) {
                            result = await GeminiService.generateReasoningTrace(safeInput, enhancedPrompt, { ...retryConfig, model: config.externalModel });
                        } else {
                            const contentToConvert = extractInputContent(safeInput);
                            result = await GeminiService.convertReasoningTrace(contentToConvert, enhancedPrompt, { ...retryConfig, model: config.externalModel });
                        }
                    } else {
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
                            promptSchema: useNativeOutput ? undefined : promptSchema,
                            signal: itemAbortController.signal,
                            maxRetries: config.maxRetries,
                            retryDelay: config.retryDelay,
                            generationParams: genParams,
                            structuredOutput: useNativeOutput ? false : (genParams?.forceStructuredOutput ?? true),
                            responsesSchema: ResponsesSchemaName.ReasoningTrace,
                            selectedFields: useNativeOutput ? undefined : genParams?.selectedFields,
                            stream: config.isStreamingEnabled,
                            onStreamChunk: handleStreamChunk,
                            streamPhase: 'regular',
                            onUsage: captureUsage
                        });
                        clearStreamingState();
                    }

                    const ensureString = (val: any) => {
                        if (val === null || val === undefined) return "";
                        if (typeof val === 'string') return val;
                        return JSON.stringify(val);
                    };

                    // Check if field selection is enabled
                    const selectedFields = genParams?.selectedFields;
                    const hasFieldSelection = selectedFields && selectedFields.length > 0;

                    // Get the schema for this prompt to know all available fields
                    const promptSetId = runtimeConfig?.promptSet || config.sessionPromptSet || SettingsService.getSettings().promptSet || 'default';
                    const schema = PromptService.getPromptSchema(
                        config.appMode === CreatorMode.Generator ? PromptCategory.Generator : PromptCategory.Converter,
                        PromptRole.System,
                        promptSetId
                    );

                    let finalResult: Record<string, any>;

                    if (useNativeOutput) {
                        const rawText = typeof result === 'string' ? result : JSON.stringify(result);
                        finalResult = parseNativeOutput(rawText);
                    } else {
                        finalResult = result;
                    }

                    if (!useNativeOutput && hasFieldSelection && schema.output.length > 0) {
                        // In both Generator and Converter modes with field selection: merge generated fields with existing data
                        const existingItem: Partial<SynthLogItem> = {
                            reasoning: originalReasoning,
                            answer: originalAnswer,
                            query: originalQuestion
                        };

                        const mergeResult = mergeWithExistingFields(
                            existingItem,
                            result,
                            selectedFields,
                            schema.output
                        );

                        finalResult = mergeResult.data;

                        // Log any issues
                        if (mergeResult.missingFields.length > 0) {
                            logger.warn(`Missing fields in response: ${mergeResult.missingFields.join(', ')}`);
                        }
                        if (mergeResult.preservedFields.length > 0) {
                            logger.log(`Preserved fields from existing data: ${mergeResult.preservedFields.join(', ')}`);
                        }
                    }

                    let answer = ensureString(finalResult.answer);
                    let reasoning = ensureString(finalResult.reasoning);
                    let reasoningContent = ensureString(finalResult.reasoning_content || reasoning);

                    if (useNativeOutput && hasFieldSelection) {
                        if (selectedFields && !selectedFields.includes(OutputFieldName.Reasoning)) {
                            reasoning = originalReasoning || '';
                            reasoningContent = reasoning;
                        }
                        if (selectedFields && !selectedFields.includes(OutputFieldName.Answer)) {
                            answer = originalAnswer || '';
                        }
                    }
                    // If field selection is enabled and answer was not selected, use original answer
                    const finalAnswer = (originalAnswer && hasFieldSelection && !selectedFields?.includes(OutputFieldName.Answer))
                        ? originalAnswer
                        : answer;

                    const finalUsage = usageRef.current;
                    return {
                        id: generationId,
                        sessionUid: config.sessionUid,
                        source: source,
                        seed_preview: safeInput.substring(0, 150) + "...",
                        full_seed: safeInput,
                        query: originalQuestion || (config.appMode === CreatorMode.Converter ? extractInputContent(safeInput, { format: ExtractContentFormat.Display }) : safeInput),
                        reasoning: reasoning,
                        reasoning_content: reasoningContent,
                        [SynthLogFieldName.OriginalReasoning]: originalReasoning,
                        answer: finalAnswer,
                        [SynthLogFieldName.OriginalAnswer]: originalAnswer,
                        timestamp: new Date().toISOString(),
                        duration: Date.now() - startTime,
                        tokenCount: finalUsage?.total_tokens
                            || Math.round((finalAnswer.length + reasoning.length) / 4),
                        usage: finalUsage || undefined,
                        modelUsed: config.provider === ProviderType.Gemini ? 'Gemini 3 Flash' : `${config.externalProvider}/${config.externalModel}`,
                        provider: config.externalProvider,
                        status: LogItemStatus.DONE
                    };
                } else {
                    // Deep mode
                    let inputPayload = safeInput;
                    if (config.appMode === CreatorMode.Converter) {
                        inputPayload = extractInputContent(safeInput);
                    }

                    if (config.appMode === CreatorMode.Generator && originalAnswer && originalAnswer.trim().length > 0) {
                        inputPayload = `${inputPayload}\n\n[EXPECTED ANSWER]\n${originalAnswer.trim()}`;
                    }

                    const runtimeDeepConfig = JSON.parse(JSON.stringify(effectiveDeepConfig));

                    const deepStreamState = initStreamingState(1, inputPayload, true);
                    config.streamingConversationsRef.current.set(generationId, deepStreamState);
                    config.bumpStreamingConversations();

                    const deepResult = await DeepReasoningService.orchestrateDeepReasoning({
                        input: inputPayload,
                        originalQuery: originalQuestion || (config.appMode === CreatorMode.Converter ? extractInputContent(safeInput, { format: ExtractContentFormat.Display }) : safeInput),
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
                            [SynthLogFieldName.OriginalReasoning]: originalReasoning,
                            [SynthLogFieldName.OriginalAnswer]: originalAnswer,
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
                        [SynthLogFieldName.OriginalReasoning]: originalReasoning,
                        [SynthLogFieldName.OriginalAnswer]: originalAnswer,
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
                const safeErrInput = typeof inputText === 'string' ? inputText : JSON.stringify(inputText);
                return {
                    id: generationId,
                    sessionUid: config.sessionUid,
                    source: source,
                    seed_preview: safeErrInput.substring(0, 50),
                    full_seed: safeErrInput,
                    query: originalQuestion || 'HALTED',
                    reasoning: "",
                    reasoning_content: "",
                    answer: "Halted",
                    [SynthLogFieldName.OriginalReasoning]: originalReasoning,
                    [SynthLogFieldName.OriginalAnswer]: originalAnswer,
                    timestamp: new Date().toISOString(),
                    duration: Date.now() - startTime,
                    modelUsed: config.engineMode === EngineMode.Deep ? 'DEEP ENGINE' : "System",
                    isError: true,
                    status: LogItemStatus.ERROR,
                    error: 'Halted by user'
                };
            }
            if (err.name === 'TimeoutError' || didTimeout) {
                const safeErrInput = typeof inputText === 'string' ? inputText : JSON.stringify(inputText);
                return {
                    id: generationId,
                    sessionUid: config.sessionUid,
                    source: source,
                    seed_preview: safeErrInput.substring(0, 50),
                    full_seed: safeErrInput,
                    query: originalQuestion || 'TIMEOUT',
                    reasoning: "",
                    reasoning_content: "",
                    answer: "Timed out",
                    [SynthLogFieldName.OriginalReasoning]: originalReasoning,
                    [SynthLogFieldName.OriginalAnswer]: originalAnswer,
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
                reasoning_content: "",
                answer: "Failed",
                [SynthLogFieldName.OriginalReasoning]: originalReasoning,
                [SynthLogFieldName.OriginalAnswer]: originalAnswer,
                timestamp: new Date().toISOString(),
                duration: Date.now() - startTime,
                modelUsed: config.engineMode === EngineMode.Deep ? 'DEEP ENGINE' : "System",
                isError: true,
                status: LogItemStatus.ERROR,
                error: err.message
            };
        } finally {
            // Always clear streaming state to prevent stuck streaming cards
            clearStreamingState();
            if (globalSignal) {
                globalSignal.removeEventListener('abort', handleGlobalAbort);
            }
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
        }
    }

    private async processResult(result: SynthLogItem): Promise<void> {
        const { config } = this;

        result.sessionUid = config.sessionUidRef.current;
        if (config.sessionNameRef.current) {
            result.sessionName = config.sessionNameRef.current;
        }

        await LogStorageService.saveLog(config.sessionUidRef.current, result);

        // Directly prepend new log to visible list instead of full IndexedDB reload
        // to avoid race conditions with concurrent workers during generation
        if (config.currentPage === 1) {
            config.setVisibleLogs((prev: SynthLogItem[]) => [result, ...prev]);
        }
        config.setTotalLogCount((prev: number) => prev + 1);
        config.setFilteredLogCount((prev: number) => prev + 1);

        const currentEnv = config.environmentRef.current;
        if (currentEnv === Environment.Production && FirebaseService.isFirebaseConfigured()) {
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
}

// Factory function for easier use
export function createGenerationService(config: GenerationConfig): GenerationService {
    return new GenerationService(config);
}

// Re-export extractInputContent for use elsewhere
export { extractInputContent } from '../../utils/contentExtractor';
