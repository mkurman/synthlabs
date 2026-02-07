/**
 * Database Service (Backend-Only)
 *
 * All database operations are delegated to the backend server.
 * The frontend no longer connects to Firebase/Firestore directly.
 * Firebase configuration is managed by the backend via service account.
 */

import { SynthLogItem, VerifierItem, SessionListFilters } from '../types';
import { CloudSessionResult, SessionData } from '../interfaces/services/SessionConfig';
import { SessionVerificationStatus } from '../interfaces/enums/SessionVerificationStatus';
import * as backendClient from './backendClient';
import * as jobStorageService from './jobStorageService';
import { logger } from '../utils/logger';

// Legacy type re-exported for backward compatibility
export type SavedSession = SessionData;

// Recursively remove undefined values from objects/arrays
const sanitizePayload = (obj: any, seen = new WeakSet()): any => {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (seen.has(obj)) return null;
    seen.add(obj);

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizePayload(item, seen));
    }
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value !== undefined) {
            cleaned[key] = sanitizePayload(value, seen);
        }
    }
    return cleaned;
};

/**
 * @deprecated No-op. Firebase is now managed by the backend.
 */
export const initializeFirebase = async (_config?: any): Promise<boolean> => {
    logger.log('initializeFirebase is a no-op — database connections are managed by the backend.');
    return true;
};

/**
 * Always returns true — the backend manages database connectivity.
 */
export const isFirebaseConfigured = (): boolean => true;

/**
 * Always returns true — database operations go through the backend.
 */
export const isDbEnabled = (): boolean => true;

// --- Log Operations ---

export const fetchLogItem = async (logId: string): Promise<VerifierItem | null> => {
    const log = await backendClient.fetchLog(logId);
    if (!log) return null;
    const logData = log as SynthLogItem & { id: string };
    return {
        ...logData,
        id: logData.id,
        score: logData.score || 0,
        hasUnsavedChanges: false
    };
};

export const saveLogToFirebase = async (log: SynthLogItem, _collectionName: string = 'synth_logs') => {
    const docData: any = {
        sessionUid: log.sessionUid || 'unknown',
        source: log.source,
        seed_preview: log.seed_preview,
        full_seed: log.full_seed,
        query: log.query,
        reasoning: log.reasoning,
        reasoning_content: log.reasoning_content,
        answer: log.answer,
        timestamp: log.timestamp,
        duration: log.duration || 0,
        tokenCount: log.tokenCount || 0,
        modelUsed: log.modelUsed,
        createdAt: log.timestamp
    };
    if (log.deepMetadata) {
        const cleanMetadata: any = { ...log.deepMetadata };
        Object.keys(cleanMetadata).forEach(key => {
            if (cleanMetadata[key] === undefined) {
                delete cleanMetadata[key];
            }
        });
        docData.deepMetadata = cleanMetadata;
    }
    if (log.deepTrace) {
        docData.deepTrace = log.deepTrace;
    }
    if (log.messages && log.messages.length > 0) {
        docData.messages = log.messages;
        docData.isMultiTurn = true;
    }
    if (log.sessionName) {
        docData.sessionName = log.sessionName;
    }
    await backendClient.createLog(sanitizePayload(docData) as unknown as Record<string, unknown>);
};

export const updateLogItem = async (logId: string, updates: Partial<SynthLogItem>): Promise<VerifierItem | null> => {
    const updatedLog = await backendClient.updateLog(logId, updates as Record<string, unknown>);
    if (!updatedLog) {
        return null;
    }
    const logData = updatedLog as SynthLogItem & { id: string };
    return {
        ...logData,
        id: logData.id,
        score: logData.score || 0,
        hasUnsavedChanges: false
    };
};

export const deleteLogItem = async (logId: string) => {
    await backendClient.deleteLog(logId);
};

export const getDbStats = async (currentSessionUid?: string): Promise<{ total: number; session: number }> => {
    try {
        return await backendClient.fetchDbStats(currentSessionUid);
    } catch (e) {
        console.error('Failed to fetch DB stats from backend', e);
        return { total: 0, session: 0 };
    }
};

// --- Session Operations ---

export const saveSessionToFirebase = async (sessionData: SessionData, name: string) => {
    const sessionId = sessionData.id || sessionData.sessionUid;
    if (!sessionId) {
        throw new Error('Session must have an id or sessionUid');
    }
    const payload = sanitizePayload({
        ...sessionData,
        name: name || sessionData.name,
        updatedAt: Date.now(),
        sessionUid: sessionId
    });
    await backendClient.updateSession(sessionId, payload);
};

export const createSessionInFirebase = async (name?: string, source?: string, config?: any): Promise<string> => {
    const payload: Record<string, unknown> = {
        name: name || `Auto Session ${new Date().toLocaleString()}`,
        source,
        createdAt: new Date().toISOString(),
        isAutoCreated: true,
        logCount: 0
    };
    if (config) {
        payload.config = sanitizePayload(config);
    }
    return backendClient.createSession(payload);
};

export const getSessionsFromFirebase = async (
    filters?: SessionListFilters,
    cursor?: string | null,
    limit?: number,
    forceRefresh?: boolean
): Promise<{ sessions: SessionData[]; nextCursor?: string | null; hasMore?: boolean }> => {
    const result = await backendClient.fetchSessions(filters, cursor, limit, forceRefresh);
    return {
        sessions: result.sessions as SessionData[],
        nextCursor: result.nextCursor,
        hasMore: result.hasMore
    };
};

export const deleteSessionFromFirebase = async (id: string) => {
    await backendClient.deleteSessionWithLogs(id);
};

export const updateSessionVerificationStatus = async (sessionId: string, status: SessionVerificationStatus) => {
    await backendClient.updateSessionVerificationStatus(sessionId, status);
};

export const deleteSessionWithLogs = async (sessionId: string): Promise<{ deletedLogs: number }> => {
    return backendClient.deleteSessionWithLogs(sessionId);
};

export const loadFromCloud = async (sessionId: string): Promise<CloudSessionResult | null> => {
    const data = await backendClient.fetchSession(sessionId) as SessionData;
    if (!data) return null;
    const sessionUid = (data as any).sessionUid || (data as any).id;
    return {
        id: (data as any).id || sessionId,
        name: (data as any).name || 'Unknown Session',
        sessionData: data,
        sessionUid
    };
};

// --- Verifier Functions ---

export const fetchAllLogs = async (
    limitCount?: number,
    sessionUid?: string,
    forceRefresh = false
): Promise<VerifierItem[]> => {
    const logs = typeof limitCount === 'number' && limitCount > 0
        ? await backendClient.fetchLogs(sessionUid, limitCount, 0, forceRefresh)
        : await backendClient.fetchAllLogs(sessionUid, forceRefresh);
    return logs as VerifierItem[];
};

export const fetchLogsAfter = async (options: {
    limitCount?: number;
    sessionUid?: string;
    offsetCount?: number;
    lastDoc?: any;
}): Promise<VerifierItem[]> => {
    const logs = typeof options.limitCount === 'number' && options.limitCount > 0
        ? await backendClient.fetchLogs(options.sessionUid, options.limitCount, options.offsetCount || 0)
        : await backendClient.fetchAllLogs(options.sessionUid);
    return logs as VerifierItem[];
};

/**
 * @deprecated saveFinalDataset is not supported through backend yet.
 * Keeping signature for backward compatibility.
 */
export const saveFinalDataset = async (_items: VerifierItem[], _collectionName = 'synth_verified'): Promise<number> => {
    throw new Error('saveFinalDataset is not yet supported through the backend API. Export as JSON instead.');
};

// --- Orphan Operations ---

export interface OrphanedLogsInfo {
    hasOrphanedLogs: boolean;
    orphanedSessionCount: number;
    totalOrphanedLogs: number;
    orphanedUids: string[];
    isPartialScan?: boolean;
    scannedCount?: number;
}

export interface OrphanScanProgress {
    scannedCount: number;
    orphanedSessionCount: number;
    totalOrphanedLogs: number;
}

const ORPHAN_CHECK_COOLDOWN_KEY = 'synthlabs_orphan_check_last_run';
const ORPHAN_CHECK_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

export const isOrphanCheckOnCooldown = (): boolean => {
    try {
        const lastRun = localStorage.getItem(ORPHAN_CHECK_COOLDOWN_KEY);
        if (!lastRun) return false;
        return (Date.now() - Number(lastRun)) < ORPHAN_CHECK_COOLDOWN_MS;
    } catch {
        return false;
    }
};

const setOrphanCheckLastRun = (): void => {
    try {
        localStorage.setItem(ORPHAN_CHECK_COOLDOWN_KEY, String(Date.now()));
    } catch {
        // localStorage not available
    }
};

export const getOrphanedLogsInfo = async (onProgress?: (progress: OrphanScanProgress) => void): Promise<OrphanedLogsInfo> => {
    setOrphanCheckLastRun();
    try {
        const jobId = await backendClient.startOrphanCheck();
        await jobStorageService.addJob({ id: jobId, type: 'orphan_check', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
        try {
            const result = await backendClient.pollOrphanCheckJob(jobId, (progress) => {
                onProgress?.({
                    scannedCount: progress.scannedCount || 0,
                    orphanedSessionCount: progress.orphanedSessionCount || 0,
                    totalOrphanedLogs: progress.totalOrphanedLogs || 0
                });
            });
            if (onProgress) {
                onProgress({
                    scannedCount: result.scannedCount || 0,
                    orphanedSessionCount: result.orphanedSessionCount || 0,
                    totalOrphanedLogs: result.totalOrphanedLogs || 0
                });
            }
            return result as OrphanedLogsInfo;
        } finally {
            await jobStorageService.removeJob(jobId);
        }
    } catch (e: any) {
        // Backward-compat fallback for older backends that only expose GET /api/orphans/check.
        try {
            const result = await backendClient.checkOrphansLegacy() as OrphanedLogsInfo;
            if (onProgress) {
                onProgress({
                    scannedCount: result.scannedCount || 0,
                    orphanedSessionCount: result.orphanedSessionCount || 0,
                    totalOrphanedLogs: result.totalOrphanedLogs || 0
                });
            }
            return result as OrphanedLogsInfo;
        } catch {
            throw e;
        }
    }
};

export interface SyncResult {
    sessionsCreated: number;
    logsAssigned: number;
    orphanedUids: string[];
    isPartialScan?: boolean;
    scannedCount?: number;
}

export interface OrphanSyncProgress {
    phase: 'scan' | 'reassign';
    scannedCount: number;
    orphanedSessions: number;
    updatedLogs: number;
}

export const syncOrphanedLogsToSessions = async (onProgress?: (progress: OrphanSyncProgress) => void): Promise<SyncResult> => {
    const jobId = await backendClient.startOrphanSync();
    await jobStorageService.addJob({ id: jobId, type: 'orphan_sync', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
    const result = await backendClient.pollJob(jobId, (progress) => {
        onProgress?.({
            phase: 'reassign',
            scannedCount: progress.scannedCount,
            orphanedSessions: progress.orphanedSessions,
            updatedLogs: progress.updatedLogs
        });
    }) as SyncResult;
    await jobStorageService.removeJob(jobId);
    if (onProgress) {
        onProgress({
            phase: 'reassign',
            scannedCount: result.scannedCount || 0,
            orphanedSessions: result.orphanedUids?.length || 0,
            updatedLogs: result.logsAssigned || 0
        });
    }
    return result;
};

export const resumeOrphanSyncJobs = async (onProgress?: (progress: OrphanSyncProgress) => void): Promise<boolean> => {
    const jobs = await jobStorageService.listJobs();
    const orphanJobs = jobs.filter(job => job.type === 'orphan_sync' || job.type === 'orphan-sync');
    if (orphanJobs.length === 0) {
        return false;
    }
    let resumed = false;
    for (const job of orphanJobs) {
        try {
            const result = await backendClient.pollJob(job.id, (progress) => {
                onProgress?.({
                    phase: 'reassign',
                    scannedCount: progress.scannedCount,
                    orphanedSessions: progress.orphanedSessions,
                    updatedLogs: progress.updatedLogs
                });
            }) as SyncResult;
            resumed = true;
            onProgress?.({
                phase: 'reassign',
                scannedCount: result.scannedCount || 0,
                orphanedSessions: result.orphanedUids?.length || 0,
                updatedLogs: result.logsAssigned || 0
            });
        } catch (e) {
            console.warn(`[resumeOrphanSyncJobs] Job ${job.id} is stale or not found, cleaning up`, e);
        }
        await jobStorageService.removeJob(job.id);
    }
    return resumed;
};

export const hasOrphanSyncJobs = async (): Promise<boolean> => {
    const jobs = await jobStorageService.listJobs();
    return jobs.some(job => job.type === 'orphan_sync' || job.type === 'orphan-sync');
};
