const JOBS_COLLECTION = 'admin_jobs';

export const JobStatus = Object.freeze({
    Pending: 'pending',
    Running: 'running',
    Completed: 'completed',
    Failed: 'failed'
});

export const createJobStore = (getDb) => {
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
            await getDb().collection(JOBS_COLLECTION).doc(jobId).set(job);
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
            getDb().collection(JOBS_COLLECTION).doc(jobId).set(job, { merge: true });
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to persist job update', error);
        }
    };

    const getJob = async (jobId) => {
        const job = jobs.get(jobId);
        if (job) return job;
        const docRef = await getDb().collection(JOBS_COLLECTION).doc(jobId).get();
        if (!docRef.exists) return null;
        return docRef.data();
    };

    return { createJob, updateJob, getJob };
};
