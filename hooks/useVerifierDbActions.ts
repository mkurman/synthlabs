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
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
            return;
        }

        setItemStates(prev => ({ ...prev, [item.id]: 'saving' }));

        try {
            await FirebaseService.updateLogItem(item.id, {
                query: item.query,
                reasoning: item.reasoning,
                answer: item.answer
            });
            setData(prev => prev.map(i => i.id === item.id ? { ...i, hasUnsavedChanges: false } : i));
            setItemStates(prev => ({ ...prev, [item.id]: 'saved' }));
            setTimeout(() => {
                setItemStates(prev => ({ ...prev, [item.id]: 'idle' }));
            }, 10000);
        } catch (e: any) {
            console.error('Failed to update item:', e);
            toast.error('Update failed: ' + e.message);
            setItemStates(prev => ({ ...prev, [item.id]: 'idle' }));
        }
    }, [setData, setItemStates, toast]);

    const handleDbRollback = useCallback(async (item: VerifierItem) => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
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
