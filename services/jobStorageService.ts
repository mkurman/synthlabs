const DB_NAME = 'SynthLabsJobsDB';
const STORE_NAME = 'jobs';
const DB_VERSION = 2;

export interface BackendJobRecord {
    id: string;
    type: string;
    status: string;
    progress?: Record<string, unknown>;
    result?: Record<string, unknown> | null;
    error?: string | null;
    createdAt: number;
    updatedAt: number;
}

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
        } else {
            const tx = request.transaction;
            if (tx) {
                const store = tx.objectStore(STORE_NAME);
                if (!store.indexNames.contains('status')) {
                    store.createIndex('status', 'status', { unique: false });
                }
                if (!store.indexNames.contains('createdAt')) {
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            }
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

export const addJob = async (job: BackendJobRecord): Promise<void> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(job);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const updateJob = async (job: BackendJobRecord): Promise<void> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(job);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getJob = async (id: string): Promise<BackendJobRecord | null> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve((request.result as BackendJobRecord) || null);
        request.onerror = () => reject(request.error);
    });
};

export const removeJob = async (id: string): Promise<void> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const listJobs = async (): Promise<BackendJobRecord[]> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => {
            const jobs = (request.result as BackendJobRecord[])
                .sort((a, b) => b.createdAt - a.createdAt);
            resolve(jobs);
        };
        request.onerror = () => reject(request.error);
    });
};

export const clearOldJobs = async (olderThanMs: number): Promise<void> => {
    const cutoff = Date.now() - olderThanMs;
    const jobs = await listJobs();
    const db = await openDb();
    const toDelete = jobs.filter(j => j.createdAt < cutoff);
    if (toDelete.length === 0) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const job of toDelete) {
            store.delete(job.id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};
