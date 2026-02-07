/**
 * AI Chat endpoint with SSE streaming and tool calling support
 * POST /api/ai/chat/stream - Streaming chat
 * POST /api/ai/chat - Non-streaming chat
 */

import { withSSEStreaming, validateRequired, SSEEventTypes } from '../../middleware/withSSEStreaming.js';
import { streamChatCompletion, Providers } from '../../services/aiStreamClient.js';
import { parseThinkTags, parseToolCalls } from '../../services/responseParser.js';

/**
 * Map external provider names to internal provider identifiers
 */
const mapProvider = (provider) => {
    const normalized = (provider || '').toLowerCase();
    if (normalized.includes('anthropic') || normalized.includes('claude')) {
        return Providers.ANTHROPIC;
    }
    if (normalized.includes('ollama')) {
        return Providers.OLLAMA;
    }
    if (normalized.includes('openrouter')) {
        return Providers.OPENROUTER;
    }
    if (normalized.includes('gemini') || normalized.includes('google')) {
        return Providers.GEMINI;
    }
    return Providers.OPENAI;
};

/**
 * Register chat routes
 * @param {import('express').Application} app
 * @param {{ decryptKey: (encrypted: string) => string }} deps
 */
export const registerChatRoutes = (app, { decryptKey }) => {
    /**
     * Simple SSE test endpoint - sends 5 chunks over 2.5 seconds
     * Test with: curl -N http://localhost:8787/api/ai/test-sse
     */
    app.get('/api/ai/test-sse', withSSEStreaming(
        { name: 'test-sse' },
        async (req, res, ctx) => {
            ctx.logWithTime('Starting test...');

            // Send 5 chunks with 500ms delay each
            for (let i = 1; i <= 5; i++) {
                await new Promise(r => setTimeout(r, 500));

                if (ctx.isAborted()) {
                    ctx.logWithTime('Client disconnected during test');
                    return { success: false, reason: 'aborted' };
                }

                ctx.logWithTime('Sending chunk', i);
                ctx.onChunk({ count: i, message: `Test chunk ${i}`, timestamp: Date.now() });
            }

            ctx.logWithTime('Test complete');
            return { success: true, total: 5 };
        }
    ));

    /**
     * POST version of SSE test - for testing POST + SSE combo
     */
    app.post('/api/ai/test-sse-post', withSSEStreaming(
        { name: 'test-sse-post' },
        async (req, res, ctx) => {
            ctx.logWithTime('Request body:', JSON.stringify(req.body).slice(0, 100));

            for (let i = 1; i <= 5; i++) {
                await new Promise(r => setTimeout(r, 500));

                if (ctx.isAborted()) {
                    return { success: false, reason: 'aborted' };
                }

                ctx.onChunk({ count: i, message: `Test chunk ${i}`, timestamp: Date.now() });
            }

            return { success: true, total: 5 };
        }
    ));

    /**
     * Streaming chat endpoint with tool calling
     */
    app.post('/api/ai/chat/stream', async (req, res) => {
        const {
            apiKey: encryptedApiKey,
            provider: rawProvider,
            model,
            baseUrl,
            messages,
            tools,
            systemPrompt,
            generationParams = {},
        } = req.body || {};

        // Validate required fields before establishing SSE
        if (!validateRequired(res, { apiKey: encryptedApiKey, model, baseUrl })) {
            return;
        }
        if (!messages || !Array.isArray(messages)) {
            res.status(400).json({ error: 'messages array is required' });
            return;
        }

        // Decrypt API key before SSE
        let apiKey;
        try {
            apiKey = decryptKey(encryptedApiKey);
        } catch (err) {
            res.status(400).json({ error: 'Failed to decrypt API key' });
            return;
        }

        const provider = mapProvider(rawProvider);

        // Use the unified SSE streaming wrapper
        const streamHandler = withSSEStreaming(
            { name: 'chat' },
            async (req, res, ctx) => {
                ctx.logWithTime('Provider:', provider, '| Model:', model, '| BaseUrl:', baseUrl);
                ctx.logWithTime('Messages count:', messages?.length || 0, '| Tools:', tools?.length || 0);

                // Prepend system prompt if provided
                const finalMessages = systemPrompt
                    ? [{ role: 'system', content: systemPrompt }, ...messages]
                    : messages;

                ctx.logWithTime('Starting streamChatCompletion... signal aborted:', ctx.abortController.signal.aborted);

                const result = await streamChatCompletion({
                    baseUrl,
                    apiKey,
                    model,
                    provider,
                    messages: finalMessages,
                    tools: tools || undefined,
                    signal: ctx.abortController.signal,
                    maxTokens: generationParams.maxTokens || generationParams.max_tokens || 4096,
                    temperature: generationParams.temperature ?? 0.7,
                    onChunk: (chunk, accumulated, reasoningAccumulated, usage, toolCalls) => {
                        if (ctx.isAborted()) {
                            return false;
                        }

                        // Parse thinking and tool calls from accumulated
                        const parsed = parseThinkTags(accumulated);
                        const xmlToolCalls = parseToolCalls(accumulated);

                        // Send chunk event with parsed content
                        return ctx.onChunk({
                            chunk,
                            accumulated,
                            thinking: parsed.reasoning || null,
                            content: parsed.answer,
                            toolCalls: toolCalls || xmlToolCalls.length > 0 ? (toolCalls || xmlToolCalls) : null,
                            usage: usage || null,
                        });
                    },
                });

                ctx.logWithTime('streamChatCompletion completed, content length:', result?.content?.length || 0);
                ctx.logWithTime('Result tool calls:', result.toolCalls ? JSON.stringify(result.toolCalls).slice(0, 500) : 'none');

                // Final parsing
                const finalParsed = parseThinkTags(result.content);
                const finalXmlToolCalls = parseToolCalls(result.content);
                const allToolCalls = result.toolCalls || finalXmlToolCalls;

                ctx.logWithTime('All tool calls:', allToolCalls.length > 0 ? JSON.stringify(allToolCalls).slice(0, 500) : 'none');

                return {
                    success: true,
                    result: {
                        content: finalParsed.answer,
                        thinking: finalParsed.reasoning || null,
                        toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
                        usage: result.usage,
                    },
                };
            }
        );

        // Execute the stream handler
        await streamHandler(req, res);
    });

    /**
     * Non-streaming chat endpoint
     */
    app.post('/api/ai/chat', async (req, res) => {
        const {
            apiKey: encryptedApiKey,
            provider: rawProvider,
            model,
            baseUrl,
            messages,
            tools,
            systemPrompt,
            generationParams = {},
        } = req.body || {};

        // Validate required fields
        if (!encryptedApiKey || !model || !baseUrl || !messages) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        // Decrypt API key
        let apiKey;
        try {
            apiKey = decryptKey(encryptedApiKey);
        } catch (err) {
            res.status(400).json({ error: 'Failed to decrypt API key' });
            return;
        }

        const provider = mapProvider(rawProvider);

        try {
            const finalMessages = systemPrompt
                ? [{ role: 'system', content: systemPrompt }, ...messages]
                : messages;

            const result = await streamChatCompletion({
                baseUrl,
                apiKey,
                model,
                provider,
                messages: finalMessages,
                tools: tools || undefined,
                maxTokens: generationParams.maxTokens || generationParams.max_tokens || 4096,
                temperature: generationParams.temperature ?? 0.7,
                onChunk: () => {}, // No-op for non-streaming
            });

            const parsed = parseThinkTags(result.content);
            const xmlToolCalls = parseToolCalls(result.content);
            const allToolCalls = result.toolCalls || xmlToolCalls;

            res.json({
                success: true,
                result: {
                    content: parsed.answer,
                    thinking: parsed.reasoning || null,
                    toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
                    usage: result.usage,
                },
            });
        } catch (error) {
            console.error('[chat] Error:', error.message);
            res.status(500).json({
                error: error.message,
                code: error.status || 500,
            });
        }
    });
};
