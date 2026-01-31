import { ChatMessage, ChatRole } from '../../../types';

export function truncateMessagesByMaxTraces(
  messages: ChatMessage[],
  maxTraces: number | undefined
): ChatMessage[] {
  if (!maxTraces || maxTraces <= 0) {
    return messages;
  }

  let assistantCount = 0;
  let cutoffIndex = messages.length;
  
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === ChatRole.Assistant) {
      assistantCount++;
      if (assistantCount >= maxTraces) {
        cutoffIndex = i + 1;
        break;
      }
    }
  }
  
  return messages.slice(0, cutoffIndex);
}

export function shouldSkipProcessing(
  message: ChatMessage,
  assistantIndex: number,
  maxTraces: number | undefined
): boolean {
  if (message.role !== ChatRole.Assistant) {
    return true;
  }
  
  if (maxTraces && maxTraces > 0 && assistantIndex >= maxTraces) {
    return true;
  }
  
  return false;
}
