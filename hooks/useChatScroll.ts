import { useCallback, useEffect, useRef } from 'react';

interface UseChatScrollOptions {
    messages: any[];
    isStreaming: boolean;
    lastMessageLength: number;
    autoScroll: boolean;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    messagesContainerRef: React.RefObject<HTMLDivElement | null>;
    setAutoScroll: (value: boolean) => void;
    setShowScrollButton: (value: boolean) => void;
}

export function useChatScroll({
    messages,
    isStreaming,
    lastMessageLength: _lastMessageLength,
    autoScroll,
    messagesEndRef,
    messagesContainerRef,
    setAutoScroll,
    setShowScrollButton
}: UseChatScrollOptions) {
    const isStreamingRef = useRef(isStreaming);

    useEffect(() => {
        isStreamingRef.current = isStreaming;
    }, [isStreaming]);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messagesEndRef]);

    const handleScrollToBottom = useCallback(() => {
        scrollToBottom();
        setAutoScroll(true);
        setShowScrollButton(false);
    }, [scrollToBottom, setAutoScroll, setShowScrollButton]);

    const checkIfNearBottom = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) return true;
        const threshold = 50;
        return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    }, [messagesContainerRef]);

    useEffect(() => {
        if (autoScroll) {
            scrollToBottom();
        }
    }, [autoScroll, messages, scrollToBottom]);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return undefined;

        const handleScroll = () => {
            // Never show scroll button during streaming
            if (isStreamingRef.current) {
                setShowScrollButton(false);
                return;
            }
            if (!checkIfNearBottom()) {
                setAutoScroll(false);
                setShowScrollButton(true);
            } else {
                setAutoScroll(true);
                setShowScrollButton(false);
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [checkIfNearBottom, messagesContainerRef, setAutoScroll, setShowScrollButton]);

    return { handleScrollToBottom };
}

export default useChatScroll;
