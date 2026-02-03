export const registerJobRoutes = (app, { getJob }) => {
    app.get('/api/jobs/:id', async (req, res) => {
        try {
            const job = await getJob(req.params.id);
            if (!job) {
                res.status(404).json({ error: 'Job not found' });
                return;
            }
            res.json(job);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
