import { ExternalProvider, GenerationParams, StreamChunkCallback, StreamPhase, ApiType } from '../../types';
import { OutputFieldName } from '../../interfaces/enums/OutputFieldName';
import { ResponsesSchemaName } from '../../interfaces/enums/ResponsesSchemaName';
export { ResponsesSchemaName };
import { JSON_SCHEMA_INSTRUCTION_PREFIX, JSON_OUTPUT_FALLBACK } from '../../constants';

// JSON Schema definitions for Responses API structured outputs
export const RESPONSES_API_SCHEMAS: Record<ResponsesSchemaName, {
  name: string;
  schema: Record<string, any>;
  description: string;
  strict: boolean;
}> = {
  [ResponsesSchemaName.ReasoningTrace]: {
    name: 'reasoning_trace',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question or query being answered' },
        reasoning: { type: 'string', description: 'The step-by-step reasoning process' },
        answer: { type: 'string', description: 'The final answer to the query' }
      },
      required: [OutputFieldName.Reasoning, OutputFieldName.Answer],
      additionalProperties: false
    },
    description: 'Schema for reasoning trace output',
    strict: true
  },
  [ResponsesSchemaName.ReasoningTraceWithFollowUp]: {
    name: 'reasoning_trace_with_followup',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question or query being answered' },
        reasoning: { type: 'string', description: 'The step-by-step reasoning process' },
        answer: { type: 'string', description: 'The final answer to the query' },
        follow_up_question: { type: 'string', description: 'A follow-up question for multi-turn conversation' }
      },
      required: [OutputFieldName.Reasoning, OutputFieldName.Answer, OutputFieldName.FollowUpQuestion],
      additionalProperties: false
    },
    description: 'Schema for reasoning trace with follow-up output',
    strict: true
  },
  [ResponsesSchemaName.RewriteResponse]: {
    name: 'rewrite_response',
    schema: {
      type: 'object',
      properties: {
        response: { type: 'string', description: 'The rewritten content' }
      },
      required: [OutputFieldName.Response],
      additionalProperties: false
    },
    description: 'Schema for rewrite response output',
    strict: true
  },
  [ResponsesSchemaName.MessageRewrite]: {
    name: 'message_rewrite',
    schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string', description: 'The reasoning/thinking process' },
        answer: { type: 'string', description: 'The final answer content' }
      },
      required: [OutputFieldName.Reasoning, OutputFieldName.Answer],
      additionalProperties: false
    },
    description: 'Schema for message rewrite output',
    strict: true
  },
  [ResponsesSchemaName.UserAgentResponse]: {
    name: 'user_agent_response',
    schema: {
      type: 'object',
      properties: {
        follow_up_question: { type: 'string', description: 'A natural follow-up question based on the conversation' },
        question: { type: 'string', description: 'Alternative field for follow-up question' }
      },
      required: [OutputFieldName.FollowUpQuestion],
      additionalProperties: false
    },
    description: 'Schema for user agent response output',
    strict: true
  },
  [ResponsesSchemaName.GenericObject]: {
    name: 'generic_object',
    schema: {
      type: 'object',
      additionalProperties: true
    },
    description: 'Generic JSON object schema',
    strict: false
  }
} as const;


export interface ExternalApiConfig {
  provider: ExternalProvider;
  apiKey: string;
  model: string;
  apiType?: ApiType;
  customBaseUrl?: string;
  userPrompt: string;
  systemPrompt?: string;
  messages?: any[];
  signal?: AbortSignal;
  maxRetries?: number;
  retryDelay?: number;
  generationParams?: GenerationParams;
  structuredOutput?: boolean;
  responsesSchema?: ResponsesSchemaName;
  promptSchema?: import('../../types').PromptSchema;
  stream?: boolean;
  onStreamChunk?: StreamChunkCallback;
  streamPhase?: StreamPhase;
  tools?: any[];
  maxTokens?: number;
  /** Array of field names to include in the output schema (for field selection feature) */
  selectedFields?: OutputFieldName[];
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function generateJsonSchemaForPrompt(
  outputFields?: { name: OutputFieldName; description: string; optional?: boolean }[],
  selectedFields?: OutputFieldName[]
): string {
  if (!outputFields || outputFields.length === 0) {
    return '\n\n' + JSON_OUTPUT_FALLBACK;
  }

  // Filter fields if selection is provided
  const fieldsToUse = selectedFields && selectedFields.length > 0
    ? outputFields.filter(f => selectedFields.includes(f.name))
    : outputFields;

  if (fieldsToUse.length === 0) {
    return '\n\n' + JSON_OUTPUT_FALLBACK;
  }

  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const field of fieldsToUse) {
    properties[field.name] = {
      type: 'string',
      description: field.description
    };
    if (!field.optional) {
      required.push(field.name);
    }
  }

  const schema = {
    type: 'object',
    properties,
    required,
    additionalProperties: true
  };

  return '\n\n' + JSON_SCHEMA_INSTRUCTION_PREFIX + ' ' + JSON.stringify(schema, null, 2);
}
