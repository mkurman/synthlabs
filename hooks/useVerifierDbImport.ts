import { useCallback } from 'react';

import * as FirebaseService from '../services/firebaseService';
import { resolveSessionFilter } from '../services/verifierSessionFilterService';
import type { VerifierItem } from '../types';
import { VerifierPanelTab } from '../interfaces/enums/VerifierPanelTab';
import { VerifierDataSource } from '../interfaces/enums/VerifierDataSource';

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
    setDataSource: (source: VerifierDataSource | null) => void;
    setActiveTab: (tab: VerifierPanelTab) => void;
    toast: { error: (message: string) => void; info: (message: string) => void };
    confirmService: { confirm: (options: { title: string; message: string; confirmLabel: string; cancelLabel: string; variant: 'info' | 'warning' | 'danger' }) => Promise<boolean> };
    onSessionDeleted: (sessionId: string) => void;
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
    toast,
    confirmService,
    onSessionDeleted
}: UseVerifierDbImportOptions) {
    const handleDbImport = useCallback(async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
            return;
        }
        setIsImporting(true);
        try {
            const limitToUse = isLimitEnabled ? importLimit : 100;
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

            const items = await FirebaseService.fetchAllLogs(limitToUse, sessionUid, true);
            if (items.length === 0) {
                toast.info('No items found matching criteria.');
                if (sessionUid) {
                    const shouldDelete = await confirmService.confirm({
                        title: 'Empty session found',
                        message: 'This session has 0 rows. Do you want to delete the session and its logs?',
                        confirmLabel: 'Delete Session',
                        cancelLabel: 'Keep',
                        variant: 'danger'
                    });
                    if (shouldDelete) {
                        await FirebaseService.deleteSessionWithLogs(sessionUid);
                        onSessionDeleted(sessionUid);
                        toast.info('Empty session deleted.');
                    }
                }
            } else {
                analyzeDuplicates(items);
                setData(items);
                setDataSource(VerifierDataSource.Database);
                setActiveTab(VerifierPanelTab.Review);
            }
        } catch (e: any) {
            toast.error('Import failed: ' + e.message);
        } finally {
            setIsImporting(false);
        }
    }, [analyzeDuplicates, confirmService, currentSessionUid, customSessionId, importLimit, isLimitEnabled, onSessionDeleted, selectedSessionFilter, setActiveTab, setData, setDataSource, setIsImporting, toast]);

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
            const offsetToFetch = start > 0 ? start : data.length;

            const newItems = await FirebaseService.fetchLogsAfter({
                limitCount: limitToFetch,
                sessionUid,
                offsetCount: offsetToFetch,
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
