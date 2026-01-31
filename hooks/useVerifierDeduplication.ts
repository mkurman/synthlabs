import { useCallback } from 'react';

import type { VerifierItem } from '../types';

interface UseVerifierDeduplicationOptions {
    data: VerifierItem[];
    setData: (items: VerifierItem[] | ((prev: VerifierItem[]) => VerifierItem[])) => void;
}

export function useVerifierDeduplication({ data, setData }: UseVerifierDeduplicationOptions) {
    const analyzeDuplicates = useCallback((items: VerifierItem[]) => {
        const map = new Map<string, string[]>();

        items.forEach(i => {
            i.isDuplicate = false;
            i.duplicateGroupId = undefined;
        });

        items.forEach(item => {
            if (item.isDiscarded) return;
            const key = (item.query || item.full_seed || '').trim().toLowerCase();
            if (!map.has(key)) map.set(key, []);
            map.get(key)?.push(item.id);
        });

        map.forEach((ids) => {
            if (ids.length > 1) {
                const groupId = crypto.randomUUID();
                ids.forEach(id => {
                    const item = items.find(i => i.id === id);
                    if (item) {
                        item.isDuplicate = true;
                        item.duplicateGroupId = groupId;
                    }
                });
            }
        });
    }, []);

    const handleReScan = useCallback(() => {
        setData((prev: VerifierItem[]) => {
            const next = prev.map(i => ({ ...i }));
            analyzeDuplicates(next);

            if (next.length === prev.length) {
                for (let i = 0; i < next.length; i++) {
                    if (next[i].isDuplicate !== prev[i].isDuplicate || next[i].duplicateGroupId !== prev[i].duplicateGroupId) {
                        next[i].hasUnsavedChanges = true;
                    }
                }
            }

            return next;
        });
    }, [analyzeDuplicates, setData]);

    const toggleDuplicateStatus = useCallback((id: string) => {
        setData((prev: VerifierItem[]) => prev.map(item => {
            if (item.id === id) {
                return { ...item, isDuplicate: !item.isDuplicate, hasUnsavedChanges: true };
            }
            return item;
        }));
    }, [setData]);

    const autoResolveDuplicates = useCallback(() => {
        const groups = new Map<string, VerifierItem[]>();

        data.filter((i: VerifierItem) => i.isDuplicate && !i.isDiscarded).forEach((i: VerifierItem) => {
            if (i.duplicateGroupId) {
                if (!groups.has(i.duplicateGroupId)) groups.set(i.duplicateGroupId, []);
                groups.get(i.duplicateGroupId)?.push(i);
            }
        });

        const idsToDiscard = new Set<string>();

        groups.forEach((groupItems) => {
            groupItems.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return (b.answer?.length || 0) - (a.answer?.length || 0);
            });

            for (let i = 1; i < groupItems.length; i++) {
                idsToDiscard.add(groupItems[i].id);
            }
        });

        setData((prev: VerifierItem[]) => prev.map(item =>
            idsToDiscard.has(item.id)
                ? { ...item, isDiscarded: true, hasUnsavedChanges: true }
                : item
        ));
    }, [data, setData]);

    return {
        analyzeDuplicates,
        handleReScan,
        toggleDuplicateStatus,
        autoResolveDuplicates
    };
}

export default useVerifierDeduplication;
