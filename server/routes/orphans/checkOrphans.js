export const registerCheckOrphansRoute = (app, { getDb }) => {
    app.get('/api/orphans/check', async (_req, res) => {
        try {
            const db = getDb();
            const sessionsSnapshot = await db.collection('synth_sessions').get();
            const existingSessionUids = new Set();
            sessionsSnapshot.docs.forEach(d => {
                existingSessionUids.add(d.id);
                const data = d.data();
                if (data.sessionUid) {
                    existingSessionUids.add(data.sessionUid);
                }
            });

            const orphanedUids = new Set();
            const logCounts = new Map();
            let scannedCount = 0;
            let lastDoc = null;
            const chunkSize = 50;

            while (true) {
                let q = db.collection('synth_logs').orderBy('createdAt', 'desc').limit(chunkSize);
                if (lastDoc) {
                    q = q.startAfter(lastDoc);
                }
                const snapshot = await q.get();
                if (snapshot.empty) break;
                scannedCount += snapshot.docs.length;
                snapshot.docs.forEach(d => {
                    const data = d.data();
                    const uid = data.sessionUid || 'unknown';
                    if (uid !== 'unknown' && !existingSessionUids.has(uid)) {
                        orphanedUids.add(uid);
                        logCounts.set(uid, (logCounts.get(uid) || 0) + 1);
                    }
                });
                lastDoc = snapshot.docs[snapshot.docs.length - 1];
                if (orphanedUids.size > 0) break;
            }

            let totalOrphanedLogs = 0;
            logCounts.forEach(count => {
                totalOrphanedLogs += count;
            });
            if (totalOrphanedLogs === 0 && orphanedUids.size > 0) {
                totalOrphanedLogs = orphanedUids.size;
            }

            res.json({
                hasOrphanedLogs: orphanedUids.size > 0,
                orphanedSessionCount: orphanedUids.size,
                totalOrphanedLogs,
                orphanedUids: Array.from(orphanedUids),
                scannedCount,
                isPartialScan: orphanedUids.size > 0
            });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
