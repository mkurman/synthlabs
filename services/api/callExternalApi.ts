import { ExternalProvider, ApiType, ChatRole } from '../../types';
import { PROVIDERS, JSON_OUTPUT_FALLBACK } from '../../constants';
import { logger } from '../../utils/logger';
import { SettingsService } from '../settingsService';
import { ExternalApiConfig, RESPONSES_API_SCHEMAS, sleep, generateJsonSchemaForPrompt, ResponsesSchemaName } from './schemas';
import { processStreamResponse } from './streaming';
import { parseJsonContent, MissingFieldsError } from './jsonParser';
import { cleanGenerationParamsForApi } from '../../utils/generationParamsUtils';

export type { ExternalApiConfig } from './schemas';

export const callExternalApi = async (config: ExternalApiConfig): Promise<any> => {
  const {
    provider, apiKey, model, apiType = ApiType.Chat, customBaseUrl, userPrompt, signal,
    maxRetries = 3, retryDelay = 2000, generationParams, structuredOutput,
    responsesSchema = ResponsesSchemaName.ReasoningTrace, stream = false, onStreamChunk, streamPhase, tools,
    promptSchema, onUsage
  } = config;

  let baseUrl = provider === ExternalProvider.Other ? customBaseUrl : PROVIDERS[provider]?.url;
  let responseFormat = structuredOutput ? 'json_object' : 'text';

  // Build system prompt from schema if provided
  let enhancedSystemPrompt: string;

  // Get selected fields from config (for field selection feature)
  const selectedFields = config.selectedFields;
  const useNativeOutput = generationParams?.useNativeOutput ?? false;

  logger.log('[callExternalApi] Field selection debug:', {
    selectedFields,
    hasPromptSchema: !!promptSchema,
    useNativeOutput,
    promptSchemaOutputLength: promptSchema?.output?.length,
    promptSchemaOutput: promptSchema?.output?.map(f => ({ name: f.name, optional: f.optional }))
  });

  const splitFieldRequests = generationParams?.splitFieldRequests ?? false;

  if (useNativeOutput || splitFieldRequests) {
    // Native mode or split field mode: use system prompt as-is, no JSON output instructions
    enhancedSystemPrompt = config.systemPrompt || '';
  } else if (config.systemPrompt) {
    if (structuredOutput) {
      // Use promptSchema.output if available, otherwise we can't generate proper schema
      if (promptSchema?.output && promptSchema.output.length > 0) {
        enhancedSystemPrompt = config.systemPrompt + generateJsonSchemaForPrompt(promptSchema.output, selectedFields);
      } else {
        // Fallback: include system prompt but warn that schema is missing
        enhancedSystemPrompt = config.systemPrompt + '\n\n' + JSON_OUTPUT_FALLBACK;
        logger.warn('[callExternalApi] System prompt provided but no promptSchema.output available for schema generation');
      }
    } else {
      enhancedSystemPrompt = config.systemPrompt + '\n\n' + JSON_OUTPUT_FALLBACK;
    }
  } else if (promptSchema) {
    if (structuredOutput) {
      enhancedSystemPrompt = promptSchema.prompt + generateJsonSchemaForPrompt(promptSchema.output, selectedFields);
    } else {
      const example: Record<string, string> = {};
      // Filter fields if selection is provided
      const fieldsToShow = selectedFields && selectedFields.length > 0
        ? (promptSchema.output || []).filter(f => selectedFields.includes(f.name))
        : (promptSchema.output || []);
      for (const field of fieldsToShow) {
        const suffix = field.optional ? ' (optional)' : '';
        example[field.name] = field.description.substring(0, 50) + (field.description.length > 50 ? '...' : '') + suffix;
      }
      enhancedSystemPrompt = promptSchema.prompt + '\n\nOutput valid JSON only: ' + JSON.stringify(example);
    }
  } else {
    enhancedSystemPrompt = '\n\n' + JSON_OUTPUT_FALLBACK;
  }

  const isResponsesApi = apiType === ApiType.Responses;

  // Ensure custom endpoint ends with correct path
  if (baseUrl) {
    const isAnthropicFormat = baseUrl.includes('/messages');
    const alreadyHasChatPath = baseUrl.includes('/chat/completions');
    const alreadyHasResponsesPath = baseUrl.includes('/responses');
    const alreadyHasPath = alreadyHasChatPath || alreadyHasResponsesPath || isAnthropicFormat;

    if (!alreadyHasPath) {
      if (isResponsesApi) {
        baseUrl = `${baseUrl}/responses`;
      } else {
        baseUrl = `${baseUrl}/chat/completions`;
      }
    }
  }

  if (!baseUrl) {
    throw new Error(`No base URL found for provider: ${provider}`);
  }

  baseUrl = baseUrl.replace(/\/$/, '');

  const safeApiKey = apiKey ? apiKey.replace(/[^\x20-\x7E]/g, '').trim() : '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (provider === ExternalProvider.Anthropic) {
    headers['x-api-key'] = safeApiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (provider === ExternalProvider.Ollama && !safeApiKey) {
    headers['Authorization'] = 'Bearer ollama-local';
  } else {
    headers['Authorization'] = `Bearer ${safeApiKey}`;
  }

  const cleanGenParams = cleanGenerationParamsForApi(generationParams);

  let url = '';
  let payload: any = {};
  const shouldStream = Boolean(stream && onStreamChunk);

  if (provider === ExternalProvider.Anthropic) {
    url = `${baseUrl}/messages`;
    payload = {
      model,
      ...(config.maxTokens ? { max_tokens: config.maxTokens } : {}),
      system: enhancedSystemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: cleanGenParams.temperature,
      top_p: cleanGenParams.top_p,
      top_k: cleanGenParams.top_k,
      stream: shouldStream
    };
  } else if (isResponsesApi) {
    if (baseUrl.includes('/responses')) {
      url = baseUrl;
    } else if (provider === ExternalProvider.OpenAI) {
      url = 'https://api.openai.com/v1/responses';
    } else {
      url = `${baseUrl.replace(/\/v1\/?$/, '').replace(/\/chat\/completions$/, '')}/v1/responses`;
    }

    let input: any;
    if (config.messages && config.messages.length > 0) {
      const nonSystemMessages = config.messages.filter((m: any) => m.role !== ChatRole.System);
      input = nonSystemMessages.map((m: any) => {
        if (m.role === ChatRole.User) {
          return { role: 'user', content: m.content };
        } else if (m.role === ChatRole.Assistant || m.role === ChatRole.Model) {
          return { role: 'assistant', content: m.content };
        }
        return { role: 'user', content: m.content };
      });
    } else {
      input = userPrompt;
    }

    const schema = structuredOutput ? RESPONSES_API_SCHEMAS[responsesSchema] : null;

    payload = {
      model,
      input,
      ...(enhancedSystemPrompt ? { instructions: enhancedSystemPrompt } : {}),
      ...(config.maxTokens ? { max_output_tokens: config.maxTokens } : {}),
      ...(schema ? {
        text: {
          format: {
            type: 'json_schema',
            name: schema.name,
            description: schema.description,
            schema: schema.schema,
            strict: schema.strict
          }
        }
      } : undefined),
      stream: shouldStream,
      ...(shouldStream ? { include_usage: true, stream_options: { include_usage: true } } : {}),
      ...cleanGenParams
    };

    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) delete payload[key];
    });
  } else {
    url = baseUrl;

    const finalMessages = config.messages || [
      { role: 'system', content: enhancedSystemPrompt },
      { role: 'user', content: userPrompt }
    ];

    payload = {
      model,
      messages: finalMessages,
      ...(config.maxTokens ? { max_tokens: config.maxTokens } : {}),
      response_format: structuredOutput && provider !== ExternalProvider.Ollama ? { type: responseFormat } : undefined,
      stream: shouldStream,
      ...(shouldStream ? { include_usage: true, stream_options: { include_usage: true } } : {}),
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...cleanGenParams
    };

    if (cleanGenParams.temperature === undefined) {
      const defaults = SettingsService.getSettings().defaultGenerationParams;
      if (defaults && defaults.temperature !== undefined) {
        payload.temperature = defaults.temperature;
      }
    }
  }

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
      });

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const backoff = retryDelay * Math.pow(2, attempt);
          logger.warn(`Attempt ${attempt + 1} failed (${response.status}). Retrying in ${backoff}ms...`);
          await sleep(backoff);
          continue;
        } else {
          const errText = await response.text();
          throw new Error(`${provider} API Error ${response.status} after ${maxRetries} retries: ${errText}`);
        }
      }

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`${provider} API Error: ${response.status} - ${err}`);
      }

      if (shouldStream) {
        const rawContent = await processStreamResponse(
          response,
          provider,
          (chunk, accumulated, usage) => {
            return onStreamChunk!(chunk, accumulated, streamPhase, usage);
          },
          signal,
          apiType
        );

        if (!rawContent) {
          logger.warn("Streaming returned empty content");
          throw new Error("Streaming returned empty content");
        }

        if (!structuredOutput) {
          return rawContent;
        }
        return parseJsonContent(rawContent, { requiredFields: selectedFields });
      }

      const data = await response.json();

      // Extract usage data from non-streaming response
      if (onUsage && data.usage) {
        const usage = data.usage;
        const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens
          ?? usage.reasoning_tokens
          ?? 0;
        onUsage({
          prompt_tokens: usage.prompt_tokens || usage.input_tokens || 0,
          completion_tokens: usage.completion_tokens || usage.output_tokens || 0,
          total_tokens: usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0)),
          reasoning_tokens: reasoningTokens,
          cost: 0
        });
      }

      if (provider === ExternalProvider.Anthropic) {
        const content = data.content?.[0]?.text || "";
        return parseJsonContent(content, { requiredFields: selectedFields });
      } else if (isResponsesApi) {
        const output = data.output || [];
        const messageOutput = output.find((o: any) => o.type === 'message') || output[0];

        let rawContent = '';
        if (messageOutput?.content) {
          if (Array.isArray(messageOutput.content)) {
            rawContent = messageOutput.content
              .filter((c: any) => c.type === 'output_text')
              .map((c: any) => c.text)
              .join('');
          } else if (typeof messageOutput.content === 'string') {
            rawContent = messageOutput.content;
          }
        }

        if (!rawContent && data.text) {
          rawContent = typeof data.text === 'string' ? data.text : JSON.stringify(data.text);
        }

        if (!rawContent) {
          logger.warn("Responses API returned empty content", data);
          throw new Error("Responses API returned empty content (check console for details)");
        }

        if (!structuredOutput) {
          return rawContent;
        }

        const parsed = parseJsonContent(rawContent, { requiredFields: selectedFields });
        return parsed;
      } else {
        const choice = data.choices?.[0];
        const message = choice?.message;

        let rawContent = message?.content;
        if (!rawContent && !message?.tool_calls) {
          rawContent = message?.reasoning || message?.reasoning_content || "";
        }

        // Native mode: combine reasoning_content with content using <think> tags
        // This mirrors the streaming behavior where reasoning_content is wrapped in <think> tags
        if (useNativeOutput) {
          const reasoningContent = message?.reasoning_content || message?.reasoning;
          const contentPart = message?.content || '';
          if (reasoningContent && contentPart) {
            rawContent = `<think>${reasoningContent}</think>${contentPart}`;
          } else if (reasoningContent) {
            rawContent = `<think>${reasoningContent}</think>`;
          } else {
            rawContent = contentPart;
          }
        }

        if (message?.tool_calls) {
          rawContent = rawContent || "";
          for (const tc of message.tool_calls) {
            rawContent += `\n<tool_call>\n${JSON.stringify({ name: tc.function.name, arguments: JSON.parse(tc.function.arguments) }, null, 2)}\n</tool_call>\n`;
          }
        }

        if (!rawContent) {
          logger.warn("Provider returned empty content", data);
          throw new Error("Provider returned empty content (check console for details)");
        }

        if (structuredOutput && provider === ExternalProvider.Ollama) {
          const parsed = parseJsonContent(rawContent, { requiredFields: selectedFields });
          return parsed;
        }

        if (!structuredOutput) {
          return rawContent;
        }

        const parsed = parseJsonContent(rawContent, { requiredFields: selectedFields });
        return parsed;
      }

    } catch (err: any) {
      if (err.name === 'AbortError') throw err;

      // If MissingFieldsError, don't retry - the model returned incomplete data
      if (err instanceof MissingFieldsError) {
        logger.error(`Missing required fields in response: ${err.missingFields.join(', ')}`);
        throw err;
      }

      lastError = err;

      if (attempt < maxRetries) {
        const backoff = retryDelay * Math.pow(2, attempt);
        logger.warn(`Attempt ${attempt + 1} network error. Retrying in ${backoff}ms...`, err);
        await sleep(backoff);
        continue;
      }
    }
  }

  throw lastError;
};
