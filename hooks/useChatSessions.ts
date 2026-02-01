import { useCallback, useEffect, useRef } from 'react';

import { ChatStorageService } from '../services/chatStorageService';
import { createChatMessageId } from '../utils/chatMessageId';
import type { ChatMessage } from '../types';
import { confirmService } from '../services/confirmService';
import type { ChatService } from '../services/chatService';

interface UseChatSessionsOptions {
    chatServiceRef: React.MutableRefObject<ChatService | null>;
    syncServiceHistory: (msgs: ChatMessage[]) => void;
    setCurrentSessionId: (id: string) => void;
    setMessages: (messages: ChatMessage[]) => void;
    setShowModelSelector: (show: boolean) => void;
    showHistory: boolean;
    setShowHistory: (show: boolean) => void;
    setHistorySessions: (sessions: { id: string; title: string; updatedAt: number }[]) => void;
    currentSessionId: string | null;
}

export function useChatSessions({
    chatServiceRef,
    syncServiceHistory,
    setCurrentSessionId,
    setMessages,
    setShowModelSelector,
    showHistory,
    setShowHistory,
    setHistorySessions,
    currentSessionId
}: UseChatSessionsOptions) {
    const normalizeMessages = useCallback((msgs: ChatMessage[]) => {
        const normalized = msgs.map(msg => ({
            ...msg,
            id: msg.id || createChatMessageId()
        }));
        return normalized.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    }, []);
    const handleNewChat = useCallback(async () => {
        const session = await ChatStorageService.createSession();
        setCurrentSessionId(session.id);
        setMessages([]);
        if (chatServiceRef.current) {
            chatServiceRef.current.clearHistory();
        }
        setShowModelSelector(false);
    }, [chatServiceRef, setCurrentSessionId, setMessages, setShowModelSelector]);

    const loadHistory = useCallback(async () => {
        const sessions = await ChatStorageService.getAllSessions();
        setHistorySessions(sessions);
    }, [setHistorySessions]);

    const handleHistoryClick = useCallback(() => {
        if (!showHistory) {
            loadHistory();
        }
        setShowHistory(!showHistory);
    }, [loadHistory, setShowHistory, showHistory]);

    const handleSessionSelect = useCallback(async (sessionId: string) => {
        try {
            const session = await ChatStorageService.getSession(sessionId);
            if (session) {
                setCurrentSessionId(session.id);
                const normalized = normalizeMessages(session.messages);
                setMessages(normalized);

                if (chatServiceRef.current) {
                    syncServiceHistory(normalized);
                }

                await ChatStorageService.setCurrentSessionId(session.id);
                setShowHistory(false);
            }
        } catch (e) {
            console.error('Error selecting session:', e);
        }
    }, [chatServiceRef, setCurrentSessionId, setMessages, setShowHistory, syncServiceHistory]);

    const handleDeleteSession = useCallback(async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        const confirmDelete = await confirmService.confirm({
            title: 'Delete chat?',
            message: 'Delete this chat? This cannot be undone.',
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'danger'
        });
        if (confirmDelete) {
            await ChatStorageService.deleteSession(sessionId);
            loadHistory();
            if (sessionId === currentSessionId) {
                handleNewChat();
            }
        }
    }, [currentSessionId, handleNewChat, loadHistory]);

    // Use a ref to track if initialization has been done to prevent repeated calls
    const isInitializedRef = useRef(false);

    // Store callbacks in refs to avoid effect re-runs
    const handleNewChatRef = useRef(handleNewChat);
    const setCurrentSessionIdRef = useRef(setCurrentSessionId);
    const setMessagesRef = useRef(setMessages);
    const syncServiceHistoryRef = useRef(syncServiceHistory);
    const normalizeMessagesRef = useRef(normalizeMessages);

    // Keep refs up to date
    useEffect(() => {
        handleNewChatRef.current = handleNewChat;
        setCurrentSessionIdRef.current = setCurrentSessionId;
        setMessagesRef.current = setMessages;
        syncServiceHistoryRef.current = syncServiceHistory;
        normalizeMessagesRef.current = normalizeMessages;
    });

    useEffect(() => {
        // Prevent double initialization (React StrictMode or re-renders)
        if (isInitializedRef.current) return;
        isInitializedRef.current = true;

        const initSession = async () => {
            const lastId = await ChatStorageService.getCurrentSessionId();
            if (lastId) {
                const session = await ChatStorageService.getSession(lastId);
                if (session) {
                    setCurrentSessionIdRef.current(session.id);
                    const normalized = normalizeMessagesRef.current(session.messages);
                    setMessagesRef.current(normalized);
                    syncServiceHistoryRef.current(normalized);
                    return;
                }
            }
            await handleNewChatRef.current();
        };
        initSession();
    }, []); // Empty deps - run only once on mount

    return {
        handleNewChat,
        handleHistoryClick,
        handleSessionSelect,
        handleDeleteSession,
        loadHistory
    };
}

export default useChatSessions;
