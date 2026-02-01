import { useCallback } from 'react';

import * as FirebaseService from '../services/firebaseService';
import * as HuggingFaceService from '../services/huggingFaceService';
import type { VerifierItem } from '../types';

interface UseVerifierExportActionsOptions {
    data: VerifierItem[];
    exportColumns: Record<string, boolean>;
    setIsUploading: (value: boolean) => void;
    hfToken: string;
    hfRepo: string;
    hfFormat: 'jsonl' | 'parquet';
    toast: { info: (message: string) => void; success: (message: string) => void; error: (message: string) => void };
}

export function useVerifierExportActions({
    data,
    exportColumns,
    setIsUploading,
    hfToken,
    hfRepo,
    hfFormat,
    toast
}: UseVerifierExportActionsOptions) {
    const getExportData = useCallback(() => {
        return data.filter((i: VerifierItem) => !i.isDiscarded).map((item: VerifierItem) => {
            const exportItem: any = {};
            Object.keys(exportColumns).forEach(key => {
                if (exportColumns[key]) {
                    exportItem[key] = (item as any)[key];
                }
            });
            return exportItem;
        });
    }, [data, exportColumns]);

    const handleJsonExport = useCallback(() => {
        const exportData = getExportData();
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `synth_verified_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [getExportData]);

    const handleDbSave = useCallback(async () => {
        setIsUploading(true);
        try {
            const itemsToSave = data.filter((i: VerifierItem) => !i.isDiscarded);
            const count = await FirebaseService.saveFinalDataset(itemsToSave, 'synth_verified');
            toast.success(`Saved ${count} items to 'synth_verified' collection.`);
        } catch (e: any) {
            toast.error('DB Save Failed: ' + e.message);
        } finally {
            setIsUploading(false);
        }
    }, [data, setIsUploading, toast]);

    const handleHfPush = useCallback(async () => {
        if (!hfToken || !hfRepo) {
            toast.info('Please provide HF Token and Repo ID.');
            return;
        }
        setIsUploading(true);
        try {
            const itemsToSave = getExportData();
            const filename = hfFormat === 'parquet' ? 'train.parquet' : 'data.jsonl';
            const url = await HuggingFaceService.uploadToHuggingFace(hfToken, hfRepo, itemsToSave, filename, true, hfFormat);
            toast.success('Successfully pushed to: ' + url);
        } catch (e: any) {
            toast.error('HF Push Failed: ' + e.message);
        } finally {
            setIsUploading(false);
        }
    }, [getExportData, hfFormat, hfRepo, hfToken, setIsUploading, toast]);

    return { getExportData, handleJsonExport, handleDbSave, handleHfPush };
}

export default useVerifierExportActions;
