import { JobStatus } from './jobStore.js';
import { isJobStalled } from './jobResume.js';

/**
 * Monitor for stalled jobs
 * Periodically checks for jobs that are "running" but haven't been updated recently
 */
export class StalledJobMonitor {
    constructor({ listJobs, updateJob, getJob, options = {} }) {
        this.listJobs = listJobs;
        this.updateJob = updateJob;
        this.getJob = getJob;

        // Configuration
        this.checkIntervalMs = options.checkIntervalMs || 2 * 60 * 1000; // Check every 2 minutes
        this.stalledThresholdMs = options.stalledThresholdMs || 5 * 60 * 1000; // 5 minutes without update = stalled
        this.autoMarkAsFailed = options.autoMarkAsFailed !== false; // Auto-mark stalled jobs as failed
        this.enabled = options.enabled !== false; // Enabled by default

        this.intervalId = null;
        this.isRunning = false;
    }

    /**
     * Start monitoring for stalled jobs
     */
    start() {
        if (this.intervalId || !this.enabled) {
            return;
        }

        console.log('[StalledJobMonitor] Starting monitor (interval: %dms, threshold: %dms)',
            this.checkIntervalMs, this.stalledThresholdMs);

        // Run immediately then on interval
        this.checkStalledJobs();
        this.intervalId = setInterval(() => this.checkStalledJobs(), this.checkIntervalMs);
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[StalledJobMonitor] Stopped');
        }
    }

    /**
     * Check for stalled jobs and mark them
     */
    async checkStalledJobs() {
        if (this.isRunning) {
            // Skip if previous check is still running
            return;
        }

        this.isRunning = true;
        try {
            // Get all running jobs
            const runningJobs = await this.listJobs({ status: JobStatus.Running, limit: 100 });

            let stalledCount = 0;

            for (const job of runningJobs) {
                if (isJobStalled(job, this.stalledThresholdMs)) {
                    stalledCount++;
                    console.log('[StalledJobMonitor] Detected stalled job: %s (type: %s, last update: %s)',
                        job.id, job.type, new Date(job.updatedAt || job.createdAt).toISOString());

                    if (this.autoMarkAsFailed) {
                        // Mark as failed with stalled reason
                        await this.updateJob(job.id, {
                            status: JobStatus.Failed,
                            error: `Job stalled - no updates for ${Math.round(this.stalledThresholdMs / 60000)} minutes. Backend may have restarted. Use resume to continue.`,
                            updatedAt: Date.now()
                        });
                        console.log('[StalledJobMonitor] Marked job %s as failed', job.id);
                    }
                }
            }

            if (stalledCount > 0) {
                console.log('[StalledJobMonitor] Found %d stalled jobs', stalledCount);
            }
        } catch (error) {
            console.error('[StalledJobMonitor] Error checking stalled jobs:', error);
        } finally {
            this.isRunning = false;
        }
    }
}

/**
 * Create and start a stalled job monitor
 * @param {Object} jobStore - Job store with listJobs, updateJob, getJob methods
 * @param {Object} options - Configuration options
 * @returns {StalledJobMonitor}
 */
export function createStalledJobMonitor(jobStore, options = {}) {
    const monitor = new StalledJobMonitor({
        listJobs: jobStore.listJobs,
        updateJob: jobStore.updateJob,
        getJob: jobStore.getJob,
        options
    });

    monitor.start();
    return monitor;
}
