/**
 * Start a background job to remove items from a session
 * POST /api/jobs/remove-items
 */

export const registerStartRemoveItemsRoute = (app, { repo, createJob, updateJob, getJob }) => {
    app.post('/api/jobs/remove-items', async (req, res) => {
        const {
            sessionId,
            indices,
            scoreThreshold,
            scoreField = 'score',
            dryRun = false,
        } = req.body;

        // Validate required fields
        if (!sessionId) {
            res.status(400).json({ error: 'sessionId is required' });
            return;
        }

        // Validate that exactly one method is provided
        if (indices && scoreThreshold !== undefined) {
            res.status(400).json({ error: 'Cannot use both indices and scoreThreshold. Choose one method.' });
            return;
        }
        if (!indices && scoreThreshold === undefined) {
            res.status(400).json({ error: 'Must provide either indices or scoreThreshold.' });
            return;
        }

        // Validate scoreField
        const validFields = ['score'];
        if (!validFields.includes(scoreField)) {
            res.status(400).json({ error: `Invalid scoreField. Must be one of: ${validFields.join(', ')}` });
            return;
        }

        console.log(`[removeItems] Starting job for session ${sessionId}`);
        console.log(`[removeItems] Method: ${indices ? `indices (${indices.length} items)` : `scoreThreshold < ${scoreThreshold}`}`);
        console.log(`[removeItems] Score field: ${scoreField}, dryRun: ${dryRun}`);

        // Create job (must await - createJob is async)
        const job = await createJob('remove-items');

        // Return job ID immediately
        res.json({ jobId: job.id });

        // Run job in background
        runRemoveItemsJob(job.id, {
            repo,
            updateJob,
            getJob,
            sessionId,
            indices,
            scoreThreshold,
            scoreField,
            dryRun,
        }).catch(err => {
            console.error(`[removeItems] Job ${job.id} failed:`, err);
            updateJob(job.id, {
                status: 'failed',
                error: err.message,
                completedAt: Date.now(),
            });
        });
    });
};

async function runRemoveItemsJob(jobId, options) {
    const {
        repo,
        updateJob,
        getJob,
        sessionId,
        indices,
        scoreThreshold,
        scoreField,
        dryRun,
    } = options;

    updateJob(jobId, { status: 'running', startedAt: Date.now() });

    try {
        let itemsToRemove = [];

        if (indices) {
            // Remove by indices - need to fetch all items first to map indices to doc IDs
            console.log(`[removeItems] Fetching items by indices...`);

            const allDocs = await repo.fetchLogsForProcessing(sessionId);

            // Map indices to documents
            for (const idx of indices) {
                if (idx >= 0 && idx < allDocs.length) {
                    const doc = allDocs[idx];
                    itemsToRemove.push({
                        id: doc.id,
                        index: idx,
                        score: doc[scoreField],
                        queryPreview: doc.query?.slice(0, 50) || ''
                    });
                }
            }
        } else if (scoreThreshold !== undefined) {
            // Remove by score threshold
            console.log(`[removeItems] Fetching items with ${scoreField} < ${scoreThreshold}...`);

            const scoreDocs = await repo.getLogsByScoreRange(sessionId, { field: scoreField, below: scoreThreshold });

            let idx = 0;
            scoreDocs.forEach(doc => {
                itemsToRemove.push({
                    id: doc.id,
                    index: idx++,
                    score: doc[scoreField],
                    queryPreview: doc.query?.slice(0, 50) || ''
                });
            });
        }

        console.log(`[removeItems] Found ${itemsToRemove.length} items to remove`);

        updateJob(jobId, {
            total: itemsToRemove.length,
            progress: 0,
            itemsToRemove: itemsToRemove.slice(0, 20), // Preview first 20
        });

        if (itemsToRemove.length === 0) {
            updateJob(jobId, {
                status: 'completed',
                completedAt: Date.now(),
                result: {
                    removedCount: 0,
                    message: 'No items matched the removal criteria.'
                }
            });
            return;
        }

        if (dryRun) {
            updateJob(jobId, {
                status: 'completed',
                completedAt: Date.now(),
                result: {
                    dryRun: true,
                    wouldRemoveCount: itemsToRemove.length,
                    wouldRemove: itemsToRemove,
                    message: `Would remove ${itemsToRemove.length} items.`
                }
            });
            return;
        }

        // Check if job was cancelled
        const currentJob = getJob(jobId);
        if (currentJob?.status === 'cancelled') {
            console.log(`[removeItems] Job ${jobId} was cancelled`);
            return;
        }

        // Delete items in batches
        const BATCH_SIZE = 100;
        let deleted = 0;
        let failed = 0;

        for (let i = 0; i < itemsToRemove.length; i += BATCH_SIZE) {
            // Check for cancellation
            const job = getJob(jobId);
            if (job?.status === 'cancelled') {
                console.log(`[removeItems] Job ${jobId} cancelled at item ${deleted}`);
                break;
            }

            const batchItems = itemsToRemove.slice(i, i + BATCH_SIZE);
            const batchIds = batchItems.map(item => item.id);

            try {
                await repo.deleteLogs(batchIds);
                deleted += batchItems.length;
                console.log(`[removeItems] Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}, total: ${deleted}`);
            } catch (err) {
                console.error(`[removeItems] Batch delete failed:`, err);
                failed += batchItems.length;
            }

            updateJob(jobId, {
                progress: deleted,
                deleted,
                failed,
            });
        }

        // Update session's logCount
        if (deleted > 0) {
            try {
                await repo.incrementSessionField(sessionId, 'logCount', -deleted);
                console.log(`[removeItems] Updated session logCount by -${deleted}`);
            } catch (err) {
                console.warn(`[removeItems] Failed to update session logCount:`, err);
            }
        }

        updateJob(jobId, {
            status: 'completed',
            completedAt: Date.now(),
            result: {
                removedCount: deleted,
                failedCount: failed,
                message: `Removed ${deleted} items from session "${sessionId}".${failed > 0 ? ` Failed: ${failed}` : ''}`
            }
        });

        console.log(`[removeItems] Job ${jobId} completed. Removed: ${deleted}, Failed: ${failed}`);
    } catch (error) {
        console.error(`[removeItems] Job ${jobId} error:`, error);
        updateJob(jobId, {
            status: 'failed',
            error: error.message,
            completedAt: Date.now(),
        });
    }
}
