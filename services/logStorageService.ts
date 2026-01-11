import { SynthLogItem } from '../types';

const DB_NAME = 'SynthLabsDB';
const DB_VERSION = 1;
const LOGS_STORE = 'logs';
const INDEX_STORE = 'indices';

interface LogIndex {
    sessionUid: string;
    totalCount: number;
}

// IndexedDB wrapper with lazy initialization
let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
    if (dbInstance) return Promise.resolve(dbInstance);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDB open failed:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Create logs store with compound index for session+id
            if (!db.objectStoreNames.contains(LOGS_STORE)) {
                const logsStore = db.createObjectStore(LOGS_STORE, { keyPath: ['sessionUid', 'id'] });
                logsStore.createIndex('sessionUid', 'sessionUid', { unique: false });
                logsStore.createIndex('sessionTimestamp', ['sessionUid', 'timestamp'], { unique: false });
            }

            // Create index store for session metadata
            if (!db.objectStoreNames.contains(INDEX_STORE)) {
                db.createObjectStore(INDEX_STORE, { keyPath: 'sessionUid' });
            }
        };
    });

    return dbPromise;
};

// Helper to wrap IDB requests in promises
const wrapRequest = <T>(request: IDBRequest<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const LogStorageService = {
    // Save a single log (append to end)
    saveLog: async (sessionUid: string, log: SynthLogItem): Promise<boolean> => {
        try {
            const db = await getDB();
            const tx = db.transaction([LOGS_STORE, INDEX_STORE], 'readwrite');

            // Store the log with session reference
            const logsStore = tx.objectStore(LOGS_STORE);
            const logWithSession = { ...log, sessionUid, timestamp: Date.now() };
            await wrapRequest(logsStore.put(logWithSession));

            // Update session index
            const indexStore = tx.objectStore(INDEX_STORE);
            const existingIndex = await wrapRequest(indexStore.get(sessionUid)) as LogIndex | undefined;
            const newIndex: LogIndex = {
                sessionUid,
                totalCount: (existingIndex?.totalCount || 0) + 1
            };
            await wrapRequest(indexStore.put(newIndex));

            return true;
        } catch (e) {
            console.error('IndexedDB persistence failed:', e);
            return false;
        }
    },

    // Get a page of logs (reverse order - newest first)
    getLogs: async (sessionUid: string, page: number, pageSize: number): Promise<SynthLogItem[]> => {
        try {
            const db = await getDB();
            const tx = db.transaction(LOGS_STORE, 'readonly');
            const store = tx.objectStore(LOGS_STORE);
            const index = store.index('sessionUid');

            // Get all logs for this session
            const logs = await wrapRequest(index.getAll(sessionUid)) as (SynthLogItem & { sessionUid: string; timestamp: number })[];

            // Sort by timestamp descending (newest first)
            logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            // Paginate
            const start = (page - 1) * pageSize;
            const end = start + pageSize;

            return logs.slice(start, end).map(({ sessionUid: _s, timestamp: _t, ...log }) => log as SynthLogItem);
        } catch (e) {
            console.error('IndexedDB read failed:', e);
            return [];
        }
    },

    // Synchronous version for backwards compatibility (deprecated - throws error)
    getLogsSync: (sessionUid: string, page: number, pageSize: number): SynthLogItem[] => {
        // This method is deprecated and no longer returns data.
        // Callers must use the async getLogs API instead.
        throw new Error('getLogsSync is deprecated. Use the async getLogs(sessionUid, page, pageSize) method for log retrieval.');
    },

    // Update a specific log item (e.g. after retry)
    updateLog: async (sessionUid: string, updatedLog: SynthLogItem): Promise<boolean> => {
        try {
            const db = await getDB();
            const tx = db.transaction(LOGS_STORE, 'readwrite');
            const store = tx.objectStore(LOGS_STORE);

            // Get existing log to preserve timestamp
            const existing = await wrapRequest(store.get([sessionUid, updatedLog.id])) as (SynthLogItem & { timestamp: number }) | undefined;

            const logWithSession = {
                ...updatedLog,
                sessionUid,
                timestamp: existing?.timestamp || Date.now()
            };
            await wrapRequest(store.put(logWithSession));

            return true;
        } catch (e) {
            console.error('IndexedDB update failed:', e);
            return false;
        }
    },

    getTotalCount: async (sessionUid: string): Promise<number> => {
        try {
            const db = await getDB();
            const tx = db.transaction(INDEX_STORE, 'readonly');
            const store = tx.objectStore(INDEX_STORE);
            const index = await wrapRequest(store.get(sessionUid)) as LogIndex | undefined;
            return index?.totalCount || 0;
        } catch (e) {
            console.error('IndexedDB count failed:', e);
            return 0;
        }
    },

    // Synchronous version for backwards compatibility
    getTotalCountSync: (sessionUid: string): number => {
        console.warn('getTotalCountSync called - use getTotalCount async version for accurate data');
        return 0;
    },

    clearSession: async (sessionUid: string): Promise<void> => {
        try {
            const db = await getDB();
            const tx = db.transaction([LOGS_STORE, INDEX_STORE], 'readwrite');

            // Delete all logs for this session
            const logsStore = tx.objectStore(LOGS_STORE);
            const index = logsStore.index('sessionUid');
            const logs = await wrapRequest(index.getAllKeys(sessionUid));

            // Delete all logs in parallel for better performance
            const deletePromises = logs.map((key) =>
                wrapRequest(logsStore.delete(key))
            );
            await Promise.all(deletePromises);

            // Delete session index
            const indexStore = tx.objectStore(INDEX_STORE);
            await wrapRequest(indexStore.delete(sessionUid));
        } catch (e) {
            console.error('IndexedDB clear failed:', e);
        }
    },

    // Get all logs for export
    getAllLogs: async (sessionUid: string): Promise<SynthLogItem[]> => {
        try {
            const db = await getDB();
            const tx = db.transaction(LOGS_STORE, 'readonly');
            const store = tx.objectStore(LOGS_STORE);
            const index = store.index('sessionUid');

            const logs = await wrapRequest(index.getAll(sessionUid)) as (SynthLogItem & { sessionUid: string; timestamp: number })[];

            // Sort by timestamp ascending (oldest first for export)
            logs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

            // Remove internal fields
            return logs.map(({ sessionUid: _s, timestamp: _t, ...log }) => log as SynthLogItem);
        } catch (e) {
            console.error('IndexedDB getAllLogs failed:', e);
            return [];
        }
    },

    // Get all session UIDs
    getAllSessionUids: async (): Promise<string[]> => {
        try {
            const db = await getDB();
            const tx = db.transaction(INDEX_STORE, 'readonly');
            const store = tx.objectStore(INDEX_STORE);
            const indices = await wrapRequest(store.getAll()) as LogIndex[];
            return indices.map(i => i.sessionUid);
        } catch (e) {
            console.error('IndexedDB getAllSessionUids failed:', e);
            return [];
        }
    },

    // Migrate data from LocalStorage to IndexedDB (one-time migration)
    migrateFromLocalStorage: async (): Promise<void> => {
        const LOG_STORAGE_PREFIX = 'synth_logs_';
        // CHUNK_SIZE must match the historical value from the LocalStorage implementation
        const CHUNK_SIZE = 50;

        // Find all LocalStorage sessions
        const localStorageSessions = Object.keys(localStorage)
            .filter(k => k.startsWith(LOG_STORAGE_PREFIX) && k.endsWith('_index'))
            .map(k => k.replace(LOG_STORAGE_PREFIX, '').replace('_index', ''));

        if (localStorageSessions.length === 0) {
            console.log('[Migration] No LocalStorage sessions to migrate');
            return;
        }

        console.log(`[Migration] Found ${localStorageSessions.length} sessions to migrate`);

        for (const sessionUid of localStorageSessions) {
            try {
                // Check if already migrated
                const existingCount = await LogStorageService.getTotalCount(sessionUid);
                if (existingCount > 0) {
                    console.log(`[Migration] Session ${sessionUid} already exists in IndexedDB, skipping`);
                    continue;
                }

                // Read from LocalStorage
                const indexKey = `${LOG_STORAGE_PREFIX}${sessionUid}_index`;
                const indexStr = localStorage.getItem(indexKey);
                if (!indexStr) continue;

                const indexData = JSON.parse(indexStr);
                let lastChunkId = indexData.lastChunkId ?? Math.floor((indexData.totalCount - 1) / CHUNK_SIZE);

                let allLogs: SynthLogItem[] = [];
                for (let i = 0; i <= lastChunkId; i++) {
                    const chunkKey = `${LOG_STORAGE_PREFIX}${sessionUid}_chunk_${i}`;
                    const chunkStr = localStorage.getItem(chunkKey);
                    if (chunkStr) {
                        const chunk = JSON.parse(chunkStr);
                        if (Array.isArray(chunk)) {
                            allLogs = allLogs.concat(chunk);
                        }
                    }
                }

                // Save to IndexedDB in parallel for better performance
                await Promise.all(
                    allLogs.map((log) => LogStorageService.saveLog(sessionUid, log))
                );

                // Clear from LocalStorage only after successful migration
                for (let i = 0; i <= lastChunkId; i++) {
                    localStorage.removeItem(`${LOG_STORAGE_PREFIX}${sessionUid}_chunk_${i}`);
                }
                localStorage.removeItem(indexKey);

                console.log(`[Migration] Migrated ${allLogs.length} logs for session ${sessionUid}`);
            } catch (e) {
                console.error(`[Migration] Failed to migrate session ${sessionUid}:`, e);
                // Migration failed for this session, but we don't delete LocalStorage data
                // to avoid data loss. The migration will be retried on next load.
            }
        }

        console.log('[Migration] Migration complete');
    }
};

// Track migration status for UI feedback
let migrationStatus: { completed: boolean; failed: boolean; error?: Error } = {
    completed: false,
    failed: false
};

// Auto-migrate on module load and track status
LogStorageService.migrateFromLocalStorage()
    .then(() => {
        migrationStatus.completed = true;
        console.log('[Migration] Auto-migration completed successfully');
    })
    .catch((e) => {
        migrationStatus.failed = true;
        migrationStatus.error = e;
        console.error('[Migration] Auto-migration failed:', e);
    });

// Export migration status check
export const getMigrationStatus = () => migrationStatus;
