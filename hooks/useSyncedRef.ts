import { useEffect, useRef } from 'react';

export function useSyncedRef<T>(value: T) {
    const ref = useRef<T>(value);

    useEffect(() => {
        ref.current = value;
    }, [value]);

    return ref;
}

export default useSyncedRef;
