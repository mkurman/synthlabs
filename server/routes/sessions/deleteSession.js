import { clearSessionsCache } from '../../cache/sessionCache.js';

export const registerDeleteSessionRoute = (app, { repo }) => {
    app.delete('/api/sessions/:id', async (req, res) => {
        try {
            const withLogs = req.query.withLogs === '1';
            const sessionId = req.params.id;
            let deletedLogs = 0;

            if (withLogs) {
                deletedLogs = await repo.deleteLogsBySession(sessionId);
            }

            await repo.deleteSession(sessionId);
            clearSessionsCache();
            res.json({ deletedLogs });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
