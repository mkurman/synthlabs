import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

interface UsePauseRefOptions {
    isPaused: boolean;
    isPausedRef: MutableRefObject<boolean>;
}

export function usePauseRef({ isPaused, isPausedRef }: UsePauseRefOptions) {
    useEffect(() => {
        isPausedRef.current = isPaused;
    }, [isPaused, isPausedRef]);
}

export default usePauseRef;
