import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Firestore, getDocs, query, orderBy, deleteDoc, doc, getCountFromServer, where, limit, writeBatch, updateDoc, increment, getDoc } from 'firebase/firestore';

// ... (existing imports)

export const fetchLogItem = async (logId: string): Promise<VerifierItem | null> => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        const docRef = doc(db, 'synth_logs', logId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return {
                ...docSnap.data(),
                id: docSnap.id,
                score: (docSnap.data() as any).score || 0
            } as VerifierItem;
        } else {
            return null;
        }
    } catch (e) {
        console.error("Error fetching log item", e);
        throw e;
    }
};
import { SynthLogItem, FirebaseConfig, VerifierItem } from '../types';
import { logger } from '../utils/logger';

let db: Firestore | null = null;
let app: FirebaseApp | null = null;
let currentConfigStr: string | null = null;

// Recursively remove undefined values from objects/arrays (Firestore doesn't support undefined)
const sanitizeForFirestore = (obj: any, seen = new WeakSet()): any => {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;

    // Detect circular references
    if (seen.has(obj)) {
        return null; // or '[Circular]' but null is safer for Firestore
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeForFirestore(item, seen));
    }
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value !== undefined) {
            cleaned[key] = sanitizeForFirestore(value, seen);
        }
    }
    return cleaned;
};

export interface SavedSession {
    id: string;
    name: string;
    createdAt: string;
    config: any;
    logCount?: number;      // Number of logs connected to this session
    sessionUid?: string;    // The session UID used in synth_logs (matches doc ID)
    isAutoRecovered?: boolean; // True if session was auto-created from orphaned logs
    source?: string;
}

const getEnvConfig = (): FirebaseConfig => {
    const env = (import.meta as any).env || {};
    return {
        apiKey: env.VITE_FIREBASE_API_KEY || '',
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
        projectId: env.VITE_FIREBASE_PROJECT_ID || '',
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: env.VITE_FIREBASE_APP_ID || ''
    };
};

// Track ongoing initialization to prevent race conditions
let initPromise: Promise<boolean> | null = null;
let initConfigStr: string | null = null; // Track which config is being initialized

// Internal implementation - does the actual Firebase init
const initializeFirebaseInternal = async (config: FirebaseConfig): Promise<boolean> => {
    try {
        if (!config.apiKey || !config.projectId) {
            logger.warn("Invalid Firebase Config Provided");
            return false;
        }

        const configStr = JSON.stringify(config);

        // Prevent redundant re-initialization (fixes AbortError)
        if (app && currentConfigStr === configStr) {
            if (!db) db = getFirestore(app);
            return true;
        }

        // Clean up existing app if re-initializing with NEW config
        if (app) {
            try {
                await deleteApp(app);
            } catch (e) {
                logger.warn("Failed to delete existing Firebase app", e);
            }
        } else {
            // Check for default apps created by potential hot-reload or other instances
            const existingApps = getApps();
            if (existingApps.length > 0) {
                await Promise.all(existingApps.map(a => deleteApp(a)));
            }
        }

        app = initializeApp(config);
        db = getFirestore(app);
        currentConfigStr = configStr;
        logger.log("Firebase Initialized Successfully via dynamic config");

        // Warmup: trigger Firestore connection establishment with a background read
        // This ensures the WebSocket connection is ready before actual operations
        warmupFirestoreConnection();

        return true;
    } catch (e) {
        console.error("Firebase Initialization Failed:", e);
        return false;
    }
};

// Non-blocking warmup to establish Firestore connection
const warmupFirestoreConnection = () => {
    if (!db) return;
    // Do a simple metadata read to force connection establishment
    // This runs in the background and doesn't block initialization
    getCountFromServer(collection(db, 'synth_logs'))
        .then(() => logger.log("Firestore connection warmed up"))
        .catch((e) => logger.warn("Firestore warmup failed (non-blocking):", e));
};

// Public wrapper - handles concurrency to prevent AbortError
export const initializeFirebase = async (config: FirebaseConfig): Promise<boolean> => {
    const configStr = JSON.stringify(config);

    // If already initialized with this exact config, return immediately
    if (db && currentConfigStr === configStr) {
        return true;
    }

    // If currently initializing with the SAME config, just wait for it
    if (initPromise && initConfigStr === configStr) {
        return initPromise;
    }

    // If initializing with DIFFERENT config, wait for current init to complete first
    if (initPromise) {
        try {
            await initPromise;
        } catch {
            // Ignore errors from previous init
        }
    }

    // Now start the new initialization
    initConfigStr = configStr;
    initPromise = initializeFirebaseInternal(config);

    return initPromise;
}

// Auto-init on load if env vars exist
const envConfig = getEnvConfig();
if (envConfig.apiKey) {
    initializeFirebase(envConfig);
}

export const isFirebaseConfigured = () => !!db;

// Wait for any pending initialization before saving (with timeout)
const ensureInitialized = async (): Promise<boolean> => {
    if (initPromise) {
        // Add timeout to prevent indefinite hanging
        const timeoutPromise = new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(false), 5000) // 5 second timeout
        );
        await Promise.race([initPromise, timeoutPromise]);
    }
    return !!db;
};

export const saveLogToFirebase = async (log: SynthLogItem, collectionName: string = 'synth_logs') => {
    // Wait for initialization to complete
    const isReady = await ensureInitialized();
    if (!isReady || !db) {
        throw new Error("Firebase is not configured. Set keys in GUI or .env.");
    }

    try {
        // Explicitly construct data to save
        const docData: any = {
            sessionUid: log.sessionUid || 'unknown',
            source: log.source,
            seed_preview: log.seed_preview,
            full_seed: log.full_seed,
            query: log.query,
            reasoning: log.reasoning,
            answer: log.answer,
            timestamp: log.timestamp,
            duration: log.duration || 0,
            tokenCount: log.tokenCount || 0,
            modelUsed: log.modelUsed,
            createdAt: log.timestamp
        };

        if (log.deepMetadata) {
            // Firestore doesn't support undefined values, so we must sanitize or convert to null
            const cleanMetadata: any = { ...log.deepMetadata };
            Object.keys(cleanMetadata).forEach(key => {
                if (cleanMetadata[key] === undefined) {
                    delete cleanMetadata[key]; // Remove undefined keys
                }
            });
            docData.deepMetadata = cleanMetadata;
        }

        if (log.deepTrace) {
            docData.deepTrace = log.deepTrace;
        }

        // Add multi-turn conversation messages
        if (log.messages && log.messages.length > 0) {
            docData.messages = log.messages;
            docData.isMultiTurn = true;
        }

        // Add session name if available (auto-naming feature)
        if (log.sessionName) {
            docData.sessionName = log.sessionName;
        }

        // Retry logic with exponential backoff (handles transient AbortErrors)
        const MAX_RETRIES = 3;
        let lastError: Error | null = null;

        // Sanitize entire docData to remove any nested undefined values
        const sanitizedDocData = sanitizeForFirestore(docData);

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                await addDoc(collection(db, collectionName), sanitizedDocData);

                // Successfully saved - now increment the session's log count
                if (log.sessionUid && log.sessionUid !== 'unknown') {
                    try {
                        // Find session by sessionUid (the session's doc ID)
                        const sessionRef = doc(db!, 'synth_sessions', log.sessionUid);
                        await updateDoc(sessionRef, {
                            logCount: increment(1)
                        });
                    } catch (countErr) {
                        // Log count increment failure shouldn't break the save
                        logger.warn("Failed to increment session log count", countErr);
                    }
                }

                return; // Success, exit
            } catch (retryErr: any) {
                lastError = retryErr;
                const isAbortError = retryErr?.name === 'AbortError' || retryErr?.message?.includes('abort');

                if (isAbortError && attempt < MAX_RETRIES - 1) {
                    // Exponential backoff: 500ms, 1000ms, 2000ms
                    const delay = 500 * Math.pow(2, attempt);
                    logger.warn(`Firebase write aborted (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    // Non-abort error or final attempt, throw immediately
                    throw retryErr;
                }
            }
        }

        // If we exhausted retries, throw the last error
        if (lastError) throw lastError;
    } catch (e) {
        console.error("Error saving to Firebase:", e);
        throw e;
    }
};

export const updateLogItem = async (logId: string, updates: Partial<SynthLogItem>) => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");

    try {
        const docRef = doc(db, 'synth_logs', logId);
        // Sanitize updates to remove undefined values
        const sanitizedUpdates = sanitizeForFirestore(updates);

        await updateDoc(docRef, sanitizedUpdates);
    } catch (e) {
        console.error("Error updating log item:", e);
        throw e;
    }
};

export const deleteLogItem = async (logId: string) => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");

    try {
        const docRef = doc(db, 'synth_logs', logId);
        await deleteDoc(docRef);
    } catch (e) {
        console.error("Error deleting log item:", e);
        throw e;
    }
};

export const getDbStats = async (currentSessionUid?: string): Promise<{ total: number, session: number }> => {
    await ensureInitialized();
    if (!db) return { total: 0, session: 0 };
    try {
        const coll = collection(db, 'synth_logs');

        // Parallel fetch for efficiency
        const totalPromise = getCountFromServer(coll);
        let sessionPromise = Promise.resolve({ data: () => ({ count: 0 }) });

        if (currentSessionUid) {
            const q = query(coll, where("sessionUid", "==", currentSessionUid));
            sessionPromise = getCountFromServer(q);
        }

        const [totalSnap, sessionSnap] = await Promise.all([totalPromise, sessionPromise]);

        return {
            total: totalSnap.data().count,
            session: sessionSnap.data().count
        };
    } catch (e) {
        console.error("Failed to fetch DB stats", e);
        return { total: 0, session: 0 };
    }
};

export const saveSessionToFirebase = async (sessionData: any, name: string) => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        await addDoc(collection(db, 'synth_sessions'), {
            name,
            config: sessionData,
            createdAt: new Date().toISOString()
        });
    } catch (e) {
        console.error("Error saving session", e);
        throw e;
    }
};

// Create a new session in Firebase and return its ID for use as sessionUid
// This ensures synth_sessions and synth_logs are always in sync
export const createSessionInFirebase = async (name?: string, source?: string, config?: any): Promise<string> => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        const createdAt = new Date().toISOString();
        const docData: any = {
            name: name || `Auto Session ${new Date().toLocaleString()}`,
            source: source,
            createdAt: createdAt,
            isAutoCreated: true,
            logCount: 0  // Initialize log count
        };

        // Save config if provided (ensures sessions can be restored)
        if (config) {
            docData.config = sanitizeForFirestore(config);
        }

        // Add timeout to prevent indefinite hanging on Firestore connection issues
        const timeoutMs = 10000; // 10 seconds
        const addDocPromise = addDoc(collection(db, 'synth_sessions'), docData);
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Firebase session creation timed out')), timeoutMs)
        );

        const docRef = await Promise.race([addDocPromise, timeoutPromise]);

        // Update the document to include its own ID as sessionUid for easier querying
        try {
            await updateDoc(doc(db!, 'synth_sessions', docRef.id), {
                sessionUid: docRef.id
            });
        } catch (updateErr) {
            logger.warn("Failed to set sessionUid on session document", updateErr);
        }

        return docRef.id;
    } catch (e) {
        console.error("Error creating session", e);
        throw e;
    }
};

export const getSessionsFromFirebase = async (): Promise<SavedSession[]> => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        const q = query(collection(db, 'synth_sessions'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        // Only extract minimal fields - avoid spreading large config objects
        return snapshot.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                name: data.name || 'Unknown Session',
                createdAt: data.createdAt || '',
                logCount: data.logCount,
                sessionUid: data.sessionUid || d.id,
                isAutoRecovered: data.isAutoRecovered,
                source: data.source,
                config: undefined  // Don't load full config - too large
            } as SavedSession;
        });
    } catch (e) {
        console.error("Error fetching sessions", e);
        throw e;
    }
};

export const deleteSessionFromFirebase = async (id: string) => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        await deleteDoc(doc(db, 'synth_sessions', id));
    } catch (e) {
        console.error("Error deleting session", e);
        throw e;
    }
};

// --- Verifier Functions ---

export const fetchAllLogs = async (limitCount?: number, sessionUid?: string): Promise<VerifierItem[]> => {
    return fetchLogsAfter({ limitCount, sessionUid });
};

export const fetchLogsAfter = async (options: {
    limitCount?: number;
    sessionUid?: string;
    lastDoc?: any; // QueryDocumentSnapshot
}): Promise<VerifierItem[]> => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        const { limitCount, sessionUid, lastDoc } = options;
        const constraints: any[] = [];

        // Filter by Session
        if (sessionUid) {
            constraints.push(where('sessionUid', '==', sessionUid));
        }

        // Ordering
        constraints.push(orderBy('createdAt', 'desc'));

        // Pagination
        if (lastDoc) {
            // Lazy load startAfter (it's a function we need to import or use from existing imports if available)
            // But we can just pass the doc snapshot directly to startAfter() query constraint
            const { startAfter: startAfterFn } = await import('firebase/firestore');
            constraints.push(startAfterFn(lastDoc));
        }

        // Limit
        if (limitCount && limitCount > 0) {
            constraints.push(limit(limitCount));
        }

        const q = query(collection(db, 'synth_logs'), ...constraints);

        const snapshot = await getDocs(q);

        return snapshot.docs.map(d => ({
            ...d.data(),
            id: d.id, // Use firestore ID
            score: 0, // Initialize score
            _doc: d // Store internal doc reference for next cursor
        } as VerifierItem));
    } catch (e: any) {
        console.error("Error fetching logs", e);
        // Fallback for missing index if no pagination needed yet or first page
        if (e.code === 'failed-precondition' && options.sessionUid && !options.lastDoc) {
            logger.warn("Falling back to client-side sort due to missing Firestore index.");
            const constraintsRetry: any[] = [where('sessionUid', '==', options.sessionUid)];
            if (options.limitCount && options.limitCount > 0) constraintsRetry.push(limit(options.limitCount));

            const qRetry = query(collection(db, 'synth_logs'), ...constraintsRetry);
            const snapRetry = await getDocs(qRetry);
            const items = snapRetry.docs.map(d => ({ ...d.data(), id: d.id, score: 0 } as VerifierItem));
            // Sort desc
            return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }
        throw e;
    }
};

export const saveFinalDataset = async (items: VerifierItem[], collectionName = 'synth_verified') => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        const batch = writeBatch(db);
        const coll = collection(db, collectionName);

        let count = 0;
        for (const item of items) {
            const docRef = doc(coll); // Auto ID
            const { id, isDuplicate, duplicateGroupId, isDiscarded, ...dataToSave } = item; // Strip internal flags, keep data
            batch.set(docRef, {
                ...dataToSave,
                verifiedAt: new Date().toISOString(),
                finalScore: item.score
            });
            count++;
        }

        await batch.commit();
        return count;
    } catch (e) {
        console.error("Error saving final dataset", e);
        throw e;
    }
};


// Orphaned logs information interface
export interface OrphanedLogsInfo {
    hasOrphanedLogs: boolean;
    orphanedSessionCount: number;
    totalOrphanedLogs: number;
    orphanedUids: string[];
    isPartialScan?: boolean;  // True if we stopped early after finding orphans
    scannedCount?: number;    // How many logs we scanned
}

// Check if there are orphaned logs (logs with sessionUids not in synth_sessions)
// Uses chunked scanning to avoid OOM - stops early when orphans are found
const ORPHAN_SCAN_CHUNK_SIZE = 100;

export const getOrphanedLogsInfo = async (): Promise<OrphanedLogsInfo> => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");

    try {
        // 1. Get all session IDs from synth_sessions (lightweight - just IDs)
        const sessionsSnapshot = await getDocs(collection(db, 'synth_sessions'));
        const existingSessionUids = new Set<string>();

        sessionsSnapshot.docs.forEach(d => {
            existingSessionUids.add(d.id);
            const data = d.data();
            if (data.sessionUid) {
                existingSessionUids.add(data.sessionUid);
            }
        });

        logger.log(`Found ${existingSessionUids.size} existing sessions for orphan check`);

        // 2. Scan logs in chunks, stop early if orphans found
        const orphanedUids = new Set<string>();
        const logCounts = new Map<string, number>();  // Track count per orphaned UID
        let scannedCount = 0;
        let lastDoc: any = null;
        let hasMore = true;

        while (hasMore) {
            // Build query with pagination
            let q;
            if (lastDoc) {
                const { startAfter: startAfterFn } = await import('firebase/firestore');
                q = query(
                    collection(db!, 'synth_logs'),
                    orderBy('createdAt', 'desc'),
                    startAfterFn(lastDoc),
                    limit(ORPHAN_SCAN_CHUNK_SIZE)
                );
            } else {
                q = query(
                    collection(db!, 'synth_logs'),
                    orderBy('createdAt', 'desc'),
                    limit(ORPHAN_SCAN_CHUNK_SIZE)
                );
            }

            const snapshot = await getDocs(q);
            scannedCount += snapshot.docs.length;

            // Process this chunk
            snapshot.docs.forEach(d => {
                const data = d.data();
                const uid = data.sessionUid || 'unknown';

                if (uid !== 'unknown' && !existingSessionUids.has(uid)) {
                    orphanedUids.add(uid);
                    logCounts.set(uid, (logCounts.get(uid) || 0) + 1);
                }
            });

            // Check if we should continue
            if (snapshot.docs.length < ORPHAN_SCAN_CHUNK_SIZE) {
                hasMore = false;
            } else if (orphanedUids.size > 0) {
                // Found orphans - stop early to save memory
                logger.log(`Found orphans after scanning ${scannedCount} logs, stopping early`);
                hasMore = false;
            } else {
                lastDoc = snapshot.docs[snapshot.docs.length - 1];
            }
        }

        // Calculate totals
        let totalOrphanedLogs = 0;
        logCounts.forEach(count => {
            totalOrphanedLogs += count;
        });

        return {
            hasOrphanedLogs: orphanedUids.size > 0,
            orphanedSessionCount: orphanedUids.size,
            totalOrphanedLogs,
            orphanedUids: Array.from(orphanedUids),
            isPartialScan: orphanedUids.size > 0,  // We stopped early
            scannedCount
        };
    } catch (e) {
        console.error("Error checking for orphaned logs", e);
        return {
            hasOrphanedLogs: false,
            orphanedSessionCount: 0,
            totalOrphanedLogs: 0,
            orphanedUids: []
        };
    }
};

// Sync result interface
export interface SyncResult {
    sessionsCreated: number;
    logsAssigned: number;
    orphanedUids: string[];
}

// Chunk size for sync operation
const SYNC_CHUNK_SIZE = 100;
const BATCH_WRITE_LIMIT = 450;  // Firestore limit is 500, leave some margin

// Find orphaned synth_logs (logs with sessionUids not in synth_sessions) and create sessions for them
// Uses chunked scanning to avoid OOM
export const syncOrphanedLogsToSessions = async (): Promise<SyncResult> => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");

    const result: SyncResult = {
        sessionsCreated: 0,
        logsAssigned: 0,
        orphanedUids: []
    };

    try {
        // 1. Fetch all session UIDs from synth_sessions
        const sessionsSnapshot = await getDocs(collection(db, 'synth_sessions'));
        const existingSessionUids = new Set<string>();

        sessionsSnapshot.docs.forEach(d => {
            existingSessionUids.add(d.id);
            const data = d.data();
            if (data.sessionUid) {
                existingSessionUids.add(data.sessionUid);
            }
        });

        logger.log(`Found ${existingSessionUids.size} existing sessions`);

        // 2. Scan logs in chunks and collect orphaned session info
        const logGroups = new Map<string, {
            count: number;
            earliestTimestamp: string;
            source?: string;
            sessionName?: string;
        }>();

        let lastDoc: any = null;
        let hasMore = true;
        let scannedCount = 0;

        while (hasMore) {
            // Build query with pagination
            let q;
            if (lastDoc) {
                const { startAfter: startAfterFn } = await import('firebase/firestore');
                q = query(
                    collection(db!, 'synth_logs'),
                    orderBy('createdAt', 'asc'),  // Ascending to find earliest timestamp
                    startAfterFn(lastDoc),
                    limit(SYNC_CHUNK_SIZE)
                );
            } else {
                q = query(
                    collection(db!, 'synth_logs'),
                    orderBy('createdAt', 'asc'),
                    limit(SYNC_CHUNK_SIZE)
                );
            }

            const snapshot = await getDocs(q);
            scannedCount += snapshot.docs.length;

            // Process this chunk - only track orphaned UIDs
            snapshot.docs.forEach(d => {
                const data = d.data();
                const uid = data.sessionUid || 'unknown';
                const timestamp = data.createdAt || data.timestamp || new Date().toISOString();

                // Only track if it's a potential orphan
                if (uid !== 'unknown' && !existingSessionUids.has(uid)) {
                    if (logGroups.has(uid)) {
                        const group = logGroups.get(uid)!;
                        group.count++;
                        if (timestamp < group.earliestTimestamp) {
                            group.earliestTimestamp = timestamp;
                        }
                    } else {
                        logGroups.set(uid, {
                            count: 1,
                            earliestTimestamp: timestamp,
                            source: data.source,
                            sessionName: data.sessionName
                        });
                    }
                }
            });

            // Check if we should continue
            if (snapshot.docs.length < SYNC_CHUNK_SIZE) {
                hasMore = false;
            } else {
                lastDoc = snapshot.docs[snapshot.docs.length - 1];
            }

            logger.log(`Scanned ${scannedCount} logs, found ${logGroups.size} orphaned sessions so far`);
        }

        // 3. Get list of orphaned UIDs
        const orphanedUids = Array.from(logGroups.keys());
        result.orphanedUids = orphanedUids;
        logger.log(`Found ${orphanedUids.length} orphaned session UIDs total`);

        if (orphanedUids.length === 0) {
            return result;
        }

        // 4. Create sessions in batches (Firestore has 500 operation limit per batch)
        let currentBatch = writeBatch(db);
        let batchCount = 0;

        for (const uid of orphanedUids) {
            const group = logGroups.get(uid)!;
            const sessionRef = doc(db, 'synth_sessions', uid);

            const sessionData = {
                name: group.sessionName || `Recovered Session ${new Date(group.earliestTimestamp).toLocaleDateString()}`,
                source: group.source || 'unknown',
                createdAt: group.earliestTimestamp,
                sessionUid: uid,
                logCount: group.count,
                isAutoRecovered: true,
                isAutoCreated: true
            };

            currentBatch.set(sessionRef, sessionData);
            result.sessionsCreated++;
            result.logsAssigned += group.count;
            batchCount++;

            // Commit batch if we hit the limit
            if (batchCount >= BATCH_WRITE_LIMIT) {
                await currentBatch.commit();
                logger.log(`Committed batch of ${batchCount} sessions`);
                currentBatch = writeBatch(db);
                batchCount = 0;
            }
        }

        // Commit remaining batch
        if (batchCount > 0) {
            await currentBatch.commit();
            logger.log(`Committed final batch of ${batchCount} sessions`);
        }

        logger.log(`Created ${result.sessionsCreated} sessions for ${result.logsAssigned} orphaned logs`);

        return result;
    } catch (e) {
        console.error("Error syncing orphaned logs to sessions", e);
        throw e;
    }
};
