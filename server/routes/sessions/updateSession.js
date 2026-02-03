export const registerUpdateSessionRoute = (app, { getDb }) => {
    app.put('/api/sessions/:id', async (req, res) => {
        try {
            const db = getDb();
            const sessionId = req.params.id;
            const data = req.body || {};

            // Remove fields that shouldn't be overwritten
            delete data.id;
            delete data.createdAt;

            const docRef = db.collection('synth_sessions').doc(sessionId);
            const doc = await docRef.get();

            const now = new Date().toISOString();
            if (!doc.exists) {
                // Create if doesn't exist (upsert behavior)
                await docRef.set({
                    ...data,
                    sessionUid: sessionId,
                    createdAt: now,
                    updatedAt: now
                });
            } else {
                // Update existing
                await docRef.update({
                    ...data,
                    updatedAt: now
                });
            }

            res.json({ ok: true, id: sessionId });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
