import { SynthLogItem } from '../../types';
import * as FirebaseService from '../firebaseService';
import { LogStorageService } from '../logStorageService';
import { confirmService } from '../confirmService';
import { toast } from '../toastService';
import { logger } from '../../utils/logger';
import { Environment } from '../../interfaces/enums';

/**
 * Retry a single failed item.
 */
export async function retryItem(
    id: string,
    sessionUid: string,
    environment: string,
    visibleLogs: SynthLogItem[],
    generateSingleItem: (inputText: string, workerId: number, opts: any) => Promise<SynthLogItem | null>,
    setRetryingIds: (fn: (prev: Set<string>) => Set<string>) => void,
    refreshLogs: () => void,
    updateDbStats: () => void
): Promise<void> {
    const logItem = visibleLogs.find(l => l.id === id);
    if (!logItem) return;

    setRetryingIds(prev => new Set(prev).add(id));
    try {
        const result = await generateSingleItem(logItem.full_seed, 0, { retryId: id });
        if (result) {
            // Save to Firebase in production
            if (environment === Environment.Production && !result.isError) {
                try {
                    await FirebaseService.saveLogToFirebase(result);
                    updateDbStats();
                } catch (saveErr: any) {
                    console.error("Firebase Sync Error on Retry", saveErr);
                    result.storageError = saveErr.message || "Save failed";
                }
            }

            // Update Local Storage
            await LogStorageService.updateLog(sessionUid, result);
            refreshLogs();
        }
    } catch (e) {
        console.error("Retry failed for item", id, e);
    } finally {
        setRetryingIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }
}

/**
 * Retry saving a single item to Firebase.
 */
export async function retrySave(
    id: string,
    sessionUid: string,
    visibleLogs: SynthLogItem[],
    setRetryingIds: (fn: (prev: Set<string>) => Set<string>) => void,
    refreshLogs: () => void,
    updateDbStats: () => void
): Promise<void> {
    const logItem = visibleLogs.find(l => l.id === id);
    if (!logItem) return;

    setRetryingIds(prev => new Set(prev).add(id));
    try {
        await FirebaseService.saveLogToFirebase(logItem);
        const updated = { ...logItem, storageError: undefined };
        await LogStorageService.updateLog(sessionUid, updated);
        refreshLogs();
        updateDbStats();
    } catch (e: any) {
        console.error("Retry Save Failed", e);
        const updated = { ...logItem, storageError: e.message || "Retry save failed" };
        await LogStorageService.updateLog(sessionUid, updated);
        refreshLogs();
    } finally {
        setRetryingIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }
}

/**
 * Retry all failed items with concurrency control.
 */
export async function retryAllFailed(
    sessionUid: string,
    environment: string,
    concurrency: number,
    visibleLogs: SynthLogItem[],
    isInvalidLog: (log: SynthLogItem) => boolean,
    setRetryingIds: (fn: (prev: Set<string>) => Set<string>) => void,
    generateSingleItem: (inputText: string, workerId: number, opts: any) => Promise<SynthLogItem | null>,
    refreshLogs: () => void
): Promise<void> {
    const failedItems = visibleLogs.filter((l: SynthLogItem) => isInvalidLog(l));
    if (failedItems.length === 0) return;

    const failedIds = failedItems.map((l: SynthLogItem) => l.id);
    setRetryingIds(prev => new Set([...prev, ...failedIds]));

    const queue = [...failedItems];
    let activeWorkers = 0;

    const processQueue = async () => {
        while (queue.length > 0) {
            if (activeWorkers >= concurrency) {
                await new Promise(r => setTimeout(r, 100));
                continue;
            }
            const item = queue.shift();
            if (!item) break;
            activeWorkers++;

            generateSingleItem(item.full_seed, 0, { retryId: item.id })
                .then(async (result) => {
                    activeWorkers--;
                    if (result) {
                        if (environment === Environment.Production && !result.isError) {
                            try {
                                await FirebaseService.saveLogToFirebase(result);
                                result.savedToDb = true;
                            } catch (e) { }
                        }
                        LogStorageService.updateLog(sessionUid, result);
                        refreshLogs();
                    }
                })
                .catch(() => { activeWorkers--; });
        }
    };

    processQueue();
}

/**
 * Sync all unsaved items to Firebase.
 */
export async function syncAllUnsavedToDb(
    sessionUid: string,
    isInvalidLog: (log: SynthLogItem) => boolean,
    refreshLogs: () => void,
    updateDbStats: () => void
): Promise<void> {
    if (!FirebaseService.isFirebaseConfigured()) {
        await confirmService.alert({
            title: 'Firebase not configured',
            message: 'Please configure Firebase in Settings to enable cloud sync.',
            variant: 'warning'
        });
        return;
    }

    const allLogs = await LogStorageService.getAllLogs(sessionUid);
    const unsavedLogs = allLogs.filter((l: SynthLogItem) => !l.savedToDb && !isInvalidLog(l));

    if (unsavedLogs.length === 0) {
        await confirmService.alert({
            title: 'Nothing to sync',
            message: 'No unsaved items to sync.',
            variant: 'info'
        });
        return;
    }

    const confirmSync = await confirmService.confirm({
        title: 'Sync unsaved items?',
        message: `Sync ${unsavedLogs.length} unsaved items to Firebase?`,
        confirmLabel: 'Sync',
        cancelLabel: 'Cancel',
        variant: 'warning'
    });

    if (!confirmSync) return;

    let synced = 0;
    let failed = 0;

    for (const log of unsavedLogs) {
        try {
            const logToSave = { ...log, sessionUid: sessionUid };
            await FirebaseService.saveLogToFirebase(logToSave);
            log.savedToDb = true;
            log.sessionUid = sessionUid;
            await LogStorageService.updateLog(sessionUid, log);
            synced++;
        } catch (e: any) {
            logger.warn(`Failed to sync item ${log.id}:`, e);
            failed++;
        }
    }

    updateDbStats();
    refreshLogs();

    await confirmService.alert({
        title: 'Sync complete',
        message: `Synced ${synced} items to Firebase.${failed > 0 ? ` ${failed} failed.` : ''}`,
        variant: failed > 0 ? 'warning' : 'info'
    });
}

/**
 * Save a single item to Firebase.
 */
export async function saveItemToDb(
    id: string,
    sessionUid: string,
    visibleLogs: SynthLogItem[],
    refreshLogs: () => void,
    updateDbStats: () => void
): Promise<void> {
    if (!FirebaseService.isFirebaseConfigured()) {
        await confirmService.alert({
            title: 'Firebase not configured',
            message: 'Please configure Firebase in Settings to enable cloud sync.',
            variant: 'warning'
        });
        return;
    }

    const logItem = visibleLogs.find(l => l.id === id);
    if (!logItem) return;

    try {
        const logToSave = { ...logItem, sessionUid: sessionUid };
        await FirebaseService.saveLogToFirebase(logToSave);
        const updated = { ...logItem, savedToDb: true, sessionUid: sessionUid };
        await LogStorageService.updateLog(sessionUid, updated);
        refreshLogs();
        updateDbStats();
        toast.success('Saved to Firebase');
    } catch (e: any) {
        console.error("Save to Firebase Failed", e);
        const updated = { ...logItem, storageError: e.message || "Save failed" };
        await LogStorageService.updateLog(sessionUid, updated);
        refreshLogs();
        toast.error(`Save failed: ${e.message}`);
    }
}
