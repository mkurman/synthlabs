export const registerUpdateLogRoute = (app, { repo }) => {
    app.patch('/api/logs/:id', async (req, res) => {
        try {
            const updates = req.body || {};
            delete updates.id;
            delete updates.createdAt;
            const log = await repo.updateLog(req.params.id, updates);
            res.json({ ok: true, log });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
