import { useCallback } from 'react';

import * as FirebaseService from '../services/firebaseService';
import { toast } from '../services/toastService';

interface UseVerifierOrphansOptions {
    setIsCheckingOrphans: (value: boolean) => void;
    setOrphanedLogsInfo: (value: any | null) => void;
    setIsSyncing: (value: boolean) => void;
    setAvailableSessions: (sessions: any[]) => void;
}

export function useVerifierOrphans({ setIsCheckingOrphans, setOrphanedLogsInfo, setIsSyncing, setAvailableSessions }: UseVerifierOrphansOptions) {
    const handleCheckOrphans = useCallback(async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
            return;
        }
        setIsCheckingOrphans(true);
        setOrphanedLogsInfo(null);
        try {
            const result = await FirebaseService.getOrphanedLogsInfo();
            setOrphanedLogsInfo(result);
            if (!result.hasOrphanedLogs) {
                toast.success('No orphaned logs found. All logs are synced!');
            }
        } catch (e: any) {
            toast.error('Check failed: ' + e.message);
        } finally {
            setIsCheckingOrphans(false);
        }
    }, [setIsCheckingOrphans, setOrphanedLogsInfo]);

    const handleSyncOrphanedLogs = useCallback(async () => {
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
            return;
        }
        setIsSyncing(true);
        try {
            const result = await FirebaseService.syncOrphanedLogsToSessions();
            if (result.sessionsCreated === 0) {
                toast.info('No orphaned logs found. All logs are already connected to sessions.');
            } else {
                toast.success(`Created ${result.sessionsCreated} sessions for ${result.logsAssigned} orphaned logs.`);
            }
            FirebaseService.getSessionsFromFirebase()
                .then(setAvailableSessions)
                .catch(console.error);
            FirebaseService.getOrphanedLogsInfo()
                .then(setOrphanedLogsInfo)
                .catch(console.error);
        } catch (e: any) {
            toast.error('Sync failed: ' + e.message);
        } finally {
            setIsSyncing(false);
        }
    }, [setAvailableSessions, setIsSyncing, setOrphanedLogsInfo]);

    return { handleCheckOrphans, handleSyncOrphanedLogs };
}

export default useVerifierOrphans;
