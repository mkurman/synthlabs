import { ChatRole } from '../enums';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  reasoning?: string;
  toolCalls?: any[];
  toolCallId?: string;
}
