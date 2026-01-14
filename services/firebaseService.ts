import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Firestore, getDocs, query, orderBy, deleteDoc, doc, getCountFromServer, where, limit, writeBatch, serverTimestamp } from 'firebase/firestore';
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

export const initializeFirebase = async (config: FirebaseConfig): Promise<boolean> => {
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
        return true;
    } catch (e) {
        console.error("Firebase Initialization Failed:", e);
        return false;
    }
};

// Track ongoing initialization to prevent race conditions
let initPromise: Promise<boolean> | null = null;

// Auto-init on load if env vars exist
const envConfig = getEnvConfig();
if (envConfig.apiKey) {
    initPromise = initializeFirebase(envConfig);
    initPromise.catch(console.error);
}

export const isFirebaseConfigured = () => !!db;

// Wait for any pending initialization before saving
const ensureInitialized = async (): Promise<boolean> => {
    if (initPromise) {
        await initPromise;
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

export const getDbStats = async (currentSessionUid?: string): Promise<{ total: number, session: number }> => {
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
    if (!db) throw new Error("Firebase not initialized");
    try {
        const docData: any = {
            name: name || `Auto Session ${new Date().toLocaleString()}`,
            source: source,
            createdAt: new Date().toISOString(),
            isAutoCreated: true
        };

        // Save config if provided (ensures sessions can be restored)
        if (config) {
            docData.config = sanitizeForFirestore(config);
        }

        const docRef = await addDoc(collection(db, 'synth_sessions'), docData);
        return docRef.id;
    } catch (e) {
        console.error("Error creating session", e);
        throw e;
    }
};

export const getSessionsFromFirebase = async (): Promise<SavedSession[]> => {
    if (!db) throw new Error("Firebase not initialized");
    try {
        const q = query(collection(db, 'synth_sessions'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        } as SavedSession));
    } catch (e) {
        console.error("Error fetching sessions", e);
        throw e;
    }
};

export const deleteSessionFromFirebase = async (id: string) => {
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
    if (!db) throw new Error("Firebase not initialized");
    try {
        const constraints: any[] = [];

        // Filter by Session
        if (sessionUid) {
            constraints.push(where('sessionUid', '==', sessionUid));
        }

        // Ordering
        // Note: Using 'orderBy' combined with 'where' on different fields requires a composite index in Firestore.
        // To avoid breaking the app for users without indexes, we only orderBy createdAt if NO session filter is active,
        // or we accept that an index creation link will appear in console.
        // For safety/ease-of-use in this demo, we'll sort client-side if a specific session is requested to avoid index errors,
        // unless it's a simple query.
        constraints.push(orderBy('createdAt', 'desc'));

        // Limit
        if (limitCount && limitCount > 0) {
            constraints.push(limit(limitCount));
        }

        const q = query(collection(db, 'synth_logs'), ...constraints);

        const snapshot = await getDocs(q);

        return snapshot.docs.map(d => ({
            ...d.data(),
            id: d.id, // Use firestore ID
            score: 0 // Initialize score
        } as VerifierItem));
    } catch (e: any) {
        console.error("Error fetching logs", e);
        // Fallback: If index is missing for orderBy, try fetching without sort and sort locally
        if (e.code === 'failed-precondition' && sessionUid) {
            logger.warn("Falling back to client-side sort due to missing Firestore index.");
            const constraintsRetry: any[] = [where('sessionUid', '==', sessionUid)];
            if (limitCount && limitCount > 0) constraintsRetry.push(limit(limitCount));

            const qRetry = query(collection(db, 'synth_logs'), ...constraintsRetry);
            const snapRetry = await getDocs(qRetry);
            const items = snapRetry.docs.map(d => ({ ...d.data(), id: d.id, score: 0 } as VerifierItem));
            // Sort desc
            return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }
        throw e;
    }
};

export const saveFinalDataset = async (items: VerifierItem[], collectionName = 'synth_final') => {
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

// Get unique session UIDs from synth_logs with count of logs per session
export interface DiscoveredSession {
    uid: string;
    count: number;
    latestTimestamp?: string;
}

export const getUniqueSessionUidsFromLogs = async (): Promise<DiscoveredSession[]> => {
    if (!db) throw new Error("Firebase not initialized");
    try {
        // Fetch all logs to get complete session discovery
        // Note: For very large collections, consider pagination or aggregation
        const q = query(
            collection(db, 'synth_logs'),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);

        // Aggregate by sessionUid
        const sessionMap = new Map<string, { count: number; latestTimestamp: string }>();

        snapshot.docs.forEach(d => {
            const data = d.data();
            const uid = data.sessionUid || 'unknown';
            const timestamp = data.createdAt || data.timestamp || '';

            if (sessionMap.has(uid)) {
                const existing = sessionMap.get(uid)!;
                existing.count++;
                if (timestamp && timestamp > existing.latestTimestamp) {
                    existing.latestTimestamp = timestamp;
                }
            } else {
                sessionMap.set(uid, { count: 1, latestTimestamp: timestamp });
            }
        });

        // Convert to array and sort by count descending
        const results: DiscoveredSession[] = [];
        sessionMap.forEach((value, uid) => {
            results.push({
                uid,
                count: value.count,
                latestTimestamp: value.latestTimestamp
            });
        });

        return results.sort((a, b) => b.count - a.count);
    } catch (e) {
        console.error("Error getting unique session UIDs from logs", e);
        return [];
    }
};
