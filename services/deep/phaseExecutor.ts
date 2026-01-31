import { DeepPhaseConfig, GenerationParams, StreamChunkCallback, StreamPhase, ProviderType, ApiType } from '../../types';
import { PromptCategory, PromptRole, DeepPhase, ResponsesSchemaName } from '../../interfaces/enums';
import { JSON_SCHEMA_INSTRUCTION_PREFIX, JSON_OUTPUT_FALLBACK } from '../../constants';
import * as GeminiService from '../geminiService';
import * as ExternalApiService from '../externalApiService';
import { SettingsService } from '../settingsService';
import { logger } from '../../utils/logger';
import { PromptService } from '../promptService';

// Map phase IDs to prompt schemas (loaded once)
export const PHASE_TO_SCHEMA: Record<DeepPhase, () => import('../../types').PromptSchema> = {
  [DeepPhase.Meta]: () => PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Meta),
  [DeepPhase.Retrieval]: () => PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Retrieval),
  [DeepPhase.Derivation]: () => PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Derivation),
  [DeepPhase.Writer]: () => PromptService.getPromptSchema(PromptCategory.Converter, PromptRole.Writer),
  [DeepPhase.Rewriter]: () => PromptService.getPromptSchema(PromptCategory.Converter, PromptRole.Rewriter),
  [DeepPhase.Responder]: () => PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Responder),
  [DeepPhase.UserAgent]: () => PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.UserAgent)
};

export interface PhaseExecutionResult {
  result: any;
  model: string;
  input: string;
  duration: number;
  timestamp: string;
}

export const executePhase = async (
  phaseConfig: DeepPhaseConfig,
  userContent: string,
  signal?: AbortSignal,
  maxRetries = 3,
  retryDelay = 2000,
  generationParams?: GenerationParams,
  structuredOutput: boolean = true,
  streamOptions?: { stream: boolean; onStreamChunk?: StreamChunkCallback; streamPhase?: StreamPhase }
): Promise<PhaseExecutionResult> => {
  const { id, provider, externalProvider, apiType, apiKey, model, customBaseUrl, promptSchema: configSchema, selectedFields } = phaseConfig;
  const modelName = provider === ProviderType.Gemini ? 'Gemini 3 Flash' : `${externalProvider}/${model}`;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Get schema: from config if provided, otherwise lookup by phase ID
  const schema = configSchema || PHASE_TO_SCHEMA[id]?.();

  const defaultSelectedFields = schema?.output
    ?.filter(field => !field.optional)
    .map(field => field.name) || [];

  const effectiveSelectedFields = selectedFields && selectedFields.length > 0
    ? selectedFields
    : defaultSelectedFields;
  
  // Filter schema fields based on effectiveSelectedFields
  const effectiveSchema = schema && effectiveSelectedFields.length > 0
    ? {
        ...schema,
        output: schema.output.filter(f => effectiveSelectedFields.includes(f.name))
      }
    : schema;
  
  logger.groupCollapsed(`[Deep Phase: ${id.toUpperCase()}]`);
  logger.log("Model:", modelName);
  logger.log("Input Snippet:", userContent.substring(0, 150).replace(/\n/g, ' ') + "...");
  logger.log("System Prompt Snippet:", schema?.prompt.substring(0, 100) + "..." || '(none)');

  let result;
  try {
    if (provider === ProviderType.Gemini) {
      // For Gemini, build the prompt with effective schema (filtered by selected fields)
      const geminiSystemPrompt = effectiveSchema 
        ? (structuredOutput 
            ? effectiveSchema.prompt + '\n\n' + JSON_SCHEMA_INSTRUCTION_PREFIX + ' ' + JSON.stringify({
                type: 'object',
                properties: Object.fromEntries(effectiveSchema.output.map(f => [f.name, { type: 'string', description: f.description }])),
                required: effectiveSchema.output.filter(f => !f.optional).map(f => f.name),
                additionalProperties: true
              })
            : effectiveSchema.prompt + '\n\n' + JSON_OUTPUT_FALLBACK)
        : '\n\n' + JSON_OUTPUT_FALLBACK;
      result = await GeminiService.generateGenericJSON(userContent, geminiSystemPrompt, { maxRetries, retryDelay, generationParams, structuredOutput });
    } else {
      // Resolve API key from phaseConfig first, then fall back to SettingsService
      const resolvedApiKey = apiKey || (externalProvider ? SettingsService.getApiKey(externalProvider) : '');
      const resolvedBaseUrl = customBaseUrl || SettingsService.getCustomBaseUrl();

      // Determine appropriate schema for Responses API
      const responsesSchema: ExternalApiService.ResponsesSchemaName = ResponsesSchemaName.ReasoningTrace;

      result = await ExternalApiService.callExternalApi({
        provider: externalProvider,
        apiKey: resolvedApiKey,
        model: model,
        apiType: apiType || ApiType.Chat,
        customBaseUrl: resolvedBaseUrl,
        promptSchema: effectiveSchema,
        userPrompt: userContent,
        signal: signal,
        maxRetries,
        retryDelay,
        generationParams,
        structuredOutput,
        responsesSchema,
        selectedFields,
        // Streaming: only enable if streamOptions provided with callback
        stream: streamOptions?.stream,
        onStreamChunk: streamOptions?.onStreamChunk,
        streamPhase: streamOptions?.streamPhase
      });
    }

    const duration = Date.now() - startTime;
    logger.log(`✅ Phase ${id} completed in ${duration}ms`);
    logger.groupEnd();

    return { result, model: modelName, input: userContent, duration, timestamp };
  } catch (err: any) {
    logger.error(`❌ Phase ${id} failed:`, err);
    logger.groupEnd();
    throw err;
  }
};

export const getModelName = (cfg: DeepPhaseConfig) => {
  return cfg.provider === ProviderType.Gemini ? 'Gemini 3 Flash' : `${cfg.externalProvider}/${cfg.model}`;
};

export const truncatePreview = (value: string, maxLen: number = 500): string => {
  if (!value) return '';
  return value.length > maxLen ? value.substring(0, maxLen) + '...' : value;
};

export const toPreviewString = (value: any, maxLen: number = 800): string => {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return truncatePreview(str, maxLen);
};
