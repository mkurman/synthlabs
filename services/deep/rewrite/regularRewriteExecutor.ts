import { DeepConfig, GenerationParams, ProviderType, ExternalProvider, StreamChunkCallback } from '../../../types';
import { PromptCategory, PromptRole } from '../../../interfaces/enums';
import * as GeminiService from '../../geminiService';
import * as ExternalApiService from '../../externalApiService';
import { SettingsService } from '../../settingsService';
import { PromptService } from '../../promptService';
import { executePhase } from '../phaseExecutor';

export interface RegularModeConfig {
  provider: ProviderType;
  externalProvider: ExternalProvider;
  apiKey: string;
  model: string;
  customBaseUrl: string;
  generationParams?: GenerationParams;
}

export interface RegularRewriteResult {
  newReasoning: string;
}

export async function executeRegularRewrite(
  rewriteInput: string,
  originalThinking: string,
  regularModeConfig: RegularModeConfig | undefined,
  config: DeepConfig,
  converterPrompt: string | undefined,
  promptSet: string | undefined,
  signal: AbortSignal | undefined,
  maxRetries: number,
  retryDelay: number,
  generationParams: GenerationParams | undefined,
  structuredOutput: boolean | undefined,
  stream: boolean | undefined,
  onStreamChunk: StreamChunkCallback | undefined
): Promise<RegularRewriteResult> {
  if (regularModeConfig?.provider === ProviderType.Gemini) {
    const geminiPrompt = converterPrompt || PromptService.getSystemPrompt(PromptCategory.Converter, PromptRole.Writer, promptSet, structuredOutput);
    const result = await GeminiService.generateGenericJSON(
      rewriteInput,
      geminiPrompt,
      { maxRetries, retryDelay, generationParams: regularModeConfig.generationParams || generationParams }
    );
    return { newReasoning: result.reasoning || originalThinking };
  } else if (regularModeConfig) {
    const result = await ExternalApiService.callExternalApi({
      provider: regularModeConfig.externalProvider as any,
      apiKey: regularModeConfig.apiKey || SettingsService.getApiKey(regularModeConfig.externalProvider as any),
      model: regularModeConfig.model,
      customBaseUrl: regularModeConfig.customBaseUrl || SettingsService.getCustomBaseUrl(),
      userPrompt: `[INPUT LOGIC START]\n${rewriteInput}\n[INPUT LOGIC END]`,
      signal,
      maxRetries,
      retryDelay,
      generationParams,
      structuredOutput,
      stream: stream,
      onStreamChunk: onStreamChunk,
      streamPhase: 'regular'
    });
    return { newReasoning: result.reasoning || originalThinking };
  } else {
    // Fallback to writer phase
    const writerRes = await executePhase(
      config.phases.writer,
      rewriteInput,
      signal,
      maxRetries,
      retryDelay,
      config.phases.writer.generationParams || generationParams,
      structuredOutput
    );
    return { newReasoning: writerRes.result?.reasoning || originalThinking };
  }
}
