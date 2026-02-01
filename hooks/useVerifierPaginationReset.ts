import { useEffect } from 'react';

interface UseVerifierPaginationResetOptions {
    showDuplicatesOnly: boolean;
    filterScore: number | null;
    showUnsavedOnly: boolean;
    dataLength: number;
    setCurrentPage: (page: number) => void;
}

export function useVerifierPaginationReset({
    showDuplicatesOnly,
    filterScore,
    showUnsavedOnly,
    dataLength,
    setCurrentPage
}: UseVerifierPaginationResetOptions) {
    useEffect(() => {
        setCurrentPage(1);
    }, [showDuplicatesOnly, filterScore, showUnsavedOnly, dataLength, setCurrentPage]);
}

export default useVerifierPaginationReset;
