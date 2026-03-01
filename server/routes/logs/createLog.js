export const registerCreateLogRoute = (app, { repo }) => {
    app.post('/api/logs', async (req, res) => {
        try {
            const data = req.body || {};
            const result = await repo.createLog(data);
            res.json({ id: result.id });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
