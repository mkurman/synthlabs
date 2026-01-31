import { GenerationParams, StreamChunkCallback, StreamPhase, ProviderType, ApiType, ExternalProvider } from '../../types';
import { JSON_OUTPUT_FALLBACK } from '../../constants';
import * as GeminiService from '../geminiService';
import * as ExternalApiService from '../externalApiService';

export interface CallAgentConfig {
  provider: ProviderType;
  externalProvider: ExternalProvider;
  apiType?: ApiType;
  apiKey: string;
  model: string;
  customBaseUrl: string;
  promptSchema?: import('../../types').PromptSchema;
  generationParams?: GenerationParams;
}

export const callAgent = async (
  config: CallAgentConfig,
  userContent: string,
  signal?: AbortSignal,
  maxRetries = 3,
  retryDelay = 2000,
  generationParams?: GenerationParams,
  structuredOutput: boolean = true,
  streamOptions?: { stream: boolean; onStreamChunk?: StreamChunkCallback; streamPhase?: StreamPhase }
): Promise<any> => {
  const effectiveParams = config.generationParams || generationParams;
  const schema = config.promptSchema;
  
  // Determine responses schema based on output fields
  let responsesSchema: ExternalApiService.ResponsesSchemaName = 'reasoningTrace';
  if (schema?.output.some(f => f.name === 'follow_up_question' || f.name === 'question')) {
    responsesSchema = 'userAgentResponse';
  }
  
  if (config.provider === ProviderType.Gemini) {
    // Build system prompt from schema
    let geminiSystemPrompt = '\n\n' + JSON_OUTPUT_FALLBACK;
    if (schema) {
      if (structuredOutput) {
        geminiSystemPrompt = schema.prompt + '\n\n' + JSON_SCHEMA_INSTRUCTION_PREFIX + ' ' + JSON.stringify({
          type: 'object',
          properties: Object.fromEntries(schema.output.map(f => [f.name, { type: 'string', description: f.description }])),
          required: schema.output.filter(f => !f.optional).map(f => f.name),
          additionalProperties: true
        });
      } else {
        const example: Record<string, string> = {};
        for (const field of schema.output) {
          const suffix = field.optional ? ' (optional)' : '';
          example[field.name] = field.description.substring(0, 50) + (field.description.length > 50 ? '...' : '') + suffix;
        }
        geminiSystemPrompt = schema.prompt + '\n\n' + JSON_OUTPUT_FALLBACK + ': ' + JSON.stringify(example);
      }
    }
    return await GeminiService.generateGenericJSON(userContent, geminiSystemPrompt, { maxRetries, retryDelay, generationParams: effectiveParams });
  } else {
    return await ExternalApiService.callExternalApi({
      provider: config.externalProvider as any,
      apiKey: config.apiKey,
      model: config.model,
      apiType: config.apiType || ApiType.Chat,
      customBaseUrl: config.customBaseUrl,
      promptSchema: schema,
      userPrompt: userContent,
      signal,
      maxRetries,
      retryDelay,
      generationParams: effectiveParams,
      structuredOutput,
      responsesSchema,
      stream: streamOptions?.stream,
      onStreamChunk: streamOptions?.onStreamChunk,
      streamPhase: streamOptions?.streamPhase
    });
  }
};

// JSON_SCHEMA_INSTRUCTION_PREFIX is used above but not imported - need to add it
const JSON_SCHEMA_INSTRUCTION_PREFIX = "You must respond with a JSON object that conforms to the following schema:";
