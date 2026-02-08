import { VerifierItem } from '../types';
import { ChatMessage } from '../interfaces/models/ChatMessage';
import { parseThinkTagsForDisplay } from './thinkTagParser';

/**
 * Normalizes messages by extracting <think> tags from content into reasoning_content field.
 * This ensures reasoning is properly separated from answer content.
 */
export function normalizeMessageReasoning(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(msg => {
        // Only process assistant messages that don't already have reasoning_content
        if (msg.role !== 'assistant' || msg.reasoning_content) {
            return msg;
        }

        const parsed = parseThinkTagsForDisplay(msg.content);
        
        if (parsed.hasThinkTags) {
            return {
                ...msg,
                reasoning_content: parsed.reasoning || undefined,
                content: parsed.answer
            };
        }

        return msg;
    });
}

/**
 * Normalizes a VerifierItem by extracting think tags from message contents.
 */
export function normalizeItemReasoning(item: VerifierItem): VerifierItem {
    if (!item.messages || item.messages.length === 0) {
        return item;
    }

    const normalizedMessages = normalizeMessageReasoning(item.messages);
    
    // Check if any messages were modified
    const hasChanges = normalizedMessages.some((msg, idx) => msg !== item.messages![idx]);
    
    if (hasChanges) {
        return {
            ...item,
            messages: normalizedMessages
        };
    }

    return item;
}

/**
 * Normalizes an array of VerifierItems by extracting think tags from all message contents.
 */
export function normalizeItemsReasoning(items: VerifierItem[]): VerifierItem[] {
    return items.map(normalizeItemReasoning);
}
