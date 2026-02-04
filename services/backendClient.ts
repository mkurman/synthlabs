import type { SessionListFilters } from '../types';

// --- Constants ---
const DEFAULT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const BACKEND_URL_OVERRIDE_KEY = 'synthlabs_backend_url';
const SERVICE_FINGERPRINT = 'synthlabs-rg';
const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
const defaultPortStart = isElectron && import.meta.env.MODE === 'production' ? 8788 : 8787;
const DEFAULT_PORT_START = Number(import.meta.env.VITE_BACKEND_PORT_START || defaultPortStart);
const DEFAULT_PORT_RANGE = Number(import.meta.env.VITE_BACKEND_PORT_RANGE || 10);

let resolvedBackendUrl: string | null = null;
let resolvingBackendUrl: Promise<string> | null = null;

const normalizeBaseUrl = (base: string) => (base.endsWith('/') ? base.slice(0, -1) : base);

// --- localStorage helpers ---
const getStoredOverride = (): string => {
    try {
        return localStorage.getItem(BACKEND_URL_OVERRIDE_KEY) || '';
    } catch {
        return '';
    }
};

const setStoredOverride = (value: string) => {
    try {
        localStorage.setItem(BACKEND_URL_OVERRIDE_KEY, value);
    } catch {
        // Ignore storage errors (e.g., storage disabled)
    }
};

const clearStoredOverride = () => {
    try {
        localStorage.removeItem(BACKEND_URL_OVERRIDE_KEY);
    } catch {
        // Ignore storage errors (e.g., storage disabled)
    }
};

// --- Layer A: Electron IPC ---
const resolveViaElectronIpc = async (): Promise<string | null> => {
    if (!isElectron) return null;
    try {
        const port = await window.electronAPI?.getBackendPort();
        if (port) {
            const url = `http://localhost:${port}`;
            console.log(`[backendClient] Resolved via Electron IPC: ${url}`);
            return url;
        }
    } catch (e) {
        console.warn('[backendClient] Electron IPC failed:', e);
    }
    return null;
};

// --- Layer B: Dev vault endpoint ---
const resolveViaDevVault = async (): Promise<string | null> => {
    if (import.meta.env.MODE === 'production') return null;
    try {
        const response = await fetch('/__vault__', {
            signal: AbortSignal.timeout(1000)
        });
        if (!response.ok) return null;
        const vault = await response.json();
        if (vault?.port && vault?.service === SERVICE_FINGERPRINT) {
            const url = `http://localhost:${vault.port}`;
            console.log(`[backendClient] Resolved via dev vault: ${url}`);
            return url;
        }
    } catch {
        // Vault endpoint not available
    }
    return null;
};

// --- Layer C: Fingerprinted port scanning ---
const probeUrl = async (baseUrl: string, timeoutMs = 600): Promise<boolean> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${normalizeBaseUrl(baseUrl)}/health`, { signal: controller.signal });
        if (!response.ok) return false;
        const body = await response.json();
        return body?.ok === true && body?.service === SERVICE_FINGERPRINT;
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
};

const getDefaultPortStart = (): number => {
    if (DEFAULT_BACKEND_URL) {
        try {
            const url = new URL(DEFAULT_BACKEND_URL);
            if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
                const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
                if (Number.isFinite(port)) {
                    return port;
                }
            }
        } catch {
            // Ignore malformed URL
        }
    }
    return DEFAULT_PORT_START;
};

const discoverBackendUrl = async (): Promise<string> => {
    const startPort = getDefaultPortStart();
    for (let i = 0; i <= DEFAULT_PORT_RANGE; i += 1) {
        const port = startPort + i;
        const candidate = `http://localhost:${port}`;
        if (await probeUrl(candidate)) {
            setStoredOverride(candidate);
            return candidate;
        }
    }
    return '';
};

// --- Main resolution orchestrator ---
const resolveBackendUrl = async (): Promise<string> => {
    // Priority 1: Electron IPC (deterministic, instant)
    const ipcUrl = await resolveViaElectronIpc();
    if (ipcUrl) return ipcUrl;

    // Priority 2: Dev vault (deterministic, fast)
    const vaultUrl = await resolveViaDevVault();
    if (vaultUrl) return vaultUrl;

    // Priority 3: localStorage override (user-configured)
    const override = getStoredOverride();
    if (override) return override;

    // Priority 4: VITE_BACKEND_URL env var with fingerprint check
    if (DEFAULT_BACKEND_URL) {
        const isHealthy = await probeUrl(DEFAULT_BACKEND_URL);
        if (isHealthy) return DEFAULT_BACKEND_URL;
    }

    // Priority 5: Port scanning with fingerprint verification
    return discoverBackendUrl();
};

const getBackendUrl = async (): Promise<string> => {
    if (resolvedBackendUrl) return resolvedBackendUrl;
    if (!resolvingBackendUrl) {
        resolvingBackendUrl = resolveBackendUrl().finally(() => {
            resolvingBackendUrl = null;
        });
    }
    resolvedBackendUrl = await resolvingBackendUrl;
    return resolvedBackendUrl;
};

const buildUrl = async (path: string) => {
    const base = await getBackendUrl();
    if (!base) {
        throw new Error('Backend URL is not configured.');
    }
    return `${normalizeBaseUrl(base)}${path}`;
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const url = await buildUrl(path);
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
            ...init
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `Request failed: ${response.status}`);
        }
        return response.json() as Promise<T>;
    } catch (error) {
        resolvedBackendUrl = null;
        const discovered = await resolveBackendUrl();
        if (discovered) {
            resolvedBackendUrl = discovered;
            const retryUrl = `${normalizeBaseUrl(discovered)}${path}`;
            const retryResponse = await fetch(retryUrl, {
                headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
                ...init
            });
            if (!retryResponse.ok) {
                const text = await retryResponse.text();
                throw new Error(text || `Request failed: ${retryResponse.status}`);
            }
            return retryResponse.json() as Promise<T>;
        }
        throw error;
    }
};

export const isBackendEnabled = () => Boolean(DEFAULT_BACKEND_URL || getStoredOverride());

export const getBackendUrlOverride = () => getStoredOverride();

export const setBackendUrlOverride = (value: string) => {
    if (value.trim().length === 0) {
        clearStoredOverride();
        resolvedBackendUrl = null;
        return;
    }
    setStoredOverride(value.trim());
    resolvedBackendUrl = null;
};

export const fetchSessions = async (filters?: SessionListFilters, cursor?: string | null, limit?: number, forceRefresh?: boolean) => {
    const params = new URLSearchParams();
    if (filters) {
        if (filters.search) params.set('search', filters.search);
        if (filters.onlyWithLogs) params.set('onlyWithLogs', '1');
        if (filters.minRows !== null) params.set('minRows', String(filters.minRows));
        if (filters.maxRows !== null) params.set('maxRows', String(filters.maxRows));
        if (filters.appMode) params.set('appMode', filters.appMode);
        if (filters.engineMode) params.set('engineMode', filters.engineMode);
        if (filters.model) params.set('model', filters.model);
    }
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));
    if (forceRefresh) params.set('forceRefresh', '1');
    const query = params.toString();
    const result = await requestJson<{ sessions: unknown[]; nextCursor?: string | null; hasMore?: boolean }>(`/api/sessions${query ? `?${query}` : ''}`);
    return result;
};

export const fetchSession = async (id: string) => {
    const result = await requestJson<{ session: unknown }>(`/api/sessions/${id}`);
    return result.session;
};

export const createSession = async (payload: Record<string, unknown>) => {
    const result = await requestJson<{ id: string }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    return result.id;
};

export const updateSession = async (id: string, payload: Record<string, unknown>) => {
    const result = await requestJson<{ ok: boolean; id: string }>(`/api/sessions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    });
    return result;
};

export const updateSessionVerificationStatus = async (id: string, status: string) => {
    await requestJson<{ ok: boolean }>(`/api/sessions/${id}/verification-status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
    });
};

export const deleteSessionWithLogs = async (id: string) => {
    const result = await requestJson<{ deletedLogs: number }>(`/api/sessions/${id}?withLogs=1`, {
        method: 'DELETE'
    });
    return result;
};

export const fetchLogs = async (sessionUid?: string, limit = 100) => {
    const query = new URLSearchParams();
    query.set('limit', String(limit));
    if (sessionUid) {
        query.set('sessionUid', sessionUid);
    }
    const result = await requestJson<{ logs: unknown[] }>(`/api/logs?${query.toString()}`);
    return result.logs;
};

export interface LogsPageResult {
    logs: unknown[];
    hasMore: boolean;
    nextCursorCreatedAt?: string | number | null;
}

export const fetchLogsPage = async (
    sessionUid?: string,
    limit = 500,
    cursorCreatedAt?: string | number | null
): Promise<LogsPageResult> => {
    const query = new URLSearchParams();
    query.set('limit', String(limit));
    if (sessionUid) {
        query.set('sessionUid', sessionUid);
    }
    if (cursorCreatedAt !== undefined && cursorCreatedAt !== null && `${cursorCreatedAt}`.length > 0) {
        query.set('cursorCreatedAt', String(cursorCreatedAt));
    }
    return requestJson<LogsPageResult>(`/api/logs?${query.toString()}`);
};

export const fetchAllLogs = async (sessionUid?: string): Promise<unknown[]> => {
    const pageSize = 500;
    const maxPages = 100; // Safety cap: up to 50k logs per request chain
    let cursorCreatedAt: string | number | null | undefined = undefined;
    const allLogs: unknown[] = [];

    for (let page = 0; page < maxPages; page += 1) {
        const { logs, hasMore, nextCursorCreatedAt } = await fetchLogsPage(sessionUid, pageSize, cursorCreatedAt);
        if (logs.length > 0) {
            allLogs.push(...logs);
        }
        if (!hasMore || !nextCursorCreatedAt) {
            break;
        }
        cursorCreatedAt = nextCursorCreatedAt;
    }

    return allLogs;
};

export const fetchLog = async (id: string) => {
    const result = await requestJson<{ log: unknown }>(`/api/logs/${id}`);
    return result.log;
};

export const updateLog = async (id: string, updates: Record<string, unknown>) => {
    await requestJson<{ ok: boolean }>(`/api/logs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
    });
};

export const deleteLog = async (id: string) => {
    await requestJson<{ ok: boolean }>(`/api/logs/${id}`, {
        method: 'DELETE'
    });
};

export const createLog = async (payload: Record<string, unknown>) => {
    const result = await requestJson<{ id: string }>('/api/logs', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    return result.id;
};

export const fetchDbStats = async (sessionUid?: string): Promise<{ total: number; session: number }> => {
    const query = new URLSearchParams();
    if (sessionUid) {
        query.set('sessionUid', sessionUid);
    }
    return requestJson<{ total: number; session: number }>(`/api/logs/stats?${query.toString()}`);
};

export const startOrphanCheck = async () => {
    const { jobId } = await requestJson<{ jobId: string }>('/api/orphans/check', { method: 'POST' });
    if (!jobId) {
        throw new Error('Orphan check job start failed.');
    }
    return jobId;
};

export const checkOrphansLegacy = async () => {
    return requestJson('/api/orphans/check');
};

export const startOrphanSync = async () => {
    const { jobId } = await requestJson<{ jobId: string }>('/api/orphans/sync', { method: 'POST' });
    if (!jobId) {
        throw new Error('Job start failed.');
    }
    return jobId;
};

export const fetchJob = async (jobId: string) => {
    return requestJson<{
        status: string;
        progress?: { scannedCount: number; orphanedSessions: number; updatedLogs: number };
        result?: any;
        error?: string;
    }>(`/api/jobs/${jobId}`);
};


export const pollJob = async (
    jobId: string,
    onProgress?: (progress: { scannedCount: number; orphanedSessions: number; updatedLogs: number }) => void
) => {
    for (;;) {
        const job = await fetchJob(jobId);
        if (job.progress && onProgress) {
            onProgress(job.progress);
        }
        if (job.status === 'completed') {
            return job.result;
        }
        if (job.status === 'failed') {
            throw new Error(job.error || 'Job failed.');
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
};

export const syncOrphans = async (onProgress?: (progress: { scannedCount: number; orphanedSessions: number; updatedLogs: number }) => void) => {
    const jobId = await startOrphanSync();
    return pollJob(jobId, onProgress);
};

export const pollOrphanCheckJob = async (
    jobId: string,
    onProgress?: (progress: { scannedCount: number; orphanedSessionCount: number; totalOrphanedLogs: number }) => void
) => {
    for (;;) {
        const job = await fetchJob(jobId);
        if (job.progress && onProgress) {
            const progress = job.progress as {
                scannedCount?: number;
                orphanedSessionCount?: number;
                totalOrphanedLogs?: number;
            };
            onProgress({
                scannedCount: progress.scannedCount || 0,
                orphanedSessionCount: progress.orphanedSessionCount || 0,
                totalOrphanedLogs: progress.totalOrphanedLogs || 0
            });
        }
        if (job.status === 'completed') {
            return job.result;
        }
        if (job.status === 'failed') {
            throw new Error(job.error || 'Orphan check job failed.');
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
};

export const setServiceAccountPath = async (path: string) => {
    await requestJson<{ ok: boolean }>('/api/admin/service-account-path', {
        method: 'POST',
        body: JSON.stringify({ path })
    });
};

export const setServiceAccountJson = async (json: string) => {
    await requestJson<{ ok: boolean }>('/api/admin/service-account-json', {
        method: 'POST',
        body: JSON.stringify({ json })
    });
};
