import { clearSessionsCache } from '../../cache/sessionCache.js';

export const registerDeleteSessionRoute = (app, { getDb }) => {
    app.delete('/api/sessions/:id', async (req, res) => {
        try {
            const db = getDb();
            const withLogs = req.query.withLogs === '1';
            const sessionId = req.params.id;
            let deletedLogs = 0;

            if (withLogs) {
                let lastDoc = null;
                while (true) {
                    let q = db.collection('synth_logs')
                        .where('sessionUid', '==', sessionId)
                        .orderBy('createdAt', 'desc')
                        .limit(500);
                    if (lastDoc) {
                        q = q.startAfter(lastDoc);
                    }
                    const snapshot = await q.get();
                    if (snapshot.empty) break;
                    const batch = db.batch();
                    snapshot.docs.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit();
                    deletedLogs += snapshot.size;
                    lastDoc = snapshot.docs[snapshot.docs.length - 1];
                }
            }

            await db.collection('synth_sessions').doc(sessionId).delete();
            clearSessionsCache();
            res.json({ deletedLogs });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
