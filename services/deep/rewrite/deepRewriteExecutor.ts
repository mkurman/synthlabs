import { DeepConfig, GenerationParams, StreamChunkCallback } from '../../../types';
import { OutputFieldName } from '../../../interfaces/enums';
import { logger } from '../../../utils/logger';
import { orchestrateDeepReasoning } from '../deepOrchestrator';

export interface DeepRewriteResult {
  newReasoning: string;
  newAnswer: string;
  error?: string;
}

export async function executeDeepRewrite(
  rewriteInput: string,
  outsideThinkContent: string,
  config: DeepConfig,
  signal: AbortSignal | undefined,
  maxRetries: number,
  retryDelay: number,
  generationParams: GenerationParams | undefined,
  structuredOutput: boolean | undefined,
  stream: boolean | undefined,
  onStreamChunk: StreamChunkCallback | undefined
): Promise<DeepRewriteResult> {
  const deepResult = await orchestrateDeepReasoning({
    input: rewriteInput,
    config: config,
    signal: signal,
    maxRetries: maxRetries,
    retryDelay: retryDelay,
    generationParams: generationParams,
    structuredOutput: structuredOutput,
    expectedAnswer: outsideThinkContent,
    stream: stream,
    onStreamChunk: onStreamChunk
  });

  if (deepResult.isError) {
    logger.warn(`⚠️ Message rewrite failed, using original content`);
    return {
      newReasoning: '', // Will use original thinking
      newAnswer: outsideThinkContent,
      error: deepResult.error || 'Unknown error'
    };
  }

  // Handle field selection: only use generated fields that are selected
  const selectedFields = generationParams?.selectedFields;
  
  logger.log('[Field Selection] Deep Rewrite:', {
    selectedFields,
    hasReasoning: !!deepResult.reasoning,
    hasAnswer: !!deepResult.answer,
    reasoningLength: deepResult.reasoning?.length,
    answerLength: deepResult.answer?.length
  });
  
  const shouldUseReasoning = !selectedFields || selectedFields.includes(OutputFieldName.Reasoning);
  const shouldUseAnswer = !selectedFields || selectedFields.includes(OutputFieldName.Answer);
  
  logger.log('[Field Selection] Decision:', {
    shouldUseReasoning,
    shouldUseAnswer,
    finalReasoningLength: shouldUseReasoning ? deepResult.reasoning?.length : 0,
    finalAnswerLength: shouldUseAnswer ? deepResult.answer?.length : outsideThinkContent.length
  });

  return {
    newReasoning: shouldUseReasoning ? (deepResult.reasoning || '') : '',
    newAnswer: shouldUseAnswer ? (deepResult.answer || outsideThinkContent) : outsideThinkContent
  };
}
