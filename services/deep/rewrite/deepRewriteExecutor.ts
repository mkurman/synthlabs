import { DeepConfig, GenerationParams, StreamChunkCallback } from '../../../types';
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

  return {
    newReasoning: deepResult.reasoning || '',
    newAnswer: deepResult.answer || outsideThinkContent
  };
}
