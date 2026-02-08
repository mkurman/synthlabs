import { JobStatus } from '../../jobs/jobStore.js';
import { callChatCompletion } from '../../services/aiClient.js';
import { decryptKey } from '../../utils/keyEncryption.js';
import { extractResumeState, canResumeJob } from '../../jobs/jobResume.js';

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
            force, itemIds, resumeJobId,
        } = req.body || {};

        // If resuming, load the previous job
        let existingJob = null;
        if (resumeJobId) {
            existingJob = await getJob(resumeJobId);
            if (!existingJob) {
                res.status(404).json({ error: 'Job to resume not found' });
                return;
            }
            if (!canResumeJob(existingJob)) {
                res.status(400).json({ error: 'Job cannot be resumed (already completed)' });
                return;
            }
        }

        if (!sessionId && !existingJob) {
            res.status(400).json({ error: 'sessionId is required' });
            return;
        }
        if (!existingJob && (!model || !baseUrl || !encryptedApiKey)) {
            res.status(400).json({ error: 'model, baseUrl, and apiKey are required' });
            return;
        }

        let apiKey;
        try {
            apiKey = decryptKey(encryptedApiKey || existingJob?.params?.apiKey);
        } catch (err) {
            res.status(400).json({ error: 'Failed to decrypt API key. Check VITE_API_KEY_SALT configuration.' });
            return;
        }

        // Create new job or update existing for resume
        const job = existingJob || await createJob('autoscore');

        // Mark as running if resuming a failed/stalled job
        if (existingJob && existingJob.status === JobStatus.Failed) {
            updateJob(job.id, { status: JobStatus.Running, error: null });
        }

        res.json({ jobId: job.id });

        // Store original params (sans decrypted key) so we can rerun this job later
        const jobParams = {
            sessionId, provider, model, baseUrl,
            limit, offset, sleepMs,
            concurrency: reqConcurrency, maxRetries: reqMaxRetries, retryDelay: reqRetryDelay,
            force: !!force, itemIds,
        };

        // Store sessionId at top level for easy access by tools/UI
        await updateJob(job.id, {
            params: jobParams,
            sessionId  // Store at top level
        });

        // Run scoring in background
        (async () => {
            updateJob(job.id, { status: JobStatus.Running });

            // Load resume state if resuming
            const resumeState = extractResumeState(existingJob);
            const trace = resumeState.trace;
            const processedIds = resumeState.processedIds;

            try {
                // Use params from existing job or current request
                const params = existingJob?.params || {
                    sessionId, provider, model, baseUrl,
                    limit, offset, sleepMs,
                    concurrency: reqConcurrency, maxRetries: reqMaxRetries, retryDelay: reqRetryDelay,
                    force: !!force, itemIds,
                };

                // Resolve settings
                const concurrency = (typeof params.concurrency === 'number' && params.concurrency > 0) ? params.concurrency : 1;
                const maxRetries = (typeof params.maxRetries === 'number' && params.maxRetries >= 0) ? params.maxRetries : 2;
                const retryDelay = (typeof params.retryDelay === 'number' && params.retryDelay >= 0) ? params.retryDelay : 2000;
                const sleepTime = typeof params.sleepMs === 'number' ? params.sleepMs : 500;

                // Fetch all logs for this session
                const fetchLimit = (typeof params.offset === 'number' && params.offset > 0)
                    ? (params.limit || 10000) + params.offset
                    : (typeof params.limit === 'number' && params.limit > 0 ? params.limit : undefined);

                let logs = await repo.fetchLogsForProcessing(params.sessionId, { limit: fetchLimit });

                // Apply offset manually
                if (typeof params.offset === 'number' && params.offset > 0) {
                    logs = logs.slice(params.offset);
                    if (typeof params.limit === 'number' && params.limit > 0) {
                        logs = logs.slice(0, params.limit);
                    }
                }

                // Filter to specific item IDs if provided
                if (Array.isArray(params.itemIds) && params.itemIds.length > 0) {
                    const itemIdSet = new Set(params.itemIds);
                    logs = logs.filter(l => itemIdSet.has(l.id));
                }

                // Filter out already processed items when resuming
                if (processedIds.size > 0) {
                    logs = logs.filter(l => !processedIds.has(l.id));
                    trace.push({
                        type: 'info',
                        message: `Resuming job: skipping ${processedIds.size} already processed items`,
                        timestamp: Date.now()
                    });
                }

                // Filter to only unscored logs unless force is set
                const unscoredLogs = params.force ? logs : logs.filter(log => !log.score);
                const total = unscoredLogs.length;
                let scored = resumeState.progress.scored || 0;
                let skipped = resumeState.progress.skipped || 0;
                let errors = resumeState.progress.errors || 0;
                let processed = resumeState.progress.current || 0;
                let cancelled = false;

                // Log initial job context (only if not resuming)
                if (!existingJob) {
                    trace.push({
                        type: 'info',
                        message: `Job started: session=${params.sessionId}, model=${params.model}, provider=${params.provider || 'unknown'}`,
                        timestamp: Date.now()
                    });
                }
                trace.push({
                    type: 'info',
                    message: `${existingJob ? 'Resuming' : 'Starting'}: Found ${unscoredLogs.length} items to process`,
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
