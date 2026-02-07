/**
 * Rerun a failed/completed job with its original params + a fresh API key.
 * POST /api/jobs/:id/rerun
 *
 * Body: { apiKey: "<encrypted>" }
 * Internally forwards to the correct start endpoint (rewrite, autoscore, etc.)
 */

export const registerRerunJobRoute = (app, { getJob }) => {
    app.post('/api/jobs/:id/rerun', async (req, res) => {
        const { id } = req.params;
        const { apiKey: encryptedApiKey } = req.body || {};

        // Look up the original job
        const job = await getJob(id);
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        if (!job.params) {
            res.status(400).json({ error: 'Job has no stored params — cannot rerun' });
            return;
        }

        // Determine target endpoint from job type
        const RERUN_ENDPOINTS = {
            rewrite: '/api/jobs/rewrite',
            autoscore: '/api/jobs/autoscore',
        };

        const endpoint = RERUN_ENDPOINTS[job.type];
        if (!endpoint) {
            res.status(400).json({ error: `Rerun not supported for job type: ${job.type}` });
            return;
        }

        // Build request body from stored params + fresh apiKey
        const body = { ...job.params };
        if (encryptedApiKey) {
            body.apiKey = encryptedApiKey;
        }

        // Forward internally via Express router
        // Create a minimal synthetic request matching what the target route expects
        const fakeReq = Object.create(req);
        fakeReq.body = body;
        fakeReq.method = 'POST';
        fakeReq.url = endpoint;
        fakeReq.originalUrl = endpoint;
        fakeReq.path = endpoint;

        app.handle(fakeReq, res);
    });
};
