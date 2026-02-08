import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import type { AutoscoreConfig, AutoscoreToolParams, AutoscoreToolResult, VerifierItem } from '../../../../types';
import { ProviderType } from '../../../../types';
import { OutputFieldName, VerifierRewriteTarget } from '../../../../interfaces/enums';
import { VerifierDataSource } from '../../../../interfaces/enums/VerifierDataSource';
import { PromptCategory, PromptRole } from '../../../../interfaces/enums';
import * as FirebaseService from '../../../../services/firebaseService';
import * as VerifierRewriterService from '../../../../services/verifierRewriterService';
import * as ExternalApiService from '../../../../services/externalApiService';
import * as GeminiService from '../../../../services/geminiService';
import * as backendClient from '../../../../services/backendClient';
import { SettingsService } from '../../../../services/settingsService';
import { PromptService } from '../../../../services/promptService';
import { PROVIDERS } from '../../../../constants';
import { encryptKey } from '../../../../utils/keyEncryption';
import { isBackendAiAvailable, chatViaBackend } from '../../../../services/api/backendAiClient';
import { toast } from '../../../../services/toastService';
import { confirmService } from '../../../../services/confirmService';
import { extractJsonFields } from '../../../../utils/jsonFieldExtractor';
import { sanitizeReasoningContent } from '../../../../utils/thinkTagParser';
import { normalizeImportItem } from '../../../../services/verifierImportService';

interface UseVerifierBulkActionsOptions {
    data: VerifierItem[];
    setData: Dispatch<SetStateAction<VerifierItem[]>>;
    filteredData: VerifierItem[];
    dataSource: VerifierDataSource | null;
    autoSaveEnabled: boolean;
    rewriterConfig: VerifierRewriterService.RewriterConfig;
    autoscoreConfig: AutoscoreConfig;
    handleDbUpdate: (item: VerifierItem) => Promise<void>;
    resolveActiveSessionId: () => string | null;
    onJobCreated?: (jobId: string, type: string) => void;
}

interface UseVerifierBulkActionsResult {
    selectedItemIds: Set<string>;
    isRewritingAll: boolean;
    rewriteProgress: { current: number; total: number };
    isAutoscoring: boolean;
    autoscoreProgress: { current: number; total: number } | null;
    isBulkUpdating: boolean;
    deleteModalOpen: boolean;
    itemsToDelete: string[];
    isDeleting: boolean;
    handleAutoscoreItems: (params: AutoscoreToolParams) => Promise<AutoscoreToolResult>;
    handleRefreshRowsFromDb: (startIndex: number, endIndex: number) => Promise<VerifierItem[]>;
    toggleSelection: (id: string) => void;
    handleSelectAll: () => void;
    handleBulkRewrite: (mode: VerifierRewriteTarget.Query | VerifierRewriteTarget.Reasoning | VerifierRewriteTarget.Answer | VerifierRewriteTarget.Both) => Promise<void>;
    handleAutoscoreSelected: () => Promise<void>;
    handleAutoscoreSingleItem: (itemId: string) => Promise<void>;
    handleBulkDbUpdate: () => Promise<void>;
    initiateDelete: (ids: string[]) => void;
    confirmDelete: () => Promise<void>;
    setDeleteModalOpen: Dispatch<SetStateAction<boolean>>;
}

export function useVerifierBulkActions({
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
}: UseVerifierBulkActionsOptions): UseVerifierBulkActionsResult {
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [isRewritingAll, setIsRewritingAll] = useState(false);
    const [rewriteProgress, setRewriteProgress] = useState({ current: 0, total: 0 });
    const [isAutoscoring, setIsAutoscoring] = useState(false);
    const [autoscoreProgress, setAutoscoreProgress] = useState<{ current: number; total: number } | null>(null);
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);

    const autoscoreSingleItem = useCallback(async (item: VerifierItem, signal?: AbortSignal): Promise<number> => {
        const { provider, externalProvider, apiKey, model, customBaseUrl, maxRetries, retryDelay, generationParams } = autoscoreConfig;

        const providerString = provider === ProviderType.External ? externalProvider : 'gemini';
        const effectiveApiKey = apiKey || SettingsService.getApiKey(providerString);
        const effectiveBaseUrl = customBaseUrl || PROVIDERS[providerString]?.url || '';

        const systemPrompt = 'You are an expert evaluator. Score the quality of the reasoning and answer on a scale of 1-5, where 1 is poor and 5 is excellent.';

        const userPrompt = `## ITEM TO SCORE
Query: ${item.query || (item as any).QUERY || item.full_seed || ''}
Reasoning Trace: ${item.reasoning}
Answer: ${item.answer}

---
Based on the criteria above, provide a 1-5 score.`;

        let rawResult = '';

        const useBackend = await isBackendAiAvailable();
        if (useBackend) {
            try {
                const result = await chatViaBackend({
                    provider: providerString,
                    model,
                    apiKey: effectiveApiKey,
                    baseUrl: effectiveBaseUrl,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    generationParams: generationParams || SettingsService.getDefaultGenerationParams(),
                    signal,
                });
                rawResult = result.content || '';
                const match = rawResult.match(/[1-5]/);
                return match ? parseInt(match[0], 10) : 0;
            } catch (backendError: unknown) {
                if (backendError instanceof Error && (backendError.name === 'AbortError' || signal?.aborted)) throw backendError;
                console.warn('[autoscore] Backend AI failed, falling back to direct call:', backendError);
            }
        }

        if (provider !== ProviderType.External) {
            const result = await GeminiService.generateReasoningTrace(userPrompt, systemPrompt, {
                maxRetries,
                retryDelay,
                generationParams: generationParams || SettingsService.getDefaultGenerationParams()
            });
            rawResult = result.answer || result.reasoning || String(result);
        } else {
            const result = await ExternalApiService.callExternalApi({
                provider: externalProvider,
                apiKey: effectiveApiKey,
                model,
                customBaseUrl: effectiveBaseUrl,
                userPrompt: systemPrompt + '\n\n' + userPrompt,
                signal,
                maxRetries,
                retryDelay,
                structuredOutput: false,
                generationParams: generationParams || SettingsService.getDefaultGenerationParams()
            });
            rawResult = typeof result === 'string' ? result : JSON.stringify(result);
        }

        const match = rawResult.match(/[1-5]/);
        return match ? parseInt(match[0], 10) : 0;
    }, [autoscoreConfig]);

    const handleAutoscoreItems = useCallback(async (params: AutoscoreToolParams): Promise<AutoscoreToolResult> => {
        const { indices = [], scores = [] } = params;
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
            setData((prev: VerifierItem[]) => prev.map(existing =>
                existing.id === item.id ? { ...existing, score, hasUnsavedChanges: true } : existing
            ));
            if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
                await handleDbUpdate({ ...item, score, hasUnsavedChanges: true });
            }
            scored += 1;
        }

        return { scored, skipped, errors };
    }, [autoSaveEnabled, data, dataSource, handleDbUpdate, setData]);

    const handleRefreshRowsFromDb = useCallback(async (startIndex: number, endIndex: number): Promise<VerifierItem[]> => {
        const slice = data.slice(startIndex, endIndex);
        if (slice.length === 0) return [];
        const refreshed: VerifierItem[] = [];
        for (const item of slice) {
            if (!item.id) {
                refreshed.push(item);
                continue;
            }
            const fresh = await FirebaseService.fetchLogItem(item.id);
            refreshed.push(fresh ? normalizeImportItem(fresh) : item);
        }
        const updated = [...data];
        for (let i = 0; i < refreshed.length; i++) {
            updated[startIndex + i] = refreshed[i];
        }
        setData(updated);
        return refreshed;
    }, [data, setData]);

    const toggleSelection = useCallback((id: string) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleSelectAll = useCallback(() => {
        if (selectedItemIds.size === filteredData.length) {
            setSelectedItemIds(new Set());
        } else {
            setSelectedItemIds(new Set(filteredData.map(i => i.id)));
        }
    }, [filteredData, selectedItemIds.size]);

    const getSelectedItems = useCallback(() => {
        return filteredData.filter(i => selectedItemIds.has(i.id));
    }, [filteredData, selectedItemIds]);

    const handleBulkRewrite = useCallback(async (mode: VerifierRewriteTarget.Query | VerifierRewriteTarget.Reasoning | VerifierRewriteTarget.Answer | VerifierRewriteTarget.Both) => {
        const itemsToProcess = getSelectedItems();
        if (itemsToProcess.length === 0) {
            toast.info('No items selected.');
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

        if (dataSource === VerifierDataSource.Database && backendClient.isBackendEnabled()) {
            const sessionId = resolveActiveSessionId();
            if (!sessionId) {
                toast.error('No session selected. Select a specific session to run a backend rewrite job.');
                return;
            }

            const fields: string[] = mode === VerifierRewriteTarget.Both ? ['reasoning', 'answer'] : [mode];
            const effectiveProvider = rewriterConfig.externalProvider || SettingsService.getSettings().defaultProvider || 'openrouter';
            const effectiveModel = rewriterConfig.model || SettingsService.getDefaultModel(effectiveProvider) || '';
            const effectiveBaseUrl = (rewriterConfig.customBaseUrl && rewriterConfig.customBaseUrl !== '' ? rewriterConfig.customBaseUrl : null)
                || SettingsService.getProviderUrl(effectiveProvider)
                || PROVIDERS[effectiveProvider]?.url
                || '';
            const apiKey = (rewriterConfig.apiKey && rewriterConfig.apiKey !== '' ? rewriterConfig.apiKey : null)
                || SettingsService.getApiKey(effectiveProvider)
                || '';

            if (!apiKey) {
                toast.error(`No API key found for provider "${effectiveProvider}". Configure it in Settings or the Rewriter panel.`);
                return;
            }

            try {
                const encryptedKey = await encryptKey(apiKey);
                const effectiveSystemPrompt = rewriterConfig.systemPrompt && rewriterConfig.systemPrompt.trim() !== ''
                    ? rewriterConfig.systemPrompt
                    : undefined;

                let fieldPrompts: Record<string, string> | undefined;
                if (!effectiveSystemPrompt) {
                    const promptSet = SettingsService.getSettings().promptSet || 'default';
                    const schema = PromptService.getPromptSchema(PromptCategory.Verifier, PromptRole.Rewriter, promptSet);
                    if (schema.prompt) {
                        fieldPrompts = {};
                        for (const field of fields) {
                            fieldPrompts[field] = schema.prompt;
                        }
                    }
                }

                const itemIds = itemsToProcess.map(i => i.id);
                const jobId = await backendClient.startRewrite({
                    sessionId,
                    provider: effectiveProvider,
                    model: effectiveModel,
                    baseUrl: effectiveBaseUrl,
                    apiKey: encryptedKey,
                    fields,
                    itemIds,
                    sleepMs: rewriterConfig.delayMs ?? 500,
                    concurrency: rewriterConfig.concurrency ?? 1,
                    maxRetries: rewriterConfig.maxRetries ?? 3,
                    retryDelay: rewriterConfig.retryDelay ?? 2000,
                    systemPrompt: effectiveSystemPrompt,
                    fieldPrompts,
                });

                onJobCreated?.(jobId, 'rewrite');
                toast.success(`Rewrite job started for ${itemsToProcess.length} items (${fields.join(', ')})`);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                toast.error(`Failed to start rewrite job: ${msg}`);
            }
            return;
        }

        setIsRewritingAll(true);
        setRewriteProgress({ current: 0, total: itemsToProcess.length });

        const { concurrency = 1, delayMs = 0 } = rewriterConfig;
        let currentIndex = 0;

        const worker = async () => {
            while (currentIndex < itemsToProcess.length) {
                const myIndex = currentIndex++;
                if (myIndex >= itemsToProcess.length) break;

                const item = itemsToProcess[myIndex];
                const itemForRewrite = {
                    ...item,
                    query: item.query || (item as any).QUERY || item.full_seed || ''
                };

                const bulkSplitFieldRequests = SettingsService.getDefaultGenerationParams().splitFieldRequests ?? false;

                try {
                    if (mode === VerifierRewriteTarget.Both) {
                        let finalReasoning: string;
                        let finalAnswer: string;

                        if (bulkSplitFieldRequests) {
                            const result = await VerifierRewriterService.rewriteBothSplitStreaming(
                                {
                                    item: itemForRewrite,
                                    field: OutputFieldName.Reasoning,
                                    config: rewriterConfig,
                                    promptSet: SettingsService.getSettings().promptSet
                                },
                                () => { },
                                () => { }
                            );
                            finalReasoning = sanitizeReasoningContent(result.reasoning);
                            finalAnswer = result.answer;
                        } else {
                            const rawResult = await VerifierRewriterService.rewriteFieldStreaming(
                                {
                                    item: itemForRewrite,
                                    field: OutputFieldName.Reasoning,
                                    config: rewriterConfig,
                                    promptSet: SettingsService.getSettings().promptSet
                                },
                                () => { }
                            );

                            const extracted = extractJsonFields(rawResult);
                            finalReasoning = sanitizeReasoningContent(extracted.reasoning || extracted.answer || rawResult);
                            finalAnswer = (extracted.reasoning && extracted.answer) ? extracted.answer : item.answer;
                        }

                        setData((prev: VerifierItem[]) => prev.map(i =>
                            i.id === item.id
                                ? {
                                    ...i,
                                    reasoning: finalReasoning,
                                    reasoning_content: finalReasoning,
                                    answer: finalAnswer,
                                    hasUnsavedChanges: true
                                }
                                : i
                        ));
                    } else {
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
                            finalValue = sanitizeReasoningContent(extracted.reasoning || extracted.answer || rawResult);
                        } else if (mode === VerifierRewriteTarget.Answer) {
                            finalValue = extracted.answer || extracted.reasoning || rawResult;
                        } else if (mode === VerifierRewriteTarget.Query) {
                            finalValue = extracted.answer || rawResult;
                        }

                        const updatedItem = mode === VerifierRewriteTarget.Reasoning
                            ? {
                                ...item,
                                reasoning: finalValue,
                                reasoning_content: finalValue,
                                hasUnsavedChanges: true
                            }
                            : { ...item, [mode]: finalValue, hasUnsavedChanges: true };

                        setData((prev: VerifierItem[]) => prev.map(i => (i.id === item.id ? updatedItem : i)));

                        if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
                            await handleDbUpdate(updatedItem as VerifierItem);
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
    }, [
        autoSaveEnabled,
        dataSource,
        getSelectedItems,
        handleDbUpdate,
        onJobCreated,
        resolveActiveSessionId,
        rewriterConfig,
        setData
    ]);

    const handleAutoscoreSelected = useCallback(async () => {
        const selectedItems = getSelectedItems();
        const itemsToScore = selectedItems.filter(i => !!i.score || i.score === 0);

        if (itemsToScore.length === 0) {
            toast.info('No unrated items in selection.');
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

        if (dataSource === VerifierDataSource.Database && backendClient.isBackendEnabled()) {
            const sessionId = resolveActiveSessionId();
            if (!sessionId) {
                toast.error('No session selected. Select a specific session to run a backend autoscore job.');
                return;
            }

            const providerString = autoscoreConfig.provider === ProviderType.External
                ? autoscoreConfig.externalProvider
                : 'gemini';
            const effectiveModel = autoscoreConfig.model || '';
            const effectiveBaseUrl = autoscoreConfig.customBaseUrl || PROVIDERS[providerString]?.url || '';
            const apiKey = autoscoreConfig.apiKey || SettingsService.getApiKey(providerString) || '';

            if (!apiKey) {
                toast.error(`No API key found for provider "${providerString}". Configure it in the Auto-Score settings.`);
                return;
            }

            try {
                const encryptedKey = await encryptKey(apiKey);
                const itemIds = itemsToScore.map(i => i.id);

                const jobId = await backendClient.startAutoScore({
                    sessionId,
                    provider: providerString,
                    model: effectiveModel,
                    baseUrl: effectiveBaseUrl,
                    apiKey: encryptedKey,
                    itemIds,
                    sleepMs: autoscoreConfig.sleepTime ?? 0,
                    concurrency: autoscoreConfig.concurrency ?? 5,
                    maxRetries: autoscoreConfig.maxRetries ?? 3,
                    retryDelay: autoscoreConfig.retryDelay ?? 2000,
                    force: false,
                });

                onJobCreated?.(jobId, 'autoscore');
                toast.success(`Autoscore job started for ${itemsToScore.length} unrated items`);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                toast.error(`Failed to start autoscore job: ${msg}`);
            }
            return;
        }

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
                            await handleDbUpdate({ ...item, score, hasUnsavedChanges: true });
                        }
                    }
                } catch (err) {
                    console.error(`Failed to score item ${item.id}:`, err);
                }

                setAutoscoreProgress(prev => prev ? { ...prev, current: prev.current + 1 } : { current: 1, total: 1 });

                if (sleepTime > 0 && currentIndex < itemsToScore.length) {
                    await new Promise(r => setTimeout(r, sleepTime));
                }
            }
        };

        const workers = Array.from({ length: Math.min(concurrency, itemsToScore.length) }, () => worker());
        await Promise.all(workers);

        setIsAutoscoring(false);
        toast.success(`Autoscoring complete! Processed ${itemsToScore.length} items.`);
    }, [
        autoSaveEnabled,
        autoscoreConfig,
        autoscoreSingleItem,
        dataSource,
        getSelectedItems,
        handleDbUpdate,
        onJobCreated,
        resolveActiveSessionId,
        setData
    ]);

    const handleBulkDbUpdate = useCallback(async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
            return;
        }

        const itemsToUpdate = getSelectedItems();
        if (itemsToUpdate.length === 0) {
            toast.info('No items selected.');
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

        const chunkSize = 10;

        for (let i = 0; i < itemsToUpdate.length; i += chunkSize) {
            const chunk = itemsToUpdate.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (item) => {
                try {
                    const isMultiTurnItem = Array.isArray(item.messages) && item.messages.length > 0;
                    const updates = isMultiTurnItem
                        ? {
                            query: item.query,
                            messages: item.messages,
                            isMultiTurn: true,
                            score: item.score,
                            isDuplicate: item.isDuplicate
                        }
                        : {
                            reasoning: item.reasoning,
                            reasoning_content: item.reasoning_content || item.reasoning,
                            answer: item.answer,
                            score: item.score,
                            isDuplicate: item.isDuplicate
                        };
                    await FirebaseService.updateLogItem(item.id, updates);
                    successCount++;
                } catch (e) {
                    console.error('Update failed', item.id, e);
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
    }, [getSelectedItems]);

    const initiateDelete = useCallback((ids: string[]) => {
        setItemsToDelete(ids);
        setDeleteModalOpen(true);
    }, []);

    const confirmDelete = useCallback(async () => {
        setIsDeleting(true);
        try {
            await Promise.all(itemsToDelete.map(id => FirebaseService.deleteLogItem(id)));

            setData(prev => prev.filter(item => !itemsToDelete.includes(item.id)));

            setSelectedItemIds(prev => {
                const next = new Set(prev);
                itemsToDelete.forEach(id => next.delete(id));
                return next;
            });

            setDeleteModalOpen(false);
            setItemsToDelete([]);
        } catch (e) {
            console.error('Failed to delete items', e);
            await confirmService.alert({
                title: 'Delete failed',
                message: 'Failed to delete items. See console for details.',
                variant: 'danger'
            });
        } finally {
            setIsDeleting(false);
        }
    }, [itemsToDelete, setData]);

    const handleAutoscoreSingleItem = useCallback(async (itemId: string): Promise<void> => {
        const item = data.find(i => i.id === itemId);
        if (!item) {
            toast.error('Item not found');
            return;
        }

        setIsAutoscoring(true);
        setAutoscoreProgress({ current: 1, total: 1 });

        try {
            const score = await autoscoreSingleItem(item);
            if (score > 0) {
                const updatedItem = { ...item, score, hasUnsavedChanges: true };
                setData(prev => prev.map(i => i.id === itemId ? updatedItem : i));
                if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
                    await handleDbUpdate(updatedItem);
                }
                toast.success(`Item scored: ${score}/5`);
            } else {
                toast.error('Failed to get valid score from AI');
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                toast.info('Autoscoring cancelled');
            } else {
                toast.error('Autoscoring failed: ' + error.message);
            }
        } finally {
            setIsAutoscoring(false);
            setAutoscoreProgress(null);
        }
    }, [data, autoscoreSingleItem, setData, autoSaveEnabled, dataSource, handleDbUpdate]);

    return {
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
        handleBulkDbUpdate,
        handleAutoscoreSingleItem,
        initiateDelete,
        confirmDelete,
        setDeleteModalOpen
    };
}

export default useVerifierBulkActions;
