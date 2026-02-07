import { clearSessionsCache } from '../../cache/sessionCache.js';

export const registerUpdateVerificationStatusRoute = (app, { repo }) => {
    app.patch('/api/sessions/:id/verification-status', async (req, res) => {
        try {
            const status = req.body?.status;
            if (!status) {
                res.status(400).json({ error: 'status is required' });
                return;
            }

            const sessionId = req.params.id;
            let docId = sessionId;

            // Check if it's a sessionUid (UUID format) rather than a Firestore doc ID
            let session = await repo.getSession(sessionId);
            if (!session) {
                // Try to find by sessionUid
                session = await repo.getSessionByUid(sessionId);
                if (!session) {
                    res.status(404).json({ error: 'Session not found' });
                    return;
                }
                docId = session.id;
            }

            await repo.updateSession(docId, { verificationStatus: status });
            clearSessionsCache();
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
