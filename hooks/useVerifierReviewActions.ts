import { useCallback } from 'react';

import type { VerifierItem } from '../types';

interface UseVerifierReviewActionsOptions {
    setData: (items: VerifierItem[] | ((prev: VerifierItem[]) => VerifierItem[])) => void;
}

export function useVerifierReviewActions({ setData }: UseVerifierReviewActionsOptions) {
    const setScore = useCallback((id: string, score: number) => {
        setData((prev: VerifierItem[]) => prev.map(i => i.id === id ? { ...i, score, hasUnsavedChanges: true } : i));
    }, [setData]);

    const toggleDiscard = useCallback((id: string) => {
        setData((prev: VerifierItem[]) => prev.map(i => i.id === id ? { ...i, isDiscarded: !i.isDiscarded, hasUnsavedChanges: true } : i));
    }, [setData]);

    return { setScore, toggleDiscard };
}

export default useVerifierReviewActions;
