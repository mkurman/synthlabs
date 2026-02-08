import {
    SessionData,
} from '../interfaces/services/SessionConfig';
import {
    getSessionsFromFirebase,
    loadFromCloud as loadFromCloudFirebase,
    deleteSessionFromFirebase,
    isFirebaseConfigured
} from './firebaseService';
import * as IndexedDBUtils from './session/indexedDBUtils';
import { logger } from '../utils/logger';
import { DataSource } from '../types';
import { CreatorMode, Environment } from '../interfaces/enums';
import { toast } from './toastService';
import type { SessionListFilters } from '../types';

// Interface for a lightweight session list item
export interface SessionSummary {
    id: string;
    name: string;
    timestamp: string;
    mode?: CreatorMode;
    createTime?: string;
    source: string;
    logCount?: number;
    isCloud: boolean;
    isFavorite?: boolean; // For future use
    sessionUid: string;
}

class SessionLoadService {
    private cache: Map<string, SessionData> = new Map();
    private listCache: SessionData[] | null = null;
    private listCacheTimestamp: number = 0;
    private listCacheEnvironment: Environment | null = null;
    private listCursor: string | null = null;
    private listHasMore: boolean = true;
    private CACHE_DURATION = Number(import.meta.env.VITE_SESSION_LIST_TTL_MS || 60000);
    private PAGE_SIZE = Number(import.meta.env.VITE_SESSION_LIST_PAGE_SIZE || 50);

    // Deduplication: track pending requests per environment
    private pendingListRequest: Map<Environment, Promise<SessionData[]>> = new Map();

    /**
     * Load the list of available sessions.
     * Merges cloud sessions and local sessions.
     * Deduplicates concurrent calls for the same environment.
     */
    async loadSessionList(forceRefresh = false, environment: Environment, filters?: SessionListFilters): Promise<SessionData[]> {
        // Check cache validity (must match environment)
        const cacheValid = !forceRefresh
            && this.listCache
            && this.listCacheEnvironment === environment
            && (Date.now() - this.listCacheTimestamp < this.CACHE_DURATION)
            && !filters;

        if (cacheValid) {
            return this.listCache!;
        }

        // Deduplicate: if there's already a pending request for this environment, wait for it
        const pendingRequest = this.pendingListRequest.get(environment);
        if (pendingRequest) {
            return pendingRequest;
        }

        // Create and track the new request
        const request = this.doLoadSessionList(environment, filters, forceRefresh);
        this.pendingListRequest.set(environment, request);

        try {
            return await request;
        } finally {
            // Clean up pending request tracking
            this.pendingListRequest.delete(environment);
        }
    }

    /**
     * Internal method that actually loads sessions.
     */
    private async doLoadSessionList(environment: Environment, filters?: SessionListFilters, forceRefresh?: boolean): Promise<SessionData[]> {
        try {
            const summaries: SessionData[] = [];
            this.listCursor = null;
            this.listHasMore = true;

            // 1. Load Cloud Sessions (only if configured and explicitly not disabled, or if we want to mix)
            // CURRENT LOGIC: Mix both if available.
            if (environment === Environment.Production) {
                try {
                    if (!isFirebaseConfigured()) {
                        throw new Error('Firebase is not configured');
                    }
                    const { sessions, nextCursor, hasMore } = await getSessionsFromFirebase(filters, null, this.PAGE_SIZE, forceRefresh);
                    summaries.push(...sessions);
                    this.listCursor = nextCursor || null;
                    this.listHasMore = Boolean(hasMore);
                } catch (e) {
                    logger.warn('Failed to load cloud sessions', e);
                    toast.error('Failed to load cloud sessions');
                }
            }

            else if (environment === Environment.Development) {
                // 2. Load Local Sessions (Always load local, they are separate)
                try {
                    // Recover orphaned sessions (logs without session entries) on refresh or first load
                    if (forceRefresh || !this.listCache) {
                        try {
                            const { recovered } = await IndexedDBUtils.recoverOrphanedSessions();
                            if (recovered > 0) {
                                toast.info(`Recovered ${recovered} orphaned session(s)`);
                            }
                        } catch (e) {
                            logger.warn('Failed to recover orphaned sessions', e);
                        }
                    }

                    const localSessions = await IndexedDBUtils.loadAllSessions();

                    // Filter out local sessions that might be duplicates of cloud ones if needed?
                    // For now, assume IDs are unique enough or user manages them.

                    const filteredLocal = filters ? applySessionFilters(localSessions, filters) : localSessions;
                    summaries.push(...filteredLocal);
                    this.listHasMore = false;
                } catch (e) {
                    logger.warn('Failed to load local sessions', e);
                    toast.error('Failed to load local sessions');
                }
            }

            // Sort by timestamp desc
            summaries.sort((a, b) => new Date(b.timestamp || b.updatedAt || b.createdAt || Date.now()).getTime() - new Date(a.timestamp || a.updatedAt || a.createdAt || Date.now()).getTime());

            this.listCache = summaries;
            this.listCacheTimestamp = Date.now();
            this.listCacheEnvironment = environment;
            return summaries;
        } catch (e) {
            logger.error('Failed to load session list', e);
            return []; // Return empty list on error
        }
    }

    async loadMoreSessions(environment: Environment, filters?: SessionListFilters): Promise<SessionData[]> {
        if (environment !== Environment.Production) {
            return [];
        }
        if (!this.listHasMore) {
            return [];
        }
        const cursor = this.listCursor;
        const { sessions, nextCursor, hasMore } = await getSessionsFromFirebase(filters, cursor, this.PAGE_SIZE);
        this.listCursor = nextCursor || null;
        this.listHasMore = Boolean(hasMore);
        const merged = [...(this.listCache || []), ...sessions];
        this.listCache = merged;
        this.listCacheTimestamp = Date.now();
        return sessions;
    }

    hasMoreSessions(): boolean {
        return this.listHasMore;
    }

    /**
     * Invalidate list cache for a specific environment or all.
     */
    invalidateListCache(environment?: Environment) {
        if (!environment || this.listCacheEnvironment === environment) {
            this.listCache = null;
            this.listCacheTimestamp = 0;
            this.listCacheEnvironment = null;
        }
    }

    /**
     * Load detailed session configuration.
     * Uses cache if available.
     */
    async loadSessionDetails(sessionId: string): Promise<SessionData | null> {
        if (this.cache.has(sessionId)) {
            return this.cache.get(sessionId)!;
        }

        try {
            // Try cloud first if configured
            if (isFirebaseConfigured()) {
                try {
                    const result = await loadFromCloudFirebase(sessionId);
                    if (result && result.sessionData) {
                        this.cache.set(sessionId, result.sessionData);
                        return result.sessionData;
                    }
                } catch (e) {
                    // Ignore cloud fetch error, try local
                }
            }

            // Try local
            try {
                const localSession: any = await IndexedDBUtils.loadSession(sessionId);
                if (localSession && localSession.config) {
                    const sessionData = localSession.config as SessionData;
                    this.cache.set(sessionId, sessionData);
                    return sessionData;
                }
            } catch (e) {
                logger.warn(`Failed to load local session ${sessionId}`, e);
            }

            return null;
        } catch (e) {
            logger.error(`Failed to load session details for ${sessionId}`, e);
            return null;
        }
    }

    async getSessionSummary(sessionData: SessionData): Promise<SessionSummary> {
        // If not found in list, create a summary from session data
        return {
            id: sessionData.id,
            name: sessionData.name || 'Unnamed Session',
            timestamp: new Date(sessionData.timestamp || sessionData.updatedAt || sessionData.createdAt || Date.now()).toISOString(),
            source: sessionData.dataset?.type || DataSource.Manual,
            logCount: sessionData.itemCount || 0,
            isCloud: false,
            sessionUid: sessionData.id
        };
    }
    /**
     * Clear memory cache.
     */
    clearCache() {
        this.cache.clear();
        this.listCache = null;
        this.listCacheTimestamp = 0;
        this.listCacheEnvironment = null;
    }

    /**
     * Delete a session.
     */
    async deleteSession(sessionId: string, isCloud?: boolean): Promise<void> {
        // If isCloud is explicitly provided, verify accordingly, but safest is to try both or rely on ID
        if (isCloud && isFirebaseConfigured()) {
            await deleteSessionFromFirebase(sessionId);
        } else if (isCloud === false) {
            await IndexedDBUtils.deleteSession(sessionId);
        } else {
            // Fallback: try deleting from both if unknown
            if (isFirebaseConfigured()) {
                try { await deleteSessionFromFirebase(sessionId); } catch { }
            }
            try { await IndexedDBUtils.deleteSession(sessionId); } catch { }
        }

        // Remove from caches
        this.cache.delete(sessionId);
        if (this.listCache) {
            this.listCache = this.listCache.filter(s => s.id !== sessionId);
        }
    }
}

const getRowCount = (session: SessionData): number => {
    return session.logCount ?? session.itemCount ?? 0;
};

const applySessionFilters = (sessions: SessionData[], filters: SessionListFilters): SessionData[] => {
    const searchTerm = filters.search.trim().toLowerCase();
    const modelTerm = filters.model.trim().toLowerCase();
    return sessions.filter(session => {
        const rowCount = getRowCount(session);
        if (filters.onlyWithLogs && rowCount <= 0) return false;
        if (filters.minRows !== null && rowCount < filters.minRows) return false;
        if (filters.maxRows !== null && rowCount > filters.maxRows) return false;
        const resolvedAppMode = session.config?.appMode;
        const resolvedEngineMode = session.config?.engineMode;
        if (filters.appMode && resolvedAppMode !== filters.appMode) return false;
        if (filters.engineMode && resolvedEngineMode !== filters.engineMode) return false;
        if (searchTerm && !(session.name || '').toLowerCase().includes(searchTerm)) return false;
        if (modelTerm) {
            const model = (session.config?.externalModel || '').toLowerCase();
            if (!model.includes(modelTerm)) return false;
        }
        return true;
    });
};

export const sessionLoadService = new SessionLoadService();
