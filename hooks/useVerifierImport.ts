import { useCallback } from 'react';

import type { VerifierItem } from '../types';
import { parseVerifierItemsFromText } from '../services/verifierFileParseService';
import { VerifierPanelTab } from '../interfaces/enums/VerifierPanelTab';

interface UseVerifierImportOptions {
    setIsImporting: (value: boolean) => void;
    analyzeDuplicates: (items: VerifierItem[]) => void;
    setData: (items: VerifierItem[]) => void;
    setDataSource: (source: 'file' | 'db' | null) => void;
    setActiveTab: (tab: VerifierPanelTab) => void;
    toast: { error: (message: string) => void };
}

export function useVerifierImport({
    setIsImporting,
    analyzeDuplicates,
    setData,
    setDataSource,
    setActiveTab,
    toast
}: UseVerifierImportOptions) {
    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsImporting(true);
        const readers: Promise<VerifierItem[]>[] = [];

        Array.from(files).forEach((file: File) => {
            readers.push(new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (typeof event.target?.result === 'string') {
                        try {
                            const items = parseVerifierItemsFromText(event.target.result);
                            resolve(items);
                            return;
                        } catch (err) {
                            console.error('Failed to parse file', file.name, err);
                        }
                        resolve([]);
                    } else {
                        resolve([]);
                    }
                };
                reader.readAsText(file);
            }));
        });

        Promise.all(readers).then(results => {
            const allItems = results.flat();
            if (allItems.length > 0) {
                analyzeDuplicates(allItems);
                setData(allItems);
                setDataSource('file');
                setActiveTab(VerifierPanelTab.Review);
            } else {
                toast.error('No valid data found in selected files. Please check the format (JSON Array or JSONL).');
            }
            setIsImporting(false);
        });

        e.target.value = '';
    }, [analyzeDuplicates, setActiveTab, setData, setDataSource, setIsImporting, toast]);

    return { handleFileUpload };
}

export default useVerifierImport;
