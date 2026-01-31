import { VerifierItem } from '../../../types';

export type TargetComponent = 'reasoning' | 'answer' | 'both';

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
    const thinkMatch = targetMessage.content.match(/<think>([\s\S]*?)<\/think>/);
    const existingReasoning = thinkMatch ? thinkMatch[1].trim() : (targetMessage.reasoning || '');
    const existingAnswer = thinkMatch
        ? targetMessage.content.replace(/<think>[\s\S]*?<\/think>/, '').trim()
        : targetMessage.content;

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
        return `[${msg.role.toUpperCase()}]:
${msg.content}`;
    }).join('\n\n');

    let instructions = '';
    if (targetComponent === 'reasoning') {
        instructions = `TASK: Regenerate ONLY the REASONING TRACE for the target message.
- Keep the existing ANSWER exactly as it is (do not output it).
- Generate new, improved reasoning that leads to this answer.
- Your response must be a VALID JSON object.

Expected Output Format:
{
  "reasoning": "# 1. Query decomposition..."
}`;
    } else if (targetComponent === 'answer') {
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
