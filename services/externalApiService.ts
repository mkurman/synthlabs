
import { ExternalProvider, GenerationParams, StreamChunkCallback, StreamPhase } from '../types';
import { PROVIDER_URLS } from '../constants';
import { logger } from '../utils/logger';
import { extractJsonFields } from '../utils/jsonFieldExtractor';
import { SettingsService } from './settingsService';

export interface ExternalApiConfig {
  provider: ExternalProvider;
  apiKey: string;
  model: string;
  customBaseUrl?: string;
  systemPrompt: string;
  userPrompt: string;
  messages?: any[]; // Allow passing full history
  signal?: AbortSignal;
  maxRetries?: number;
  retryDelay?: number;
  generationParams?: GenerationParams;
  structuredOutput?: boolean;
  // Streaming support
  stream?: boolean;
  onStreamChunk?: StreamChunkCallback;
  streamPhase?: StreamPhase;
  // Tool support
  tools?: any[];
  // Optional max tokens (omit to let model use default/maximum)
  maxTokens?: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to parse SSE stream and extract content chunks
// Helper to parse SSE stream and extract content chunks
async function processStreamResponse(
  response: Response,
  provider: ExternalProvider,
  onChunk: (chunk: string, accumulated: string, usage?: any) => void,
  signal?: AbortSignal
): Promise<string> {
  console.log('🔴 externalApiService: processStreamResponse STARTED');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body for streaming');

  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';
  let isReasoning = false;

  // Track tool calls accumulation
  let toolCalls: Record<number, { name: string, args: string, id?: string }> = {};

  // Track usage data
  let usageData: any = null;

  let chunkCount = 0;
  try {
    while (true) {
      chunkCount++;
      if (signal?.aborted) {
        reader.cancel();
        throw new DOMException('Aborted', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        // Handle SSE format: "message\t{json}" or "data: {json}"
        let dataStart = trimmed.startsWith('data: ') ? 6 : -1;
        if (dataStart === -1) {
          // Try to find "data: " after "message\t" prefix
          const messagePrefix = 'message\t';
          if (trimmed.startsWith(messagePrefix)) {
            dataStart = trimmed.indexOf('data: ');
            if (dataStart !== -1) {
              dataStart = dataStart + 6; // Skip past "data: "
            }
          }
        }

        if (dataStart !== -1) {
          try {
            const json = JSON.parse(trimmed.slice(dataStart));
            console.log('externalApiService: Parsed JSON chunk, has usage:', !!json.usage);

            let chunk = '';
            let isReasoningChunk = false;

            // Capture usage data if present
            if (json.usage) {
              usageData = json.usage;
              console.log('externalApiService: Captured usage data:', usageData);
            }

            if (provider === 'anthropic') {
              // Anthropic format: delta.text or content_block_delta
              // Note: Anthropic uses a different stream event structure for tools (content_block_start etc).
              // For simplicity, we assume this logic primarily targets OpenRouter/OpenAI-compatible endpoints where tools are passed directly via delta.tools_calls.
              if (json.type === 'content_block_delta') {
                chunk = json.delta?.text || '';
              } else if (json.delta?.text) {
                chunk = json.delta.text;
              }
            } else {
              // OpenAI-compatible format
              const delta = json.choices?.[0]?.delta;
              if (delta) {
                // Check for various reasoning field names
                const reasoningVal = delta.reasoning_content || delta.reasoning;

                // Check for tool calls
                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index;
                    if (!toolCalls[idx]) {
                      toolCalls[idx] = { name: '', args: '', id: tc.id };
                    }
                    if (tc.function?.name) toolCalls[idx].name += tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
                  }
                  // For streaming tool calls, we don't necessarily emit a text chunk immediately,
                  // but we need to eventually serialize this into the returned "accumulated" string 
                  // or let the parser handle it. 
                  // Our current chat parser looks for <tool_call> JSON </tool_call>.
                  // So we can synthesize this on the fly or just rely on the final object construction.
                  // HOWEVER, `onChunk` expects (chunk, accumulated). 
                  // We should probably serialise completed tool calls into the stream for the UI/Parser.

                  // Simple approach: When we see tool calls, we don't output text chunks, 
                  // but we append the construction to the accumulation at the end?
                  // Actually, to make "streamResponse" return a single string compatible with our parser,
                  // we should convert the tool calls to our internal XML format as they complete?
                  // Or since we only return the final string, we can verify what "accumulated" means.
                  // The UI updates based on 'accumulated'. If we want the UI to "see" the tool call happening, 
                  // we might need to stream it.

                  // But waiting until the end is safer for valid JSON.
                } else if (reasoningVal) {
                  chunk = reasoningVal;
                  isReasoningChunk = true;
                } else if (delta.content) {
                  chunk = delta.content;
                }
              }
            }

            // State transition logic for reasoning tags
            if (isReasoningChunk && !isReasoning) {
              const startTag = '<think>';
              accumulated += startTag;
              onChunk(startTag, accumulated, usageData);
              isReasoning = true;
            } else if (!isReasoningChunk && isReasoning && chunk) {
              const endTag = '</think>';
              accumulated += endTag;
              onChunk(endTag, accumulated, usageData);
              isReasoning = false;
            }

            if (chunk || usageData) {
              if (chunk) accumulated += chunk;
              console.log('externalApiService: calling onChunk with chunk length:', chunk?.length || 0, 'usage:', usageData);
              onChunk(chunk, accumulated, usageData);
            }
          } catch (e) {
            // Skip malformed JSON lines
            logger.warn('Failed to parse SSE chunk:', trimmed);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Close reasoning tag if still open at end of stream
  if (isReasoning) {
    const endTag = '</think>';
    accumulated += endTag;
    onChunk(endTag, accumulated);
  }

  // Append collected tool calls to accumulated string in our internal format
  // so that ChatService.parseResponse can pick them up cleanly.
  // We utilize the <tool_call> format we defined.
  const toolIndices = Object.keys(toolCalls).sort();
  if (toolIndices.length > 0) {
    for (const idx of toolIndices) {
      const tc = toolCalls[Number(idx)];
      try {
        // Validate JSON if complete (optional, just raw dump is usually fine for our parser if valid)
        // Construct our internal representation
        const toolXml = `\n<tool_call>\n${JSON.stringify({ name: tc.name, arguments: JSON.parse(tc.args || '{}') }, null, 2)}\n</tool_call>\n`;
        accumulated += toolXml;
        onChunk(toolXml, accumulated, usageData);
      } catch (e) {
        console.warn("Failed to parse tool args at end of stream", tc.args);
        // Dump raw if parsing fails, aiming for best effort
        const rawXml = `\n<tool_call>\n{"name": "${tc.name}", "arguments": ${tc.args}}\n</tool_call>\n`;
        accumulated += rawXml;
        onChunk(rawXml, accumulated, usageData);
      }
    }
  }

  console.log('🔴 externalApiService: Stream finished, total chunks:', chunkCount, 'final usage:', usageData);
  return accumulated;
}

export const callExternalApi = async (config: ExternalApiConfig): Promise<any> => {
  const {
    provider, apiKey, model, customBaseUrl, systemPrompt, userPrompt, signal,
    maxRetries = 3, retryDelay = 2000, generationParams, structuredOutput,
    stream = false, onStreamChunk, streamPhase, tools
  } = config;

  let baseUrl = provider === 'other' ? customBaseUrl : PROVIDER_URLS[provider];
  let responseFormat = structuredOutput ? 'json_object' : 'text';

  // Ensure custom endpoint ends with /chat/completions for 'other' provider
  if (baseUrl) {
    const isAnthropicFormat = baseUrl.includes('/messages');
    const alreadyHasPath = baseUrl.includes('/chat/completions') || baseUrl.includes('/messages');

    if (!alreadyHasPath && !isAnthropicFormat) {
      baseUrl = `${baseUrl}/chat/completions`;
    }
  }

  if (!baseUrl) {
    throw new Error(`No base URL found for provider: ${provider}`);
  }

  // Remove trailing slash if present
  baseUrl = baseUrl.replace(/\/$/, '');

  // Sanitize API Key
  const safeApiKey = apiKey ? apiKey.replace(/[^\x20-\x7E]/g, '').trim() : '';

  // Determine headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (provider === 'anthropic') {
    headers['x-api-key'] = safeApiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (provider === 'ollama' && !safeApiKey) {
    headers['Authorization'] = 'Bearer ollama-local';
  } else {
    headers['Authorization'] = `Bearer ${safeApiKey}`;
  }

  // Filter undefined generation params
  const cleanGenParams: Record<string, any> = {};
  if (generationParams) {
    if (generationParams.temperature !== undefined) cleanGenParams.temperature = generationParams.temperature;
    if (generationParams.topP !== undefined) cleanGenParams.top_p = generationParams.topP;
    if (generationParams.topK !== undefined) cleanGenParams.top_k = generationParams.topK; // OpenAI typically doesn't use top_k, but others might
    if (generationParams.frequencyPenalty !== undefined) cleanGenParams.frequency_penalty = generationParams.frequencyPenalty;
    if (generationParams.presencePenalty !== undefined) cleanGenParams.presence_penalty = generationParams.presencePenalty;
  }

  // Construct Payload
  let url = '';
  let payload: any = {};

  // Determine if we should actually stream (only if callback provided)
  // Use Boolean() to ensure it's true/false, not the function itself
  const shouldStream = Boolean(stream && onStreamChunk);

  if (provider === 'anthropic') {
    url = `${baseUrl}/messages`;
    payload = {
      model,
      ...(config.maxTokens ? { max_tokens: config.maxTokens } : {}),
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: cleanGenParams.temperature,
      top_p: cleanGenParams.top_p,
      top_k: cleanGenParams.top_k,
      stream: shouldStream
    };
  } else {
    url = baseUrl;
    const finalMessages = config.messages || [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    payload = {
      model,
      messages: finalMessages,
      ...(config.maxTokens ? { max_tokens: config.maxTokens } : {}),
      // Ollama doesn't support response_format for arrays, only json_object or text
      // So we disable structuredOutput for Ollama when we need arrays
      response_format: structuredOutput && provider !== 'ollama' ? { type: responseFormat } : undefined,
      stream: shouldStream,
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...cleanGenParams
    };
    // If temp was not provided in params, check settings, otherwise let provider decide (send nothing)
    if (cleanGenParams.temperature === undefined) {
      // Use defaults from settings if available
      const defaults = SettingsService.getSettings().defaultGenerationParams;
      if (defaults && defaults.temperature !== undefined) {
        payload.temperature = defaults.temperature;
      }
    }
  }

  // RETRY LOOP
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
      });

      // Handle Rate Limits (429) and Server Errors (5xx)
      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const backoff = retryDelay * Math.pow(2, attempt); // Exponential backoff
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

      // STREAMING PATH: process SSE stream
      if (shouldStream) {
        const rawContent = await processStreamResponse(
          response,
          provider,
          (chunk, accumulated, usage) => {
            console.log('externalApiService callExternalApi wrapper - usage:', usage);
            onStreamChunk!(chunk, accumulated, streamPhase, usage);
          },
          signal
        );

        if (!rawContent) {
          logger.warn("Streaming returned empty content");
          throw new Error("Streaming returned empty content");
        }

        if (!structuredOutput) {
          return rawContent;
        }
        return parseJsonContent(rawContent);
      }

      // NON-STREAMING PATH: parse JSON response
      const data = await response.json();

      if (provider === 'anthropic') {
        const content = data.content?.[0]?.text || "";
        return parseJsonContent(content);
      } else {
        const choice = data.choices?.[0];
        const message = choice?.message;

        let rawContent = message?.content;
        if (!rawContent && !message?.tool_calls) {
          rawContent = message?.reasoning || message?.reasoning_content || "";
        }

        // Check for tool calls in non-streaming response
        if (message?.tool_calls) {
          // Append tool calls in our internal XML format
          rawContent = rawContent || "";
          for (const tc of message.tool_calls) {
            rawContent += `\n<tool_call>\n${JSON.stringify({ name: tc.function.name, arguments: JSON.parse(tc.function.arguments) }, null, 2)}\n</tool_call>\n`;
          }
        }

        if (!rawContent) {
          logger.warn("Provider returned empty content", data);
          throw new Error("Provider returned empty content (check console for details)");
        }

        // For Ollama with structuredOutput, we still get text (not json_object) because
        // we disabled response_format for arrays. So we need to parse it.
        if (structuredOutput && provider === 'ollama') {
          const parsed = parseJsonContent(rawContent);
          return parsed;
        }

        if (!structuredOutput) {
          return rawContent;
        }
        
        // For other providers with structuredOutput, parse the JSON content
        const parsed = parseJsonContent(rawContent);
        return parsed;
      }

    } catch (err: any) {
      if (err.name === 'AbortError') throw err; // Don't retry aborts

      lastError = err;

      // If network error (fetch failed completely), also retry
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

// New function to generate synthetic seeds using external providers
export const generateSyntheticSeeds = async (
  baseConfig: Omit<ExternalApiConfig, 'userPrompt' | 'systemPrompt'>,
  topic: string,
  count: number
): Promise<string[]> => {
  const prompt = `Generate ${count} DISTINCT, high-quality, factual text paragraphs about: "${topic}".
  The texts should be suitable for testing an AI's reasoning capabilities.
  
  Output format: A raw JSON array of strings. 
  Example: ["Text paragraph 1...", "Text paragraph 2..."].
  Do not include markdown formatting or explanations. Output ONLY the JSON.`;

  try {
    const result = await callExternalApi({
      ...baseConfig,
      systemPrompt: "You are a high-fidelity synthetic data generator. You output strict JSON arrays of strings.",
      userPrompt: prompt
    });

    // Handle cases where the model might return { "seeds": [...] } instead of just [...]
    if (Array.isArray(result)) {
      return result.map(String);
    }
    if (result && Array.isArray(result.seeds)) {
      return result.seeds.map(String);
    }
    if (result && Array.isArray(result.paragraphs)) {
      return result.paragraphs.map(String);
    }
    
    // Try to extract array from response content if it's a string
    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) {
          return parsed.map(String);
        }
        if (parsed && Array.isArray(parsed.seeds)) {
          return parsed.seeds.map(String);
        }
        if (parsed && Array.isArray(parsed.paragraphs)) {
          return parsed.paragraphs.map(String);
        }
      } catch (parseError) {
        console.error("Failed to parse result string as JSON:", parseError);
      }
    }

    // If result is an object with a content field (common in some API responses)
    if (result && typeof result === 'object' && result.content) {
      try {
        const parsed = typeof result.content === 'string' ? JSON.parse(result.content) : result.content;
        if (Array.isArray(parsed)) {
          return parsed.map(String);
        }
      } catch (parseError) {
        console.error("Failed to parse result.content:", parseError);
      }
    }

    console.warn("generateSyntheticSeeds: Could not extract array from result:", result);
    return [];
  } catch (e) {
    console.error("External Seed Gen failed", e);
    // If it fails, return empty so the UI knows
    return [];
  }
};

// Helper to safely parse JSON from LLM output, handling markdown blocks
function parseJsonContent(content: string): any {
  let cleanContent = content.trim();

  // 1. Try to extract JSON from markdown code blocks
  const codeBlockMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1].trim();
    // Only use the extracted content if it looks like a JSON object or array
    // This prevents extracting internal code blocks (e.g. inside a "reasoning" string)
    // while discarding the surrounding JSON structure.
    if (extracted.startsWith('{') || extracted.startsWith('[')) {
      cleanContent = extracted;
    }
  } else {
    // 2. Fallback: try to strip leading ```json and trailing ``` if no full block found
    // (Only if it looks like it's trying to be a block)
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent
        .replace(/^```json\s*/, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
    }
  }

  // 3. Try direct parse
  try {
    const parsed = JSON.parse(cleanContent);
    // Handle double-encoded JSON (if parsed result is a string)
    if (typeof parsed === 'string') {
      try {
        const doubleParsed = JSON.parse(parsed);
        if (typeof doubleParsed === 'object' && doubleParsed !== null) {
          return doubleParsed;
        }
        // If double parsed is still a string (or failed), we might want to try extraction
        // But if it successfully parsed to a string, it means the model output was a JSON string literal.
        // We will fall through to catch block logic if we want to try extraction on the inner string?
        // Actually, let's just use the inner string as content for extraction
        cleanContent = parsed;
        throw new Error("Parsed as string, forcing extraction");
      } catch (e) {
        // Double parse failed, but we have a string. 
        // Use this string for extraction
        cleanContent = parsed;
        throw new Error("Parsed as string, forcing extraction");
      }
    }
    return parsed;
  } catch (e) {
    // 4. Try to find the first valid { ... } object or [ ... ] array in the text
    // We match from the first '{' to the last '}' or first '[' to last ']'
    const jsonObjectMatch = cleanContent.match(/\{[\s\S]*\}/);
    const jsonArrayMatch = cleanContent.match(/\[[\s\S]*\]/);
    
    // Prefer array match if both exist (for seed generation)
    if (jsonArrayMatch) {
      try {
        return JSON.parse(jsonArrayMatch[0]);
      } catch (e2) {
        // Fall through to object match or repair
      }
    }
    
    if (jsonObjectMatch) {
      try {
        return JSON.parse(jsonObjectMatch[0]);
      } catch (e2) {
        // Fall through to repair
      }
    }

    // 5. Try JSONL format (multiple JSON objects separated by newlines)
    const lines = cleanContent.split('\n').filter(line => line.trim());
    if (lines.length > 1) {
      const jsonlResults: any[] = [];
      let allParsed = true;
      for (const line of lines) {
        try {
          jsonlResults.push(JSON.parse(line.trim()));
        } catch {
          allParsed = false;
          break;
        }
      }
      if (allParsed && jsonlResults.length > 0) {
        // If single result, return it directly; otherwise return array
        return jsonlResults.length === 1 ? jsonlResults[0] : jsonlResults;
      }
    }

    // 6. Try to repair the JSON using json-repair-js
    try {
      const repaired = jsonrepair(cleanContent);
      logger.log("JSON repaired successfully");
      return JSON.parse(repaired);
    } catch (repairError) {
      // Also try repairing the matched object/array if found
      const matchToRepair = jsonArrayMatch || jsonObjectMatch;
      if (matchToRepair) {
        try {
          const repairedMatch = jsonrepair(matchToRepair[0]);
          logger.log("JSON object/array repaired successfully");
          return JSON.parse(repairedMatch);
        } catch {
          // Fall through
        }
      }
    }

    // 7. Try robust field extraction (regex-based) matching the streaming logic
    const extracted = extractJsonFields(cleanContent);
    if (extracted.reasoning || extracted.answer) {
      logger.log("JSON parsing failed, but field extraction succeeded");
      return {
        answer: extracted.answer || cleanContent.trim(), // fallback to raw if no answer found but reasoning exists
        reasoning: extracted.reasoning || "",
        follow_up_question: "" // optional
      };
    }

    // If all parsing fails, wrap the raw text as a fallback response
    // This allows the conversation to continue even if JSON wasn't returned
    console.warn("JSON Parse Failed, using raw text as fallback", e);
    return {
      answer: content.trim(),
      reasoning: "",
      follow_up_question: content.trim() // For user agent responses
    };
  }
}

// ==================== Ollama Integration ====================

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaModelListResponse {
  models: OllamaModel[];
}

/**
 * Fetch available models from a local Ollama instance
 * @param baseUrl - Ollama server URL (default: http://localhost:11434)
 * @returns List of available models or empty array on error
 */
export async function fetchOllamaModels(baseUrl: string = 'http://localhost:11434'): Promise<OllamaModel[]> {
  try {
    // Ollama uses /api/tags endpoint to list models (not /v1/models like OpenAI)
    const url = `${baseUrl.replace(/\/v1\/?$/, '')}/api/tags`;
    logger.log(`Fetching Ollama models from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      logger.warn(`Ollama API returned ${response.status}: ${response.statusText}`);
      return [];
    }

    const data: OllamaModelListResponse = await response.json();
    logger.log(`Found ${data.models?.length || 0} Ollama models`);
    return data.models || [];
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        logger.warn('Ollama connection timed out - is Ollama running?');
      } else if (error.message.includes('fetch')) {
        logger.warn('Could not connect to Ollama - is Ollama running?');
      } else {
        logger.warn('Error fetching Ollama models:', error.message);
      }
    }
    return [];
  }
}

/**
 * Check if Ollama is running and accessible
 * @param baseUrl - Ollama server URL
 * @returns true if Ollama is reachable
 */
export async function checkOllamaStatus(baseUrl: string = 'http://localhost:11434'): Promise<boolean> {
  try {
    const url = `${baseUrl.replace(/\/v1\/?$/, '')}/api/tags`;
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Format Ollama model size for display (e.g., "7B", "13B")
 */
export function formatOllamaModelSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)}GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)}MB`;
}
