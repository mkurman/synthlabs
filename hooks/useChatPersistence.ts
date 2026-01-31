import { useEffect } from 'react';

import { ChatStorageService } from '../services/chatStorageService';
import type { ChatMessage } from '../types';

interface UseChatPersistenceOptions {
    currentSessionId: string;
    messages: ChatMessage[];
}

export function useChatPersistence({ currentSessionId, messages }: UseChatPersistenceOptions) {
    useEffect(() => {
        if (currentSessionId && messages.length > 0) {
            ChatStorageService.getSession(currentSessionId).then(session => {
                if (session) {
                    session.messages = messages as any;
                    ChatStorageService.saveSession(session);
                }
            });
        }
    }, [messages, currentSessionId]);
}

export default useChatPersistence;
