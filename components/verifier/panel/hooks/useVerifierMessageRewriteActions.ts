import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { VerifierItem } from '../../../../types';
import { ChatRole, OutputFieldName, VerifierRewriteTarget } from '../../../../interfaces/enums';
import { VerifierDataSource } from '../../../../interfaces/enums/VerifierDataSource';
import * as VerifierRewriterService from '../../../../services/verifierRewriterService';
import { SettingsService } from '../../../../services/settingsService';
import { toast } from '../../../../services/toastService';
import { confirmService } from '../../../../services/confirmService';
import { extractJsonFields } from '../../../../utils/jsonFieldExtractor';
import { extractMessageParts, parseThinkTagsForDisplay, sanitizeReasoningContent } from '../../../../utils/thinkTagParser';

interface UseVerifierMessageRewriteActionsOptions {
    data: VerifierItem[];
    setData: Dispatch<SetStateAction<VerifierItem[]>>;
    rewriterConfig: VerifierRewriterService.RewriterConfig;
    autoSaveEnabled: boolean;
    dataSource: VerifierDataSource | null;
    handleDbUpdate: (item: VerifierItem) => Promise<void> | void;
    setRewritingField: Dispatch<SetStateAction<{ itemId: string; field: VerifierRewriteTarget } | null>>;
    setStreamingContent: Dispatch<SetStateAction<string>>;
    setMessageRewriteStart: (itemId: string, messageIndex: number, field: VerifierRewriteTarget) => void;
    setMessageRewriteContent: (itemId: string, messageIndex: number, content: string) => void;
    setMessageRewriteBothContent: (itemId: string, messageIndex: number, reasoningContent: string, content: string) => void;
    clearMessageRewriteState: (itemId: string, messageIndex: number) => void;
    getMessageRewriteKey: (itemId: string, messageIndex: number) => string;
    messageRewriteAbortControllers: MutableRefObject<Record<string, AbortController>>;
}

interface UseVerifierMessageRewriteActionsResult {
    handleDeleteMessagesFromHere: (itemId: string, messageIndex: number) => Promise<void>;
    handleMessageQueryRewrite: (itemId: string, messageIndex: number) => Promise<void>;
    handleMessageRewrite: (itemId: string, messageIndex: number) => Promise<void>;
    handleMessageReasoningRewrite: (itemId: string, messageIndex: number) => Promise<void>;
    handleMessageBothRewrite: (itemId: string, messageIndex: number) => Promise<void>;
    handleFieldRewrite: (
        itemId: string,
        field: VerifierRewriteTarget.Query | VerifierRewriteTarget.Reasoning | VerifierRewriteTarget.Answer
    ) => Promise<void>;
    handleBothRewrite: (itemId: string) => Promise<void>;
}

export function useVerifierMessageRewriteActions({
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
}: UseVerifierMessageRewriteActionsOptions): UseVerifierMessageRewriteActionsResult {
    const ensureModelConfigured = useCallback((): boolean => {
        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error(`Please set a default model for ${rewriterConfig.externalProvider} in Settings`);
            return false;
        }
        return true;
    }, [rewriterConfig.externalProvider, rewriterConfig.model]);

    const maybeAutoSave = useCallback((item: VerifierItem | null) => {
        if (!item) return;
        if (autoSaveEnabled && dataSource === VerifierDataSource.Database) {
            handleDbUpdate(item);
        }
    }, [autoSaveEnabled, dataSource, handleDbUpdate]);

    const handleDeleteMessagesFromHere = useCallback(async (itemId: string, messageIndex: number) => {
        const item = data.find(i => i.id === itemId);
        if (!item?.messages) return;

        const deleteCount = item.messages.length - messageIndex;
        const confirmed = await confirmService.confirm({
            message: `Delete message #${messageIndex + 1} and ${deleteCount > 1 ? `all ${deleteCount - 1} message(s) after it` : 'no other messages'}? (${deleteCount} total)`,
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'danger'
        });
        if (!confirmed) return;

        const newMessages = item.messages.slice(0, messageIndex);
        const updatedItem: VerifierItem = {
            ...item,
            messages: newMessages,
            isMultiTurn: newMessages.length > 1,
            hasUnsavedChanges: true
        };

        setData((prev: VerifierItem[]) => prev.map(i => (i.id === itemId ? updatedItem : i)));
        maybeAutoSave(updatedItem);
    }, [data, maybeAutoSave, setData]);

    const handleMessageQueryRewrite = useCallback(async (itemId: string, messageIndex: number) => {
        const item = data.find(i => i.id === itemId);
        if (!item || !item.messages || !item.messages[messageIndex]) {
            return;
        }

        const targetMessage = item.messages[messageIndex];
        if (targetMessage.role !== ChatRole.User) {
            return;
        }

        if (!ensureModelConfigured()) return;

        setMessageRewriteStart(itemId, messageIndex, VerifierRewriteTarget.MessageQuery);
        const rewriteKey = getMessageRewriteKey(itemId, messageIndex);
        const abortController = new AbortController();
        messageRewriteAbortControllers.current[rewriteKey] = abortController;

        try {
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

            const newValue = await VerifierRewriterService.callRewriterAIStreaming(
                userPrompt,
                rewriterConfig,
                (_chunk: string, accumulated: string) => {
                    const extracted = extractJsonFields(accumulated);
                    if (extracted.answer) {
                        setMessageRewriteContent(itemId, messageIndex, extracted.answer);
                    } else {
                        setMessageRewriteContent(itemId, messageIndex, accumulated);
                    }
                },
                abortController.signal
            );

            const extracted = extractJsonFields(newValue);
            const finalQuery = extracted.answer || newValue.trim();

            let updatedItemForDb: VerifierItem | null = null;
            setData((prev: VerifierItem[]) => prev.map(i => {
                if (i.id !== itemId) return i;
                const currentMessages = [...(i.messages || [])];
                if (!currentMessages[messageIndex]) return i;
                currentMessages[messageIndex] = {
                    ...currentMessages[messageIndex],
                    content: finalQuery
                };
                const updated = { ...i, messages: currentMessages, hasUnsavedChanges: true };
                updatedItemForDb = updated;
                return updated;
            }));

            maybeAutoSave(updatedItemForDb);
            toast.success('Query rewritten');
        } catch (error: unknown) {
            if (error instanceof Error && (error.name === 'AbortError' || abortController.signal.aborted)) return;
            console.error('Query rewrite failed:', error);
            toast.error('Rewrite failed. See console for details.');
        } finally {
            clearMessageRewriteState(itemId, messageIndex);
        }
    }, [
        data,
        ensureModelConfigured,
        setMessageRewriteStart,
        getMessageRewriteKey,
        messageRewriteAbortControllers,
        rewriterConfig,
        setMessageRewriteContent,
        setData,
        maybeAutoSave,
        clearMessageRewriteState
    ]);

    const handleMessageRewrite = useCallback(async (itemId: string, messageIndex: number) => {
        const item = data.find(i => i.id === itemId);
        if (!item || !item.messages || !item.messages[messageIndex]) {
            return;
        }

        if (!ensureModelConfigured()) return;

        setMessageRewriteStart(itemId, messageIndex, VerifierRewriteTarget.MessageAnswer);
        const rewriteKey = getMessageRewriteKey(itemId, messageIndex);
        const abortController = new AbortController();
        messageRewriteAbortControllers.current[rewriteKey] = abortController;

        try {
            const newValue = await VerifierRewriterService.rewriteMessageStreaming(
                {
                    item,
                    messageIndex,
                    config: rewriterConfig,
                    promptSet: SettingsService.getSettings().promptSet,
                    signal: abortController.signal
                },
                (_chunk, accumulated) => {
                    const extracted = extractJsonFields(accumulated);
                    if (extracted.answer) {
                        setMessageRewriteContent(itemId, messageIndex, extracted.answer);
                    } else {
                        setMessageRewriteContent(itemId, messageIndex, accumulated);
                    }
                }
            );

            const extracted = extractJsonFields(newValue);
            const finalAnswer = extracted.answer || newValue;

            let updatedItemForDb: VerifierItem | null = null;
            setData((prev: VerifierItem[]) => prev.map(i => {
                if (i.id !== itemId) return i;
                const currentMessages = [...(i.messages || [])];
                if (!currentMessages[messageIndex]) return i;
                const { reasoning: existingReasoning } = extractMessageParts(currentMessages[messageIndex]);
                currentMessages[messageIndex] = {
                    ...currentMessages[messageIndex],
                    content: finalAnswer.trim(),
                    reasoning_content: existingReasoning,
                };
                const updated: VerifierItem = { ...i, messages: currentMessages, hasUnsavedChanges: true };
                updatedItemForDb = updated;
                return updated;
            }));

            maybeAutoSave(updatedItemForDb);
        } catch (error: unknown) {
            if (error instanceof Error && (error.name === 'AbortError' || abortController.signal.aborted)) return;
            console.error('Rewrite failed:', error);
            toast.error('Rewrite failed. See console for details.');
        } finally {
            clearMessageRewriteState(itemId, messageIndex);
        }
    }, [
        data,
        ensureModelConfigured,
        setMessageRewriteStart,
        getMessageRewriteKey,
        messageRewriteAbortControllers,
        rewriterConfig,
        setMessageRewriteContent,
        setData,
        maybeAutoSave,
        clearMessageRewriteState
    ]);

    const handleMessageReasoningRewrite = useCallback(async (itemId: string, messageIndex: number) => {
        const item = data.find(i => i.id === itemId);
        if (!item || !item.messages || !item.messages[messageIndex]) {
            return;
        }

        if (!ensureModelConfigured()) return;

        setMessageRewriteStart(itemId, messageIndex, VerifierRewriteTarget.MessageReasoning);
        const rewriteKey = getMessageRewriteKey(itemId, messageIndex);
        const abortController = new AbortController();
        messageRewriteAbortControllers.current[rewriteKey] = abortController;

        try {
            const rawResult = await VerifierRewriterService.rewriteMessageReasoningStreaming(
                {
                    item,
                    messageIndex,
                    config: rewriterConfig,
                    promptSet: SettingsService.getSettings().promptSet,
                    signal: abortController.signal
                },
                (_chunk, accumulated) => {
                    const extracted = extractJsonFields(accumulated);
                    if (extracted.reasoning) {
                        setMessageRewriteContent(itemId, messageIndex, extracted.reasoning);
                    } else if (extracted.answer) {
                        setMessageRewriteContent(itemId, messageIndex, extracted.answer);
                    } else {
                        setMessageRewriteContent(itemId, messageIndex, accumulated);
                    }
                }
            );

            const extracted = extractJsonFields(rawResult);
            const finalReasoning = sanitizeReasoningContent(extracted.reasoning || extracted.answer || rawResult);
            const modelGeneratedAnswer = extracted.reasoning && extracted.answer ? extracted.answer : undefined;
            const finalAnswer = modelGeneratedAnswer || extractMessageParts(item.messages[messageIndex]).content;

            let updatedItemForDb: VerifierItem | null = null;
            setData((prev: VerifierItem[]) => prev.map(i => {
                if (i.id !== itemId) return i;
                const currentMessages = [...(i.messages || [])];
                if (!currentMessages[messageIndex]) return i;
                currentMessages[messageIndex] = {
                    ...currentMessages[messageIndex],
                    content: finalAnswer,
                    reasoning_content: finalReasoning,
                };
                const updated = { ...i, messages: currentMessages, hasUnsavedChanges: true };
                updatedItemForDb = updated;
                return updated;
            }));

            maybeAutoSave(updatedItemForDb);
        } catch (error: unknown) {
            if (error instanceof Error && (error.name === 'AbortError' || abortController.signal.aborted)) return;
            console.error('Reasoning rewrite failed:', error);
            toast.error('Rewrite failed. See console for details.');
        } finally {
            clearMessageRewriteState(itemId, messageIndex);
        }
    }, [
        data,
        ensureModelConfigured,
        setMessageRewriteStart,
        getMessageRewriteKey,
        messageRewriteAbortControllers,
        rewriterConfig,
        setMessageRewriteContent,
        setData,
        maybeAutoSave,
        clearMessageRewriteState
    ]);

    const handleMessageBothRewrite = useCallback(async (itemId: string, messageIndex: number) => {
        const item = data.find(i => i.id === itemId);
        if (!item || !item.messages || !item.messages[messageIndex]) {
            return;
        }

        if (!ensureModelConfigured()) return;

        setMessageRewriteStart(itemId, messageIndex, VerifierRewriteTarget.MessageBoth);
        const rewriteKey = getMessageRewriteKey(itemId, messageIndex);
        const abortController = new AbortController();
        messageRewriteAbortControllers.current[rewriteKey] = abortController;

        const splitFieldRequests = SettingsService.getDefaultGenerationParams().splitFieldRequests ?? false;

        try {
            let finalReasoning: string;
            let finalAnswer: string;

            if (splitFieldRequests) {
                let splitReasoningAccumulated = '';
                const result = await VerifierRewriterService.rewriteMessageBothSplitStreaming(
                    {
                        item,
                        messageIndex,
                        config: rewriterConfig,
                        promptSet: SettingsService.getSettings().promptSet,
                        signal: abortController.signal
                    },
                    (_chunk, accumulated) => {
                        splitReasoningAccumulated = accumulated;
                        setMessageRewriteBothContent(itemId, messageIndex, accumulated, '');
                    },
                    (_chunk, accumulated) => {
                        setMessageRewriteBothContent(itemId, messageIndex, splitReasoningAccumulated, accumulated);
                    }
                );
                finalReasoning = sanitizeReasoningContent(result.reasoning);
                finalAnswer = result.answer;
            } else {
                const rawResult = await VerifierRewriterService.rewriteMessageBothStreaming(
                    {
                        item,
                        messageIndex,
                        config: rewriterConfig,
                        promptSet: SettingsService.getSettings().promptSet,
                        signal: abortController.signal
                    },
                    (_chunk, accumulated) => {
                        const extracted = extractJsonFields(accumulated);
                        if (extracted.reasoning && !extracted.hasAnswerStart) {
                            setMessageRewriteBothContent(itemId, messageIndex, extracted.reasoning, '');
                        } else if (extracted.hasAnswerStart) {
                            setMessageRewriteBothContent(itemId, messageIndex, extracted.reasoning || '', extracted.answer || '');
                        } else {
                            setMessageRewriteBothContent(itemId, messageIndex, '', accumulated);
                        }
                    }
                );

                const extracted = extractJsonFields(rawResult);
                const parsedThink = parseThinkTagsForDisplay(rawResult);
                const parsedAnswerThink = parseThinkTagsForDisplay(extracted.answer || '');
                finalReasoning = sanitizeReasoningContent(
                    extracted.reasoning || parsedAnswerThink.reasoning || parsedThink.reasoning || ''
                );
                finalAnswer = extracted.answer
                    ? (parsedAnswerThink.hasThinkTags ? parsedAnswerThink.answer : extracted.answer)
                    : (parsedThink.hasThinkTags ? parsedThink.answer : rawResult);
            }

            let updatedItemForDb: VerifierItem | null = null;
            setData((prev: VerifierItem[]) => prev.map(i => {
                if (i.id !== itemId) return i;
                const currentMessages = [...(i.messages || [])];
                if (!currentMessages[messageIndex]) return i;
                const preservedReasoning = extractMessageParts(currentMessages[messageIndex]).reasoning;
                currentMessages[messageIndex] = {
                    ...currentMessages[messageIndex],
                    content: finalAnswer,
                    reasoning_content: finalReasoning || preservedReasoning,
                };
                const updated: VerifierItem = { ...i, messages: currentMessages, hasUnsavedChanges: true };
                updatedItemForDb = updated;
                return updated;
            }));

            maybeAutoSave(updatedItemForDb);
            toast.success('Regenerated message reasoning and answer');
        } catch (error: unknown) {
            if (error instanceof Error && (error.name === 'AbortError' || abortController.signal.aborted)) return;
            console.error('Both rewrite failed:', error);
            toast.error('Rewrite failed. See console for details.');
        } finally {
            clearMessageRewriteState(itemId, messageIndex);
        }
    }, [
        data,
        ensureModelConfigured,
        setMessageRewriteStart,
        getMessageRewriteKey,
        messageRewriteAbortControllers,
        rewriterConfig,
        setMessageRewriteBothContent,
        setData,
        maybeAutoSave,
        clearMessageRewriteState
    ]);

    const handleFieldRewrite = useCallback(async (
        itemId: string,
        field: VerifierRewriteTarget.Query | VerifierRewriteTarget.Reasoning | VerifierRewriteTarget.Answer
    ) => {
        const item = data.find(i => i.id === itemId);
        if (!item) return;

        if (!ensureModelConfigured()) return;

        const itemForRewrite = {
            ...item,
            query: item.query || (item as any).QUERY || item.full_seed || ''
        };

        setRewritingField({ itemId, field });
        setStreamingContent('');

        try {
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
                    const extracted = extractJsonFields(accumulated);

                    if (field === VerifierRewriteTarget.Reasoning) {
                        setStreamingContent(extracted.reasoning || extracted.answer || accumulated);
                    } else if (field === VerifierRewriteTarget.Answer) {
                        setStreamingContent(extracted.answer || extracted.reasoning || accumulated);
                    } else if (field === VerifierRewriteTarget.Query) {
                        setStreamingContent(extracted.answer || accumulated);
                    } else {
                        setStreamingContent(accumulated);
                    }
                }
            );

            const extracted = extractJsonFields(newValue);
            let finalValue = newValue;
            if (field === VerifierRewriteTarget.Reasoning) {
                finalValue = sanitizeReasoningContent(extracted.reasoning || extracted.answer || newValue);
            } else if (field === VerifierRewriteTarget.Answer) {
                finalValue = extracted.answer || extracted.reasoning || newValue;
            } else if (field === VerifierRewriteTarget.Query) {
                finalValue = extracted.answer || newValue;
            }

            const updatedItem = { ...itemForRewrite, [field]: finalValue, hasUnsavedChanges: true };

            setData((prev: VerifierItem[]) => prev.map(i => (i.id === itemId ? updatedItem : i)));
            maybeAutoSave(updatedItem);
        } catch (error: unknown) {
            console.error('Rewrite failed:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error(`Rewrite failed: ${message}`);
        } finally {
            setRewritingField(null);
            setStreamingContent('');
        }
    }, [
        data,
        ensureModelConfigured,
        setRewritingField,
        setStreamingContent,
        rewriterConfig,
        setData,
        maybeAutoSave
    ]);

    const handleBothRewrite = useCallback(async (itemId: string) => {
        const item = data.find(i => i.id === itemId);
        if (!item) return;

        if (!ensureModelConfigured()) return;

        const itemForRewrite = {
            ...item,
            query: item.query || (item as any).QUERY || item.full_seed || ''
        };

        setRewritingField({ itemId, field: VerifierRewriteTarget.Both });
        setStreamingContent('');

        const splitFieldRequests = SettingsService.getDefaultGenerationParams().splitFieldRequests ?? false;

        try {
            let finalReasoning: string;
            let finalAnswer: string;

            if (splitFieldRequests) {
                const result = await VerifierRewriterService.rewriteBothSplitStreaming(
                    {
                        item: itemForRewrite,
                        field: OutputFieldName.Reasoning,
                        config: rewriterConfig,
                        promptSet: SettingsService.getSettings().promptSet
                    },
                    (_chunk, accumulated) => {
                        setStreamingContent(accumulated);
                    },
                    (_chunk, accumulated) => {
                        setStreamingContent(accumulated);
                    }
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
                    (_chunk, accumulated) => {
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

                const extracted = extractJsonFields(rawResult);
                finalReasoning = sanitizeReasoningContent(extracted.reasoning || extracted.answer || rawResult);
                finalAnswer = (extracted.reasoning && extracted.answer) ? extracted.answer : item.answer;
            }

            const updatedItem = {
                ...item,
                reasoning: finalReasoning,
                reasoning_content: finalReasoning,
                answer: finalAnswer,
                hasUnsavedChanges: true
            };

            setData((prev: VerifierItem[]) => prev.map(i => (i.id === itemId ? updatedItem : i)));
            maybeAutoSave(updatedItem);
        } catch (error: unknown) {
            console.error('Rewrite both failed:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error(`Rewrite failed: ${message}`);
        } finally {
            setRewritingField(null);
            setStreamingContent('');
        }
    }, [
        data,
        ensureModelConfigured,
        setRewritingField,
        setStreamingContent,
        rewriterConfig,
        setData,
        maybeAutoSave
    ]);

    return {
        handleDeleteMessagesFromHere,
        handleMessageQueryRewrite,
        handleMessageRewrite,
        handleMessageReasoningRewrite,
        handleMessageBothRewrite,
        handleFieldRewrite,
        handleBothRewrite
    };
}

export default useVerifierMessageRewriteActions;
