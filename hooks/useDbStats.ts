import { useCallback, useEffect } from 'react';

import * as FirebaseService from '../services/firebaseService';
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
        }
    }, [environment, sessionUid, setDbStats]);

    useEffect(() => {
        if (environment === Environment.Production) {
            const interval = setInterval(updateDbStats, 10000);
            return () => clearInterval(interval);
        }
        return undefined;
    }, [environment, updateDbStats]);

    return { updateDbStats };
}

export default useDbStats;
