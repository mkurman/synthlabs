/**
 * Settings Storage Service
 * Stores user preferences and API keys in IndexedDB for consistency with log storage
 * Maintains an in-memory cache for synchronous access
 */

import { EXTERNAL_PROVIDERS, PROVIDER_URLS } from '../constants';

const DB_NAME = 'SynthLabsSettingsDB';
const DB_VERSION = 1;
const STORE_NAME = 'settings';
const SETTINGS_KEY = 'app_settings';

// All available external providers from constants
export const AVAILABLE_PROVIDERS = EXTERNAL_PROVIDERS;

export interface AppSettings {
    // Provider API Keys - dynamic based on provider
    providerKeys: Record<string, string>;

    // Custom endpoint for 'other' provider
    customEndpointUrl?: string;

    // HuggingFace
    huggingFaceToken?: string;
    huggingFaceDefaultRepo?: string;

    // Firebase (override env vars)
    firebaseApiKey?: string;
    firebaseAuthDomain?: string;
    firebaseProjectId?: string;
    firebaseStorageBucket?: string;
    firebaseMessagingSenderId?: string;
    firebaseAppId?: string;

    // Gemini (primary provider, not external)
    geminiApiKey?: string;

    // UI Preferences
    defaultProvider?: string;
    defaultModel?: string;
    defaultConcurrency?: number;
    theme?: 'dark' | 'light';
}

const DEFAULT_SETTINGS: AppSettings = {
    providerKeys: {},
    defaultConcurrency: 4,
    theme: 'dark'
};

// In-memory cache for synchronous access
let settingsCache: AppSettings = { ...DEFAULT_SETTINGS };
let isInitialized = false;
let dbInstance: IDBDatabase | null = null;

// Initialize the IndexedDB database
const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[SettingsDB] Failed to open database:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
};

// Load settings from IndexedDB into cache
const loadSettingsFromDB = async (): Promise<AppSettings> => {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(SETTINGS_KEY);

            request.onsuccess = () => {
                if (request.result) {
                    settingsCache = { ...DEFAULT_SETTINGS, ...request.result };
                    console.log('[SettingsDB] Loaded settings from IndexedDB');
                } else {
                    // Try to migrate from localStorage
                    const legacySettings = localStorage.getItem('synth_settings');
                    if (legacySettings) {
                        try {
                            const parsed = JSON.parse(legacySettings);
                            settingsCache = { ...DEFAULT_SETTINGS, ...parsed };
                            // Save to IndexedDB and remove from localStorage
                            saveSettingsToDB(settingsCache).then(() => {
                                localStorage.removeItem('synth_settings');
                                console.log('[SettingsDB] Migrated settings from localStorage to IndexedDB');
                            });
                        } catch (e) {
                            console.error('[SettingsDB] Failed to parse legacy settings:', e);
                        }
                    }
                }
                isInitialized = true;
                resolve(settingsCache);
            };

            request.onerror = () => {
                console.error('[SettingsDB] Failed to load settings:', request.error);
                isInitialized = true;
                resolve(settingsCache);
            };
        });
    } catch (e) {
        console.error('[SettingsDB] DB init failed, using defaults:', e);
        isInitialized = true;
        return settingsCache;
    }
};

// Save settings to IndexedDB
// WARNING: API keys are stored in IndexedDB which is accessible via JavaScript.
// While this is the standard approach for client-side storage, sensitive API keys
// could be exfiltrated by XSS attacks or malicious browser extensions. Users should
// only use API keys with appropriate restrictions/quotas.
const saveSettingsToDB = async (settings: AppSettings): Promise<void> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(settings, SETTINGS_KEY);

            request.onsuccess = () => {
                console.log('[SettingsDB] Settings saved to IndexedDB');
                resolve();
            };
            request.onerror = () => {
                console.error('[SettingsDB] Failed to save settings:', request.error);
                reject(request.error);
            };
        });
    } catch (e) {
        console.error('[SettingsDB] Save failed:', e);
    }
};

// Initialize on module load - store the promise so it can be awaited
let initPromise: Promise<AppSettings> | null = null;

const startInit = (): Promise<AppSettings> => {
    if (!initPromise) {
        initPromise = loadSettingsFromDB();
    }
    return initPromise;
};

// Detect whether IndexedDB is available (e.g., not in SSR/test environments)
const hasIndexedDBSupport = typeof indexedDB !== 'undefined';

// Start loading immediately when module loads, but only if IndexedDB is available
if (hasIndexedDBSupport) {
    startInit().catch((e) => {
        console.error('[SettingsDB] Initial settings load failed:', e);
    });
}

// Export a function to wait for initialization
export const waitForSettingsInit = (): Promise<AppSettings> => {
    if (!hasIndexedDBSupport) {
        // In environments without IndexedDB, immediately resolve with current cache/defaults
        return Promise.resolve(settingsCache);
    }
    return startInit();
};

export const SettingsService = {
    // Synchronous getter (uses cache - may return defaults if not yet initialized)
    getSettings: (): AppSettings => {
        return { ...settingsCache };
    },

    // Async getter for when you need guaranteed fresh data
    getSettingsAsync: async (): Promise<AppSettings> => {
        if (!isInitialized) {
            await startInit();
        }
        return { ...settingsCache };
    },

    // Save settings (updates cache and persists to IndexedDB)
    // Note: This is a "fire and forget" operation. Use saveSettingsAsync if you need
    // to ensure the data is persisted before continuing.
    saveSettings: (settings: AppSettings): void => {
        settingsCache = { ...settings };
        saveSettingsToDB(settings);
    },

    // Async save for when you need confirmation
    saveSettingsAsync: async (settings: AppSettings): Promise<void> => {
        settingsCache = { ...settings };
        await saveSettingsToDB(settings);
    },

    // Update settings synchronously (uses saveSettings internally)
    // Note: Returns updated settings immediately, but persistence is async.
    // Use updateSettingsAsync if you need to ensure data is persisted.
    updateSettings: (partial: Partial<AppSettings>): AppSettings => {
        const updated = { ...settingsCache, ...partial };
        SettingsService.saveSettings(updated);
        return updated;
    },

    // Async version of updateSettings
    updateSettingsAsync: async (partial: Partial<AppSettings>): Promise<AppSettings> => {
        const updated = { ...settingsCache, ...partial };
        await SettingsService.saveSettingsAsync(updated);
        return updated;
    },

    clearSettings: async (): Promise<void> => {
        settingsCache = { ...DEFAULT_SETTINGS };
        try {
            const db = await initDB();
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.delete(SETTINGS_KEY);
        } catch (e) {
            console.error('[SettingsDB] Failed to clear settings:', e);
        }
    },

    // Get a specific provider's API key with env fallback
    getApiKey: (provider: string): string => {
        const settings = settingsCache;
        const env = import.meta.env;

        // Check settings first
        if (settings.providerKeys[provider]) {
            return settings.providerKeys[provider];
        }

        // Provider-specific env fallbacks
        switch (provider.toLowerCase()) {
            case 'gemini':
                return settings.geminiApiKey || env.VITE_GEMINI_API_KEY || '';
            case 'openai':
                return env.VITE_OPENAI_API_KEY || '';
            case 'anthropic':
                return env.VITE_ANTHROPIC_API_KEY || '';
            case 'openrouter':
                return env.VITE_OPENROUTER_API_KEY || '';
            case 'together':
                return env.VITE_TOGETHER_API_KEY || '';
            case 'groq':
                return env.VITE_GROQ_API_KEY || '';
            case 'cerebras':
                return env.VITE_CEREBRAS_API_KEY || '';
            case 'featherless':
                return env.VITE_FEATHERLESS_API_KEY || '';
            case 'qwen':
            case 'qwen-deepinfra':
                return env.VITE_QWEN_API_KEY || '';
            case 'kimi':
                return env.VITE_KIMI_API_KEY || '';
            case 'z.ai':
                return env.VITE_ZAI_API_KEY || '';
            case 'chutes':
                return env.VITE_CHUTES_API_KEY || '';
            case 'huggingface':
                return settings.huggingFaceToken || env.VITE_HF_TOKEN || '';
            case 'ollama':
                return ''; // Ollama typically doesn't need a key
            default:
                return '';
        }
    },

    // Get custom base URL for 'other' provider
    getCustomBaseUrl: (): string => {
        return settingsCache.customEndpointUrl || '';
    },

    // Get provider URL (from constants, or custom for 'other')
    getProviderUrl: (provider: string): string => {
        if (provider === 'other') {
            return SettingsService.getCustomBaseUrl();
        }
        return PROVIDER_URLS[provider] || '';
    },

    // Clear all app data (settings + IndexedDB + any remaining localStorage)
    // Note: indexedDB.databases() is not supported in Firefox and Safari.
    // We fall back to deleting known databases, but any databases created in the
    // future or by other parts of the app won't be automatically cleaned up.
    clearAllData: async (): Promise<void> => {
        // Clear settings cache
        settingsCache = { ...DEFAULT_SETTINGS };

        // Clear Firebase config from localStorage
        localStorage.removeItem('synth_firebase_config');

        // Clear any synth_logs from localStorage (legacy)
        const keysToRemove = Object.keys(localStorage).filter(k =>
            k.startsWith('synth_logs_') || k.startsWith('synth_')
        );
        keysToRemove.forEach(k => localStorage.removeItem(k));

        // Clear all IndexedDB databases
        try {
            const databases = await indexedDB.databases();
            for (const db of databases) {
                if (db.name) {
                    indexedDB.deleteDatabase(db.name);
                }
            }
        } catch (e) {
            // indexedDB.databases() not supported in Firefox and Safari
            // Try deleting known databases
            indexedDB.deleteDatabase('SynthLabsDB');
            indexedDB.deleteDatabase(DB_NAME);
        }

        // Reset db instance
        dbInstance = null;
        isInitialized = false;
        initPromise = null;
    },

    // Force reload from IndexedDB (useful after external changes)
    // Note: Resets initialization state. Should only be called when no save
    // operations are in progress to avoid race conditions.
    reloadSettings: async (): Promise<AppSettings> => {
        initPromise = null;
        isInitialized = false;
        return await loadSettingsFromDB();
    }
};
