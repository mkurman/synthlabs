import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Firestore, getDocs, query, orderBy, deleteDoc, doc, getCountFromServer, where, limit, writeBatch, updateDoc, increment, getDoc, setDoc, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

import { SynthLogItem, FirebaseConfig, VerifierItem, SessionListFilters } from '../types';
import { CloudSessionResult, SessionData } from '../interfaces/services/SessionConfig';
import { SessionVerificationStatus } from '../interfaces/enums/SessionVerificationStatus';
import * as backendClient from './backendClient';
import * as jobStorageService from './jobStorageService';
import { logger } from '../utils/logger';

export const fetchLogItem = async (logId: string): Promise<VerifierItem | null> => {
    if (backendClient.isBackendEnabled()) {
        const log = await backendClient.fetchLog(logId);
        if (!log) return null;
        const logData = log as SynthLogItem & { id: string };
        return {
            ...logData,
            id: logData.id,
            score: logData.score || 0,
            hasUnsavedChanges: false
        };
    }
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        const docRef = doc(db, 'synth_logs', logId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return {
                ...docSnap.data(),
                id: docSnap.id,
                score: (docSnap.data() as any).score || 0,
                hasUnsavedChanges: false
            } as VerifierItem;
        } else {
            return null;
        }
    } catch (e) {
        console.error("Error fetching log item", e);
        throw e;
    }
};

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

export const isFirebaseConfigured = () => backendClient.isBackendEnabled() || !!db;

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
    if (backendClient.isBackendEnabled()) {
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
        await backendClient.createLog(sanitizeForFirestore(docData) as unknown as Record<string, unknown>);
        return;
    }
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
            reasoning_content: log.reasoning_content,
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
    if (backendClient.isBackendEnabled()) {
        await backendClient.updateLog(logId, updates as Record<string, unknown>);
        return;
    }
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

export const isDbEnabled = () => backendClient.isBackendEnabled() || isFirebaseConfigured();

export const deleteLogItem = async (logId: string) => {
    if (backendClient.isBackendEnabled()) {
        await backendClient.deleteLog(logId);
        return;
    }
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
    // Use backend API if enabled
    if (backendClient.isBackendEnabled()) {
        try {
            return await backendClient.fetchDbStats(currentSessionUid);
        } catch (e) {
            console.error("Failed to fetch DB stats from backend", e);
            return { total: 0, session: 0 };
        }
    }

    // Fall back to direct Firebase
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

export const saveSessionToFirebase = async (sessionData: SessionData, name: string) => {
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        // Use the session's id as the document ID for consistent upsert behavior
        const sessionId = sessionData.id || sessionData.sessionUid;
        if (!sessionId) {
            throw new Error("Session must have an id or sessionUid");
        }

        // Sanitize the full SessionData for Firestore (removes undefined values)
        const sanitizedData = sanitizeForFirestore({
            ...sessionData,
            name: name || sessionData.name,
            updatedAt: Date.now(),
            // Ensure sessionUid matches the document ID
            sessionUid: sessionId
        });

        // Use setDoc with merge to update existing or create new
        const docRef = doc(db, 'synth_sessions', sessionId);
        await setDoc(docRef, sanitizedData, { merge: true });
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

export const getSessionsFromFirebase = async (
    filters?: SessionListFilters,
    cursor?: string | null,
    limit?: number,
    forceRefresh?: boolean
): Promise<{ sessions: SessionData[]; nextCursor?: string | null; hasMore?: boolean }> => {
    if (backendClient.isBackendEnabled()) {
        const result = await backendClient.fetchSessions(filters, cursor, limit, forceRefresh);
        return {
            sessions: result.sessions as SessionData[],
            nextCursor: result.nextCursor,
            hasMore: result.hasMore
        };
    }
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        const q = query(collection(db, 'synth_sessions'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const sessions = snapshot.docs.map(d => {
            const data = d.data();
            return { ...data, id: d.id } as SessionData;
        });
        return { sessions };
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

export const updateSessionVerificationStatus = async (sessionId: string, status: SessionVerificationStatus) => {
    if (backendClient.isBackendEnabled()) {
        await backendClient.updateSessionVerificationStatus(sessionId, status);
        return;
    }
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        await updateDoc(doc(db, 'synth_sessions', sessionId), {
            verificationStatus: status,
            updatedAt: Date.now()
        });
    } catch (e) {
        console.error("Error updating session verification status", e);
        throw e;
    }
};

export const deleteSessionWithLogs = async (sessionId: string): Promise<{ deletedLogs: number }> => {
    if (backendClient.isBackendEnabled()) {
        return backendClient.deleteSessionWithLogs(sessionId);
    }
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        let deletedLogs = 0;
        let lastDoc: any = null;
        const logsCollection = collection(db, 'synth_logs');

        while (true) {
            const constraints: any[] = [
                where('sessionUid', '==', sessionId),
                orderBy('createdAt', 'desc'),
                limit(500)
            ];
            if (lastDoc) {
                constraints.push(startAfter(lastDoc));
            }

            const q = query(logsCollection, ...constraints);
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                break;
            }

            const batch = writeBatch(db);
            snapshot.docs.forEach(docSnap => {
                batch.delete(docSnap.ref);
            });
            await batch.commit();

            deletedLogs += snapshot.size;
            lastDoc = snapshot.docs[snapshot.docs.length - 1];
        }

        await deleteDoc(doc(db, 'synth_sessions', sessionId));

        return { deletedLogs };
    } catch (e) {
        console.error("Error deleting session with logs", e);
        throw e;
    }
};

export const loadFromCloud = async (sessionId: string): Promise<CloudSessionResult | null> => {
    if (backendClient.isBackendEnabled()) {
        const data = await backendClient.fetchSession(sessionId) as SessionData;
        if (!data) return null;
        const sessionUid = (data as any).sessionUid || (data as any).id;
        return {
            id: (data as any).id || sessionId,
            name: (data as any).name || 'Unknown Session',
            sessionData: data,
            sessionUid
        };
    }
    await ensureInitialized();
    if (!db) throw new Error("Firebase not initialized");
    try {
        const docRef = doc(db, 'synth_sessions', sessionId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            // Handle both old format (sessionData nested in 'config') and new format (full SessionData at root)
            let sessionData: SessionData;

            if (data.config && typeof data.config === 'object' && data.config.config) {
                // Old format: { name, config: SessionData, createdAt }
                // The SessionData was stored in 'config' field
                sessionData = data.config as SessionData;
            } else if (data.config && typeof data.config === 'object') {
                // Intermediate format: config contains SessionConfig (not full SessionData)
                sessionData = {
                    ...data,
                    id: docSnap.id,
                    sessionUid: data.sessionUid || docSnap.id
                } as SessionData;
            } else {
                // New format: full SessionData stored at document root
                sessionData = {
                    ...data,
                    id: docSnap.id,
                    sessionUid: data.sessionUid || docSnap.id
                } as SessionData;
            }

            return {
                id: docSnap.id,
                name: data.name || sessionData.name || 'Unknown Session',
                sessionData,
                sessionUid: data.sessionUid || docSnap.id
            };
        }
        return null;
    } catch (e) {
        console.error("Error loading session from cloud", e);
        throw e;
    }
};

// --- Verifier Functions ---

export const fetchAllLogs = async (limitCount?: number, sessionUid?: string): Promise<VerifierItem[]> => {
    if (backendClient.isBackendEnabled()) {
        const logs = typeof limitCount === 'number' && limitCount > 0
            ? await backendClient.fetchLogs(sessionUid, limitCount)
            : await backendClient.fetchAllLogs(sessionUid);
        return logs as VerifierItem[];
    }
    return fetchLogsAfter({ limitCount, sessionUid });
};

export const fetchLogsAfter = async (options: {
    limitCount?: number;
    sessionUid?: string;
    lastDoc?: any; // QueryDocumentSnapshot
}): Promise<VerifierItem[]> => {
    if (backendClient.isBackendEnabled()) {
        const logs = typeof options.limitCount === 'number' && options.limitCount > 0
            ? await backendClient.fetchLogs(options.sessionUid, options.limitCount)
            : await backendClient.fetchAllLogs(options.sessionUid);
        return logs as VerifierItem[];
    }
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
            hasUnsavedChanges: false, // Initialize unsaved changes flag
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
            const items = snapRetry.docs.map(d => ({ ...d.data(), id: d.id, score: 0, hasUnsavedChanges: false } as VerifierItem));
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
            // Strip internal flags and non-serializable fields, keep data
            const { id, isDuplicate, duplicateGroupId, isDiscarded, _doc, hasUnsavedChanges, ...dataToSave } = item;
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

export interface OrphanScanProgress {
    scannedCount: number;
    orphanedSessionCount: number;
    totalOrphanedLogs: number;
}

// Check if there are orphaned logs (logs with sessionUids not in synth_sessions)
// Uses chunked scanning to avoid OOM - stops early when orphans are found
const ORPHAN_SCAN_CHUNK_SIZE = 50;
const ORPHAN_SCAN_MAX_LOGS = 50000;
const ORPHANED_LOGS_DEFAULT_COUNT_PER_SESSION = 1;

export const getOrphanedLogsInfo = async (onProgress?: (progress: OrphanScanProgress) => void): Promise<OrphanedLogsInfo> => {
    if (backendClient.isBackendEnabled()) {
        try {
            const jobId = await backendClient.startOrphanCheck();
            await jobStorageService.addJob({ id: jobId, type: 'orphan-check', createdAt: Date.now() });
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
            // We intentionally try this on any async-check failure.
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
    }
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
                const data = d.data() as { sessionUid?: string };
                const uid = data.sessionUid || 'unknown';

                if (uid !== 'unknown' && !existingSessionUids.has(uid)) {
                    orphanedUids.add(uid);
                    logCounts.set(uid, (logCounts.get(uid) || 0) + 1);
                }
            });

            // Check if we should continue
            if (scannedCount >= ORPHAN_SCAN_MAX_LOGS) {
                logger.warn(`Orphan scan stopped after ${scannedCount} logs to avoid memory pressure.`);
                hasMore = false;
            } else if (snapshot.docs.length < ORPHAN_SCAN_CHUNK_SIZE) {
                hasMore = false;
            } else if (orphanedUids.size > 0) {
                // Found orphans - stop early to save memory
                logger.log(`Found orphans after scanning ${scannedCount} logs, stopping early`);
                hasMore = false;
            } else {
                lastDoc = snapshot.docs[snapshot.docs.length - 1];
            }

            let totalOrphanedLogs = 0;
            logCounts.forEach(count => {
                totalOrphanedLogs += count;
            });
            if (totalOrphanedLogs === 0 && orphanedUids.size > 0) {
                totalOrphanedLogs = orphanedUids.size * ORPHANED_LOGS_DEFAULT_COUNT_PER_SESSION;
            }
            onProgress?.({
                scannedCount,
                orphanedSessionCount: orphanedUids.size,
                totalOrphanedLogs
            });

            // Yield to keep UI responsive during large scans
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Calculate totals
        let totalOrphanedLogs = 0;
        logCounts.forEach(count => {
            totalOrphanedLogs += count;
        });
        if (totalOrphanedLogs === 0 && orphanedUids.size > 0) {
            totalOrphanedLogs = orphanedUids.size * ORPHANED_LOGS_DEFAULT_COUNT_PER_SESSION;
        }

        return {
            hasOrphanedLogs: orphanedUids.size > 0,
            orphanedSessionCount: orphanedUids.size,
            totalOrphanedLogs,
            orphanedUids: Array.from(orphanedUids),
            isPartialScan: scannedCount >= ORPHAN_SCAN_MAX_LOGS || orphanedUids.size > 0,  // We stopped early or hit cap
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
    isPartialScan?: boolean;
    scannedCount?: number;
}

export interface OrphanSyncProgress {
    phase: 'scan' | 'reassign';
    scannedCount: number;
    orphanedSessions: number;
    updatedLogs: number;
}

// Chunk size for sync operation
const SYNC_CHUNK_SIZE = 200;
const BATCH_WRITE_LIMIT = 200;  // Smaller batches reduce memory pressure in the browser.
const SYNC_MAX_LOG_UPDATES = 20000; // Hard cap per sync run to avoid OOM.

// Find orphaned synth_logs (logs with sessionUids not in synth_sessions) and create sessions for them
// Uses chunked scanning with on-the-fly updates to avoid OOM
export const syncOrphanedLogsToSessions = async (onProgress?: (progress: OrphanSyncProgress) => void): Promise<SyncResult> => {
    if (backendClient.isBackendEnabled()) {
        const jobId = await backendClient.startOrphanSync();
        await jobStorageService.addJob({ id: jobId, type: 'orphan-sync', createdAt: Date.now() });
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
    }
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

        // 2. Scan logs in chunks and update orphaned logs on the fly
        const orphanedSessionUids = new Set<string>();
        let recoveredSessionId: string | null = null;
        const recoveredName = `Recovered Orphaned Logs ${new Date().toLocaleString()}`;

        let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
        let hasMore = true;
        let scannedCount = 0;
        let totalUpdated = 0;
        let shouldStop = false;

        while (hasMore) {
            const q = lastDoc
                ? query(
                    collection(db!, 'synth_logs'),
                    orderBy('createdAt', 'asc'),
                    startAfter(lastDoc),
                    limit(SYNC_CHUNK_SIZE)
                )
                : query(
                    collection(db!, 'synth_logs'),
                    orderBy('createdAt', 'asc'),
                    limit(SYNC_CHUNK_SIZE)
                );

            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                break;
            }

            scannedCount += snapshot.docs.length;
            const orphanedDocs = snapshot.docs.filter(docSnap => {
                const data = docSnap.data() as { sessionUid?: string };
                const uid = data.sessionUid || 'unknown';
                if (uid !== 'unknown' && !existingSessionUids.has(uid)) {
                    orphanedSessionUids.add(uid);
                    return true;
                }
                return false;
            });

            onProgress?.({
                phase: 'scan',
                scannedCount,
                orphanedSessions: orphanedSessionUids.size,
                updatedLogs: totalUpdated
            });

            if (orphanedDocs.length > 0) {
                if (!recoveredSessionId) {
                    recoveredSessionId = await createSessionInFirebase(recoveredName, 'orphaned', undefined);
                    result.sessionsCreated = 1;
                }

                for (let i = 0; i < orphanedDocs.length; i += BATCH_WRITE_LIMIT) {
                    if (totalUpdated >= SYNC_MAX_LOG_UPDATES) {
                        shouldStop = true;
                        break;
                    }
                    const batchDocs = orphanedDocs.slice(i, i + BATCH_WRITE_LIMIT);
                    const batch = writeBatch(db);
                    batchDocs.forEach(docSnap => {
                        batch.update(docSnap.ref, {
                            sessionUid: recoveredSessionId,
                            sessionName: recoveredName
                        });
                    });
                    await batch.commit();
                    totalUpdated += batchDocs.length;
                    onProgress?.({
                        phase: 'reassign',
                        scannedCount,
                        orphanedSessions: orphanedSessionUids.size,
                        updatedLogs: totalUpdated
                    });
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            lastDoc = snapshot.docs[snapshot.docs.length - 1];
            if (snapshot.docs.length < SYNC_CHUNK_SIZE) {
                hasMore = false;
            }

            if (shouldStop) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 200));
        }

        result.orphanedUids = Array.from(orphanedSessionUids.values());
        result.scannedCount = scannedCount;
        result.logsAssigned = totalUpdated;
        if (shouldStop) {
            result.isPartialScan = true;
        }

        if (recoveredSessionId) {
            await updateDoc(doc(db, 'synth_sessions', recoveredSessionId), {
                logCount: totalUpdated,
                updatedAt: Date.now()
            });
            logger.log(`Created 1 recovered session for ${totalUpdated} orphaned logs`);
        }

        return result;
    } catch (e) {
        console.error("Error syncing orphaned logs to sessions", e);
        throw e;
    }
};

export const resumeOrphanSyncJobs = async (onProgress?: (progress: OrphanSyncProgress) => void): Promise<boolean> => {
    if (!backendClient.isBackendEnabled()) {
        return false;
    }
    const jobs = await jobStorageService.listJobs();
    const orphanJobs = jobs.filter(job => job.type === 'orphan-sync');
    if (orphanJobs.length === 0) {
        return false;
    }
    for (const job of orphanJobs) {
        const result = await backendClient.pollJob(job.id, (progress) => {
            onProgress?.({
                phase: 'reassign',
                scannedCount: progress.scannedCount,
                orphanedSessions: progress.orphanedSessions,
                updatedLogs: progress.updatedLogs
            });
        }) as SyncResult;
        await jobStorageService.removeJob(job.id);
        onProgress?.({
            phase: 'reassign',
            scannedCount: result.scannedCount || 0,
            orphanedSessions: result.orphanedUids?.length || 0,
            updatedLogs: result.logsAssigned || 0
        });
    }
    return true;
};

export const hasOrphanSyncJobs = async (): Promise<boolean> => {
    if (!backendClient.isBackendEnabled()) {
        return false;
    }
    const jobs = await jobStorageService.listJobs();
    return jobs.some(job => job.type === 'orphan-sync');
};
