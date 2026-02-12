import { JobStatus } from '../../jobs/jobStore.js';
import { extractMessageParts } from '../../utils/thinkTagParser.js';
import { extractResumeState, canResumeJob } from '../../jobs/jobResume.js';

/**
 * Process a single log item: check messages for <think> tags, migrate to reasoning_content, update DB.
 */
const migrateOneItem = async ({ log, repo }) => {
    if (!log.messages || !Array.isArray(log.messages)) {
        return {
            outcome: 'skipped',
            trace: { type: 'skipped', logId: log.id, reason: 'No messages array', timestamp: Date.now() },
        };
    }

    let needsUpdate = false;
    const updatedMessages = log.messages.map(msg => {
        // Only process assistant messages
        if (msg.role !== 'assistant') {
            return msg;
        }

        // Check if reasoning_content is empty/null and content has <think> tags
        const hasReasoningContent = msg.reasoning_content && msg.reasoning_content.trim();
        if (hasReasoningContent) {
            // Already migrated
            return msg;
        }

        // Extract parts using the utility
        const parts = extractMessageParts({
            content: msg.content || '',
            reasoning_content: msg.reasoning_content,
            reasoning: msg.reasoning,
        });

        // If we found reasoning from <think> tags and it's not already in reasoning_content
        if (parts.reasoning && parts.content !== msg.content) {
            needsUpdate = true;
            return {
                ...msg,
                content: parts.content,
                reasoning_content: parts.reasoning,
            };
        }

        return msg;
    });

    if (!needsUpdate) {
        return {
            outcome: 'skipped',
            trace: { type: 'skipped', logId: log.id, reason: 'No migration needed', timestamp: Date.now() },
        };
    }

    // Update the log with migrated messages
    await repo.updateLog(log.id, {
        messages: updatedMessages,
        updatedAt: Date.now(),
    });

    return {
        outcome: 'migrated',
        trace: { type: 'migrated', logId: log.id, timestamp: Date.now() },
    };
};

export const registerStartMigrateReasoningRoute = (app, { repo, createJob, updateJob, getJob }) => {
    app.post('/api/jobs/migrate-reasoning', async (req, res) => {
        const {
            sessionId,
            limit,
            offset,
            sleepMs,
            concurrency: reqConcurrency,
            force,
            itemIds,
            resumeJobId,
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

        // Create new job or update existing for resume
        const job = existingJob || await createJob('migrate-reasoning');

        // Mark as running if resuming a failed/stalled job
        if (existingJob && existingJob.status === JobStatus.Failed) {
            updateJob(job.id, { status: JobStatus.Running, error: null });
        }

        res.json({ jobId: job.id });

        // Store original params so we can rerun this job later
        const jobParams = {
            sessionId,
            limit,
            offset,
            sleepMs,
            concurrency: reqConcurrency,
            force: !!force,
            itemIds,
        };

        // Store sessionId at top level for easy access by tools/UI
        await updateJob(job.id, {
            params: jobParams,
            sessionId  // Store at top level
        });

        // Run migration in background
        (async () => {
            updateJob(job.id, { status: JobStatus.Running });

            // Load resume state if resuming
            const resumeState = extractResumeState(existingJob);
            const trace = resumeState.trace;
            const processedIds = resumeState.processedIds;

            try {
                // Use params from existing job or current request
                const params = existingJob?.params || {
                    sessionId, limit, offset, sleepMs,
                    concurrency: reqConcurrency, force: !!force, itemIds,
                };

                // Resolve settings
                const concurrency = (typeof params.concurrency === 'number' && params.concurrency > 0) ? params.concurrency : 5;
                const sleepTime = typeof params.sleepMs === 'number' ? params.sleepMs : 100;

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

                const total = logs.length;
                let migrated = resumeState.progress.migrated || 0;
                let skipped = resumeState.progress.skipped || 0;
                let errors = resumeState.progress.errors || 0;
                let processed = resumeState.progress.current || 0;
                let cancelled = false;

                // Log initial job context (only if not resuming)
                if (!existingJob) {
                    trace.push({
                        type: 'info',
                        message: `Job started: session=${params.sessionId}`,
                        timestamp: Date.now()
                    });
                }
                trace.push({
                    type: 'info',
                    message: `${existingJob ? 'Resuming' : 'Starting'}: Found ${logs.length} items to process`,
                    timestamp: Date.now()
                });
                trace.push({
                    type: 'info',
                    message: `Config: concurrency=${concurrency}, sleepMs=${sleepTime}ms`,
                    timestamp: Date.now()
                });

                // Process items in batches of `concurrency`
                for (let batchStart = 0; batchStart < logs.length; batchStart += concurrency) {
                    // Check for cancellation before each batch
                    const currentJob = await getJob(job.id);
                    if (currentJob && currentJob.status === JobStatus.Failed) {
                        console.log(`[migrate-reasoning] Job ${job.id} cancelled, stopping at ${processed}/${total}`);
                        trace.push({ type: 'warn', message: `Cancelled by user at item ${processed}/${total}`, timestamp: Date.now() });
                        cancelled = true;
                        break;
                    }

                    const batch = logs.slice(batchStart, batchStart + concurrency);

                    // Run batch concurrently
                    const results = await Promise.allSettled(
                        batch.map(log => migrateOneItem({ log, repo }))
                    );

                    // Collect results
                    for (let j = 0; j < results.length; j++) {
                        const r = results[j];
                        if (r.status === 'fulfilled') {
                            trace.push(r.value.trace);
                            if (r.value.outcome === 'migrated') migrated++;
                            else skipped++;
                        } else {
                            const err = r.reason;
                            const logId = batch[j]?.id;
                            console.error(`[migrate-reasoning] Error migrating log ${logId}:`, err?.message || err);
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
                        progress: { migrated, skipped, errors, total, current: processed },
                        result: { totalMigrated: migrated, totalSkipped: skipped, totalErrors: errors, total, trace },
                    });

                    // Rate limiting between batches
                    if (sleepTime > 0 && batchStart + concurrency < logs.length) {
                        await new Promise(r => setTimeout(r, sleepTime));
                    }
                }

                if (cancelled) {
                    updateJob(job.id, {
                        result: { totalMigrated: migrated, totalSkipped: skipped, totalErrors: errors, total, cancelled: true, trace },
                    });
                } else {
                    updateJob(job.id, {
                        status: JobStatus.Completed,
                        result: { totalMigrated: migrated, totalSkipped: skipped, totalErrors: errors, total, trace },
                    });
                }
            } catch (error) {
                console.error('[migrate-reasoning] Job failed:', error);
                trace.push({ type: 'error', message: String(error), timestamp: Date.now() });
                updateJob(job.id, { status: JobStatus.Failed, error: String(error), result: { trace } });
            }
        })();
    });
};
