export const registerDeleteLogRoute = (app, { repo }) => {
    app.delete('/api/logs/:id', async (req, res) => {
        try {
            await repo.deleteLogs([req.params.id]);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
