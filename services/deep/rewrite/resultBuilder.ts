import { SynthLogItem, ChatMessage, ChatRole, LogItemStatus, EngineMode, DeepConfig, ProviderType, ExternalProvider } from '../../../types';

const MAX_MESSAGES_TO_STORE = 50;

export interface ResultBuilderParams {
  messages: ChatMessage[];
  finalMessages: ChatMessage[];
  engineMode: EngineMode;
  config: DeepConfig;
  regularModeConfig: { provider: ProviderType; externalProvider: ExternalProvider; model: string } | undefined;
  startTime: number;
  hasError: boolean;
  errorMessages: string[];
  isAborted: boolean;
}

export function buildSuccessResult(params: ResultBuilderParams): SynthLogItem {
  const { finalMessages, engineMode, config, regularModeConfig, startTime, hasError, errorMessages } = params;
  
  const messagesTruncated = finalMessages.length > MAX_MESSAGES_TO_STORE;
  const messagesForLog = messagesTruncated ? finalMessages.slice(-MAX_MESSAGES_TO_STORE) : finalMessages;

  const firstUser = messagesForLog.find(m => m.role === ChatRole.User);
  const displayQuery = firstUser?.content || "Conversation";

  const allReasoning = messagesForLog
    .filter(m => m.role === ChatRole.Assistant && m.reasoning)
    .map(m => m.reasoning)
    .join('\n---\n');

  const finalResult: SynthLogItem = {
    id: crypto.randomUUID(),
    seed_preview: displayQuery + (displayQuery.length >= 150 ? "..." : ""),
    full_seed: messagesForLog.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n'),
    query: displayQuery,
    reasoning: allReasoning,
    answer: messagesForLog[messagesForLog.length - 1]?.content || "",
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    tokenCount: messagesForLog.reduce((acc, m) => acc + Math.round((m.content?.length || 0) / 4), 0),
    modelUsed: engineMode === EngineMode.Deep 
      ? `DEEP-REWRITE: ${config.phases.writer.model}` 
      : `REWRITE: ${regularModeConfig?.model || 'converter'}`,
    isMultiTurn: true,
    messages: messagesForLog,
    messagesTruncated
  };

  if (hasError) {
    finalResult.isError = true;
    finalResult.status = LogItemStatus.ERROR;
    finalResult.error = errorMessages.join('; ');
  }

  return finalResult;
}

export function buildAbortedResult(params: ResultBuilderParams): SynthLogItem {
  const { messages, finalMessages, engineMode, config, regularModeConfig, startTime } = params;
  
  const firstUser = finalMessages.find(m => m.role === ChatRole.User);
  const displayQuery = firstUser?.content || "Conversation";

  return {
    id: crypto.randomUUID(),
    seed_preview: displayQuery.substring(0, 150) + (displayQuery.length >= 150 ? "..." : ""),
    full_seed: messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n'),
    query: displayQuery,
    reasoning: messages.filter(m => m.role === ChatRole.Assistant && m.reasoning).map(m => m.reasoning).join('\n---\n'),
    answer: "Halted",
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    modelUsed: engineMode === EngineMode.Deep 
      ? `DEEP-REWRITE: ${config.phases.writer.model}` 
      : `REWRITE: ${regularModeConfig?.model || 'converter'}`,
    isError: true,
    status: LogItemStatus.ERROR,
    error: 'Halted by user',
    isMultiTurn: true,
    messages: messages.length > MAX_MESSAGES_TO_STORE ? messages.slice(-MAX_MESSAGES_TO_STORE) : messages,
    messagesTruncated: messages.length > MAX_MESSAGES_TO_STORE
  };
}

export function buildErrorResult(
  messages: ChatMessage[],
  startTime: number,
  error: any
): SynthLogItem {
  return {
    id: crypto.randomUUID(),
    seed_preview: "Conversation Rewrite Error",
    full_seed: messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n'),
    query: "ERROR",
    reasoning: "",
    answer: "Conversation trace rewriting failed",
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    modelUsed: "REWRITE ENGINE",
    isError: true,
    error: error.message || "Unknown error during conversation rewriting",
    isMultiTurn: true,
    messages: messages.length > MAX_MESSAGES_TO_STORE ? messages.slice(-MAX_MESSAGES_TO_STORE) : messages,
    messagesTruncated: messages.length > MAX_MESSAGES_TO_STORE
  };
}
