import { clearSessionsCache } from '../../cache/sessionCache.js';

export const registerUpdateVerificationStatusRoute = (app, { getDb }) => {
    app.patch('/api/sessions/:id/verification-status', async (req, res) => {
        try {
            const db = getDb();
            const status = req.body?.status;
            if (!status) {
                res.status(400).json({ error: 'status is required' });
                return;
            }
            await db.collection('synth_sessions').doc(req.params.id).update({
                verificationStatus: status,
                updatedAt: Date.now()
            });
            clearSessionsCache();
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
