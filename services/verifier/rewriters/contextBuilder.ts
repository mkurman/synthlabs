import { VerifierItem } from '../../../types';

export type RewritableField = 'query' | 'reasoning' | 'answer';

/**
 * Builds context string from a VerifierItem for AI rewriting
 */
export function buildItemContext(item: VerifierItem, targetField: RewritableField): string {
    return `## FULL ITEM CONTEXT

**Query:** ${item.query}

**Reasoning Trace:**
${item.reasoning}

**Answer:**
${item.answer}

---
TARGET FIELD TO REWRITE: ${targetField.toUpperCase()}
Current value of ${targetField}:
${item[targetField]}

IMPORTANT: Respond with a VALID JSON object.

Expected Output Format:
{
  "response": "The rewritten content for ${targetField}..."
}`;
}

/**
 * Builds context for message rewriting with conversation history up to target
 * Used for answer-only regeneration
 */
export function buildMessageContext(item: VerifierItem, targetIndex: number): string {
    if (!item.messages || item.messages.length === 0) {
        return '';
    }

    const contextMessages = item.messages.slice(0, targetIndex + 1);
    const formattedHistory = contextMessages.map((msg, idx) => {
        const isTarget = idx === targetIndex;
        return `[${msg.role.toUpperCase()}]${isTarget ? ' (TARGET TO REWRITE)' : ''}:
${msg.content}`;
    }).join('\n\n');

    return `## CONVERSATION HISTORY (up to and including target message)

${formattedHistory}

---
REWRITE THE LAST MESSAGE IN THE HISTORY ABOVE (the one marked as TARGET).
IMPORTANT: Only rewrite the ANSWER portion. Preserve any existing reasoning structure.`;
}
