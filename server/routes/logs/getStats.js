export const registerGetStatsRoute = (app, { repo }) => {
    app.get('/api/logs/stats', async (req, res) => {
        try {
            const sessionUid = req.query.sessionUid || null;
            const stats = await repo.getLogStats(sessionUid);
            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
