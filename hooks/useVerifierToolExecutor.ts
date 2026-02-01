import { useEffect, useRef } from 'react';

import { ToolExecutor } from '../services/toolService';
import type { VerifierItem } from '../types';

interface UseVerifierToolExecutorOptions {
    data: VerifierItem[];
    setData: (data: VerifierItem[]) => void;
    autoSaveEnabled: boolean;
    handleFetchMore: (start: number, end: number) => Promise<void>;
    handleDbUpdate: (item: VerifierItem) => Promise<void>;
    toolExecutorRef: React.MutableRefObject<ToolExecutor | null>;
}

export function useVerifierToolExecutor({
    data,
    setData,
    autoSaveEnabled,
    handleFetchMore,
    handleDbUpdate,
    toolExecutorRef
}: UseVerifierToolExecutorOptions) {
    const dataRef = useRef(data);
    const setDataRef = useRef(setData);
    const fetchMoreRef = useRef(handleFetchMore);
    const autoSaveEnabledRef = useRef(autoSaveEnabled);
    const handleDbUpdateRef = useRef(handleDbUpdate);

    useEffect(() => {
        dataRef.current = data;
        setDataRef.current = setData;
    }, [data, setData]);

    useEffect(() => {
        fetchMoreRef.current = handleFetchMore;
        autoSaveEnabledRef.current = autoSaveEnabled;
        handleDbUpdateRef.current = handleDbUpdate;
    }, [autoSaveEnabled, handleDbUpdate, handleFetchMore]);

    useEffect(() => {
        if (!toolExecutorRef.current) {
            toolExecutorRef.current = new ToolExecutor(() => ({
                data: dataRef.current,
                setData: setDataRef.current,
                autoSaveEnabled: autoSaveEnabledRef.current,
                handleDbUpdate: handleDbUpdateRef.current,
                fetchMoreFromDb: async (start: number, end: number) => {
                    if (fetchMoreRef.current) {
                        return fetchMoreRef.current(start, end);
                    }
                    throw new Error('Fetch handler not ready');
                }
            }));
        }
    }, [toolExecutorRef]);
}

export default useVerifierToolExecutor;
