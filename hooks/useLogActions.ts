import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

import * as FirebaseService from '../services/firebaseService';
import { Environment } from '../interfaces/enums';
import type { SynthLogItem, StreamingConversationState } from '../types';

interface UseLogActionsOptions {
    environment: Environment;
    visibleLogs: SynthLogItem[];
    streamingConversationsRef: MutableRefObject<Map<string, StreamingConversationState>>;
    bumpStreamingConversations: () => void;
    handleDeleteLogFromLogs: (id: string) => Promise<void>;
    updateDbStats: () => void;
}

export function useLogActions({
    environment,
    visibleLogs,
    streamingConversationsRef,
    bumpStreamingConversations,
    handleDeleteLogFromLogs,
    updateDbStats
}: UseLogActionsOptions) {
    const handleDeleteLog = useCallback(async (id: string) => {
        if (streamingConversationsRef.current.has(id)) {
            streamingConversationsRef.current.delete(id);
            bumpStreamingConversations();
        }

        const logItem = visibleLogs.find(l => l.id === id);
        await handleDeleteLogFromLogs(id);

        if (environment === Environment.Production && FirebaseService.isFirebaseConfigured() && logItem?.savedToDb) {
            updateDbStats();
        }
    }, [bumpStreamingConversations, environment, handleDeleteLogFromLogs, streamingConversationsRef, updateDbStats, visibleLogs]);

    return { handleDeleteLog };
}

export default useLogActions;
