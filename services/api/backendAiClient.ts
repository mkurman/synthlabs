/**
 * Frontend client for backend AI streaming endpoints
 * Handles SSE connections and event parsing for AI generation, chat, and rewrite
 */

import { getBackendUrl, isBackendEnabled } from '../backendClient';
import { encryptKey } from '../../utils/keyEncryption';
import { ExternalProvider } from '../../types';

// --- Types ---

export interface StreamChunkEvent {
    type: 'chunk';
    data: {
        chunk: string;
        accumulated: string;
        parsed?: {
            reasoning: string;
            answer: string;
            phase: string;
        };
        thinking?: string | null;
        content?: string;
        toolCalls?: ToolCall[] | null;
        usage?: UsageData | null;
    };
}

export interface StreamDoneEvent {
    type: 'done';
    data: {
        success: boolean;
        result: {
            content?: string;
            reasoning?: string;
            answer?: string;
            thinking?: string | null;
            toolCalls?: ToolCall[] | null;
            usage?: UsageData | null;
        };
    };
}

export interface StreamErrorEvent {
    type: 'error';
    data: {
        code: string;
        message: string;
        retryable: boolean;
        details?: Record<string, unknown>;
    };
}

export type SSEEvent = StreamChunkEvent | StreamDoneEvent | StreamErrorEvent;

export interface UsageData {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    reasoning_tokens?: number;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown> | string;
}

export interface GenerationParams {
    maxTokens?: number;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
}

export interface StreamGenerateOptions {
    provider: ExternalProvider | string;
    model: string;
    baseUrl: string;
    apiKey: string;
    systemPrompt?: string;
    userPrompt: string;
    messages?: Array<{ role: string; content: string }>;
    outputFormat?: 'native' | 'json' | 'structured';
    generationParams?: GenerationParams;
    onChunk: (chunk: string, accumulated: string, parsed?: { reasoning: string; answer: string; phase: string }, usage?: UsageData | null) => void | false;
    signal?: AbortSignal;
}

export interface StreamChatOptions {
    provider: ExternalProvider | string;
    model: string;
    baseUrl: string;
    apiKey: string;
    messages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }>;
    tools?: unknown[];
    systemPrompt?: string;
    generationParams?: GenerationParams;
    onChunk: (chunk: string, accumulated: string, thinking?: string | null, content?: string, toolCalls?: ToolCall[] | null, usage?: UsageData | null) => void | false;
    signal?: AbortSignal;
}

export interface StreamRewriteOptions {
    provider: ExternalProvider | string;
    model: string;
    baseUrl: string;
    apiKey: string;
    field: 'query' | 'reasoning' | 'answer';
    originalContent: string;
    context?: {
        query?: string;
        reasoning?: string;
        answer?: string;
        conversation?: string;
    };
    systemPrompt?: string;
    generationParams?: GenerationParams;
    /** When true, pass originalContent as the user prompt directly (no server-side wrapping) */
    useRawPrompt?: boolean;
    onChunk: (chunk: string, accumulated: string, usage?: UsageData | null) => void | false;
    signal?: AbortSignal;
}

export interface GenerateResult {
    content: string;
    reasoning: string;
    answer: string;
    usage: UsageData | null;
    toolCalls: ToolCall[] | null;
}

export interface ChatResult {
    content: string;
    thinking: string | null;
    toolCalls: ToolCall[] | null;
    usage: UsageData | null;
}

export interface RewriteResult {
    field: string;
    content: string;
    originalContent: string;
    usage: UsageData | null;
}

// --- SSE Parser ---

/**
 * Parse SSE events from a text chunk
 */
function parseSSEEvents(text: string): SSEEvent[] {
    const events: SSEEvent[] = [];
    const lines = text.split('\n');

    let currentEvent = '';
    let currentData = '';

    for (const line of lines) {
        // Skip comment lines (used for keep-alive or connection confirmation)
        if (line.startsWith(':')) {
            continue;
        }
        if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
            try {
                const data = JSON.parse(currentData);
                events.push({ type: currentEvent as SSEEvent['type'], data } as SSEEvent);
            } catch (e) {
                console.warn('[backendAiClient] Failed to parse SSE data:', currentData.slice(0, 100), e);
            }
            currentEvent = '';
            currentData = '';
        }
    }

    return events;
}

/**
 * Process an SSE response stream
 */
async function processSSEStream<T>(
    response: Response,
    onEvent: (event: SSEEvent) => void | false,
    signal?: AbortSignal
): Promise<T | null> {
    const startTime = Date.now();
    const log = (msg: string, ...args: unknown[]) => console.log(`[backendAiClient +${Date.now() - startTime}ms]`, msg, ...args);

    log('Starting SSE stream processing');
    log('Response headers:', Object.fromEntries(response.headers.entries()));

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('No response body for streaming');
    }

    log('Got reader, starting read loop');

    const decoder = new TextDecoder();
    let buffer = '';
    let result: T | null = null;
    let chunkCount = 0;
    let totalBytesReceived = 0;

    try {
        while (true) {
            if (signal?.aborted) {
                log('Stream aborted by signal');
                reader.cancel();
                throw new DOMException('Aborted', 'AbortError');
            }

            const readPromise = reader.read();

            // Add a timeout to detect if the read hangs
            const timeoutPromise = new Promise<{ done: boolean; value: undefined; timeout: true }>((resolve) =>
                setTimeout(() => resolve({ done: false, value: undefined, timeout: true }), 5000)
            );

            let readResult: { done: boolean; value?: Uint8Array; timeout?: boolean };
            try {
                readResult = await Promise.race([readPromise, timeoutPromise]) as { done: boolean; value?: Uint8Array; timeout?: boolean };
            } catch (readError: any) {
                // When abort signal fires during an active read, the fetch connection is killed
                // and reader.read() rejects with a network error (ERR_INCOMPLETE_CHUNKED_ENCODING).
                // Normalize this to AbortError so callers can handle it consistently.
                if (signal?.aborted) {
                    log('Stream read failed due to abort signal');
                    throw new DOMException('Aborted', 'AbortError');
                }
                throw readError;
            }

            if ('timeout' in readResult && readResult.timeout) {
                log('Read timeout after 5s - still waiting for data');
                // Continue waiting - don't break
                let actualResult: ReadableStreamReadResult<Uint8Array>;
                try {
                    actualResult = await readPromise;
                } catch (readError: any) {
                    if (signal?.aborted) {
                        log('Stream read failed due to abort signal (after timeout)');
                        throw new DOMException('Aborted', 'AbortError');
                    }
                    throw readError;
                }
                if (actualResult.done) {
                    log('Stream done after timeout wait');
                    break;
                }
                // Process the actual result
                const chunk = decoder.decode(actualResult.value, { stream: true });
                chunkCount++;
                totalBytesReceived += actualResult.value?.length || 0;
                buffer += chunk;
            } else {
                const { done, value } = readResult;
                if (done) {
                    log('Stream done (reader returned done:true), total chunks:', chunkCount, 'total bytes:', totalBytesReceived);
                    log('Buffer remaining:', buffer.slice(0, 100));
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                chunkCount++;
                totalBytesReceived += value?.length || 0;
                buffer += chunk;
            }

            // Split on double newlines (SSE event separator)
            const parts = buffer.split('\n\n');
            buffer = parts.pop() || '';

            for (const part of parts) {
                if (!part.trim()) continue;

                const events = parseSSEEvents(part + '\n\n');
                for (const event of events) {
                    if (event.type === 'done') {
                        console.log('[backendAiClient] Received done event');
                        result = event.data.result as T;
                    }
                    if (event.type === 'error') {
                        console.log('[backendAiClient] Received error event:', event.data);
                        const errData = event.data;
                        const error = new Error(errData.message) as Error & { code?: string; retryable?: boolean };
                        error.code = errData.code;
                        error.retryable = errData.retryable;
                        throw error;
                    }

                    const shouldContinue = onEvent(event);
                    if (shouldContinue === false) {
                        reader.cancel();
                        return result;
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    return result;
}

// --- Public API ---

/**
 * Test SSE connectivity with the backend
 * This can be used to debug SSE issues
 */
export async function testSSEConnection(): Promise<{ success: boolean; events: SSEEvent[]; error?: string }> {
    const startTime = Date.now();
    const log = (msg: string, ...args: unknown[]) => console.log(`[testSSE +${Date.now() - startTime}ms]`, msg, ...args);

    try {
        const backendUrl = await getBackendUrl();
        if (!backendUrl) {
            return { success: false, events: [], error: 'No backend URL available' };
        }

        log('Testing SSE with GET endpoint:', `${backendUrl}/api/ai/test-sse`);

        // First test GET endpoint
        const getResponse = await fetch(`${backendUrl}/api/ai/test-sse`, {
            headers: { 'Accept': 'text/event-stream' },
        });

        log('GET response status:', getResponse.status);
        log('GET response headers:', Object.fromEntries(getResponse.headers.entries()));

        const events: SSEEvent[] = [];
        const reader = getResponse.body?.getReader();

        if (!reader) {
            return { success: false, events: [], error: 'No response body' };
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let chunkCount = 0;

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                log('Stream done after', chunkCount, 'chunks');
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            chunkCount++;
            log(`Chunk ${chunkCount}:`, chunk.slice(0, 200));
            buffer += chunk;

            // Parse events
            const parts = buffer.split('\n\n');
            buffer = parts.pop() || '';

            for (const part of parts) {
                if (!part.trim()) continue;
                const parsed = parseSSEEvents(part + '\n\n');
                events.push(...parsed);
                log('Parsed events:', parsed.length);
            }
        }

        reader.releaseLock();

        log('Test complete. Total events:', events.length);
        return { success: events.length > 0, events };

    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log('Test failed:', errorMsg);
        return { success: false, events: [], error: errorMsg };
    }
}

/**
 * Test POST + SSE connectivity
 */
export async function testPostSSEConnection(): Promise<{ success: boolean; events: SSEEvent[]; error?: string }> {
    const startTime = Date.now();
    const log = (msg: string, ...args: unknown[]) => console.log(`[testPostSSE +${Date.now() - startTime}ms]`, msg, ...args);

    try {
        const backendUrl = await getBackendUrl();
        if (!backendUrl) {
            return { success: false, events: [], error: 'No backend URL available' };
        }

        log('Testing SSE with POST endpoint:', `${backendUrl}/api/ai/test-sse-post`);

        const response = await fetch(`${backendUrl}/api/ai/test-sse-post`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            },
            body: JSON.stringify({ test: true }),
        });

        log('POST response status:', response.status);
        log('POST response headers:', Object.fromEntries(response.headers.entries()));

        const events: SSEEvent[] = [];
        const reader = response.body?.getReader();

        if (!reader) {
            return { success: false, events: [], error: 'No response body' };
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let chunkCount = 0;

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                log('Stream done after', chunkCount, 'chunks');
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            chunkCount++;
            log(`Chunk ${chunkCount}:`, chunk.slice(0, 200));
            buffer += chunk;

            // Parse events
            const parts = buffer.split('\n\n');
            buffer = parts.pop() || '';

            for (const part of parts) {
                if (!part.trim()) continue;
                const parsed = parseSSEEvents(part + '\n\n');
                events.push(...parsed);
                log('Parsed events:', parsed.length);
            }
        }

        reader.releaseLock();

        log('Test complete. Total events:', events.length);
        return { success: events.length > 0, events };

    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log('Test failed:', errorMsg);
        return { success: false, events: [], error: errorMsg };
    }
}

/**
 * Check if backend AI streaming is available
 */
export const isBackendAiAvailable = async (): Promise<boolean> => {
    // Try to discover backend even if not explicitly configured
    // This allows auto-discovery via vault file or port scanning
    try {
        const backendUrl = await getBackendUrl();
        const available = Boolean(backendUrl);
        console.log('[backendAiClient] isBackendAiAvailable:', available, '| URL:', backendUrl);
        return available;
    } catch (e) {
        console.log('[backendAiClient] isBackendAiAvailable error:', e);
        return false;
    }
};

/**
 * Stream generation via backend
 */
export async function streamGenerateViaBackend(options: StreamGenerateOptions): Promise<GenerateResult> {
    const backendUrl = await getBackendUrl();
    if (!backendUrl) {
        throw new Error('Backend URL not available');
    }

    const encryptedKey = await encryptKey(options.apiKey);

    const response = await fetch(`${backendUrl}/api/ai/generate/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
            apiKey: encryptedKey,
            provider: options.provider,
            model: options.model,
            baseUrl: options.baseUrl,
            systemPrompt: options.systemPrompt,
            userPrompt: options.userPrompt,
            messages: options.messages,
            outputFormat: options.outputFormat || 'native',
            generationParams: options.generationParams,
        }),
        signal: options.signal,
        // @ts-expect-error - some browsers support this
        keepalive: false, // Don't use keepalive for streaming
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }

    const result = await processSSEStream<GenerateResult>(
        response,
        (event) => {
            if (event.type === 'chunk') {
                return options.onChunk(
                    event.data.chunk,
                    event.data.accumulated,
                    event.data.parsed,
                    event.data.usage
                );
            }
        },
        options.signal
    );

    return result || { content: '', reasoning: '', answer: '', usage: null, toolCalls: null };
}

/**
 * Stream chat via backend
 */
export async function streamChatViaBackend(options: StreamChatOptions): Promise<ChatResult> {
    const startTime = Date.now();
    const log = (msg: string, ...args: unknown[]) => console.log(`[backendAiClient:chat +${Date.now() - startTime}ms]`, msg, ...args);

    log('streamChatViaBackend called');
    const backendUrl = await getBackendUrl();
    log('Backend URL:', backendUrl);
    if (!backendUrl) {
        throw new Error('Backend URL not available');
    }

    const encryptedKey = await encryptKey(options.apiKey);
    log('Sending chat request to:', `${backendUrl}/api/ai/chat/stream`);
    log('Provider:', options.provider, '| Model:', options.model);
    log('BaseUrl:', options.baseUrl);
    log('Messages count:', options.messages?.length || 0);
    log('Signal aborted:', options.signal?.aborted);

    log('Starting fetch...');
    const response = await fetch(`${backendUrl}/api/ai/chat/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
            apiKey: encryptedKey,
            provider: options.provider,
            model: options.model,
            baseUrl: options.baseUrl,
            messages: options.messages,
            tools: options.tools,
            systemPrompt: options.systemPrompt,
            generationParams: options.generationParams,
        }),
        signal: options.signal,
        // @ts-expect-error - some browsers support this
        keepalive: false, // Don't use keepalive for streaming
    });

    log('Response received - status:', response.status, response.statusText);
    log('Response type:', response.type);
    log('Response body exists:', !!response.body);
    log('Response body locked:', response.body?.locked);

    if (!response.ok) {
        const text = await response.text();
        log('Error response:', text);
        throw new Error(text || `Request failed: ${response.status}`);
    }

    log('Starting SSE stream processing...');
    let eventCount = 0;
    const result = await processSSEStream<ChatResult>(
        response,
        (event) => {
            eventCount++;
            if (eventCount <= 3 || eventCount % 10 === 0) {
                log(`Processing event #${eventCount}, type: ${event.type}`);
            }
            if (event.type === 'chunk') {
                return options.onChunk(
                    event.data.chunk,
                    event.data.accumulated,
                    event.data.thinking,
                    event.data.content,
                    event.data.toolCalls,
                    event.data.usage
                );
            }
        },
        options.signal
    );

    log('Stream processing complete, total events:', eventCount, 'result:', !!result);

    return result || { content: '', thinking: null, toolCalls: null, usage: null };
}

/**
 * Stream rewrite via backend
 */
export async function streamRewriteViaBackend(options: StreamRewriteOptions): Promise<RewriteResult> {
    const backendUrl = await getBackendUrl();
    if (!backendUrl) {
        throw new Error('Backend URL not available');
    }

    const encryptedKey = await encryptKey(options.apiKey);

    const response = await fetch(`${backendUrl}/api/ai/rewrite/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
            apiKey: encryptedKey,
            provider: options.provider,
            model: options.model,
            baseUrl: options.baseUrl,
            field: options.field,
            originalContent: options.originalContent,
            context: options.context,
            systemPrompt: options.systemPrompt,
            generationParams: options.generationParams,
            ...(options.useRawPrompt ? { useRawPrompt: true } : {}),
        }),
        signal: options.signal,
        // @ts-expect-error - some browsers support this
        keepalive: false, // Don't use keepalive for streaming
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }

    const result = await processSSEStream<RewriteResult>(
        response,
        (event) => {
            if (event.type === 'chunk') {
                return options.onChunk(
                    event.data.chunk,
                    event.data.accumulated,
                    event.data.usage
                );
            }
        },
        options.signal
    );

    return result || { field: options.field, content: '', originalContent: options.originalContent, usage: null };
}

/**
 * Non-streaming generation via backend
 */
export async function generateViaBackend(options: Omit<StreamGenerateOptions, 'onChunk'>): Promise<GenerateResult> {
    const backendUrl = await getBackendUrl();
    if (!backendUrl) {
        throw new Error('Backend URL not available');
    }

    const encryptedKey = await encryptKey(options.apiKey);

    const response = await fetch(`${backendUrl}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            apiKey: encryptedKey,
            provider: options.provider,
            model: options.model,
            baseUrl: options.baseUrl,
            systemPrompt: options.systemPrompt,
            userPrompt: options.userPrompt,
            messages: options.messages,
            outputFormat: options.outputFormat || 'native',
            generationParams: options.generationParams,
        }),
        signal: options.signal,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.result;
}

/**
 * Non-streaming chat via backend
 */
export async function chatViaBackend(options: Omit<StreamChatOptions, 'onChunk'>): Promise<ChatResult> {
    const backendUrl = await getBackendUrl();
    if (!backendUrl) {
        throw new Error('Backend URL not available');
    }

    const encryptedKey = await encryptKey(options.apiKey);

    const response = await fetch(`${backendUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            apiKey: encryptedKey,
            provider: options.provider,
            model: options.model,
            baseUrl: options.baseUrl,
            messages: options.messages,
            tools: options.tools,
            systemPrompt: options.systemPrompt,
            generationParams: options.generationParams,
        }),
        signal: options.signal,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.result;
}

/**
 * Non-streaming rewrite via backend
 */
export async function rewriteViaBackend(options: Omit<StreamRewriteOptions, 'onChunk'>): Promise<RewriteResult> {
    const backendUrl = await getBackendUrl();
    if (!backendUrl) {
        throw new Error('Backend URL not available');
    }

    const encryptedKey = await encryptKey(options.apiKey);

    const response = await fetch(`${backendUrl}/api/ai/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            apiKey: encryptedKey,
            provider: options.provider,
            model: options.model,
            baseUrl: options.baseUrl,
            field: options.field,
            originalContent: options.originalContent,
            context: options.context,
            systemPrompt: options.systemPrompt,
            generationParams: options.generationParams,
        }),
        signal: options.signal,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.result;
}

// Debug utilities - expose to window for easy testing
if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__backendAiDebug = {
        testSSE: testSSEConnection,
        testPostSSE: testPostSSEConnection,
        isAvailable: isBackendAiAvailable,
        getBackendUrl,
    };
    console.log('[backendAiClient] Debug utilities available at window.__backendAiDebug');
    console.log('  - __backendAiDebug.testSSE()     - Test GET SSE endpoint');
    console.log('  - __backendAiDebug.testPostSSE() - Test POST SSE endpoint');
    console.log('  - __backendAiDebug.isAvailable() - Check if backend is available');
    console.log('  - __backendAiDebug.getBackendUrl() - Get current backend URL');
}
