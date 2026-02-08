import { JobStatus } from '../../jobs/jobStore.js';
import { clearSessionsCache } from '../../cache/sessionCache.js';

export const registerSyncOrphansRoute = (app, { repo, createJob, updateJob }) => {
    app.post('/api/orphans/sync', async (_req, res) => {
        const job = await createJob('orphan-sync');
        res.json({ jobId: job.id });

        (async () => {
            updateJob(job.id, { status: JobStatus.Running });
            try {
                const existingSessionUids = await repo.getAllSessionUids();

                let lastCursor = null;
                let scannedCount = 0;
                let totalUpdated = 0;
                const orphanedSessionUids = new Set();
                const sessionMap = new Map(); // orphanedUid -> { id, name, count }
                const chunkSize = 200;
                const maxUpdates = 20000;

                while (true) {
                    const logsResult = await repo.listLogs({ limit: chunkSize, cursor: lastCursor, orderBy: 'createdAt', direction: 'asc' });
                    const logs = logsResult.logs || logsResult;
                    if (!logs || logs.length === 0) break;
                    scannedCount += logs.length;
                    const orphanedByUid = new Map();
                    logs.forEach(log => {
                        const uid = log.sessionUid || 'unknown';
                        if (uid !== 'unknown' && !existingSessionUids.has(uid)) {
                            orphanedSessionUids.add(uid);
                            if (!orphanedByUid.has(uid)) {
                                orphanedByUid.set(uid, []);
                            }
                            orphanedByUid.get(uid).push(log);
                        }
                    });

                    if (orphanedByUid.size > 0) {
                        for (const [uid, docs] of orphanedByUid.entries()) {
                            if (totalUpdated >= maxUpdates) break;
                            let sessionEntry = sessionMap.get(uid);
                            if (!sessionEntry) {
                                const recoveredName = `Recovered ${uid} (${new Date().toLocaleString()})`;
                                const newSession = await repo.createSession({ name: recoveredName, source: 'orphaned', sessionUid: uid });
                                sessionEntry = { id: newSession.id, name: recoveredName, count: 0, sessionUid: uid };
                                sessionMap.set(uid, sessionEntry);
                            }
                            // Batch update logs in chunks
                            const batchLimit = 200;
                            for (let i = 0; i < docs.length; i += batchLimit) {
                                if (totalUpdated >= maxUpdates) break;
                                const batchDocs = docs.slice(i, i + batchLimit);
                                const updates = batchDocs.map(log => ({
                                    id: log.id,
                                    data: { sessionUid: sessionEntry.sessionUid, sessionName: sessionEntry.name }
                                }));
                                await repo.batchUpdateLogs(updates);
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

                    lastCursor = logsResult.cursor || (logs.length > 0 ? logs[logs.length - 1] : null);
                    if (logs.length < chunkSize || totalUpdated >= maxUpdates) break;
                }

                for (const entry of sessionMap.values()) {
                    await repo.updateSession(entry.id, { logCount: entry.count });
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
