export const registerGetSessionTagsRoute = (app, { repo }) => {
    app.get('/api/sessions/:sessionUid/tags', async (_req, res) => {
        try {
            const { sessionUid } = _req.params;
            
            if (!sessionUid) {
                res.status(400).json({ error: 'Session UID is required' });
                return;
            }
            
            const tags = await repo.getSessionTags(sessionUid);
            res.json({ tags });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
