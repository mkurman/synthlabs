import { ChatRole } from '../enums';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  reasoning?: string;
  /** Dedicated field for reasoning content (without <think> tags) */
  reasoning_content?: string;
  toolCalls?: any[];
  toolCallId?: string;
}
