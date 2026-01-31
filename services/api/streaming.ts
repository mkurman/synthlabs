import { ExternalProvider, ApiType } from '../../types';
import { logger } from '../../utils/logger';

export async function processStreamResponse(
  response: Response,
  provider: ExternalProvider,
  onChunk: (chunk: string, accumulated: string, usage?: any) => void,
  signal?: AbortSignal,
  apiType: ApiType = ApiType.Chat
): Promise<string> {
  console.log('🔴 externalApiService: processStreamResponse STARTED', { apiType });
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
            console.log('externalApiService: Parsed JSON chunk, has usage:', !!json.usage);

            let chunk = '';
            let isReasoningChunk = false;

            if (json.usage) {
              usageData = json.usage;
              console.log('externalApiService: Captured usage data:', usageData);
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
            logger.warn('Failed to parse SSE chunk:', trimmed);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
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

  console.log('🔴 externalApiService: Stream finished, total chunks:', chunkCount, 'final usage:', usageData);
  return accumulated;
}
