import { ChatMessage } from '../../../types';

export interface ReconstructedMessage {
  message: ChatMessage;
  assistantIndex: number;
}

export function reconstructMessage(
  originalMessage: ChatMessage,
  newReasoning: string,
  outsideThinkContent: string,
  assistantIndex: number
): ReconstructedMessage {
  const newContent = `<think>${newReasoning}</think>\n\n${outsideThinkContent}`;

  const reconstructedMessage: ChatMessage = {
    ...originalMessage,
    content: newContent,
    reasoning: newReasoning
  };

  return {
    message: reconstructedMessage,
    assistantIndex: assistantIndex + 1
  };
}

export function copyNonAssistantMessage(message: ChatMessage): ChatMessage {
  return { ...message };
}
