export const JobStatus = Object.freeze({
    Pending: 'pending',
    Running: 'running',
    Completed: 'completed',
    Failed: 'failed'
});

export const createJobStore = (repo) => {
    const jobs = new Map();

    const createJob = async (type) => {
        const jobId = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const job = {
            id: jobId,
            type,
            status: JobStatus.Pending,
            progress: {},
            result: null,
            error: null,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        jobs.set(jobId, job);
        try {
            await repo.createJob(job);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to persist job', error);
        }
        return job;
    };

    const updateJob = (jobId, patch) => {
        const job = jobs.get(jobId);
        if (!job) return;
        Object.assign(job, patch, { updatedAt: Date.now() });
        try {
            repo.updateJob(jobId, job);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to persist job update', error);
        }
    };

    const getJob = async (jobId) => {
        const job = jobs.get(jobId);
        if (job) return job;
        try {
            return await repo.getJob(jobId);
        } catch {
            return null;
        }
    };

    const listJobs = async ({ type, status, limit = 50 } = {}) => {
        let results = Array.from(jobs.values());
        try {
            const dbJobs = await repo.listJobs({ type, status, limit });
            const merged = new Map(dbJobs.map(j => [j.id, j]));
            results.forEach(j => merged.set(j.id, j));
            results = Array.from(merged.values());
        } catch {
            // fallback to in-memory only
        }
        if (type) results = results.filter(j => j.type === type);
        if (status) results = results.filter(j => j.status === status);
        return results.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    };

    const cancelJob = async (jobId) => {
        const job = jobs.get(jobId);
        if (job) {
            Object.assign(job, { status: JobStatus.Failed, error: 'Cancelled by user', updatedAt: Date.now() });
        }
        try {
            const existing = await repo.getJob(jobId);
            if (existing) {
                await repo.updateJob(jobId, { status: JobStatus.Failed, error: 'Cancelled by user', updatedAt: Date.now() });
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to cancel job in DB', error);
        }
        return job || null;
    };

    return { createJob, updateJob, getJob, listJobs, cancelJob };
};
