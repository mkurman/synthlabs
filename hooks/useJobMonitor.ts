import { useState, useEffect, useCallback, useRef } from 'react';
import {
    BackendJobRecord,
    listJobs as listLocalJobs,
    addJob as addLocalJob,
    updateJob as updateLocalJob,
    removeJob as removeLocalJob,
    clearOldJobs
} from '../services/jobStorageService';
import * as backendClient from '../services/backendClient';
import { encryptKey } from '../utils/keyEncryption';
import { SettingsService } from '../services/settingsService';
import { toast } from '../services/toastService';

const POLL_INTERVAL_MS = 5000;
const JOB_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const JOB_TYPE_LABELS: Record<string, string> = {
    autoscore: 'Auto-Score',
    rewrite: 'Rewrite',
    'remove-items': 'Remove Items',
    'migrate-reasoning': 'Migrate Reasoning',
    orphan_check: 'Orphan Check',
    orphan_sync: 'Orphan Sync',
};

const getJobLabel = (type: string): string => JOB_TYPE_LABELS[type] || type;

export interface UseJobMonitorReturn {
    jobs: BackendJobRecord[];
    activeCount: number;
    trackJob: (jobId: string, type: string) => void;
    dismissJob: (jobId: string) => void;
    stopJob: (jobId: string) => Promise<void>;
    rerunJob: (jobId: string) => Promise<void>;
    resumeJob: (jobId: string) => Promise<void>;
    clearCompleted: () => void;
    refreshJobs: () => Promise<void>;
    selectedJobId: string | null;
    setSelectedJobId: (id: string | null) => void;
    isPanelOpen: boolean;
    setIsPanelOpen: (open: boolean) => void;
}

export interface UseJobMonitorOptions {
    onJobCompleted?: (jobId: string, type: string) => void;
}

export const useJobMonitor = (options?: UseJobMonitorOptions): UseJobMonitorReturn => {
    const onJobCompletedRef = useRef(options?.onJobCompleted);
    const [jobs, setJobs] = useState<BackendJobRecord[]>([]);
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const previousStatusRef = useRef<Map<string, string>>(new Map());
    const mountedRef = useRef(true);

    // Keep callback ref up to date
    onJobCompletedRef.current = options?.onJobCompleted;

    const activeCount = jobs.filter(j => j.status === 'pending' || j.status === 'running').length;

    const mergeJobs = useCallback((localJobs: BackendJobRecord[], remoteJobs: BackendJobRecord[]): BackendJobRecord[] => {
        const map = new Map<string, BackendJobRecord>();
        for (const job of localJobs) {
            map.set(job.id, job);
        }
        for (const job of remoteJobs) {
            const existing = map.get(job.id);
            if (!existing || job.updatedAt > existing.updatedAt) {
                map.set(job.id, {
                    id: job.id,
                    type: job.type,
                    status: job.status,
                    progress: job.progress,
                    result: job.result,
                    error: job.error,
                    createdAt: job.createdAt,
                    updatedAt: job.updatedAt,
                });
            }
        }
        return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    }, []);

    const refreshJobs = useCallback(async () => {
        try {
            const local = await listLocalJobs();
            let remote: BackendJobRecord[] = [];
            try {
                if (backendClient.isBackendEnabled()) {
                    const fetched = await backendClient.fetchJobs({ limit: 50 });
                    remote = fetched.map(j => ({
                        id: j.id,
                        type: j.type,
                        status: j.status,
                        progress: j.progress,
                        result: j.result,
                        error: j.error,
                        createdAt: j.createdAt,
                        updatedAt: j.updatedAt,
                    }));
                }
            } catch {
                // Backend not available, use local only
            }
            const merged = mergeJobs(local, remote);
            if (mountedRef.current) {
                setJobs(merged);
            }
            // Sync merged results back to local storage
            for (const job of merged) {
                await updateLocalJob(job);
            }
        } catch {
            // Silently handle errors on refresh
        }
    }, [mergeJobs]);

    const pollRunningJobs = useCallback(async () => {
        const running = jobs.filter(j => j.status === 'pending' || j.status === 'running');
        if (running.length === 0) return;

        let hasChanges = false;
        const updatedJobs = [...jobs];

        for (const job of running) {
            try {
                const fetched = await backendClient.fetchJob(job.id);
                const idx = updatedJobs.findIndex(j => j.id === job.id);
                if (idx === -1) continue;

                const prev = previousStatusRef.current.get(job.id);
                const updated: BackendJobRecord = {
                    ...updatedJobs[idx],
                    status: fetched.status,
                    progress: fetched.progress as Record<string, unknown> | undefined,
                    result: fetched.result as Record<string, unknown> | null | undefined,
                    error: fetched.error,
                    updatedAt: Date.now(),
                };
                updatedJobs[idx] = updated;
                hasChanges = true;

                await updateLocalJob(updated);

                // Show toast on status transition
                if (prev && prev !== fetched.status) {
                    if (fetched.status === 'completed') {
                        toast.success(`${getJobLabel(job.type)} job completed`);
                        onJobCompletedRef.current?.(job.id, job.type);
                    } else if (fetched.status === 'failed') {
                        toast.error(`${getJobLabel(job.type)} job failed`);
                    }
                }
                previousStatusRef.current.set(job.id, fetched.status);
            } catch (error: any) {
                if (error?.status === 404) {
                    const idx = updatedJobs.findIndex(j => j.id === job.id);
                    if (idx !== -1) {
                        updatedJobs.splice(idx, 1);
                        await removeLocalJob(job.id);
                        previousStatusRef.current.delete(job.id);
                        hasChanges = true;
                        toast.error(`${getJobLabel(job.type)} job not found. Removed from monitor.`);
                    }
                }
                // Job fetch failed, skip
            }
        }

        if (hasChanges && mountedRef.current) {
            setJobs(updatedJobs);
        }
    }, [jobs]);

    // Initialize: load from local + backend, prune old
    useEffect(() => {
        mountedRef.current = true;
        clearOldJobs(JOB_MAX_AGE_MS).catch(() => { /* ignore */ });
        refreshJobs();
        return () => { mountedRef.current = false; };
    }, []);

    // Initialize previous status map when jobs load
    useEffect(() => {
        for (const job of jobs) {
            if (!previousStatusRef.current.has(job.id)) {
                previousStatusRef.current.set(job.id, job.status);
            }
        }
    }, [jobs]);

    // Poll running jobs
    useEffect(() => {
        if (activeCount === 0) return;
        const interval = setInterval(pollRunningJobs, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [activeCount, pollRunningJobs]);

    const trackJob = useCallback((jobId: string, type: string) => {
        const record: BackendJobRecord = {
            id: jobId,
            type,
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        addLocalJob(record).catch(() => { /* ignore */ });
        previousStatusRef.current.set(jobId, 'pending');
        setJobs(prev => [record, ...prev.filter(j => j.id !== jobId)]);
    }, []);

    const stopJob = useCallback(async (jobId: string) => {
        try {
            await backendClient.cancelJob(jobId);
            const updated: BackendJobRecord = {
                id: jobId,
                type: jobs.find(j => j.id === jobId)?.type || 'unknown',
                status: 'failed',
                error: 'Cancelled by user',
                createdAt: jobs.find(j => j.id === jobId)?.createdAt || Date.now(),
                updatedAt: Date.now(),
            };
            await updateLocalJob(updated);
            previousStatusRef.current.set(jobId, 'failed');
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updated } : j));
            toast.info(`${getJobLabel(updated.type)} job cancelled`);
        } catch {
            toast.error('Failed to cancel job');
        }
    }, [jobs]);

    const rerunJob = useCallback(async (jobId: string) => {
        const oldJob = jobs.find(j => j.id === jobId);
        const label = getJobLabel(oldJob?.type || 'unknown');
        try {
            // Fetch full job from backend to get stored params (including provider)
            const fullJob = await backendClient.fetchJob(jobId) as Record<string, unknown>;
            const params = fullJob?.params as Record<string, unknown> | undefined;
            const provider = (params?.provider as string) || '';

            // Get the current API key for that provider
            const apiKey = provider
                ? SettingsService.getApiKey(provider)
                : '';
            if (!apiKey) {
                toast.error(`No API key for provider "${provider}" — cannot rerun job`);
                return;
            }

            const encrypted = await encryptKey(apiKey);
            const newJobId = await backendClient.rerunJob(jobId, encrypted);
            trackJob(newJobId, oldJob?.type || 'unknown');
            toast.success(`${label} job restarted`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to rerun job: ${msg}`);
        }
    }, [jobs, trackJob]);

    const resumeJob = useCallback(async (jobId: string) => {
        const oldJob = jobs.find(j => j.id === jobId);
        const label = getJobLabel(oldJob?.type || 'unknown');
        try {
            let newJobId: string;

            // Resume based on job type
            if (oldJob?.type === 'autoscore') {
                // Autoscore needs API key
                const fullJob = await backendClient.fetchJob(jobId) as Record<string, unknown>;
                const params = fullJob?.params as Record<string, unknown> | undefined;
                const provider = (params?.provider as string) || '';

                const apiKey = provider ? SettingsService.getApiKey(provider) : '';
                if (!apiKey) {
                    toast.error(`No API key for provider "${provider}" — cannot resume job`);
                    return;
                }

                const encrypted = await encryptKey(apiKey);
                newJobId = await backendClient.startAutoScore({
                    resumeJobId: jobId,
                    apiKey: encrypted,
                });
            } else if (oldJob?.type === 'migrate-reasoning') {
                // Migrate reasoning doesn't need API key
                newJobId = await backendClient.startMigrateReasoning({
                    resumeJobId: jobId,
                });
            } else if (oldJob?.type === 'rewrite') {
                // Rewrite needs API key
                const fullJob = await backendClient.fetchJob(jobId) as Record<string, unknown>;
                const params = fullJob?.params as Record<string, unknown> | undefined;
                const provider = (params?.provider as string) || '';

                const apiKey = provider ? SettingsService.getApiKey(provider) : '';
                if (!apiKey) {
                    toast.error(`No API key for provider "${provider}" — cannot resume job`);
                    return;
                }

                const encrypted = await encryptKey(apiKey);
                newJobId = await backendClient.startRewrite({
                    resumeJobId: jobId,
                    apiKey: encrypted,
                });
            } else {
                toast.error(`Job type "${oldJob?.type}" does not support resume`);
                return;
            }

            // The resumed job keeps the same ID, so just refresh
            await refreshJobs();
            toast.success(`${label} job resumed from where it stopped`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to resume job: ${msg}`);
        }
    }, [jobs, refreshJobs]);

    const dismissJob = useCallback((jobId: string) => {
        removeLocalJob(jobId).catch(() => { /* ignore */ });
        previousStatusRef.current.delete(jobId);
        setJobs(prev => prev.filter(j => j.id !== jobId));
        if (selectedJobId === jobId) {
            setSelectedJobId(null);
        }
    }, [selectedJobId]);

    const clearCompleted = useCallback(() => {
        const toRemove = jobs.filter(j => j.status === 'completed' || j.status === 'failed');
        for (const job of toRemove) {
            removeLocalJob(job.id).catch(() => { /* ignore */ });
            previousStatusRef.current.delete(job.id);
        }
        setJobs(prev => prev.filter(j => j.status !== 'completed' && j.status !== 'failed'));
        if (selectedJobId && toRemove.some(j => j.id === selectedJobId)) {
            setSelectedJobId(null);
        }
    }, [jobs, selectedJobId]);

    return {
        jobs,
        activeCount,
        trackJob,
        dismissJob,
        stopJob,
        rerunJob,
        resumeJob,
        clearCompleted,
        refreshJobs,
        selectedJobId,
        setSelectedJobId,
        isPanelOpen,
        setIsPanelOpen,
    };
};
