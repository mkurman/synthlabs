import { useCallback } from 'react';

import type { VerifierItem } from '../types';
import { ChatRole, OutputFieldName, VerifierRewriteTarget } from '../interfaces/enums';
import { VerifierDataSource } from '../interfaces/enums/VerifierDataSource';
import { extractMessageParts, parseThinkTagsForDisplay, sanitizeReasoningContent } from '../utils/thinkTagParser';

interface UseVerifierInlineEditingOptions {
    data?: VerifierItem[];
    editingField: { itemId: string; field: OutputFieldName.Query | OutputFieldName.Reasoning | OutputFieldName.Answer | VerifierRewriteTarget.MessageAnswer; messageIndex?: number; originalValue: string } | null;
    editValue: string;
    setEditingField: (value: { itemId: string; field: OutputFieldName.Query | OutputFieldName.Reasoning | OutputFieldName.Answer | VerifierRewriteTarget.MessageAnswer; messageIndex?: number; originalValue: string } | null) => void;
    setEditValue: (value: string) => void;
    setData: (items: VerifierItem[] | ((prev: VerifierItem[]) => VerifierItem[])) => void;
    autoSaveEnabled: boolean;
    dataSource: VerifierDataSource | null;
    handleDbUpdate: (item: VerifierItem) => Promise<void>;
}

export function useVerifierInlineEditing({
    // data is accepted for backward compat but no longer used (we read from setData's prev)
    data: _data,
    editingField,
    editValue,
    setEditingField,
    setEditValue,
    setData,
    autoSaveEnabled,
    dataSource,
    handleDbUpdate
}: UseVerifierInlineEditingOptions) {
    const startEditing = useCallback((
        itemId: string,
        field: OutputFieldName.Query | OutputFieldName.Reasoning | OutputFieldName.Answer,
        currentValue: string
    ) => {
        setEditingField({ itemId, field, originalValue: currentValue });
        setEditValue(currentValue);
    }, [setEditValue, setEditingField]);

    const cancelEditing = useCallback(() => {
        setEditingField(null);
        setEditValue('');
    }, [setEditValue, setEditingField]);

    const saveEditing = useCallback(() => {
        if (!editingField) return;

        // Use functional updater to read current state (avoids race with concurrent rewrites)
        let updatedItemForDb: VerifierItem | null = null;
        setData((prev: VerifierItem[]) => prev.map(item => {
            if (item.id !== editingField.itemId) return item;

            let updatedItem: VerifierItem = { ...item };
            if (editingField.field === VerifierRewriteTarget.MessageAnswer && editingField.messageIndex !== undefined && item.messages) {
                const newMessages = [...item.messages];
                if (newMessages[editingField.messageIndex]) {
                    const targetMessage = newMessages[editingField.messageIndex];
                    const parsed = parseThinkTagsForDisplay(editValue);
                    const isAssistantMessage = targetMessage.role === ChatRole.Assistant;
                    const existingReasoning = sanitizeReasoningContent(extractMessageParts(targetMessage).reasoning);
                    const sanitizedReasoning = sanitizeReasoningContent(parsed.reasoning || '');

                    newMessages[editingField.messageIndex] = {
                        ...targetMessage,
                        content: parsed.hasThinkTags ? parsed.answer : editValue,
                        reasoning_content: isAssistantMessage
                            ? (parsed.hasThinkTags ? sanitizedReasoning : existingReasoning)
                            : targetMessage.reasoning_content
                    };
                }
                updatedItem = { ...item, messages: newMessages };
            } else if (
                editingField.field === OutputFieldName.Query ||
                editingField.field === OutputFieldName.Reasoning ||
                editingField.field === OutputFieldName.Answer
            ) {
                updatedItem = { ...item, [editingField.field]: editValue };
            }
            updatedItem.hasUnsavedChanges = true;
            updatedItemForDb = updatedItem;
            return updatedItem;
        }));

        setEditingField(null);
        setEditValue('');

        if (autoSaveEnabled && dataSource === VerifierDataSource.Database && updatedItemForDb) {
            handleDbUpdate(updatedItemForDb);
        }
    }, [autoSaveEnabled, dataSource, editValue, editingField, handleDbUpdate, setData, setEditValue, setEditingField]);

    return { startEditing, cancelEditing, saveEditing };
}

export default useVerifierInlineEditing;
