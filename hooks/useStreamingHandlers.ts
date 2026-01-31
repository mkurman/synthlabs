import { useCallback } from 'react';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';

interface UseStreamingHandlersOptions {
    setStreamingConversationsVersion: Dispatch<SetStateAction<number>>;
    streamUpdateThrottleRef: MutableRefObject<number>;
    haltedStreamingIdsRef: MutableRefObject<Set<string>>;
    streamingAbortControllersRef: MutableRefObject<Map<string, AbortController>>;
    streamingConversationsRef: MutableRefObject<Map<string, any>>;
}

export function useStreamingHandlers({
    setStreamingConversationsVersion,
    streamUpdateThrottleRef,
    haltedStreamingIdsRef,
    streamingAbortControllersRef,
    streamingConversationsRef
}: UseStreamingHandlersOptions) {
    const bumpStreamingConversations = useCallback(() => {
        setStreamingConversationsVersion(prev => prev + 1);
    }, [setStreamingConversationsVersion]);

    const scheduleStreamingUpdate = useCallback(() => {
        const now = Date.now();
        if (now - streamUpdateThrottleRef.current > 50) {
            streamUpdateThrottleRef.current = now;
            bumpStreamingConversations();
        }
    }, [bumpStreamingConversations, streamUpdateThrottleRef]);

    const haltStreamingItem = useCallback((id: string) => {
        haltedStreamingIdsRef.current.add(id);
        const controller = streamingAbortControllersRef.current.get(id);
        if (controller) {
            controller.abort();
        }
        streamingAbortControllersRef.current.delete(id);
        streamingConversationsRef.current.delete(id);
        bumpStreamingConversations();
    }, [bumpStreamingConversations, haltedStreamingIdsRef, streamingAbortControllersRef, streamingConversationsRef]);

    return {
        bumpStreamingConversations,
        scheduleStreamingUpdate,
        haltStreamingItem
    };
}

export default useStreamingHandlers;
