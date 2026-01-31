import { ChatMessage } from '../../../types';

export interface ReconstructedMessage {
  message: ChatMessage;
  assistantIndex: number;
}

export function reconstructMessage(
  originalMessage: ChatMessage,
  newReasoning: string,
  newAnswer: string,
  assistantIndex: number
): ReconstructedMessage {
  // Store reasoning in dedicated field, content is just the answer (no <think> tags)
  const reconstructedMessage: ChatMessage = {
    ...originalMessage,
    content: newAnswer,
    reasoning_content: newReasoning
  };

  return {
    message: reconstructedMessage,
    assistantIndex: assistantIndex + 1
  };
}

export function copyNonAssistantMessage(message: ChatMessage): ChatMessage {
  return { ...message };
}
