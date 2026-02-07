import { VerifierItem } from '../../../types';
import { VerifierRewriteTarget } from '../../../interfaces/enums';
import { extractMessageParts } from '../../../utils/thinkTagParser';

export type TargetComponent = VerifierRewriteTarget.Reasoning | VerifierRewriteTarget.Answer | VerifierRewriteTarget.Both;

/**
 * Builds detailed context for targeted regeneration with specific component selection
 */
export function buildMessageContextForTarget(
    item: VerifierItem,
    targetIndex: number,
    targetComponent: TargetComponent
): string {
    if (!item.messages || item.messages.length === 0) {
        return '';
    }

    const targetMessage = item.messages[targetIndex];

    // Parse existing reasoning and answer from message
    // Uses priority: reasoning_content > <think> tags > reasoning field
    const { reasoning: existingReasoning, content: existingAnswer } = extractMessageParts(targetMessage);

    // Build full conversation history
    const contextMessages = item.messages.slice(0, targetIndex + 1);
    const formattedHistory = contextMessages.map((msg, idx) => {
        const isTarget = idx === targetIndex;
        if (isTarget) {
            return `[${msg.role.toUpperCase()}] (TARGET MESSAGE):
<REASONING_TRACE>
${existingReasoning || '(no reasoning present)'}
</REASONING_TRACE>

<ANSWER>
${existingAnswer}
</ANSWER>`;
        }
        // For non-target messages, strip <think> tags from content and
        // show reasoning separately if present
        const parts = extractMessageParts(msg);
        if (parts.reasoning) {
            return `[${msg.role.toUpperCase()}]:
<REASONING_TRACE>
${parts.reasoning}
</REASONING_TRACE>
${parts.content}`;
        }
        return `[${msg.role.toUpperCase()}]:
${parts.content}`;
    }).join('\n\n');

    let instructions = '';
    if (targetComponent === VerifierRewriteTarget.Reasoning) {
        instructions = `TASK: Regenerate ONLY the REASONING TRACE for the target message.
- Keep the existing ANSWER exactly as it is (do not output it).
- Generate new, improved reasoning that leads to this answer.
- Your response must be a VALID JSON object.

Expected Output Format:
{
  "reasoning": "# 1. Query decomposition..."
}`;
    } else if (targetComponent === VerifierRewriteTarget.Answer) {
        instructions = `TASK: Regenerate ONLY the ANSWER for the target message.
- Keep the existing REASONING TRACE for reference (do not output it).
- Generate a new, improved answer based on the reasoning.
- Your response must be a VALID JSON object.

Expected Output Format:
{
  "answer": "Here is the improved answer..."
}`;
    } else {
        instructions = `TASK: Regenerate BOTH the REASONING TRACE and ANSWER for the target message.
- Generate new reasoning that thoroughly analyzes the user's request
- Generate a new answer that follows from the reasoning
- Your response must be a VALID JSON object.

Expected Output Format:
{
  "reasoning": "# 1. Query decomposition...",
  "answer": "The solution is..."
}`;
    }

    return `## CONVERSATION HISTORY

${formattedHistory}

---
${instructions}

Respond with ONLY the JSON object, no additional text.`;
}

/**
 * Plain text context builder for split-field mode (no JSON instructions).
 * Used when splitFieldRequests is enabled for message-level "Both" rewrites.
 *
 * @param targetComponent - Must be Reasoning or Answer (not Both — caller splits into two calls)
 * @param context - Optional context from a previous split call (e.g. freshly-generated reasoning for answer generation)
 */
export function buildMessageContextForTargetPlainText(
    item: VerifierItem,
    targetIndex: number,
    targetComponent: VerifierRewriteTarget.Reasoning | VerifierRewriteTarget.Answer,
    context?: { reasoning?: string }
): string {
    if (!item.messages || item.messages.length === 0) {
        return '';
    }

    const targetMessage = item.messages[targetIndex];
    const { reasoning: existingReasoning, content: existingAnswer } = extractMessageParts(targetMessage);

    // Build full conversation history (same format as existing)
    const contextMessages = item.messages.slice(0, targetIndex + 1);
    const formattedHistory = contextMessages.map((msg, idx) => {
        const isTarget = idx === targetIndex;
        if (isTarget) {
            return `[${msg.role.toUpperCase()}] (TARGET MESSAGE):
<REASONING_TRACE>
${context?.reasoning || existingReasoning || '(no reasoning present)'}
</REASONING_TRACE>

<ANSWER>
${existingAnswer}
</ANSWER>`;
        }
        const parts = extractMessageParts(msg);
        if (parts.reasoning) {
            return `[${msg.role.toUpperCase()}]:
<REASONING_TRACE>
${parts.reasoning}
</REASONING_TRACE>
${parts.content}`;
        }
        return `[${msg.role.toUpperCase()}]:
${parts.content}`;
    }).join('\n\n');

    let instructions = '';
    if (targetComponent === VerifierRewriteTarget.Reasoning) {
        instructions = `TASK: Regenerate ONLY the REASONING TRACE for the target message.
- Keep the existing ANSWER exactly as it is (do not output it).
- Generate new, improved reasoning that leads to this answer.
- Output the reasoning as plain text, nothing else.`;
    } else {
        instructions = `TASK: Regenerate ONLY the ANSWER for the target message.
- The REASONING TRACE above is provided for context (do not output it).
- Generate a new, improved answer based on the reasoning.
- Output the answer as plain text, nothing else.`;
    }

    return `## CONVERSATION HISTORY

${formattedHistory}

---
${instructions}`;
}
