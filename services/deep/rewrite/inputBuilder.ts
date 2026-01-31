import { ChatMessage, ChatRole } from '../../../types';

export interface RewriteInput {
  rewriteInput: string;
  userContext: string;
}

export function buildRewriteInput(
  messages: ChatMessage[],
  messageIndex: number,
  originalThinking: string,
  outsideThinkContent: string,
  isImputation: boolean
): RewriteInput {
  // Find previous user message for context
  const prevUserMsg = messages.slice(0, messageIndex).reverse().find(m => m.role === ChatRole.User);
  const userContext = prevUserMsg ? `[USER QUERY]:\n${prevUserMsg.content}\n\n` : '';

  let rewriteInput: string;
  
  if (isImputation) {
    rewriteInput = `
[TASK]: REVERSE ENGINEERING REASONING
[INSTRUCTION]: Analyze the [USER QUERY] and the [ASSISTANT RESPONSE]. Generate a detailed stenographic reasoning trace (<think>...</think>) that logically connects the query to the response.
${userContext}
[ASSISTANT RESPONSE]:
${outsideThinkContent}
`;
  } else {
    rewriteInput = `${userContext}[RAW REASONING TRACE]:\n${originalThinking}`;
  }

  return { rewriteInput, userContext };
}
