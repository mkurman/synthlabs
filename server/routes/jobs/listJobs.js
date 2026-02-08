export const registerListJobsRoute = (app, { listJobs }) => {
    app.get('/api/jobs', async (req, res) => {
        try {
            const { type, status, limit } = req.query;
            const jobs = await listJobs({
                type: type || undefined,
                status: status || undefined,
                limit: limit ? Number(limit) : 50
            });
            res.json({ jobs });
        } catch (error) {
            console.error('[listJobs] Failed:', error);
            res.status(500).json({ error: String(error) });
        }
    });
};
