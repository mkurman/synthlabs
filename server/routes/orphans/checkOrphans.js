import { JobStatus } from '../../jobs/jobStore.js';

export const registerCheckOrphansRoute = (app, { repo, createJob, updateJob }) => {
    app.post('/api/orphans/check', async (_req, res) => {
        const job = await createJob('orphan-check');
        res.json({ jobId: job.id });

        (async () => {
            updateJob(job.id, { status: JobStatus.Running });
            try {
                const existingSessionUids = await repo.getAllSessionUids();

                const result = await repo.scanForOrphans(existingSessionUids, { chunkSize: 50, direction: 'desc' });

                const orphanedUids = result.orphanUids;
                const logCounts = result.logCounts;
                const scannedCount = result.scannedCount;

                let totalOrphanedLogs = 0;
                logCounts.forEach(count => {
                    totalOrphanedLogs += count;
                });
                if (totalOrphanedLogs === 0 && orphanedUids.length > 0) {
                    totalOrphanedLogs = orphanedUids.length;
                }

                updateJob(job.id, {
                    status: JobStatus.Completed,
                    result: {
                        hasOrphanedLogs: orphanedUids.length > 0,
                        orphanedSessionCount: orphanedUids.length,
                        totalOrphanedLogs,
                        orphanedUids,
                        scannedCount,
                        isPartialScan: orphanedUids.length > 0
                    }
                });
            } catch (error) {
                updateJob(job.id, { status: JobStatus.Failed, error: String(error) });
            }
        })();
    });
};
