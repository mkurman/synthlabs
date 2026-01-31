/**
 * Chat Storage Service
 * Persists chat history to IndexedDB
 */

import { ChatMessage } from './chatService';
import { ChatRole } from '../interfaces/enums';

const DB_NAME = 'SynthLabsChatDB';
const DB_VERSION = 4; // Increase to 4: Backfill timestamps
const STORE_NAME = 'chat_sessions';
const META_STORE_NAME = 'chat_meta'; // For storing current session ID

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    updatedAt: number;
    createdAt: number;
}

let dbInstance: IDBDatabase | null = null;

const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[ChatDB] Failed to open database:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            const transaction = (event.target as IDBOpenDBRequest).transaction;

            // 1. Chat Sessions Store
            let sessionStore: IDBObjectStore;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                sessionStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            } else {
                sessionStore = transaction!.objectStore(STORE_NAME);
            }

            // Ensure 'updatedAt' index exists
            if (!sessionStore.indexNames.contains('updatedAt')) {
                sessionStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }

            // 2. Chat Meta Store
            if (!db.objectStoreNames.contains(META_STORE_NAME)) {
                db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
            }

            // Migration: Backfill timestamp fields if missing (fixes missing history items)
            const cursorRequest = sessionStore.openCursor();
            cursorRequest.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result;
                if (cursor) {
                    const update = cursor.value;
                    let changed = false;
                    if (!update.updatedAt) {
                        update.updatedAt = Date.now();
                        changed = true;
                    }
                    if (!update.createdAt) {
                        update.createdAt = Date.now();
                        changed = true;
                    }
                    if (changed) {
                        cursor.update(update);
                    }
                    cursor.continue();
                }
            };
        };
    });
};

const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export const ChatStorageService = {
    // Generate a title based on the first user message
    generateTitle: (messages: ChatMessage[]): string => {
        const firstUserMsg = messages.find(m => m.role === ChatRole.User);
        if (firstUserMsg && firstUserMsg.content) {
            return firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
        }
        return 'New Chat';
    },

    createSession: async (): Promise<ChatSession> => {
        const id = generateId();
        const session: ChatSession = {
            id,
            title: 'New Chat',
            messages: [],
            updatedAt: Date.now(),
            createdAt: Date.now()
        };
        await ChatStorageService.saveSession(session);
        await ChatStorageService.setCurrentSessionId(id);
        return session;
    },

    saveSession: async (session: ChatSession): Promise<void> => {
        try {
            const db = await initDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                // Update title if it's still 'New Chat'
                if (session.title === 'New Chat' && session.messages.length > 0) {
                    session.title = ChatStorageService.generateTitle(session.messages);
                }

                session.updatedAt = Date.now();

                const request = store.put(session);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('[ChatDB] Save failed:', e);
        }
    },

    getSession: async (id: string): Promise<ChatSession | null> => {
        try {
            const db = await initDB();
            return new Promise((resolve) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(id);

                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => resolve(null);
            });
        } catch (e) {
            console.error('[ChatDB] Get failed:', e);
            return null;
        }
    },

    getAllSessions: async (): Promise<ChatSession[]> => {
        try {
            const db = await initDB();
            return new Promise((resolve) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const index = store.index('updatedAt');
                const request = index.openCursor(null, 'prev'); // Sort by newest first

                const sessions: ChatSession[] = [];
                request.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result;
                    if (cursor) {
                        const session = cursor.value as ChatSession;
                        // Filter out empty sessions unless they are the active one? 
                        // Actually, just filter out ones with 0 messages.
                        if (session.messages && session.messages.length > 0) {
                            sessions.push(session);
                        }
                        cursor.continue();
                    } else {
                        resolve(sessions);
                    }
                };
            });
        } catch (e) {
            console.error('[ChatDB] List failed:', e);
            return [];
        }
    },

    deleteSession: async (id: string): Promise<void> => {
        try {
            const db = await initDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete(id);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('[ChatDB] Delete failed:', e);
        }
    },

    // Meta: Current Session ID
    getCurrentSessionId: async (): Promise<string | null> => {
        try {
            const db = await initDB();
            return new Promise((resolve) => {
                const transaction = db.transaction([META_STORE_NAME], 'readonly');
                const store = transaction.objectStore(META_STORE_NAME);
                const request = store.get('current_session_id');

                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    },

    setCurrentSessionId: async (id: string): Promise<void> => {
        try {
            const db = await initDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([META_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(META_STORE_NAME);
                const request = store.put({ key: 'current_session_id', value: id });

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('[ChatDB] Set Current ID failed:', e);
        }
    },

    // Legacy migration compatibility 
    // This maintains the previous signature behavior roughly but directs to current session
    legacyLoadSession: async (): Promise<ChatMessage[]> => {
        const currentId = await ChatStorageService.getCurrentSessionId();
        if (currentId) {
            const session = await ChatStorageService.getSession(currentId);
            return session ? session.messages : [];
        } else {
            // Need a new session
            await ChatStorageService.createSession();
            return [];
        }
    }
};
