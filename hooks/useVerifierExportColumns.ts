import { useEffect } from 'react';

import type { VerifierItem } from '../types';

interface UseVerifierExportColumnsOptions {
    data: VerifierItem[];
    setExportColumns: (columns: Record<string, boolean>) => void;
}

export function useVerifierExportColumns({ data, setExportColumns }: UseVerifierExportColumnsOptions) {
    useEffect(() => {
        if (data.length === 0) return;

        const allKeys = new Set<string>();
        const excludeKeys = ['id', 'isDuplicate', 'duplicateGroupId', 'isDiscarded', 'verifiedTimestamp'];
        const defaultChecked = ['query', 'reasoning', 'answer', 'full_seed', 'score', 'modelUsed', 'source', 'messages'];

        data.forEach(item => {
            Object.keys(item).forEach(key => {
                if (!excludeKeys.includes(key)) {
                    allKeys.add(key);
                }
            });
        });

        const newColumns: Record<string, boolean> = {};
        allKeys.forEach(key => {
            newColumns[key] = defaultChecked.includes(key);
        });

        setExportColumns(newColumns);
    }, [data, setExportColumns]);
}

export default useVerifierExportColumns;
