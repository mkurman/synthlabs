import { JobStatus } from '../../jobs/jobStore.js';
import { clearSessionsCache } from '../../cache/sessionCache.js';

export const registerSyncOrphansRoute = (app, { getDb, createJob, updateJob }) => {
    app.post('/api/orphans/sync', async (_req, res) => {
        const job = await createJob('orphan-sync');
        res.json({ jobId: job.id });

        (async () => {
            updateJob(job.id, { status: JobStatus.Running });
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

                let lastDoc = null;
                let scannedCount = 0;
                let totalUpdated = 0;
                const orphanedSessionUids = new Set();
                const sessionMap = new Map(); // orphanedUid -> { id, name, count }
                const chunkSize = 200;
                const batchLimit = 200;
                const maxUpdates = 20000;

                while (true) {
                    let q = db.collection('synth_logs').orderBy('createdAt', 'asc').limit(chunkSize);
                    if (lastDoc) {
                        q = q.startAfter(lastDoc);
                    }
                    const snapshot = await q.get();
                    if (snapshot.empty) break;
                    scannedCount += snapshot.docs.length;
                    const orphanedByUid = new Map();
                    snapshot.docs.forEach(docSnap => {
                        const data = docSnap.data();
                        const uid = data.sessionUid || 'unknown';
                        if (uid !== 'unknown' && !existingSessionUids.has(uid)) {
                            orphanedSessionUids.add(uid);
                            if (!orphanedByUid.has(uid)) {
                                orphanedByUid.set(uid, []);
                            }
                            orphanedByUid.get(uid).push(docSnap);
                        }
                    });

                    if (orphanedByUid.size > 0) {
                        for (const [uid, docs] of orphanedByUid.entries()) {
                            if (totalUpdated >= maxUpdates) break;
                            let sessionEntry = sessionMap.get(uid);
                            if (!sessionEntry) {
                                const recoveredName = `Recovered ${uid} (${new Date().toLocaleString()})`;
                                const sessionRef = await db.collection('synth_sessions').add({
                                    name: recoveredName,
                                    source: 'orphaned',
                                    createdAt: Date.now(),
                                    updatedAt: Date.now(),
                                    sessionUid: uid
                                });
                            sessionEntry = { id: sessionRef.id, name: recoveredName, count: 0, sessionUid: uid };
                            sessionMap.set(uid, sessionEntry);
                        }
                        for (let i = 0; i < docs.length; i += batchLimit) {
                                if (totalUpdated >= maxUpdates) break;
                                const batchDocs = docs.slice(i, i + batchLimit);
                                const batch = db.batch();
                                batchDocs.forEach(docSnap => {
                                    batch.update(docSnap.ref, {
                                        sessionUid: sessionEntry.sessionUid,
                                        sessionName: sessionEntry.name
                                    });
                                });
                                await batch.commit();
                                totalUpdated += batchDocs.length;
                                sessionEntry.count += batchDocs.length;
                            }
                        }
                    }

                    updateJob(job.id, {
                        progress: {
                            phase: 'reassign',
                            scannedCount,
                            orphanedSessions: orphanedSessionUids.size,
                            updatedLogs: totalUpdated
                        }
                    });

                    lastDoc = snapshot.docs[snapshot.docs.length - 1];
                    if (snapshot.docs.length < chunkSize || totalUpdated >= maxUpdates) break;
                }

                for (const entry of sessionMap.values()) {
                    await db.collection('synth_sessions').doc(entry.id).update({
                        logCount: entry.count,
                        updatedAt: Date.now()
                    });
                }

                updateJob(job.id, {
                    status: JobStatus.Completed,
                    result: {
                        sessionsCreated: sessionMap.size,
                        logsAssigned: totalUpdated,
                        orphanedUids: Array.from(orphanedSessionUids),
                        scannedCount,
                        isPartialScan: totalUpdated >= maxUpdates
                    }
                });
                clearSessionsCache();
            } catch (error) {
                updateJob(job.id, { status: JobStatus.Failed, error: String(error) });
            }
        })();
    });
};
