/**
 * AI Rewrite endpoint with SSE streaming (single-item interactive rewriting)
 * POST /api/ai/rewrite/stream - Streaming rewrite for a single field
 * POST /api/ai/rewrite - Non-streaming rewrite
 *
 * This is for interactive/real-time rewriting of individual fields.
 * For batch rewriting, use /api/jobs/rewrite instead.
 */

import { withSSEStreaming, validateRequired, validateEnum } from '../../middleware/withSSEStreaming.js';
import { streamChatCompletion, Providers } from '../../services/aiStreamClient.js';
import { stripCodeBlocks, parseThinkTags } from '../../services/responseParser.js';

/**
 * Default system prompts for each field type
 */
const DEFAULT_REWRITE_PROMPTS = {
    query: `You are an expert at improving questions. Given the context, rewrite ONLY the question to be clearer, more precise, and better structured. Output ONLY the improved question text, nothing else.`,
    reasoning: `You are an expert at improving reasoning traces. Given the context, rewrite ONLY the reasoning to be more logical, thorough, and well-structured. Output ONLY the improved reasoning text, nothing else.`,
    answer: `You are an expert at improving answers. Given the context, rewrite ONLY the answer to be more accurate, clear, and complete. Output ONLY the improved answer text, nothing else.`,
};

const ALLOWED_FIELDS = ['query', 'reasoning', 'answer'];

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
 * Build user prompt for rewriting
 */
const buildRewritePrompt = (field, originalContent, context) => {
    const parts = [];

    if (context) {
        parts.push('## CONTEXT');
        if (context.query) parts.push(`Query: ${context.query}`);
        if (context.reasoning) parts.push(`Reasoning: ${context.reasoning}`);
        if (context.answer) parts.push(`Answer: ${context.answer}`);
        if (context.conversation) parts.push(`Conversation:\n${context.conversation}`);
        parts.push('');
    }

    parts.push(`## CURRENT ${field.toUpperCase()} TO REWRITE`);
    parts.push(originalContent);
    parts.push('');
    parts.push(`---`);
    parts.push(`Rewrite the ${field} above. Output ONLY the improved ${field}, nothing else.`);

    return parts.join('\n');
};

/**
 * Register rewrite routes
 * @param {import('express').Application} app
 * @param {{ decryptKey: (encrypted: string) => string }} deps
 */
export const registerRewriteStreamRoutes = (app, { decryptKey }) => {
    /**
     * Streaming single-item rewrite endpoint
     */
    app.post('/api/ai/rewrite/stream', async (req, res) => {
        const {
            apiKey: encryptedApiKey,
            provider: rawProvider,
            model,
            baseUrl,
            field,
            originalContent,
            context,
            systemPrompt,
            generationParams = {},
            useRawPrompt = false,
        } = req.body || {};

        // Validate required fields before establishing SSE
        if (!validateRequired(res, { apiKey: encryptedApiKey, model, baseUrl, field, originalContent })) {
            return;
        }
        if (!validateEnum(res, 'field', field, ALLOWED_FIELDS)) {
            return;
        }

        // Decrypt API key before SSE (validation phase)
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
            { name: 'rewrite' },
            async (req, res, ctx) => {
                ctx.logWithTime('Provider:', provider, '| Model:', model, '| BaseUrl:', baseUrl, '| Field:', field);
                ctx.logWithTime('Content length:', originalContent?.length || 0);

                const effectiveSystemPrompt = systemPrompt || DEFAULT_REWRITE_PROMPTS[field];
                // useRawPrompt: pass originalContent as-is (caller already built the full prompt)
                const userPrompt = useRawPrompt ? originalContent : buildRewritePrompt(field, originalContent, context);

                ctx.logWithTime('Starting streamChatCompletion... signal aborted:', ctx.abortController.signal.aborted, 'rawPrompt:', useRawPrompt);

                const result = await streamChatCompletion({
                    baseUrl,
                    apiKey,
                    model,
                    provider,
                    messages: [
                        { role: 'system', content: effectiveSystemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    signal: ctx.abortController.signal,
                    maxTokens: generationParams.maxTokens || generationParams.max_tokens || 8192,
                    temperature: generationParams.temperature ?? 0.7,
                    onChunk: (chunk, accumulated, reasoningAccumulated, usage) => {
                        return ctx.onChunk({
                            chunk,
                            accumulated,
                            field,
                            usage: usage || null,
                        });
                    },
                });

                ctx.logWithTime('streamChatCompletion completed, content length:', result?.content?.length || 0);

                // Clean the final result: strip code blocks, <think> tags, and <tool_call> tags
                let stripped = stripCodeBlocks(result.content);
                // Strip <tool_call> tags entirely (model artifact)
                stripped = stripped.replace(/<tool_call>[\s\S]*?<\/tool_call>\s*/gi, '').trim();
                stripped = stripped.replace(/^<tool_call>[\s\S]*/gi, '').trim();

                let cleanedContent;
                let reasoning = result.reasoning || '';

                if (useRawPrompt) {
                    // Raw prompt mode: caller handles their own prompt structure,
                    // just strip think tags and return content as-is
                    const parsed = parseThinkTags(stripped);
                    cleanedContent = parsed.hasThinkTags ? (parsed.answer || parsed.reasoning || stripped) : stripped;
                    reasoning = parsed.reasoning || reasoning;
                } else {
                    const parsed = parseThinkTags(stripped);

                    // For reasoning field: if model wrapped output in <think> tags,
                    // the actual content is in parsed.reasoning, not parsed.answer
                    if (field === 'reasoning' && parsed.hasThinkTags && parsed.reasoning && !parsed.answer) {
                        cleanedContent = parsed.reasoning;
                    } else {
                        cleanedContent = parsed.hasThinkTags ? parsed.answer : stripped;
                    }
                    reasoning = parsed.reasoning || reasoning;
                }

                return {
                    success: true,
                    result: {
                        field,
                        content: cleanedContent,
                        reasoning,
                        originalContent,
                        usage: result.usage,
                    },
                };
            }
        );

        // Execute the stream handler
        await streamHandler(req, res);
    });

    /**
     * Non-streaming single-item rewrite endpoint
     */
    app.post('/api/ai/rewrite', async (req, res) => {
        const {
            apiKey: encryptedApiKey,
            provider: rawProvider,
            model,
            baseUrl,
            field,
            originalContent,
            context,
            systemPrompt,
            generationParams = {},
        } = req.body || {};

        // Validate required fields
        if (!encryptedApiKey || !model || !baseUrl || !field || !originalContent) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        if (!ALLOWED_FIELDS.includes(field)) {
            res.status(400).json({ error: `field must be one of: ${ALLOWED_FIELDS.join(', ')}` });
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
            const effectiveSystemPrompt = systemPrompt || DEFAULT_REWRITE_PROMPTS[field];
            const userPrompt = buildRewritePrompt(field, originalContent, context);

            let finalContent = '';
            let finalUsage = null;

            await streamChatCompletion({
                baseUrl,
                apiKey,
                model,
                provider,
                messages: [
                    { role: 'system', content: effectiveSystemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                maxTokens: generationParams.maxTokens || generationParams.max_tokens || 8192,
                temperature: generationParams.temperature ?? 0.7,
                onChunk: (chunk, accumulated, reasoningAccumulated, usage) => {
                    finalContent = accumulated;
                    if (usage) finalUsage = usage;
                },
            });

            let stripped = stripCodeBlocks(finalContent);
            // Strip <tool_call> tags entirely (model artifact)
            stripped = stripped.replace(/<tool_call>[\s\S]*?<\/tool_call>\s*/gi, '').trim();
            stripped = stripped.replace(/^<tool_call>[\s\S]*/gi, '').trim();

            const parsed = parseThinkTags(stripped);

            let cleanedContent;
            if (field === 'reasoning' && parsed.hasThinkTags && parsed.reasoning && !parsed.answer) {
                cleanedContent = parsed.reasoning;
            } else {
                cleanedContent = parsed.hasThinkTags ? parsed.answer : stripped;
            }

            res.json({
                success: true,
                result: {
                    field,
                    content: cleanedContent,
                    reasoning: parsed.reasoning || '',
                    originalContent,
                    usage: finalUsage,
                },
            });
        } catch (error) {
            console.error('[rewrite] Error:', error.message);
            res.status(500).json({
                error: error.message,
                code: error.status || 500,
            });
        }
    });
};
