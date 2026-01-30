import React from 'react';
import { HFPrefetchManager } from '../../services/hfPrefetchService';
import { StreamingConversationState } from '../../types';

export interface GenerationRefs {
    abortControllerRef: React.MutableRefObject<AbortController | null>;
    prefetchManagerRef: React.MutableRefObject<HFPrefetchManager | null>;
    sessionUidRef: React.MutableRefObject<string>;
    sessionNameRef: React.MutableRefObject<string | null>;
    environmentRef: React.MutableRefObject<'development' | 'production'>;
    isPausedRef: React.MutableRefObject<boolean>;
    
    // Streaming refs
    streamingConversationsRef: React.MutableRefObject<Map<string, StreamingConversationState>>;
    streamingAbortControllersRef: React.MutableRefObject<Map<string, AbortController>>;
    haltedStreamingIdsRef: React.MutableRefObject<Set<string>>;
}
