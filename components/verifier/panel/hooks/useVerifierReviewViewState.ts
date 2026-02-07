import { useCallback, useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import * as FirebaseService from '../../../../services/firebaseService';
import { normalizeImportItem } from '../../../../services/verifierImportService';
import { VerifierDataSource } from '../../../../interfaces/enums/VerifierDataSource';
import { VerifierPanelTab } from '../../../../interfaces/enums/VerifierPanelTab';
import type { VerifierItem } from '../../../../types';

interface UseVerifierReviewViewStateOptions {
    data: VerifierItem[];
    setData: Dispatch<SetStateAction<VerifierItem[]>>;
    showDuplicatesOnly: boolean;
    showUnsavedOnly: boolean;
    filterScore: number | null;
    pageSize: number;
    currentPage: number;
    setCurrentPage: Dispatch<SetStateAction<number>>;
    analyzeDuplicates: (items: VerifierItem[]) => void;
    setIsRefreshing: Dispatch<SetStateAction<boolean>>;
    refreshTrigger?: number;
    dataSource: VerifierDataSource | null;
    activeTab: VerifierPanelTab;
    isDetailOpen: boolean;
    focusedItemIndex: number;
    setFocusedItemIndex: Dispatch<SetStateAction<number>>;
    itemRefs: MutableRefObject<Record<string, HTMLDivElement>>;
    toggleSelection: (id: string) => void;
    toggleItemExpand: (id: string) => void;
    openDetailPanel: (item: VerifierItem) => void;
    toast: { success: (message: string) => void; error: (message: string) => void };
}

interface UseVerifierReviewViewStateResult {
    filteredData: VerifierItem[];
    totalPages: number;
    currentItems: VerifierItem[];
    handleRefreshCurrentPage: () => Promise<void>;
}

export function useVerifierReviewViewState({
    data,
    setData,
    showDuplicatesOnly,
    showUnsavedOnly,
    filterScore,
    pageSize,
    currentPage,
    setCurrentPage,
    analyzeDuplicates,
    setIsRefreshing,
    refreshTrigger,
    dataSource,
    activeTab,
    isDetailOpen,
    focusedItemIndex,
    setFocusedItemIndex,
    itemRefs,
    toggleSelection,
    toggleItemExpand,
    openDetailPanel,
    toast
}: UseVerifierReviewViewStateOptions): UseVerifierReviewViewStateResult {
    const filteredData = useMemo(() => {
        return data.filter(item => {
            if (item.isDiscarded && !(showUnsavedOnly && item.hasUnsavedChanges)) return false;
            if (showUnsavedOnly && !item.hasUnsavedChanges) return false;
            if (showDuplicatesOnly && !item.isDuplicate) return false;
            if (filterScore !== null && item.score !== filterScore) return false;
            return true;
        });
    }, [data, showDuplicatesOnly, filterScore, showUnsavedOnly]);

    const totalPages = Math.ceil(filteredData.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const currentItems = filteredData.slice(startIndex, startIndex + pageSize);

    const handleRefreshCurrentPage = useCallback(async () => {
        if (!FirebaseService.isFirebaseConfigured() || currentItems.length === 0) return;
        setIsRefreshing(true);
        try {
            const updated = [...data];
            let refreshedCount = 0;
            for (const item of currentItems) {
                if (!item.id) continue;
                const fresh = await FirebaseService.fetchLogItem(item.id);
                if (fresh) {
                    const idx = updated.findIndex(d => d.id === item.id);
                    if (idx !== -1) {
                        updated[idx] = normalizeImportItem(fresh);
                        refreshedCount++;
                    }
                }
            }
            setData(updated);
            analyzeDuplicates(updated);
            toast.success(`Refreshed ${refreshedCount} items from database`);
        } catch (e: any) {
            toast.error('Refresh failed: ' + e.message);
        } finally {
            setIsRefreshing(false);
        }
    }, [analyzeDuplicates, currentItems, data, setData, setIsRefreshing, toast]);

    useEffect(() => {
        if (refreshTrigger && refreshTrigger > 0 && dataSource === VerifierDataSource.Database) {
            handleRefreshCurrentPage();
        }
    }, [dataSource, handleRefreshCurrentPage, refreshTrigger]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (activeTab !== VerifierPanelTab.Review) return;
            if (isDetailOpen) return;

            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setFocusedItemIndex(prev => {
                        const next = Math.min(prev + 1, currentItems.length - 1);
                        const item = currentItems[next];
                        if (item && itemRefs.current[item.id]) {
                            itemRefs.current[item.id].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                        return next;
                    });
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setFocusedItemIndex(prev => {
                        const next = Math.max(prev - 1, 0);
                        const item = currentItems[next];
                        if (item && itemRefs.current[item.id]) {
                            itemRefs.current[item.id].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                        return next;
                    });
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (focusedItemIndex >= 0 && currentItems[focusedItemIndex]) {
                        openDetailPanel(currentItems[focusedItemIndex]);
                    }
                    break;
                case 'e':
                case 'E':
                    e.preventDefault();
                    if (focusedItemIndex >= 0 && currentItems[focusedItemIndex]) {
                        const item = currentItems[focusedItemIndex];
                        toggleItemExpand(item.id);
                    }
                    break;
                case ' ':
                    e.preventDefault();
                    if (focusedItemIndex >= 0 && currentItems[focusedItemIndex]) {
                        const item = currentItems[focusedItemIndex];
                        toggleSelection(item.id);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        activeTab,
        currentItems,
        focusedItemIndex,
        isDetailOpen,
        itemRefs,
        openDetailPanel,
        setFocusedItemIndex,
        toggleItemExpand,
        toggleSelection
    ]);

    useEffect(() => {
        if (currentPage > 1 && currentItems.length === 0 && filteredData.length > 0) {
            setCurrentPage(Math.max(1, currentPage - 1));
        }
    }, [currentItems.length, currentPage, filteredData.length, setCurrentPage]);

    return {
        filteredData,
        totalPages,
        currentItems,
        handleRefreshCurrentPage
    };
}

export default useVerifierReviewViewState;
