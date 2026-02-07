import { useCallback, useEffect } from 'react';

import * as FirebaseService from '../services/firebaseService';
import { LogStorageService } from '../services/logStorageService';
import { Environment } from '../interfaces/enums';

interface UseDbStatsOptions {
    environment: Environment;
    sessionUid: string;
    setDbStats: (stats: { total: number; session: number }) => void;
}

export function useDbStats({ environment, sessionUid, setDbStats }: UseDbStatsOptions) {
    const updateDbStats = useCallback(async () => {
        if (environment === Environment.Production && FirebaseService.isFirebaseConfigured()) {
            const stats = await FirebaseService.getDbStats(sessionUid);
            setDbStats(stats);
        } else if (environment === Environment.Development) {
            // Get local IndexedDB stats
            const sessionCount = await LogStorageService.getTotalCount(sessionUid);
            const allSessionUids = await LogStorageService.getAllSessionUids();
            let totalCount = 0;
            for (const uid of allSessionUids) {
                totalCount += await LogStorageService.getTotalCount(uid);
            }
            setDbStats({ total: totalCount, session: sessionCount });
        }
    }, [environment, sessionUid, setDbStats]);

    useEffect(() => {
        // Update stats periodically for both environments (every 5 minutes)
        const interval = setInterval(updateDbStats, 5 * 60 * 1000);
        // Also update immediately
        updateDbStats();
        return () => clearInterval(interval);
    }, [updateDbStats]);

    return { updateDbStats };
}

export default useDbStats;
