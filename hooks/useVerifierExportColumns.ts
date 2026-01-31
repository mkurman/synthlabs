import { useEffect } from 'react';

import type { VerifierItem } from '../types';
import { ExportColumnName } from '../interfaces/enums';

interface UseVerifierExportColumnsOptions {
    data: VerifierItem[];
    setExportColumns: (columns: Record<string, boolean>) => void;
}

export function useVerifierExportColumns({ data, setExportColumns }: UseVerifierExportColumnsOptions) {
    useEffect(() => {
        if (data.length === 0) return;

        const allKeys = new Set<string>();
        const excludeKeys = ['id', 'isDuplicate', 'duplicateGroupId', 'isDiscarded', 'verifiedTimestamp'];
        const defaultChecked = [
            ExportColumnName.Query,
            ExportColumnName.Reasoning,
            ExportColumnName.Answer,
            ExportColumnName.FullSeed,
            ExportColumnName.Score,
            ExportColumnName.ModelUsed,
            ExportColumnName.Source,
            ExportColumnName.Messages
        ];

        data.forEach(item => {
            Object.keys(item).forEach(key => {
                if (!excludeKeys.includes(key)) {
                    allKeys.add(key);
                }
            });
        });

        const defaultCheckedSet = new Set<string>(defaultChecked as string[]);
        const newColumns: Record<string, boolean> = {};
        allKeys.forEach(key => {
            newColumns[key] = defaultCheckedSet.has(key);
        });

        setExportColumns(newColumns);
    }, [data, setExportColumns]);
}

export default useVerifierExportColumns;
