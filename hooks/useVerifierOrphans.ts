import { useCallback } from 'react';

import * as FirebaseService from '../services/firebaseService';
import { toast } from '../services/toastService';

interface UseVerifierOrphansOptions {
    setIsCheckingOrphans: (value: boolean) => void;
    setOrphanedLogsInfo: (value: any | null) => void;
    setIsSyncing: (value: boolean) => void;
    setAvailableSessions: (sessions: any[]) => void;
    setOrphanScanProgress: (value: FirebaseService.OrphanScanProgress | null) => void;
    setOrphanSyncProgress: (value: FirebaseService.OrphanSyncProgress | null) => void;
}

export function useVerifierOrphans({
    setIsCheckingOrphans,
    setOrphanedLogsInfo,
    setIsSyncing,
    setAvailableSessions,
    setOrphanScanProgress,
    setOrphanSyncProgress
}: UseVerifierOrphansOptions) {
    const resumeOrphanSyncJobs = useCallback(async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            return;
        }
        // Skip if orphan check ran recently (6h cooldown)
        if (FirebaseService.isOrphanCheckOnCooldown()) {
            return;
        }
        setIsSyncing(true);
        setOrphanSyncProgress(null);
        try {
            const resumed = await FirebaseService.resumeOrphanSyncJobs((progress) => {
                setOrphanSyncProgress(progress);
            });
            if (resumed) {
                FirebaseService.getOrphanedLogsInfo()
                    .then(setOrphanedLogsInfo)
                    .catch(console.error);
            }
        } catch (e: any) {
            toast.error('Resume failed: ' + e.message);
        } finally {
            setOrphanSyncProgress(null);
            setIsSyncing(false);
        }
    }, [setIsSyncing, setOrphanSyncProgress, setOrphanedLogsInfo]);
    const handleCheckOrphans = useCallback(async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
            return;
        }
        setIsCheckingOrphans(true);
        setOrphanScanProgress(null);
        setOrphanedLogsInfo(null);
        try {
            const result = await FirebaseService.getOrphanedLogsInfo((progress) => {
                setOrphanScanProgress(progress);
            });
            setOrphanedLogsInfo(result);
            if (!result.hasOrphanedLogs) {
                toast.success('No orphaned logs found. All logs are synced!');
            } else if (result.isPartialScan) {
                toast.info('Partial scan completed. Results may be incomplete.');
            }
        } catch (e: any) {
            toast.error('Check failed: ' + e.message);
        } finally {
            setOrphanScanProgress(null);
            setIsCheckingOrphans(false);
        }
    }, [setIsCheckingOrphans, setOrphanScanProgress, setOrphanedLogsInfo]);

    const handleSyncOrphanedLogs = useCallback(async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
            return;
        }
        if (await FirebaseService.hasOrphanSyncJobs()) {
            toast.info('Orphan sync is already running.');
            setIsSyncing(true);
            try {
                await FirebaseService.resumeOrphanSyncJobs((progress) => {
                    setOrphanSyncProgress(progress);
                });
            } finally {
                setOrphanSyncProgress(null);
                setIsSyncing(false);
            }
            return;
        }
        setIsSyncing(true);
        setOrphanSyncProgress(null);
        try {
            const result = await FirebaseService.syncOrphanedLogsToSessions((progress) => {
                setOrphanSyncProgress(progress);
            });
            if (result.sessionsCreated === 0) {
                toast.info('No orphaned logs found. All logs are already connected to sessions.');
            } else {
                toast.success(`Created ${result.sessionsCreated} sessions for ${result.logsAssigned} orphaned logs.`);
            }
            if (result.isPartialScan) {
                toast.info('Partial scan completed. Some orphaned sessions may still exist.');
            }
            FirebaseService.getSessionsFromFirebase()
                .then(({ sessions }) => setAvailableSessions(sessions))
                .catch(console.error);
            FirebaseService.getOrphanedLogsInfo()
                .then(setOrphanedLogsInfo)
                .catch(console.error);
        } catch (e: any) {
            toast.error('Sync failed: ' + e.message);
        } finally {
            setOrphanSyncProgress(null);
            setIsSyncing(false);
        }
    }, [setAvailableSessions, setIsSyncing, setOrphanSyncProgress, setOrphanedLogsInfo]);

    return { handleCheckOrphans, handleSyncOrphanedLogs, resumeOrphanSyncJobs };
}

export default useVerifierOrphans;
