export const registerGetSessionRoute = (app, { getDb }) => {
    app.get('/api/sessions/:id', async (req, res) => {
        try {
            const db = getDb();
            const sessionId = req.params.id;
            const docRef = await db.collection('synth_sessions').doc(sessionId).get();
            if (docRef.exists) {
                res.json({ session: { id: docRef.id, ...docRef.data() } });
                return;
            }
            // Fallback: search by sessionUid
            const snapshot = await db.collection('synth_sessions')
                .where('sessionUid', '==', sessionId)
                .limit(1)
                .get();
            if (snapshot.empty) {
                res.status(404).json({ error: 'Not found' });
                return;
            }
            const match = snapshot.docs[0];
            res.json({ session: { id: match.id, ...match.data() } });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
