import { useCallback } from 'react';
import type { SynthLogItem } from '../types';
import { LogFeedRewriteTarget } from '../interfaces/enums/LogFeedRewriteTarget';

interface UseLogFeedInlineEditingOptions {
    editingField: { itemId: string; field: LogFeedRewriteTarget; originalValue: string } | null;
    editValue: string;
    setEditingField: (value: { itemId: string; field: LogFeedRewriteTarget; originalValue: string } | null) => void;
    setEditValue: (value: string) => void;
    onUpdateLog: (id: string, updates: Partial<SynthLogItem>) => void;
}

export function useLogFeedInlineEditing({
    editingField,
    editValue,
    setEditingField,
    setEditValue,
    onUpdateLog
}: UseLogFeedInlineEditingOptions) {
    const startEditing = useCallback((
        itemId: string,
        field: LogFeedRewriteTarget,
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

        onUpdateLog(editingField.itemId, {
            [editingField.field]: editValue
        });

        setEditingField(null);
        setEditValue('');
    }, [editValue, editingField, onUpdateLog, setEditValue, setEditingField]);

    return { startEditing, cancelEditing, saveEditing };
}

export default useLogFeedInlineEditing;
