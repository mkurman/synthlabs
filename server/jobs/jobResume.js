/**
 * Helper utilities for job resumption
 */

/**
 * Extract processed item IDs from a job's trace
 * Only includes items that were successfully processed (type: 'rewritten' or 'migrated')
 * Excludes items that were skipped or had errors (these should be retried on resume)
 * @param {Array} trace - Job trace array
 * @returns {Set<string>} Set of processed item IDs
 */
export const extractProcessedItemIds = (trace) => {
    if (!Array.isArray(trace)) return new Set();

    const processedIds = new Set();
    for (const entry of trace) {
        // Only include successfully processed items
        // Exclude 'skipped' and 'error' entries - those should be retried on resume
        if (entry.logId && (entry.type === 'rewritten' || entry.type === 'migrated' || entry.outcome === 'migrated')) {
            processedIds.add(entry.logId);
        }
    }
    return processedIds;
};

/**
 * Check if a job can be resumed
 * @param {Object} job - Job object
 * @returns {boolean} True if job can be resumed
 */
export const canResumeJob = (job) => {
    if (!job) return false;

    // Can resume if job is running or failed (stalled)
    // Can't resume if completed
    return job.status === 'running' || job.status === 'failed';
};

/**
 * Extract resume state from an existing job
 * @param {Object} job - Job object
 * @returns {Object} Resume state { progress, trace, processedIds }
 */
export const extractResumeState = (job) => {
    if (!job) {
        return {
            progress: { scored: 0, skipped: 0, errors: 0, migrated: 0, total: 0, current: 0 },
            trace: [],
            processedIds: new Set()
        };
    }

    const trace = job.result?.trace || [];
    const processedIds = extractProcessedItemIds(trace);
    const progress = job.progress || { scored: 0, skipped: 0, errors: 0, migrated: 0, total: 0, current: 0 };

    return { progress, trace, processedIds };
};

/**
 * Check if a job is stalled (running but not updated recently)
 * @param {Object} job - Job object
 * @param {number} stalledThresholdMs - Time in ms to consider job stalled (default: 5 minutes)
 * @returns {boolean} True if job is stalled
 */
export const isJobStalled = (job, stalledThresholdMs = 5 * 60 * 1000) => {
    if (!job || job.status !== 'running') return false;

    const now = Date.now();
    const lastUpdate = job.updatedAt || job.createdAt || now;

    return (now - lastUpdate) > stalledThresholdMs;
};
