import { ExternalProvider, ApiType } from '../../types';
import { logger } from '../../utils/logger';

export async function processStreamResponse(
  response: Response,
  provider: ExternalProvider,
  onChunk: (chunk: string, accumulated: string, usage?: any) => void | false,
  signal?: AbortSignal,
  apiType: ApiType = ApiType.Chat
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body for streaming');

  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';
  let isReasoning = false;
  let toolCalls: Record<number, { name: string, args: string, id?: string }> = {};
  let usageData: any = null;
  const isResponsesApi = apiType === ApiType.Responses;
  let chunkCount = 0;

  let streamError: Error | null = null;

  try {
    while (true) {
      chunkCount++;
      if (signal?.aborted) {
        reader.cancel();
        throw new DOMException('Aborted', 'AbortError');
      }

      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch (readErr: any) {
        // Network disconnect or server closed connection mid-stream
        // Preserve whatever we've accumulated so far instead of losing it
        logger.warn('Stream read error (server may have disconnected):', readErr.message);
        streamError = readErr;
        break;
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        let dataStart = trimmed.startsWith('data: ') ? 6 : -1;
        if (dataStart === -1) {
          const messagePrefix = 'message\t';
          if (trimmed.startsWith(messagePrefix)) {
            dataStart = trimmed.indexOf('data: ');
            if (dataStart !== -1) {
              dataStart = dataStart + 6;
            }
          }
        }

        if (dataStart !== -1) {
          try {
            const json = JSON.parse(trimmed.slice(dataStart));

            let chunk = '';
            let isReasoningChunk = false;

            if (json.usage) {
              usageData = json.usage;
            }

            if (provider === ExternalProvider.Anthropic) {
              if (json.type === 'content_block_delta') {
                chunk = json.delta?.text || '';
              } else if (json.delta?.text) {
                chunk = json.delta.text;
              }
            } else if (isResponsesApi) {
              if (json.type === 'response.output_item.added' || json.type === 'response.output_item.delta') {
                const item = json.item || json.delta;
                if (item?.content) {
                  if (Array.isArray(item.content)) {
                    const textContent = item.content
                      .filter((c: any) => c.type === 'output_text' || c.type === 'text')
                      .map((c: any) => c.text || c.value || '')
                      .join('');
                    if (textContent) chunk = textContent;
                  } else if (typeof item.content === 'string') {
                    chunk = item.content;
                  }
                }
                if (json.delta?.text?.value) {
                  chunk = json.delta.text.value;
                }
              } else if (json.type === 'response.completed') {
                if (json.response?.output) {
                  const output = json.response.output;
                  if (Array.isArray(output) && output.length > 0) {
                    const messageOutput = output.find((o: any) => o.type === 'message') || output[0];
                    if (messageOutput?.content && Array.isArray(messageOutput.content)) {
                      const fullText = messageOutput.content
                        .filter((c: any) => c.type === 'output_text')
                        .map((c: any) => c.text)
                        .join('');
                      if (fullText && !accumulated) {
                        chunk = fullText;
                      }
                    }
                  }
                }
              }
            } else {
              const delta = json.choices?.[0]?.delta;
              if (delta) {
                const reasoningVal = delta.reasoning_content || delta.reasoning;

                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index;
                    if (!toolCalls[idx]) {
                      toolCalls[idx] = { name: '', args: '', id: tc.id };
                    }
                    if (tc.function?.name) toolCalls[idx].name += tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
                  }
                } else if (reasoningVal) {
                  chunk = reasoningVal;
                  isReasoningChunk = true;
                } else if (delta.content) {
                  chunk = delta.content;
                }
              }
            }

            if (isReasoningChunk && !isReasoning) {
              const startTag = '<think>';
              accumulated += startTag;
              if (onChunk(startTag, accumulated, usageData) === false) {
                reader.cancel();
                return accumulated;
              }
              isReasoning = true;
            } else if (!isReasoningChunk && isReasoning && chunk) {
              const endTag = '</think>';
              accumulated += endTag;
              if (onChunk(endTag, accumulated, usageData) === false) {
                reader.cancel();
                return accumulated;
              }
              isReasoning = false;
            }

            if (chunk || usageData) {
              if (chunk) accumulated += chunk;
              if (onChunk(chunk, accumulated, usageData) === false) {
                reader.cancel();
                return accumulated;
              }
            }
          } catch (e) {
            logger.warn('Failed to parse SSE chunk:', trimmed);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Process any remaining data left in the buffer (e.g. last line without trailing newline)
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed !== 'data: [DONE]') {
      const dataStart = trimmed.startsWith('data: ') ? 6 : -1;
      if (dataStart !== -1) {
        try {
          const json = JSON.parse(trimmed.slice(dataStart));
          let chunk = '';
          if (provider === ExternalProvider.Anthropic) {
            chunk = json.delta?.text || json.content?.[0]?.text || '';
          } else if (isResponsesApi) {
            const item = json.item || json.delta;
            chunk = item?.content ? (typeof item.content === 'string' ? item.content : '') : '';
          } else {
            const delta = json.choices?.[0]?.delta;
            chunk = delta?.content || delta?.reasoning_content || delta?.reasoning || '';
          }
          if (chunk) {
            accumulated += chunk;
            onChunk(chunk, accumulated, usageData);
          }
        } catch (e) {
          logger.warn('Failed to parse remaining buffer:', trimmed);
        }
      }
    }
  }

  // If we got a stream error but have no accumulated content, re-throw so it gets retried
  if (streamError && !accumulated.trim()) {
    throw streamError;
  }

  if (isReasoning) {
    const endTag = '</think>';
    accumulated += endTag;
    onChunk(endTag, accumulated);
  }

  const toolIndices = Object.keys(toolCalls).sort();
  if (toolIndices.length > 0) {
    for (const idx of toolIndices) {
      const tc = toolCalls[Number(idx)];
      try {
        const toolXml = `\n<tool_call>\n${JSON.stringify({ name: tc.name, arguments: JSON.parse(tc.args || '{}') }, null, 2)}\n</tool_call>\n`;
        accumulated += toolXml;
        onChunk(toolXml, accumulated, usageData);
      } catch (e) {
        console.warn("Failed to parse tool args at end of stream", tc.args);
        const rawXml = `\n<tool_call>\n{"name": "${tc.name}", "arguments": ${tc.args}}\n</tool_call>\n`;
        accumulated += rawXml;
        onChunk(rawXml, accumulated, usageData);
      }
    }
  }

  return accumulated;
}
