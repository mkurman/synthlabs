export const registerGetLogRoute = (app, { repo }) => {
    app.get('/api/logs/:id', async (req, res) => {
        try {
            const log = await repo.getLog(req.params.id);
            if (!log) {
                res.status(404).json({ error: 'Not found' });
                return;
            }
            res.json({ log });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
