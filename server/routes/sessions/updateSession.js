export const registerUpdateSessionRoute = (app, { repo }) => {
    app.put('/api/sessions/:id', async (req, res) => {
        try {
            const sessionId = req.params.id;
            const data = req.body || {};

            // Remove fields that shouldn't be overwritten
            delete data.id;
            delete data.createdAt;

            await repo.upsertSession(sessionId, data);

            res.json({ ok: true, id: sessionId });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
