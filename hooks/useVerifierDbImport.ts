import { useCallback } from 'react';

import * as FirebaseService from '../services/firebaseService';
import { resolveSessionFilter } from '../services/verifierSessionFilterService';
import type { VerifierItem } from '../types';
import { VerifierPanelTab } from '../interfaces/enums/VerifierPanelTab';

interface UseVerifierDbImportOptions {
    currentSessionUid: string;
    selectedSessionFilter: string;
    customSessionId: string;
    isLimitEnabled: boolean;
    importLimit: number;
    data: VerifierItem[];
    setIsImporting: (value: boolean) => void;
    analyzeDuplicates: (items: VerifierItem[]) => void;
    setData: (items: VerifierItem[]) => void;
    setDataSource: (source: 'file' | 'db' | null) => void;
    setActiveTab: (tab: VerifierPanelTab) => void;
    toast: { error: (message: string) => void; info: (message: string) => void };
}

export function useVerifierDbImport({
    currentSessionUid,
    selectedSessionFilter,
    customSessionId,
    isLimitEnabled,
    importLimit,
    data,
    setIsImporting,
    analyzeDuplicates,
    setData,
    setDataSource,
    setActiveTab,
    toast
}: UseVerifierDbImportOptions) {
    const handleDbImport = useCallback(async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
            return;
        }
        setIsImporting(true);
        try {
            const limitToUse = isLimitEnabled ? importLimit : undefined;
            const { sessionUid, requiresCustom } = resolveSessionFilter(
                selectedSessionFilter,
                currentSessionUid,
                customSessionId
            );
            if (requiresCustom && !sessionUid) {
                toast.info('Please enter a Session ID.');
                setIsImporting(false);
                return;
            }

            const items = await FirebaseService.fetchAllLogs(limitToUse, sessionUid);
            if (items.length === 0) {
                toast.info('No items found matching criteria.');
            } else {
                analyzeDuplicates(items);
                setData(items);
                setDataSource('db');
                setActiveTab(VerifierPanelTab.Review);
            }
        } catch (e: any) {
            toast.error('Import failed: ' + e.message);
        } finally {
            setIsImporting(false);
        }
    }, [analyzeDuplicates, currentSessionUid, customSessionId, importLimit, isLimitEnabled, selectedSessionFilter, setActiveTab, setData, setDataSource, setIsImporting, toast]);

    const handleFetchMore = useCallback(async (start: number, end: number) => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
            return;
        }

        setIsImporting(true);
        try {
            const lastItem = data[data.length - 1];
            const lastDoc = lastItem?._doc;

            const { sessionUid } = resolveSessionFilter(
                selectedSessionFilter,
                currentSessionUid,
                customSessionId
            );

            const limitToFetch = (end && start) ? (end - start) : (importLimit || 100);

            const newItems = await FirebaseService.fetchLogsAfter({
                limitCount: limitToFetch,
                sessionUid,
                lastDoc
            });

            if (newItems.length === 0) {
                toast.info('No more items to fetch.');
                return;
            }

            analyzeDuplicates([...data, ...newItems]);
            setData([...data, ...newItems]);
        } catch (e: any) {
            toast.error('Fetch failed: ' + e.message);
        } finally {
            setIsImporting(false);
        }
    }, [analyzeDuplicates, currentSessionUid, customSessionId, data, importLimit, selectedSessionFilter, setData, setIsImporting, toast]);

    return { handleDbImport, handleFetchMore };
}

export default useVerifierDbImport;
