import { JobStatus } from '../../jobs/jobStore.js';
import { callChatCompletion } from '../../services/aiClient.js';
import { decryptKey } from '../../utils/keyEncryption.js';
import { sanitizeReasoningContent } from '../../utils/reasoningSanitizer.js';

/**
 * Strip markdown code block encapsulation from AI responses
 * Handles: ```text```, ```json```, ```markdown```, plain ```, etc.
 */
const stripCodeBlocks = (text) => {
    if (!text) return text;
    let cleaned = text.trim();

    // Match opening ``` with optional language identifier and closing ```
    const codeBlockMatch = cleaned.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/);
    if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
    }

    return cleaned;
};

/**
 * Clean AI rewrite output of unwanted tags and model artifacts.
 * - Always strips <tool_call> tags and content (model artifact, never wanted)
 * - For reasoning field: strips <think> tag wrappers but preserves inner content
 * - For answer/query fields: strips <think> tags AND their content
 */
const cleanRewriteOutput = (text, field) => {
    if (!text) return text;
    let cleaned = text;

    // Always strip <tool_call> tags and content
    cleaned = cleaned.replace(/<tool_call>[\s\S]*?<\/tool_call>\s*/gi, '').trim();
    // Also strip unclosed <tool_call> at start (model started but didn't close)
    cleaned = cleaned.replace(/^<tool_call>[\s\S]*/gi, '').trim();

    if (field === 'reasoning') {
        // For reasoning: strip <think> tag wrappers but keep inner content
        const thinkMatch = cleaned.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
            cleaned = thinkMatch[1].trim();
        } else if (cleaned.startsWith('<think>')) {
            // Unclosed <think> tag — strip the opener
            cleaned = cleaned.replace(/^<think>\s*/, '').trim();
        }
    } else {
        // For answer/query: strip <think> tags AND content entirely
        cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
        // Handle unclosed tags: strip just the tag markers
        cleaned = cleaned.replace(/<\/?think>\s*/gi, '').trim();
    }

    if (field === 'reasoning') {
        return sanitizeReasoningContent(cleaned);
    }

    return cleaned;
};

// Default prompts for flat data (query/reasoning/answer fields)
const DEFAULT_REWRITE_SYSTEM_PROMPTS = {
    query: `You are an expert at improving questions. Given the original question, reasoning trace, and answer, rewrite ONLY the question to be clearer, more precise, and better structured. Output ONLY the improved question text, nothing else.`,
    reasoning: `You are an expert at improving reasoning traces. Given the question and the original reasoning, rewrite ONLY the reasoning trace to be more logical, thorough, and well-structured. Output ONLY the improved reasoning text, nothing else.`,
    answer: `You are an expert at improving answers. Given the question, reasoning trace, and original answer, rewrite ONLY the answer to be more accurate, clear, and complete. Output ONLY the improved answer text, nothing else.`,
};

// Default prompts for conversational data (messages array)
const DEFAULT_MESSAGE_REWRITE_PROMPTS = {
    reasoning: `You are an expert at improving reasoning traces in conversations.
Given the conversation context and a target assistant message, rewrite ONLY the reasoning/thinking portion.
The answer portion must remain unchanged.
Output ONLY the improved reasoning text, nothing else.`,
    answer: `You are an expert at improving assistant responses in conversations.
Given the conversation context and a target assistant message, rewrite ONLY the answer/response portion.
Do not include any <think> tags or reasoning - just the final response.
Output ONLY the improved answer text, nothing else.`,
    query: `You are an expert at improving user messages in conversations.
Given the conversation context and a target user message, rewrite it to be clearer and more precise.
Output ONLY the improved message text, nothing else.`,
};

/**
 * Extract reasoning and answer from a message.
 *
 * Priority chain for reasoning:
 *   1. message.reasoning_content (dedicated field, no <think> tags)
 *   2. <think> tags inside message.content
 *   3. message.reasoning (deprecated field)
 *
 * The returned `answer` always has <think> tags stripped from content.
 */
const parseMessageContent = (message) => {
    const content = message.content || '';
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);

    // Always strip <think> tags from content to get clean answer
    const answer = thinkMatch
        ? content.replace(/<think>[\s\S]*?<\/think>/, '').trim()
        : content;

    // Resolve reasoning: reasoning_content > <think> tags > reasoning field
    const reasoning =
        (message.reasoning_content && message.reasoning_content.trim()) ||
        (thinkMatch && thinkMatch[1].trim()) ||
        (message.reasoning && message.reasoning.trim()) ||
        '';

    return { reasoning: sanitizeReasoningContent(reasoning), answer };
};

/**
 * Build context from conversation history for message rewriting.
 * Strips <think> tags from content and shows reasoning separately.
 */
const buildConversationContext = (messages, targetIndex) => {
    const contextMessages = messages.slice(0, targetIndex + 1);
    return contextMessages.map((msg, idx) => {
        const isTarget = idx === targetIndex;
        const label = isTarget ? `[${msg.role.toUpperCase()}] (TARGET TO REWRITE)` : `[${msg.role.toUpperCase()}]`;
        const { reasoning, answer } = parseMessageContent(msg);
        if (reasoning) {
            return `${label}:\n<REASONING_TRACE>\n${reasoning}\n</REASONING_TRACE>\n${answer}`;
        }
        return `${label}:\n${answer}`;
    }).join('\n\n');
};

/**
 * Rebuild message content and reasoning_content fields.
 * Content is always clean (no <think> tags). Reasoning goes in reasoning_content.
 * Returns { content, reasoning_content } to be spread into the message.
 */
const rebuildMessageFields = (originalMessage, newReasoning, newAnswer) => {
    const { reasoning: existingReasoning, answer: existingAnswer } = parseMessageContent(originalMessage);
    const finalReasoning = newReasoning !== undefined ? newReasoning : existingReasoning;
    const finalAnswer = newAnswer !== undefined ? newAnswer : existingAnswer;

    return {
        content: finalAnswer,
        reasoning_content: sanitizeReasoningContent(finalReasoning || ''),
    };
};

const buildRewriteUserPrompt = (log, field) => {
    const query = log.query || log.QUERY || log.full_seed || '';
    const reasoning = log.reasoning || '';
    const answer = log.answer || '';

    switch (field) {
        case 'query':
            return `## ORIGINAL ITEM\nQuery: ${query}\nReasoning: ${reasoning}\nAnswer: ${answer}\n\n---\nRewrite the QUERY only.`;
        case 'reasoning':
            return `## ORIGINAL ITEM\nQuery: ${query}\nReasoning: ${reasoning}\nAnswer: ${answer}\n\n---\nRewrite the REASONING only.`;
        case 'answer':
            return `## ORIGINAL ITEM\nQuery: ${query}\nReasoning: ${reasoning}\nAnswer: ${answer}\n\n---\nRewrite the ANSWER only.`;
        default:
            return '';
    }
};

/**
 * Rewrite a single message in a conversation
 */
const rewriteMessage = async ({ messages, messageIndex, field, baseUrl, apiKey, model, maxRetries, retryDelay, customSystemPrompt, fieldPrompts }) => {
    const message = messages[messageIndex];
    const { reasoning, answer } = parseMessageContent(message);

    const conversationContext = buildConversationContext(messages, messageIndex);

    // Build the user prompt based on what we're rewriting
    let userPrompt;
    let currentContent;

    if (field === 'reasoning') {
        currentContent = reasoning;
        userPrompt = `## CONVERSATION\n${conversationContext}\n\n---\n## CURRENT REASONING TO REWRITE:\n${reasoning}\n\n---\nRewrite ONLY the reasoning. Keep the same logical structure but improve clarity and depth.`;
    } else if (field === 'answer') {
        currentContent = answer;
        userPrompt = `## CONVERSATION\n${conversationContext}\n\n---\n## CURRENT ANSWER TO REWRITE:\n${answer}\n\n---\nRewrite ONLY the answer. Do not include any reasoning or <think> tags.`;
    } else {
        // For query (user messages)
        currentContent = message.content;
        userPrompt = `## CONVERSATION\n${conversationContext}\n\n---\nRewrite ONLY the target user message to be clearer and more precise.`;
    }

    // Get the appropriate system prompt
    const systemPrompt = customSystemPrompt
        || (fieldPrompts && fieldPrompts[field])
        || DEFAULT_MESSAGE_REWRITE_PROMPTS[field]
        || DEFAULT_REWRITE_SYSTEM_PROMPTS[field];

    const result = await callChatCompletion({
        baseUrl,
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        maxTokens: 8192,
        temperature: 0.7,
        maxRetries,
        retryDelay,
    });

    return cleanRewriteOutput(stripCodeBlocks(result), field);
};

/**
 * Process a single log item with conversational data (messages array)
 */
const rewriteConversationalItem = async ({ log, fields, repo, baseUrl, apiKey, model, maxRetries, retryDelay, customSystemPrompt, fieldPrompts }) => {
    const messages = [...log.messages]; // Clone to modify
    const fieldResults = [];
    let anyUpdates = false;

    for (const field of fields) {
        try {
            // Determine which messages to rewrite based on field
            const targetRoles = field === 'query' ? ['user'] : ['assistant'];

            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                if (!targetRoles.includes(msg.role)) continue;

                // For assistant messages, check if there's content to rewrite
                if (msg.role === 'assistant') {
                    const { reasoning, answer } = parseMessageContent(msg);

                    // Skip if the field we want to rewrite is empty
                    if (field === 'reasoning' && !reasoning) continue;
                    if (field === 'answer' && !answer) continue;
                }

                const newContent = await rewriteMessage({
                    messages,
                    messageIndex: i,
                    field,
                    baseUrl,
                    apiKey,
                    model,
                    maxRetries,
                    retryDelay,
                    customSystemPrompt,
                    fieldPrompts,
                });

                if (newContent && newContent.length > 0) {
                    // Update the message based on field
                    if (field === 'reasoning' || field === 'answer') {
                        const newReasoning = field === 'reasoning' ? newContent : undefined;
                        const newAnswer = field === 'answer' ? newContent : undefined;
                        const rebuilt = rebuildMessageFields(msg, newReasoning, newAnswer);
                        messages[i] = {
                            ...messages[i],
                            ...rebuilt,
                        };
                        // Clean up deprecated 'reasoning' field to avoid stale data
                        delete messages[i].reasoning;
                    } else {
                        // Query (user message)
                        messages[i] = {
                            ...messages[i],
                            content: newContent,
                        };
                    }
                    anyUpdates = true;
                }
            }

            fieldResults.push({ field, success: true, mode: 'conversational' });
        } catch (err) {
            fieldResults.push({ field, success: false, error: String(err?.message || err).slice(0, 200) });
        }
    }

    if (anyUpdates) {
        await repo.updateLog(log.id, {
            messages,
            updatedAt: Date.now(),
        });
        return {
            outcome: 'rewritten',
            trace: {
                type: 'rewritten',
                logId: log.id,
                mode: 'conversational',
                messageCount: messages.length,
                fields: fieldResults,
                timestamp: Date.now()
            },
        };
    }

    return {
        outcome: 'skipped',
        trace: {
            type: 'skipped',
            logId: log.id,
            mode: 'conversational',
            reason: 'No messages updated',
            fields: fieldResults,
            timestamp: Date.now()
        },
    };
};

/**
 * Process a single log item with flat data (query/reasoning/answer fields)
 */
const rewriteFlatItem = async ({ log, fields, repo, baseUrl, apiKey, model, maxRetries, retryDelay, customSystemPrompt, fieldPrompts }) => {
    const updates = {};
    const fieldResults = [];

    for (const field of fields) {
        try {
            const systemPrompt = customSystemPrompt
                || (fieldPrompts && fieldPrompts[field])
                || DEFAULT_REWRITE_SYSTEM_PROMPTS[field];
            const userPrompt = buildRewriteUserPrompt(log, field);

            const result = await callChatCompletion({
                baseUrl,
                apiKey,
                model,
                systemPrompt,
                userPrompt,
                maxTokens: 8192,
                temperature: 0.7,
                maxRetries,
                retryDelay,
            });

            const cleaned = cleanRewriteOutput(stripCodeBlocks(result), field);
            if (cleaned.length > 0) {
                updates[field] = cleaned;
                if (field === 'reasoning') {
                    updates.reasoning_content = sanitizeReasoningContent(cleaned);
                }
                fieldResults.push({ field, success: true, length: cleaned.length });
            } else {
                fieldResults.push({ field, success: false, reason: 'Empty response' });
            }
        } catch (err) {
            fieldResults.push({ field, success: false, error: String(err?.message || err).slice(0, 200) });
        }
    }

    if (Object.keys(updates).length > 0) {
        await repo.updateLog(log.id, {
            ...updates,
            updatedAt: Date.now(),
        });
        return {
            outcome: 'rewritten',
            trace: {
                type: 'rewritten',
                logId: log.id,
                mode: 'flat',
                fields: fieldResults,
                timestamp: Date.now()
            },
        };
    }

    return {
        outcome: 'skipped',
        trace: {
            type: 'skipped',
            logId: log.id,
            mode: 'flat',
            reason: 'No fields successfully rewritten',
            fields: fieldResults,
            timestamp: Date.now()
        },
    };
};

/**
 * Process a single log item: detect data type and route to appropriate handler
 */
const rewriteOneItem = async (params) => {
    const { log } = params;

    // Check if this is conversational data (has messages array)
    const isConversational = Array.isArray(log.messages) && log.messages.length > 0;

    if (isConversational) {
        return rewriteConversationalItem(params);
    } else {
        return rewriteFlatItem(params);
    }
};

export const registerStartRewriteRoute = (app, { repo, createJob, updateJob, getJob }) => {
    app.post('/api/jobs/rewrite', async (req, res) => {
        const {
            sessionId, provider, model, baseUrl,
            apiKey: encryptedApiKey, fields, limit, offset, sleepMs,
            concurrency: reqConcurrency, maxRetries: reqMaxRetries, retryDelay: reqRetryDelay,
            systemPrompt, fieldPrompts, itemIds,
        } = req.body || {};

        if (!sessionId) {
            res.status(400).json({ error: 'sessionId is required' });
            return;
        }
        if (!model || !baseUrl || !encryptedApiKey) {
            res.status(400).json({ error: 'model, baseUrl, and apiKey are required' });
            return;
        }
        if (!fields || !Array.isArray(fields) || fields.length === 0) {
            res.status(400).json({ error: 'fields array is required (e.g. ["query", "reasoning", "answer"])' });
            return;
        }

        let apiKey;
        try {
            apiKey = decryptKey(encryptedApiKey);
        } catch (err) {
            res.status(400).json({ error: 'Failed to decrypt API key. Check VITE_API_KEY_SALT configuration.' });
            return;
        }

        const validFields = fields.filter(f => ['query', 'reasoning', 'answer'].includes(f));
        if (validFields.length === 0) {
            res.status(400).json({ error: 'No valid fields provided. Use: query, reasoning, answer' });
            return;
        }

        const job = await createJob('rewrite');
        res.json({ jobId: job.id });

        // Store original params (sans decrypted key) so we can rerun this job later
        const jobParams = {
            sessionId, provider, model, baseUrl,
            fields: validFields, limit, offset, sleepMs,
            concurrency: reqConcurrency, maxRetries: reqMaxRetries, retryDelay: reqRetryDelay,
            systemPrompt, fieldPrompts, itemIds,
        };
        updateJob(job.id, { params: jobParams });

        // Run rewriting in background
        (async () => {
            updateJob(job.id, { status: JobStatus.Running });
            const trace = [];
            try {
                // Resolve settings
                const concurrency = (typeof reqConcurrency === 'number' && reqConcurrency > 0) ? reqConcurrency : 1;
                const maxRetries = (typeof reqMaxRetries === 'number' && reqMaxRetries >= 0) ? reqMaxRetries : 2;
                const retryDelay = (typeof reqRetryDelay === 'number' && reqRetryDelay >= 0) ? reqRetryDelay : 2000;
                const sleepTime = typeof sleepMs === 'number' ? sleepMs : 500;

                const fetchLimit = (typeof offset === 'number' && offset > 0)
                    ? (limit || 10000) + offset
                    : (typeof limit === 'number' && limit > 0 ? limit : undefined);

                let logs = await repo.fetchLogsForProcessing(sessionId, { limit: fetchLimit });

                // Apply offset manually
                if (typeof offset === 'number' && offset > 0) {
                    logs = logs.slice(offset);
                    if (typeof limit === 'number' && limit > 0) {
                        logs = logs.slice(0, limit);
                    }
                }

                // Filter to specific item IDs if provided
                if (Array.isArray(itemIds) && itemIds.length > 0) {
                    const itemIdSet = new Set(itemIds);
                    logs = logs.filter(l => itemIdSet.has(l.id));
                }

                // Count conversational vs flat items
                const conversationalCount = logs.filter(l => Array.isArray(l.messages) && l.messages.length > 0).length;
                const flatCount = logs.length - conversationalCount;

                const total = logs.length;
                let rewritten = 0;
                let skipped = 0;
                let errors = 0;
                let processed = 0;
                let cancelled = false;

                // Log initial job context
                const promptSource = systemPrompt ? 'custom override' : (fieldPrompts ? 'prompt set' : 'defaults');
                trace.push({
                    type: 'info',
                    message: `Job started: session=${sessionId}, model=${model}, provider=${provider || 'unknown'}, prompts: ${promptSource}`,
                    timestamp: Date.now()
                });
                trace.push({
                    type: 'info',
                    message: `Found ${logs.length} logs (${conversationalCount} conversational, ${flatCount} flat), fields: ${validFields.join(', ')}`,
                    timestamp: Date.now()
                });
                trace.push({
                    type: 'info',
                    message: `Config: concurrency=${concurrency}, maxRetries=${maxRetries}, retryDelay=${retryDelay}ms, sleepMs=${sleepTime}ms`,
                    timestamp: Date.now()
                });

                // Process items in batches of `concurrency`
                for (let batchStart = 0; batchStart < logs.length; batchStart += concurrency) {
                    // Check for cancellation before each batch
                    const currentJob = await getJob(job.id);
                    if (currentJob && currentJob.status === JobStatus.Failed) {
                        console.log(`[rewrite] Job ${job.id} cancelled, stopping at ${processed}/${total}`);
                        trace.push({ type: 'warn', message: `Cancelled by user at item ${processed}/${total}`, timestamp: Date.now() });
                        cancelled = true;
                        break;
                    }

                    const batch = logs.slice(batchStart, batchStart + concurrency);

                    // Run batch concurrently
                    const results = await Promise.allSettled(
                        batch.map(log => rewriteOneItem({ log, fields: validFields, repo, baseUrl, apiKey, model, maxRetries, retryDelay, customSystemPrompt: systemPrompt, fieldPrompts }))
                    );

                    // Collect results
                    for (let j = 0; j < results.length; j++) {
                        const r = results[j];
                        if (r.status === 'fulfilled') {
                            trace.push(r.value.trace);
                            if (r.value.outcome === 'rewritten') rewritten++;
                            else skipped++;
                        } else {
                            const err = r.reason;
                            const logId = batch[j]?.id;
                            console.error(`[rewrite] Error rewriting log ${logId}:`, err?.message || err);
                            errors++;
                            trace.push({
                                type: 'error',
                                logId,
                                error: String(err?.message || err).slice(0, 200),
                                timestamp: Date.now()
                            });
                        }
                        processed++;
                    }

                    updateJob(job.id, {
                        progress: { rewritten, skipped, errors, total, current: processed, fields: validFields },
                        result: { totalRewritten: rewritten, totalSkipped: skipped, totalErrors: errors, total, fields: validFields, trace },
                    });

                    // Rate limiting between batches
                    if (sleepTime > 0 && batchStart + concurrency < logs.length) {
                        await new Promise(r => setTimeout(r, sleepTime));
                    }
                }

                if (cancelled) {
                    updateJob(job.id, {
                        result: { totalRewritten: rewritten, totalSkipped: skipped, totalErrors: errors, total, fields: validFields, cancelled: true, trace },
                    });
                } else {
                    updateJob(job.id, {
                        status: JobStatus.Completed,
                        result: { totalRewritten: rewritten, totalSkipped: skipped, totalErrors: errors, total, fields: validFields, trace },
                    });
                }
            } catch (error) {
                console.error('[rewrite] Job failed:', error);
                trace.push({ type: 'error', message: String(error), timestamp: Date.now() });
                updateJob(job.id, { status: JobStatus.Failed, error: String(error), result: { trace } });
            }
        })();
    });
};
