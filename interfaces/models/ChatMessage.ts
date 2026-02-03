import { ChatRole } from '../enums';

export interface ChatMessage {
  id?: string;
  role: ChatRole;
  content: string;
  reasoning?: string;
  /** Dedicated field for reasoning content (without <think> tags) */
  reasoning_content?: string;
  toolCalls?: any[];
  toolCallId?: string;
  usage?: ChatUsageSummary;
}

export interface ChatUsageSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  tps: number;
  durationMs: number;
}
