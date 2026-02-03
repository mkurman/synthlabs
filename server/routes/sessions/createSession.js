import { clearSessionsCache } from '../../cache/sessionCache.js';

export const registerCreateSessionRoute = (app, { getDb }) => {
    app.post('/api/sessions', async (req, res) => {
        try {
            const db = getDb();
            const data = req.body || {};
            const now = new Date().toISOString();
            const docRef = await db.collection('synth_sessions').add({
                ...data,
                createdAt: now,
                updatedAt: now
            });
            await docRef.update({ sessionUid: docRef.id });
            clearSessionsCache();
            res.json({ id: docRef.id });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
