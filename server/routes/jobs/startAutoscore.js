import { JobStatus } from '../../jobs/jobStore.js';
import { callChatCompletion } from '../../services/aiClient.js';
import { decryptKey } from '../../utils/keyEncryption.js';

const SCORING_SYSTEM_PROMPT = `You are an expert evaluator. Score the quality of both the reasoning and answer on a scale of 1-5, where 1 is poor and 5 is excellent. Respond with ONLY an unified single digit (1-5).`;

const buildScoringUserPrompt = (log) => {
    const query = log.query || log.QUERY || log.full_seed || '';
    const reasoning = log.reasoning || '';
    const answer = log.answer || '';
    return `## ITEM TO SCORE
Query: ${query}
Reasoning Trace: ${reasoning}
Answer: ${answer}

---
Based on the criteria above, provide a 1-5 score.`;
};

const parseScore = (text) => {
    const match = String(text).match(/[1-5]/);
    return match ? parseInt(match[0], 10) : 0;
};

/**
 * Process a single log item: call AI, parse score, update via repo.
 */
const scoreOneItem = async ({ log, repo, baseUrl, apiKey, model, maxRetries, retryDelay }) => {
    const userPrompt = buildScoringUserPrompt(log);
    const result = await callChatCompletion({
        baseUrl,
        apiKey,
        model,
        systemPrompt: SCORING_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 64,
        temperature: 0.3,
        maxRetries,
        retryDelay,
    });

    const score = parseScore(result);
    if (score > 0) {
        await repo.updateLog(log.id, {
            score,
            updatedAt: Date.now(),
        });
        return {
            outcome: 'scored',
            trace: { type: 'scored', logId: log.id, score, rawResponse: String(result).slice(0, 100), timestamp: Date.now() },
        };
    }
    return {
        outcome: 'skipped',
        trace: { type: 'skipped', logId: log.id, reason: 'Could not parse score from response', rawResponse: String(result).slice(0, 100), timestamp: Date.now() },
    };
};

export const registerStartAutoscoreRoute = (app, { repo, createJob, updateJob, getJob }) => {
    app.post('/api/jobs/autoscore', async (req, res) => {
        const {
            sessionId, provider, model, baseUrl,
            apiKey: encryptedApiKey, limit, offset, sleepMs,
            concurrency: reqConcurrency, maxRetries: reqMaxRetries, retryDelay: reqRetryDelay,
            force, itemIds,
        } = req.body || {};

        if (!sessionId) {
            res.status(400).json({ error: 'sessionId is required' });
            return;
        }
        if (!model || !baseUrl || !encryptedApiKey) {
            res.status(400).json({ error: 'model, baseUrl, and apiKey are required' });
            return;
        }

        let apiKey;
        try {
            apiKey = decryptKey(encryptedApiKey);
        } catch (err) {
            res.status(400).json({ error: 'Failed to decrypt API key. Check VITE_API_KEY_SALT configuration.' });
            return;
        }

        const job = await createJob('autoscore');
        res.json({ jobId: job.id });

        // Store original params (sans decrypted key) so we can rerun this job later
        const jobParams = {
            sessionId, provider, model, baseUrl,
            limit, offset, sleepMs,
            concurrency: reqConcurrency, maxRetries: reqMaxRetries, retryDelay: reqRetryDelay,
            force: !!force, itemIds,
        };
        updateJob(job.id, { params: jobParams });

        // Run scoring in background
        (async () => {
            updateJob(job.id, { status: JobStatus.Running });
            const trace = [];
            try {
                // Resolve settings
                const concurrency = (typeof reqConcurrency === 'number' && reqConcurrency > 0) ? reqConcurrency : 1;
                const maxRetries = (typeof reqMaxRetries === 'number' && reqMaxRetries >= 0) ? reqMaxRetries : 2;
                const retryDelay = (typeof reqRetryDelay === 'number' && reqRetryDelay >= 0) ? reqRetryDelay : 2000;
                const sleepTime = typeof sleepMs === 'number' ? sleepMs : 500;

                // Fetch all logs for this session
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

                // Filter to only unscored logs unless force is set
                const unscoredLogs = force ? logs : logs.filter(log => !log.score);
                const total = unscoredLogs.length;
                let scored = 0;
                let skipped = 0;
                let errors = 0;
                let processed = 0;
                let cancelled = false;

                // Log initial job context
                trace.push({
                    type: 'info',
                    message: `Job started: session=${sessionId}, model=${model}, provider=${provider || 'unknown'}`,
                    timestamp: Date.now()
                });
                trace.push({
                    type: 'info',
                    message: `Found ${logs.length} total logs, ${unscoredLogs.length} unscored`,
                    timestamp: Date.now()
                });
                trace.push({
                    type: 'info',
                    message: `Config: concurrency=${concurrency}, maxRetries=${maxRetries}, retryDelay=${retryDelay}ms, sleepMs=${sleepTime}ms`,
                    timestamp: Date.now()
                });

                // Process items in batches of `concurrency`
                for (let batchStart = 0; batchStart < unscoredLogs.length; batchStart += concurrency) {
                    // Check for cancellation before each batch
                    const currentJob = await getJob(job.id);
                    if (currentJob && currentJob.status === JobStatus.Failed) {
                        console.log(`[autoscore] Job ${job.id} cancelled, stopping at ${processed}/${total}`);
                        trace.push({ type: 'warn', message: `Cancelled by user at item ${processed}/${total}`, timestamp: Date.now() });
                        cancelled = true;
                        break;
                    }

                    const batch = unscoredLogs.slice(batchStart, batchStart + concurrency);

                    // Run batch concurrently
                    const results = await Promise.allSettled(
                        batch.map(log => scoreOneItem({ log, repo, baseUrl, apiKey, model, maxRetries, retryDelay }))
                    );

                    // Collect results
                    for (let j = 0; j < results.length; j++) {
                        const r = results[j];
                        if (r.status === 'fulfilled') {
                            trace.push(r.value.trace);
                            if (r.value.outcome === 'scored') scored++;
                            else skipped++;
                        } else {
                            const err = r.reason;
                            const logId = batch[j]?.id;
                            console.error(`[autoscore] Error scoring log ${logId}:`, err?.message || err);
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
                        progress: { scored, skipped, errors, total, current: processed },
                        result: { totalScored: scored, totalSkipped: skipped, totalErrors: errors, total, trace },
                    });

                    // Rate limiting between batches
                    if (sleepTime > 0 && batchStart + concurrency < unscoredLogs.length) {
                        await new Promise(r => setTimeout(r, sleepTime));
                    }
                }

                if (cancelled) {
                    updateJob(job.id, {
                        result: { totalScored: scored, totalSkipped: skipped, totalErrors: errors, total, cancelled: true, trace },
                    });
                } else {
                    updateJob(job.id, {
                        status: JobStatus.Completed,
                        result: { totalScored: scored, totalSkipped: skipped, totalErrors: errors, total, trace },
                    });
                }
            } catch (error) {
                console.error('[autoscore] Job failed:', error);
                trace.push({ type: 'error', message: String(error), timestamp: Date.now() });
                updateJob(job.id, { status: JobStatus.Failed, error: String(error), result: { trace } });
            }
        })();
    });
};
