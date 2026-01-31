import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ProgressStats } from '../types';

interface UseSparklineHistoryOptions {
    isRunning: boolean;
    progress: ProgressStats;
    setSparklineHistory: Dispatch<SetStateAction<number[]>>;
}

export function useSparklineHistory({ isRunning, progress, setSparklineHistory }: UseSparklineHistoryOptions) {
    useEffect(() => {
        if (isRunning && progress.current > 0) {
            setSparklineHistory(prev => {
                const next = [...prev, progress.current];
                if (next.length > 20) return next.slice(next.length - 20);
                return next;
            });
        }
    }, [isRunning, progress.current, setSparklineHistory]);
}

export default useSparklineHistory;
