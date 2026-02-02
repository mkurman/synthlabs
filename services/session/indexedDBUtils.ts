import { SessionData, SessionAnalytics } from '../../types';
import { AppView } from '../../interfaces/enums';
import { SessionStatus } from '../../interfaces/enums/SessionStatus';
import { StorageMode } from '../../interfaces/enums/StorageMode';

const DB_NAME = 'SynthLabsDB';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';
const ITEMS_STORE = 'items';

export interface IndexedDBSession extends SessionData {
    // Indexed fields for queries
}

export interface IndexedDBItem {
    id: string;
    sessionId: string;
    data: any; // Mode-specific item data (SynthLogItem or VerifierItem)
    createdAt: number;
    updatedAt: number;
}

/**
 * Open IndexedDB connection
 */
export async function openSessionDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Create sessions store
            if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
                const sessionsStore = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
                sessionsStore.createIndex('mode', 'mode', { unique: false });
                sessionsStore.createIndex('status', 'status', { unique: false });
                sessionsStore.createIndex('createdAt', 'createdAt', { unique: false });
                sessionsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }

            // Create items store
            if (!db.objectStoreNames.contains(ITEMS_STORE)) {
                const itemsStore = db.createObjectStore(ITEMS_STORE, { keyPath: 'id' });
                itemsStore.createIndex('sessionId', 'sessionId', { unique: false });
                itemsStore.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };
    });
}

/**
 * Save session to IndexedDB
 */
export async function saveSession(session: SessionData): Promise<void> {
    const db = await openSessionDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SESSIONS_STORE], 'readwrite');
        const store = transaction.objectStore(SESSIONS_STORE);

        const request = store.put(session);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);

        transaction.oncomplete = () => db.close();
    });
}

/**
 * Load session from IndexedDB
 */
export async function loadSession(sessionId: string): Promise<SessionData | null> {
    const db = await openSessionDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SESSIONS_STORE], 'readonly');
        const store = transaction.objectStore(SESSIONS_STORE);

        const request = store.get(sessionId);

        request.onsuccess = () => {
            resolve(request.result || null);
        };
        request.onerror = () => reject(request.error);

        transaction.oncomplete = () => db.close();
    });
}

/**
 * Load all sessions from IndexedDB
 */
export async function loadAllSessions(): Promise<SessionData[]> {
    const db = await openSessionDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SESSIONS_STORE], 'readonly');
        const store = transaction.objectStore(SESSIONS_STORE);

        const request = store.getAll();

        request.onsuccess = () => {
            resolve(request.result || []);
        };
        request.onerror = () => reject(request.error);

        transaction.oncomplete = () => db.close();
    });
}

/**
 * Delete session from IndexedDB
 */
export async function deleteSession(sessionId: string): Promise<void> {
    const db = await openSessionDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SESSIONS_STORE, ITEMS_STORE], 'readwrite');

        // Delete session
        const sessionsStore = transaction.objectStore(SESSIONS_STORE);
        sessionsStore.delete(sessionId);

        // Delete all items for this session
        const itemsStore = transaction.objectStore(ITEMS_STORE);
        const index = itemsStore.index('sessionId');
        const range = IDBKeyRange.only(sessionId);
        const itemsRequest = index.openCursor(range);

        itemsRequest.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        transaction.oncomplete = () => {
            db.close();
            resolve();
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Save items to IndexedDB (paginated)
 */
export async function saveItems(sessionId: string, items: any[]): Promise<void> {
    const db = await openSessionDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ITEMS_STORE], 'readwrite');
        const store = transaction.objectStore(ITEMS_STORE);

        const now = Date.now();

        for (const item of items) {
            const dbItem: IndexedDBItem = {
                id: item.id || `${sessionId}_${now}_${Math.random()}`,
                sessionId,
                data: item,
                createdAt: now,
                updatedAt: now
            };
            store.put(dbItem);
        }

        transaction.oncomplete = () => {
            db.close();
            resolve();
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Load items from IndexedDB (paginated)
 */
export async function loadItems(
    sessionId: string,
    page: number = 0,
    pageSize: number = 50
): Promise<{ items: any[], totalCount: number }> {
    const db = await openSessionDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ITEMS_STORE], 'readonly');
        const store = transaction.objectStore(ITEMS_STORE);
        const index = store.index('sessionId');
        const range = IDBKeyRange.only(sessionId);

        let allItems: IndexedDBItem[] = [];
        const request = index.openCursor(range);

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                allItems.push(cursor.value);
                cursor.continue();
            } else {
                // Pagination
                const startIdx = page * pageSize;
                const endIdx = startIdx + pageSize;
                const paginatedItems = allItems.slice(startIdx, endIdx).map(item => item.data);

                resolve({
                    items: paginatedItems,
                    totalCount: allItems.length
                });
            }
        };

        request.onerror = () => reject(request.error);

        transaction.oncomplete = () => db.close();
    });
}

/**
 * Update session analytics
 */
export async function updateSessionAnalytics(
    sessionId: string,
    analytics: SessionAnalytics
): Promise<void> {
    const session = await loadSession(sessionId);
    if (!session) {
        throw new Error(`Session ${sessionId} not found`);
    }

    session.analytics = analytics;
    session.updatedAt = Date.now();

    await saveSession(session);
}

/**
 * Create a new session
 */
export function createNewSession(
    name: string,
    mode: AppView,
    storageMode: StorageMode,
    dataset?: string
): SessionData {
    const now = Date.now();

    return {
        id: `session_${now}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        mode,
        status: SessionStatus.Active,
        storageMode,
        createdAt: now,
        updatedAt: now,
        itemCount: 0,
        dataset,
        analytics: {
            totalItems: 0,
            completedItems: 0,
            errorCount: 0,
            totalTokens: 0,
            totalCost: 0,
            avgResponseTime: 0,
            successRate: 0,
            lastUpdated: now
        }
    };
}
