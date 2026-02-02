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
    private CACHE_DURATION = 60 * 1000; // 1 minute cache for lists

    /**
     * Load the list of available sessions.
     * Merges cloud sessions and local sessions.
     */
    async loadSessionList(forceRefresh = false, environment: Environment): Promise<SessionData[]> {
        if (!forceRefresh && this.listCache && (Date.now() - this.listCacheTimestamp < this.CACHE_DURATION)) {
            return this.listCache;
        }

        try {
            const summaries: SessionData[] = [];

            // 1. Load Cloud Sessions (only if configured and explicitly not disabled, or if we want to mix)
            // CURRENT LOGIC: Mix both if available.
            if (environment === Environment.Production) {
                try {
                    if (!isFirebaseConfigured()) {
                        throw new Error('Firebase is not configured');
                    }
                    const cloudSessions = await getSessionsFromFirebase();
                    summaries.push(...cloudSessions);
                } catch (e) {
                    logger.warn('Failed to load cloud sessions', e);
                    toast.error('Failed to load cloud sessions');
                }
            }

            else if (environment === Environment.Development) {
                // 2. Load Local Sessions (Always load local, they are separate)
                try {
                    const localSessions = await IndexedDBUtils.loadAllSessions();

                    // Filter out local sessions that might be duplicates of cloud ones if needed?
                    // For now, assume IDs are unique enough or user manages them.

                    summaries.push(...localSessions);
                } catch (e) {
                    logger.warn('Failed to load local sessions', e);
                    toast.error('Failed to load local sessions');
                }
            }

            // Sort by timestamp desc
            summaries.sort((a, b) => new Date(b.timestamp || b.updatedAt || b.createdAt || Date.now()).getTime() - new Date(a.timestamp || a.updatedAt || a.createdAt || Date.now()).getTime());

            this.listCache = summaries;
            this.listCacheTimestamp = Date.now();
            return summaries;
        } catch (e) {
            logger.error('Failed to load session list', e);
            return []; // Return empty list on error
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

export const sessionLoadService = new SessionLoadService();
