import { DeepConfig, GenerationParams, ProviderType, ExternalProvider, StreamChunkCallback, AppMode } from '../../../types';
import { PromptCategory, PromptRole, OutputFieldName } from '../../../interfaces/enums';
import * as GeminiService from '../../geminiService';
import * as ExternalApiService from '../../externalApiService';
import { SettingsService } from '../../settingsService';
import { PromptService } from '../../promptService';
import { executePhase } from '../phaseExecutor';
import { logger } from '../../../utils/logger';
import { parseNativeOutput } from '../../../utils/thinkTagParser';

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
  newAnswer: string;
}

export async function executeRegularRewrite(
  rewriteInput: string,
  originalThinking: string,
  outsideThinkContent: string,
  regularModeConfig: RegularModeConfig | undefined,
  config: DeepConfig,
  converterPrompt: string | undefined,
  promptSet: string | undefined,
  appMode: AppMode | undefined,
  signal: AbortSignal | undefined,
  maxRetries: number,
  retryDelay: number,
  generationParams: GenerationParams | undefined,
  structuredOutput: boolean | undefined,
  stream: boolean | undefined,
  onStreamChunk: StreamChunkCallback | undefined
): Promise<RegularRewriteResult> {
  // Get selected fields from generation params
  const selectedFields = generationParams?.selectedFields;
  
  logger.log('[Field Selection] Regular Rewrite:', {
    selectedFields,
    hasGenerationParams: !!generationParams,
    provider: regularModeConfig?.provider,
    externalProvider: regularModeConfig?.externalProvider
  });
  
  const useNativeOutput = generationParams?.useNativeOutput ?? false;

  if (regularModeConfig?.provider === ProviderType.Gemini) {
    const geminiPrompt = converterPrompt || PromptService.getSystemPrompt(PromptCategory.Converter, PromptRole.Writer, promptSet, structuredOutput);
    const result = useNativeOutput
      ? parseNativeOutput(await GeminiService.generateNativeText(
          rewriteInput,
          geminiPrompt,
          { maxRetries, retryDelay, generationParams: regularModeConfig.generationParams || generationParams }
        ))
      : await GeminiService.generateGenericJSON(
          rewriteInput,
          geminiPrompt,
          { maxRetries, retryDelay, generationParams: regularModeConfig.generationParams || generationParams }
        );
    
    // Handle field selection: only use generated fields that are selected
    const shouldUseReasoning = !selectedFields || selectedFields.includes(OutputFieldName.Reasoning);
    const shouldUseAnswer = !selectedFields || selectedFields.includes(OutputFieldName.Answer);
    
    return { 
      newReasoning: shouldUseReasoning ? (result.reasoning || originalThinking) : originalThinking,
      newAnswer: shouldUseAnswer ? (result.answer || outsideThinkContent) : outsideThinkContent
    };
  } else if (regularModeConfig) {
    // Determine which prompt category and role to use based on appMode
    const promptCategory = appMode === AppMode.Generator ? PromptCategory.Generator : PromptCategory.Converter;
    const promptRole = appMode === AppMode.Generator ? PromptRole.System : PromptRole.Writer;
    
    // Get the system prompt from converterPrompt or PromptService
    const systemPrompt = converterPrompt || PromptService.getSystemPrompt(promptCategory, promptRole, promptSet, structuredOutput);
    
    // Get the prompt schema for proper JSON schema generation
    const promptSchema = PromptService.getPromptSchema(promptCategory, promptRole, promptSet);
    
    const result = await ExternalApiService.callExternalApi({
      provider: regularModeConfig.externalProvider as any,
      apiKey: regularModeConfig.apiKey || SettingsService.getApiKey(regularModeConfig.externalProvider as any),
      model: regularModeConfig.model,
      customBaseUrl: regularModeConfig.customBaseUrl || SettingsService.getCustomBaseUrl(),
      systemPrompt: systemPrompt,
      userPrompt: `[INPUT LOGIC START]\n${rewriteInput}\n[INPUT LOGIC END]`,
      promptSchema: useNativeOutput ? undefined : promptSchema,
      signal,
      maxRetries,
      retryDelay,
      generationParams,
      structuredOutput: useNativeOutput ? false : structuredOutput,
      stream: stream,
      onStreamChunk: onStreamChunk,
      streamPhase: 'regular',
      selectedFields: useNativeOutput ? undefined : selectedFields
    });
    const finalResult = useNativeOutput && typeof result === 'string' ? parseNativeOutput(result) : result;
    
    // Handle field selection: only use generated fields that are selected
    const shouldUseReasoning = !selectedFields || selectedFields.includes(OutputFieldName.Reasoning);
    const shouldUseAnswer = !selectedFields || selectedFields.includes(OutputFieldName.Answer);
    
    return {
      newReasoning: shouldUseReasoning ? (finalResult.reasoning || originalThinking) : originalThinking,
      newAnswer: shouldUseAnswer ? (finalResult.answer || outsideThinkContent) : outsideThinkContent
    };
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
    
    // Handle field selection for writer phase
    const shouldUseReasoning = !selectedFields || selectedFields.includes(OutputFieldName.Reasoning);
    const shouldUseAnswer = !selectedFields || selectedFields.includes(OutputFieldName.Answer);
    
    return { 
      newReasoning: shouldUseReasoning ? (writerRes.result?.reasoning || originalThinking) : originalThinking,
      newAnswer: shouldUseAnswer ? (writerRes.result?.answer || outsideThinkContent) : outsideThinkContent
    };
  }
}
