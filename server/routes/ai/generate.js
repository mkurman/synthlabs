/**
 * AI Generation endpoint with SSE streaming
 * POST /api/ai/generate/stream - Streaming generation
 * POST /api/ai/generate - Non-streaming generation
 */

import { withSSEStreaming, validateRequired } from '../../middleware/withSSEStreaming.js';
import { streamChatCompletion, Providers } from '../../services/aiStreamClient.js';
import { ProgressiveParser, stripCodeBlocks } from '../../services/responseParser.js';

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
    // Default to OpenAI-compatible
    return Providers.OPENAI;
};

/**
 * Register generation routes
 * @param {import('express').Application} app
 * @param {{ decryptKey: (encrypted: string) => string }} deps
 */
export const registerGenerateRoutes = (app, { decryptKey }) => {
    /**
     * Streaming generation endpoint
     */
    app.post('/api/ai/generate/stream', async (req, res) => {
        const {
            apiKey: encryptedApiKey,
            provider: rawProvider,
            model,
            baseUrl,
            systemPrompt,
            userPrompt,
            messages: customMessages,
            outputFormat = 'native', // 'native' | 'json' | 'structured'
            generationParams = {},
        } = req.body || {};

        // Validate required fields before establishing SSE
        if (!validateRequired(res, { apiKey: encryptedApiKey, model, baseUrl })) {
            return;
        }
        if (!userPrompt && !customMessages) {
            res.status(400).json({ error: 'userPrompt or messages is required' });
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
            { name: 'generate' },
            async (req, res, ctx) => {
                ctx.logWithTime('Provider:', provider, '| Model:', model, '| BaseUrl:', baseUrl);
                ctx.logWithTime('OutputFormat:', outputFormat);

                const parser = new ProgressiveParser();

                // Build messages array
                const messages = customMessages || [
                    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                    { role: 'user', content: userPrompt },
                ];

                ctx.logWithTime('Starting streamChatCompletion... signal aborted:', ctx.abortController.signal.aborted);

                const result = await streamChatCompletion({
                    baseUrl,
                    apiKey,
                    model,
                    provider,
                    messages,
                    signal: ctx.abortController.signal,
                    maxTokens: generationParams.maxTokens || generationParams.max_tokens || 4096,
                    temperature: generationParams.temperature ?? 0.7,
                    responseFormat: outputFormat === 'json' ? 'json' : undefined,
                    onChunk: (chunk, accumulated, reasoningAccumulated, usage, toolCalls) => {
                        if (ctx.isAborted()) {
                            return false;
                        }

                        // Progressive parsing
                        const parsed = parser.update(accumulated);

                        // Send chunk event with parsed content
                        return ctx.onChunk({
                            chunk,
                            accumulated,
                            parsed: {
                                reasoning: parsed.reasoning,
                                answer: parsed.answer,
                                phase: parsed.phase,
                            },
                            usage: usage || null,
                        });
                    },
                });

                ctx.logWithTime('streamChatCompletion completed, content length:', result?.content?.length || 0);

                // Finalize parsing
                const finalParsed = parser.finalize();

                return {
                    success: true,
                    result: {
                        content: stripCodeBlocks(result.content),
                        reasoning: finalParsed.reasoning,
                        answer: stripCodeBlocks(finalParsed.answer),
                        usage: result.usage,
                        toolCalls: result.toolCalls,
                    },
                };
            }
        );

        // Execute the stream handler
        await streamHandler(req, res);
    });

    /**
     * Non-streaming generation endpoint (for compatibility)
     */
    app.post('/api/ai/generate', async (req, res) => {
        const {
            apiKey: encryptedApiKey,
            provider: rawProvider,
            model,
            baseUrl,
            systemPrompt,
            userPrompt,
            messages: customMessages,
            outputFormat = 'native',
            generationParams = {},
        } = req.body || {};

        // Validate required fields
        if (!encryptedApiKey || !model || !baseUrl || (!userPrompt && !customMessages)) {
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
            const messages = customMessages || [
                ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                { role: 'user', content: userPrompt },
            ];

            let finalResult = null;
            await streamChatCompletion({
                baseUrl,
                apiKey,
                model,
                provider,
                messages,
                maxTokens: generationParams.maxTokens || generationParams.max_tokens || 4096,
                temperature: generationParams.temperature ?? 0.7,
                responseFormat: outputFormat === 'json' ? 'json' : undefined,
                onChunk: (chunk, accumulated, reasoningAccumulated, usage) => {
                    finalResult = { content: accumulated, usage };
                },
            });

            const parser = new ProgressiveParser();
            const parsed = parser.update(finalResult?.content || '');

            res.json({
                success: true,
                result: {
                    content: stripCodeBlocks(finalResult?.content || ''),
                    reasoning: parsed.reasoning,
                    answer: stripCodeBlocks(parsed.answer),
                    usage: finalResult?.usage,
                },
            });
        } catch (error) {
            console.error('[generate] Error:', error.message);
            res.status(500).json({
                error: error.message,
                code: error.status || 500,
            });
        }
    });
};
