import { VerifierItem } from '../../../types';
import { OutputFieldName } from '../../../interfaces/enums';

export type RewritableField = OutputFieldName.Query | OutputFieldName.Reasoning | OutputFieldName.Answer;

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

/**
 * Plain text context builder for split-field mode (no JSON instructions).
 * Used when splitFieldRequests is enabled.
 */
export function buildItemContextPlainText(
    item: VerifierItem,
    targetField: RewritableField,
    context?: { reasoning?: string }
): string {
    const parts: string[] = [];

    parts.push('## FULL ITEM CONTEXT');
    parts.push('');
    parts.push(`**Query:** ${item.query}`);
    parts.push('');
    parts.push(`**Reasoning Trace:**`);
    parts.push(context?.reasoning || item.reasoning || '(none)');
    parts.push('');
    parts.push(`**Answer:**`);
    parts.push(item.answer || '(none)');
    parts.push('');
    parts.push('---');

    if (targetField === OutputFieldName.Reasoning) {
        parts.push('Rewrite ONLY the reasoning trace. Output the improved reasoning as plain text, nothing else.');
    } else if (targetField === OutputFieldName.Answer) {
        parts.push('Rewrite ONLY the answer. Output the improved answer as plain text, nothing else.');
        if (context?.reasoning) {
            parts.push('');
            parts.push('Use the reasoning trace above as context for generating a better answer.');
        }
    } else {
        parts.push(`Rewrite ONLY the ${targetField}. Output the improved content as plain text, nothing else.`);
    }

    return parts.join('\n');
}
