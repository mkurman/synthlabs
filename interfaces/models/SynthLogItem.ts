import { LogItemStatus } from '../enums';
import { ChatMessage } from './ChatMessage';

export interface SynthLogItem {
  id: string;
  sessionUid?: string;
  sessionName?: string;
  source?: string;
  seed_preview: string;
  full_seed: string;
  query: string;
  reasoning: string;
  reasoning_content: string;
  original_reasoning?: string;
  answer: string;
  original_answer?: string;
  timestamp: string;
  duration?: number;
  tokenCount?: number;
  modelUsed: string;
  isError?: boolean;
  status?: LogItemStatus;
  error?: string;
  provider?: string;
  messages?: ChatMessage[];
  isMultiTurn?: boolean;
  messagesTruncated?: boolean;
  deepMetadata?: {
    meta: string;
    retrieval: string;
    derivation: string;
    writer: string;
    rewriter?: string;
  };
  deepTrace?: Record<string, {
    model: string;
    input: string;
    output: any;
    timestamp: string;
    duration: number;
  }>;
  storageError?: string;
  savedToDb?: boolean;
  score?: number;
  isDuplicate?: boolean;
  duplicateGroupId?: string;
  isDiscarded?: boolean;
  verifiedTimestamp?: string;
}
