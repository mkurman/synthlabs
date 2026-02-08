import { clearSessionsCache } from '../../cache/sessionCache.js';

export const registerCreateSessionRoute = (app, { repo }) => {
    app.post('/api/sessions', async (req, res) => {
        try {
            const data = req.body || {};
            const result = await repo.createSession(data);
            clearSessionsCache();
            res.json({ id: result.id });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
