export const registerGetSessionRoute = (app, { repo }) => {
    app.get('/api/sessions/:id', async (req, res) => {
        try {
            const sessionId = req.params.id;
            let session = await repo.getSession(sessionId);
            if (session) {
                res.json({ session });
                return;
            }
            // Fallback: search by sessionUid
            session = await repo.getSessionByUid(sessionId);
            if (!session) {
                res.status(404).json({ error: 'Not found' });
                return;
            }
            res.json({ session });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
