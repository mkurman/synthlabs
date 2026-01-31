import { useCallback } from 'react';

import type { VerifierItem } from '../types';
import { OutputFieldName, VerifierRewriteTarget } from '../interfaces/enums';

interface UseVerifierInlineEditingOptions {
    editingField: { itemId: string; field: OutputFieldName.Query | OutputFieldName.Reasoning | OutputFieldName.Answer | VerifierRewriteTarget.MessageAnswer; messageIndex?: number; originalValue: string } | null;
    editValue: string;
    setEditingField: (value: { itemId: string; field: OutputFieldName.Query | OutputFieldName.Reasoning | OutputFieldName.Answer | VerifierRewriteTarget.MessageAnswer; messageIndex?: number; originalValue: string } | null) => void;
    setEditValue: (value: string) => void;
    setData: (items: VerifierItem[] | ((prev: VerifierItem[]) => VerifierItem[])) => void;
    autoSaveEnabled: boolean;
    dataSource: 'file' | 'db' | null;
    handleDbUpdate: (item: VerifierItem) => Promise<void>;
}

export function useVerifierInlineEditing({
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

        let updatedItem: VerifierItem | null = null;

        setData((prev: VerifierItem[]) => prev.map(item => {
            if (item.id === editingField.itemId) {
                let newItem = { ...item };
                if (editingField.field === VerifierRewriteTarget.MessageAnswer && editingField.messageIndex !== undefined && item.messages) {
                    const newMessages = [...item.messages];
                    if (newMessages[editingField.messageIndex]) {
                        const thinkMatch = editValue.match(/<think>([\s\S]*?)<\/think>/);
                        const newReasoning = thinkMatch ? thinkMatch[1].trim() : undefined;

                        newMessages[editingField.messageIndex] = {
                            ...newMessages[editingField.messageIndex],
                            content: editValue,
                            reasoning: newReasoning
                        };
                    }
                    newItem = { ...item, messages: newMessages };
                } else if (
                    editingField.field === OutputFieldName.Query ||
                    editingField.field === OutputFieldName.Reasoning ||
                    editingField.field === OutputFieldName.Answer
                ) {
                    newItem = { ...item, [editingField.field]: editValue };
                }

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
    }, [autoSaveEnabled, dataSource, editValue, editingField, handleDbUpdate, setData, setEditValue, setEditingField]);

    return { startEditing, cancelEditing, saveEditing };
}

export default useVerifierInlineEditing;
