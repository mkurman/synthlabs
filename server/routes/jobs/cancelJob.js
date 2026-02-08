export const registerCancelJobRoute = (app, { cancelJob }) => {
    app.post('/api/jobs/:id/cancel', async (req, res) => {
        try {
            const job = await cancelJob(req.params.id);
            if (!job) {
                return res.status(404).json({ error: 'Job not found' });
            }
            res.json({ job });
        } catch (error) {
            console.error('[cancelJob] Failed:', error);
            res.status(500).json({ error: String(error) });
        }
    });
};
