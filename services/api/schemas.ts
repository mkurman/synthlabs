import { ExternalProvider, GenerationParams, StreamChunkCallback, StreamPhase, ApiType } from '../../types';
import { JSON_SCHEMA_INSTRUCTION_PREFIX, JSON_OUTPUT_FALLBACK } from '../../constants';

// JSON Schema definitions for Responses API structured outputs
export const RESPONSES_API_SCHEMAS = {
  reasoningTrace: {
    name: 'reasoning_trace',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question or query being answered' },
        reasoning: { type: 'string', description: 'The step-by-step reasoning process' },
        answer: { type: 'string', description: 'The final answer to the query' }
      },
      required: ['reasoning', 'answer'],
      additionalProperties: false
    },
    description: 'Schema for reasoning trace output',
    strict: true
  },
  reasoningTraceWithFollowUp: {
    name: 'reasoning_trace_with_followup',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question or query being answered' },
        reasoning: { type: 'string', description: 'The step-by-step reasoning process' },
        answer: { type: 'string', description: 'The final answer to the query' },
        follow_up_question: { type: 'string', description: 'A follow-up question for multi-turn conversation' }
      },
      required: ['reasoning', 'answer', 'follow_up_question'],
      additionalProperties: false
    },
    description: 'Schema for reasoning trace with follow-up output',
    strict: true
  },
  rewriteResponse: {
    name: 'rewrite_response',
    schema: {
      type: 'object',
      properties: {
        response: { type: 'string', description: 'The rewritten content' }
      },
      required: ['response'],
      additionalProperties: false
    },
    description: 'Schema for rewrite response output',
    strict: true
  },
  messageRewrite: {
    name: 'message_rewrite',
    schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string', description: 'The reasoning/thinking process' },
        answer: { type: 'string', description: 'The final answer content' }
      },
      required: ['reasoning', 'answer'],
      additionalProperties: false
    },
    description: 'Schema for message rewrite output',
    strict: true
  },
  userAgentResponse: {
    name: 'user_agent_response',
    schema: {
      type: 'object',
      properties: {
        follow_up_question: { type: 'string', description: 'A natural follow-up question based on the conversation' },
        question: { type: 'string', description: 'Alternative field for follow-up question' }
      },
      required: ['follow_up_question'],
      additionalProperties: false
    },
    description: 'Schema for user agent response output',
    strict: true
  },
  genericObject: {
    name: 'generic_object',
    schema: {
      type: 'object',
      additionalProperties: true
    },
    description: 'Generic JSON object schema',
    strict: false
  }
} as const;

export type ResponsesSchemaName = keyof typeof RESPONSES_API_SCHEMAS;

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
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function generateJsonSchemaForPrompt(
  outputFields?: { name: string; description: string; optional?: boolean }[]
): string {
  if (!outputFields || outputFields.length === 0) {
    return '\n\n' + JSON_OUTPUT_FALLBACK;
  }

  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const field of outputFields) {
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
