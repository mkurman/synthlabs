import type { SessionListFilters } from '../types';

const DEFAULT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const BACKEND_URL_OVERRIDE_KEY = 'synthlabs_backend_url';
const isDesktopRuntime = typeof navigator !== 'undefined' && /Electron|Tauri/i.test(navigator.userAgent);
const defaultPortStart = isDesktopRuntime && import.meta.env.MODE === 'production' ? 8788 : 8787;
const DEFAULT_PORT_START = Number(import.meta.env.VITE_BACKEND_PORT_START || defaultPortStart);
const DEFAULT_PORT_RANGE = Number(import.meta.env.VITE_BACKEND_PORT_RANGE || 10);

let resolvedBackendUrl: string | null = null;
let resolvingBackendUrl: Promise<string> | null = null;

const normalizeBaseUrl = (base: string) => (base.endsWith('/') ? base.slice(0, -1) : base);

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

const probeUrl = async (baseUrl: string, timeoutMs = 600): Promise<boolean> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${normalizeBaseUrl(baseUrl)}/health`, { signal: controller.signal });
        return response.ok;
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

const resolveBackendUrl = async (): Promise<string> => {
    const override = getStoredOverride();
    if (override) return override;
    if (DEFAULT_BACKEND_URL) {
        const isHealthy = await probeUrl(DEFAULT_BACKEND_URL);
        if (isHealthy) return DEFAULT_BACKEND_URL;
    }
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
        const discovered = await discoverBackendUrl();
        if (discovered) {
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

export const checkOrphans = async () => {
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
