import { DeepConfig, SynthLogItem, GenerationParams, ChatMessage, ChatRole, EngineMode, StreamChunkCallback } from '../../types';
import { logger } from '../../utils/logger';
import { parseThinkTags } from './rewrite/thinkTagParser';
import { buildRewriteInput } from './rewrite/inputBuilder';
import { executeDeepRewrite } from './rewrite/deepRewriteExecutor';
import { executeRegularRewrite, RegularModeConfig } from './rewrite/regularRewriteExecutor';
import { reconstructMessage, copyNonAssistantMessage } from './rewrite/messageBuilder';
import { truncateMessagesByMaxTraces, shouldSkipProcessing } from './rewrite/messageTruncator';
import { buildSuccessResult, buildAbortedResult, buildErrorResult } from './rewrite/resultBuilder';

export interface ConversationRewriteParams {
  messages: ChatMessage[];
  config: DeepConfig;
  engineMode: EngineMode;
  converterPrompt?: string;
  signal?: AbortSignal;
  maxRetries: number;
  retryDelay: number;
  generationParams?: GenerationParams;
  onMessageRewritten?: (index: number, total: number) => void;
  maxTraces?: number;
  regularModeConfig?: RegularModeConfig;
  promptSet?: string;
  structuredOutput?: boolean;
  stream?: boolean;
  onStreamChunk?: StreamChunkCallback;
}

export const orchestrateConversationRewrite = async (
  params: ConversationRewriteParams
): Promise<SynthLogItem> => {
  const {
    messages,
    config,
    engineMode,
    converterPrompt,
    signal,
    maxRetries,
    retryDelay,
    generationParams,
    onMessageRewritten,
    maxTraces,
    regularModeConfig,
    promptSet,
    structuredOutput,
    stream,
    onStreamChunk
  } = params;

  const startTime = Date.now();
  const rewrittenMessages: ChatMessage[] = [];
  let hasError = false;
  let errorMessages: string[] = [];

  logger.group("🔄 STARTING CONVERSATION TRACE REWRITING");
  logger.log("Total messages:", messages.length);
  logger.log("Engine mode:", engineMode);

  try {
    let assistantIndex = 0;
    const allAssistants = messages.filter(m => m.role === ChatRole.Assistant).length;
    const totalAssistants = maxTraces && maxTraces > 0 ? Math.min(maxTraces, allAssistants) : allAssistants;

    for (let i = 0; i < messages.length; i++) {
      if (signal?.aborted) break;

      const message = messages[i];

      // Skip non-assistant messages or messages beyond maxTraces
      if (shouldSkipProcessing(message, assistantIndex, maxTraces)) {
        rewrittenMessages.push(copyNonAssistantMessage(message));
        continue;
      }

      // Parse think tags
      const { originalThinking, outsideThinkContent, isImputation } = parseThinkTags(message.content, i);

      // Build rewrite input
      const { rewriteInput } = buildRewriteInput(
        messages, i, originalThinking, outsideThinkContent, isImputation
      );

      // Execute rewrite based on engine mode
      let newReasoning: string;
      let newAnswer = outsideThinkContent;

      if (engineMode === EngineMode.Deep) {
        const deepResult = await executeDeepRewrite(
          rewriteInput,
          outsideThinkContent,
          config,
          signal,
          maxRetries,
          retryDelay,
          generationParams,
          structuredOutput,
          stream,
          onStreamChunk
        );

        if (deepResult.error) {
          hasError = true;
          errorMessages.push(`Message ${i}: ${deepResult.error}`);
        }

        newReasoning = deepResult.newReasoning || originalThinking;
        newAnswer = deepResult.newAnswer;
      } else {
        const regularResult = await executeRegularRewrite(
          rewriteInput,
          originalThinking,
          regularModeConfig,
          config,
          converterPrompt,
          promptSet,
          signal,
          maxRetries,
          retryDelay,
          generationParams,
          structuredOutput,
          stream,
          onStreamChunk
        );
        newReasoning = regularResult.newReasoning;
      }

      // Reconstruct message
      const { message: reconstructedMessage } = reconstructMessage(
        message, newReasoning, newAnswer, assistantIndex
      );
      rewrittenMessages.push(reconstructedMessage);
      assistantIndex++;

      // Report progress
      onMessageRewritten?.(assistantIndex - 1, totalAssistants);
      logger.log(`Message ${i}: Rewritten successfully (${assistantIndex}/${totalAssistants})`);
    }

    logger.log("✅ Conversation rewrite complete");
    logger.groupEnd();

    // Apply maxTraces truncation
    const finalMessages = truncateMessagesByMaxTraces(rewrittenMessages, maxTraces);

    // Handle abort
    if (signal?.aborted) {
      logger.warn("⚠️ Conversation rewrite was halted by user");
      logger.groupEnd();
      return buildAbortedResult({
        messages: rewrittenMessages,
        finalMessages,
        engineMode,
        config,
        regularModeConfig,
        startTime,
        hasError,
        errorMessages,
        isAborted: true
      });
    }

    // Build success result
    return buildSuccessResult({
      messages: rewrittenMessages,
      finalMessages,
      engineMode,
      config,
      regularModeConfig,
      startTime,
      hasError,
      errorMessages,
      isAborted: false
    });

  } catch (error: any) {
    logger.error("💥 Conversation rewrite failed:", error);
    logger.groupEnd();
    return buildErrorResult(messages, startTime, error);
  }
};

// Re-export types for backward compatibility
export type { RegularModeConfig } from './rewrite/regularRewriteExecutor';
