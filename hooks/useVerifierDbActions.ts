import { useCallback } from 'react';

import * as FirebaseService from '../services/firebaseService';
import type { VerifierItem } from '../types';

interface UseVerifierDbActionsOptions {
    setItemStates: (states: Record<string, 'idle' | 'saving' | 'saved'> | ((prev: Record<string, 'idle' | 'saving' | 'saved'>) => Record<string, 'idle' | 'saving' | 'saved'>)) => void;
    setData: (items: VerifierItem[] | ((prev: VerifierItem[]) => VerifierItem[])) => void;
    toast: { info: (message: string) => void; success: (message: string) => void; error: (message: string) => void };
}

export function useVerifierDbActions({ setItemStates, setData, toast }: UseVerifierDbActionsOptions) {
    const handleDbUpdate = useCallback(async (item: VerifierItem) => {
        if (!FirebaseService.isDbEnabled()) {
            toast.error('DB backend not configured.');
            return;
        }

        setItemStates(prev => ({ ...prev, [item.id]: 'saving' }));

        // Optimistically clear hasUnsavedChanges before async save.
        // If a concurrent edit happens during the save, it will re-set this to true,
        // allowing the post-save guard to detect it and preserve newer local state.
        setData(prev => prev.map(i =>
            i.id === item.id ? { ...i, hasUnsavedChanges: false } : i
        ));

        try {
            const isMultiTurnItem = Array.isArray(item.messages) && item.messages.length > 0;
            const updates = isMultiTurnItem
                ? {
                    query: item.query,
                    messages: item.messages,
                    isMultiTurn: true,
                    score: item.score,
                    isDuplicate: item.isDuplicate,
                    isDiscarded: item.isDiscarded
                }
                : {
                    query: item.query,
                    reasoning: item.reasoning,
                    reasoning_content: item.reasoning_content || item.reasoning,
                    answer: item.answer,
                    score: item.score,
                    isDuplicate: item.isDuplicate,
                    isDiscarded: item.isDiscarded
                };

            const updatedFromDb = await FirebaseService.updateLogItem(item.id, updates);
            setData(prev => prev.map(i => {
                if (i.id !== item.id) return i;
                // If the item was modified again while we were saving,
                // don't overwrite with DB data — those newer changes need their own save
                if (i.hasUnsavedChanges) return i;
                if (!updatedFromDb) {
                    return { ...i, hasUnsavedChanges: false };
                }
                return {
                    ...updatedFromDb,
                    isDuplicate: i.isDuplicate,
                    duplicateGroupId: i.duplicateGroupId,
                    isDiscarded: i.isDiscarded,
                    hasUnsavedChanges: false
                };
            }));
            setItemStates(prev => ({ ...prev, [item.id]: 'saved' }));
            setTimeout(() => {
                setItemStates(prev => ({ ...prev, [item.id]: 'idle' }));
            }, 10000);
        } catch (e: any) {
            console.error('Failed to update item:', e);
            toast.error('Update failed: ' + e.message);
            // Restore unsaved flag on failure since the save didn't persist
            setData(prev => prev.map(i =>
                i.id === item.id ? { ...i, hasUnsavedChanges: true } : i
            ));
            setItemStates(prev => ({ ...prev, [item.id]: 'idle' }));
        }
    }, [setData, setItemStates, toast]);

    const handleDbRollback = useCallback(async (item: VerifierItem) => {
        if (!FirebaseService.isDbEnabled()) {
            toast.error('DB backend not configured.');
            return;
        }

        toast.info('Rolling back from DB...');

        try {
            const freshItem = await FirebaseService.fetchLogItem(item.id);
            if (freshItem) {
                const restoredItem = {
                    ...freshItem,
                    isDuplicate: item.isDuplicate,
                    duplicateGroupId: item.duplicateGroupId,
                    hasUnsavedChanges: false
                };

                setData((prev: VerifierItem[]) => prev.map(i => i.id === item.id ? restoredItem : i));
                toast.success('Changes reverted to DB version.');
            } else {
                toast.error('Item not found in DB.');
            }
        } catch (e: any) {
            console.error('Failed to rollback item:', e);
            toast.error('Rollback failed: ' + e.message);
        }
    }, [setData, toast]);

    return { handleDbUpdate, handleDbRollback };
}

export default useVerifierDbActions;
