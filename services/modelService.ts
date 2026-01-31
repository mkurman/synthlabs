/**
 * Model Service
 * Fetches and caches available models from various LLM providers
 */

import { ExternalProvider, ProviderType, ProviderModel, CachedModelList, ModelListProvider } from '../types';
import { PROVIDERS } from '../constants';

const DB_NAME = 'SynthLabsSettingsDB';
const DB_VERSION = 3; // Bump version to update models store key
const MODELS_STORE = 'models';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms

let dbInstance: IDBDatabase | null = null;
let cacheDisabled = false;

// Initialize the IndexedDB database with models store
let initPromise: Promise<IDBDatabase> | null = null;

const initDB = (): Promise<IDBDatabase> => {
    if (cacheDisabled) {
        return Promise.reject(new Error('Model cache disabled'));
    }
    // Return existing promise if init is in progress
    if (initPromise) {
        return initPromise;
    }

    // Return existing instance if valid
    if (dbInstance && dbInstance.objectStoreNames.contains(MODELS_STORE)) {
        return Promise.resolve(dbInstance);
    }

    initPromise = new Promise((resolve, reject) => {
        // Add timeout to prevent infinite hang
        const timeout = setTimeout(() => {
            console.error('[ModelService] Database open timeout');
            initPromise = null;
            cacheDisabled = true;
            reject(new Error('Database open timeout'));
        }, 20000);

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            clearTimeout(timeout);
            initPromise = null;
            console.error('[ModelService] Failed to open database:', request.error);
            cacheDisabled = true;
            reject(request.error);
        };

        request.onsuccess = () => {
            clearTimeout(timeout);
            dbInstance = request.result;
            console.log('[ModelService] Database opened successfully');
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            console.log('[ModelService] Upgrading database...');
            const db = (event.target as IDBOpenDBRequest).result;
            if (db.objectStoreNames.contains(MODELS_STORE)) {
                db.deleteObjectStore(MODELS_STORE);
            }
            db.createObjectStore(MODELS_STORE, { keyPath: 'cacheKey' });
            console.log('[ModelService] Created models object store');
            // Ensure settings store exists (from settingsService)
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings');
            }
        };

        request.onblocked = () => {
            clearTimeout(timeout);
            initPromise = null;
            console.warn('[ModelService] Database upgrade blocked - another connection is open');
            // Don't reject, try to resolve with current db if possible
            if (dbInstance) {
                resolve(dbInstance);
            } else {
                cacheDisabled = true;
                reject(new Error('Database upgrade blocked'));
            }
        };
    });

    return initPromise;
};

// Get cached models from IndexedDB
const getModelsFromCache = async (cacheKey: string): Promise<CachedModelList | null> => {
    if (cacheDisabled) {
        return null;
    }
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const transaction = db.transaction([MODELS_STORE], 'readonly');
            const store = transaction.objectStore(MODELS_STORE);
            const request = store.get(cacheKey);

            request.onsuccess = () => {
                const cached = request.result as CachedModelList | undefined;
                if (cached && cached.expiresAt > Date.now()) {
                    console.log(`[ModelService] Cache hit for ${cacheKey}`);
                    resolve(cached);
                } else {
                    console.log(`[ModelService] Cache miss for ${cacheKey}`);
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('[ModelService] Failed to read cache:', request.error);
                resolve(null);
            };
        });
    } catch (e) {
        console.error('[ModelService] DB error:', e);
        return null;
    }
};

// Save models to IndexedDB cache
const saveModelsToCache = async (cacheKey: string, provider: ModelListProvider, models: ProviderModel[]): Promise<void> => {
    if (cacheDisabled) {
        return;
    }
    try {
        const db = await initDB();
        const cached: CachedModelList = {
            cacheKey,
            provider,
            models,
            fetchedAt: Date.now(),
            expiresAt: Date.now() + CACHE_TTL,
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([MODELS_STORE], 'readwrite');
            const store = transaction.objectStore(MODELS_STORE);
            const request = store.put(cached);

            request.onsuccess = () => {
                console.log(`[ModelService] Cached ${models.length} models for ${provider}`);
                resolve();
            };

            request.onerror = () => {
                console.error('[ModelService] Failed to save cache:', request.error);
                reject(request.error);
            };
        });
    } catch (e) {
        console.error('[ModelService] Save cache error:', e);
    }
};

// Import model data from constants
import { HARDCODED_MODELS, DEFAULT_FALLBACK_MODELS } from '../constants';

// Normalize OpenAI-compatible API response to ProviderModel[]
const normalizeOpenAIModels = (data: any, provider: ModelListProvider): ProviderModel[] => {
    if (!data?.data || !Array.isArray(data.data)) {
        return [];
    }

    return data.data.map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        provider,
        context_length: model.context_length || model.context_window,
        owned_by: model.owned_by,
        created: model.created,
    }));
};

// Normalize Ollama API response
const normalizeOllamaModels = (data: any, provider: ExternalProvider): ProviderModel[] => {
    if (!data?.models || !Array.isArray(data.models)) {
        return [];
    }

    return data.models.map((model: any) => ({
        id: model.name || model.model,
        name: model.name || model.model,
        provider,
        context_length: model.details?.parameter_size ? parseInt(model.details.parameter_size) : undefined,
        owned_by: model.details?.family,
    }));
};

// Fetch models from a specific provider
const fetchModelsFromProvider = async (
    provider: ModelListProvider,
    apiKey: string,
    customBaseUrl?: string
): Promise<ProviderModel[]> => {
    // Check for hardcoded models first (except gemini, which should fetch live)
    if (provider !== ProviderType.Gemini && HARDCODED_MODELS[provider]) {
        return HARDCODED_MODELS[provider]!;
    }

    // Skip 'other' provider unless a base URL is provided
    if (provider === ExternalProvider.Other && !customBaseUrl) {
        return [];
    }
    if (provider === ProviderType.Gemini) {
        if (!apiKey) {
            throw new Error('Gemini API key required');
        }
        const endpoint = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(endpoint, { method: 'GET' });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[ModelService] gemini API error:', response.status, errorText);
            throw new Error(`API error: ${response.status}`);
        }
        const data = await response.json();
        const models = Array.isArray(data?.models) ? data.models : [];
        return models
            .map((m: any) => {
                const name = typeof m?.name === 'string' ? m.name : '';
                const id = name.startsWith('models/') ? name.replace('models/', '') : name;
                return {
                    id: id || name,
                    name: m?.displayName || id || name,
                    provider: 'openai',
                    context_length: m?.inputTokenLimit || undefined
                } as ProviderModel;
            })
            .filter((m: ProviderModel) => m.id);
    }

    const baseUrl = customBaseUrl || PROVIDERS[provider]?.url;
    if (!baseUrl) {
        console.warn(`[ModelService] No base URL for provider: ${provider}`);
        return [];
    }

    // Determine endpoint based on provider
    let endpoint: string;
    let headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    switch (provider) {
        case 'ollama':
            // Ollama uses /api/tags instead of /v1/models
            endpoint = baseUrl.replace('/v1', '') + '/api/tags';
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }
            break;
        case 'groq':
            // Groq uses /openai/v1/models
            endpoint = baseUrl + '/models';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'qwen-deepinfra':
            // DeepInfra uses /v1/openai/models
            endpoint = baseUrl + '/models';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        default:
            // Standard OpenAI-compatible endpoint
            endpoint = baseUrl + '/models';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
    }

    try {
        console.log(`[ModelService] Fetching models from ${provider}: ${endpoint}`);
        const response = await fetch(endpoint, {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[ModelService] ${provider} API error:`, response.status, errorText);
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        // Normalize based on provider
    if (provider === ExternalProvider.Ollama) {
            return normalizeOllamaModels(data, provider);
        }

        return normalizeOpenAIModels(data, provider);
    } catch (error) {
        console.error(`[ModelService] Failed to fetch models for ${provider}:`, error);
        throw error;
    }
};

// Filter and sort models for better UX
const filterAndSortModels = (models: ProviderModel[], provider: ModelListProvider): ProviderModel[] => {
    // For OpenRouter, filter to show only popular/recommended models
    if (provider === ExternalProvider.OpenRouter) {
        const preferredPrefixes = [
            'anthropic/',
            'openai/',
            'google/',
            'meta-llama/',
            'mistralai/',
            'qwen/',
            'deepseek/',
            'cohere/',
        ];

        // Filter to preferred providers and sort alphabetically
        const filtered = models.filter(m =>
            preferredPrefixes.some(prefix => m.id.toLowerCase().startsWith(prefix))
        );

        // If we have filtered results, use them; otherwise return all
        const result = filtered.length > 0 ? filtered : models;
        return result.sort((a, b) => a.id.localeCompare(b.id));
    }

    // For other providers, just sort alphabetically
    return models.sort((a, b) => a.id.localeCompare(b.id));
};

export interface GetModelsResult {
    models: ProviderModel[];
    fromCache: boolean;
    error?: string;
}

/**
 * Get models for a provider (uses cache if available)
 */
export const getModels = async (
    provider: ModelListProvider,
    apiKey: string,
    forceRefresh = false,
    customBaseUrl?: string
): Promise<GetModelsResult> => {
    const normalizedBaseUrl = customBaseUrl?.trim() || '';
    const cacheKey = `${provider}::${normalizedBaseUrl}`;

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
        const cached = await getModelsFromCache(cacheKey);
        if (cached) {
            return {
                models: filterAndSortModels(cached.models, provider),
                fromCache: true,
            };
        }
    }

    // Fetch from provider
    try {
        const models = await fetchModelsFromProvider(provider, apiKey, customBaseUrl);
        const sortedModels = filterAndSortModels(models, provider);

        // Cache the results (if we got any models)
        if (models.length > 0) {
            await saveModelsToCache(cacheKey, provider, models);
        }

        return {
            models: sortedModels,
            fromCache: false,
        };
    } catch (error) {
        // On error, try to return cached data even if expired
        const cached = await getModelsFromCache(cacheKey);
        if (cached) {
            return {
                models: filterAndSortModels(cached.models, provider),
                fromCache: true,
                error: error instanceof Error ? error.message : 'Failed to fetch models',
            };
        }

        // Check for hardcoded fallback first, then default fallback
        const fallbackModels = HARDCODED_MODELS[provider] || DEFAULT_FALLBACK_MODELS[provider];
        if (fallbackModels) {
            return {
                models: fallbackModels,
                fromCache: false,
                error: error instanceof Error ? error.message : 'Failed to fetch models',
            };
        }

        return {
            models: [],
            fromCache: false,
            error: error instanceof Error ? error.message : 'Failed to fetch models',
        };
    }
};

/**
 * Get hardcoded models for providers without API endpoint
 */
export const getHardcodedModels = (provider: ModelListProvider): ProviderModel[] => {
    return HARDCODED_MODELS[provider] || [];
};

/**
 * Get default/fallback models for a provider (hardcoded or default fallback)
 * These are used when the API call fails or no API key is configured
 */
export const getDefaultModels = (provider: ModelListProvider): ProviderModel[] => {
    return HARDCODED_MODELS[provider] || DEFAULT_FALLBACK_MODELS[provider] || [];
};

/**
 * Check if a provider has a models API endpoint
 */
export const hasModelsEndpoint = (provider: ModelListProvider): boolean => {
    const providersWithEndpoint: ModelListProvider[] = [
        ExternalProvider.OpenAI,
        ExternalProvider.OpenRouter,
        ExternalProvider.Together,
        ExternalProvider.Groq,
        ExternalProvider.Cerebras,
        ExternalProvider.Featherless,
        ExternalProvider.QwenDeepInfra,
        ExternalProvider.Ollama,
        ExternalProvider.Chutes,
        ProviderType.Gemini,
    ];
    return providersWithEndpoint.includes(provider);
};

/**
 * Check if a provider requires an API key for models endpoint
 */
export const requiresApiKeyForModels = (provider: ModelListProvider): boolean => {
    // Ollama doesn't require an API key
    if (provider === ExternalProvider.Ollama) {
        return false;
    }
    return hasModelsEndpoint(provider);
};

/**
 * Clear cached models for a provider or all providers
 */
export const clearModelsCache = async (provider?: ModelListProvider): Promise<void> => {
    if (cacheDisabled) {
        return;
    }
    try {
        const db = await initDB();
        const transaction = db.transaction([MODELS_STORE], 'readwrite');
        const store = transaction.objectStore(MODELS_STORE);

        if (provider) {
            const request = store.openCursor();
            await new Promise<void>((resolve, reject) => {
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) {
                        console.log(`[ModelService] Cleared cache for ${provider}`);
                        resolve();
                        return;
                    }
                    const key = String(cursor.key || '');
                    if (key.startsWith(`${provider}::`)) {
                        cursor.delete();
                    }
                    cursor.continue();
                };
                request.onerror = () => reject(request.error);
            });
        } else {
            store.clear();
            console.log('[ModelService] Cleared all model caches');
        }
    } catch (e) {
        console.error('[ModelService] Failed to clear cache:', e);
    }
};

/**
 * Refresh models for all providers that have API keys configured
 */
export const refreshAllModels = async (
    providerKeys: Record<string, string>
): Promise<Record<string, GetModelsResult>> => {
    const results: Record<string, GetModelsResult> = {};

    for (const [provider, apiKey] of Object.entries(providerKeys)) {
        if (apiKey || provider === ExternalProvider.Ollama) {
            results[provider] = await getModels(provider as ExternalProvider, apiKey, true);
        }
    }

    return results;
};

/**
 * Prefetch models for all providers with configured API keys
 * This is designed to be called on app load to warm up the cache
 * Uses non-blocking parallel fetches and doesn't force refresh
 */
export const prefetchModels = async (
    providerKeys: Record<string, string>,
    getApiKeyFn?: (provider: string) => string
): Promise<void> => {
    const providersToFetch: { provider: ExternalProvider; apiKey: string }[] = [];

    // Collect providers that need fetching
    for (const provider of Object.keys(PROVIDERS) as ExternalProvider[]) {
        // Skip 'other' provider - requires manual entry
        if (provider === ExternalProvider.Other) continue;

        // Get API key from provided keys or via callback function
        const apiKey = providerKeys[provider] || (getApiKeyFn ? getApiKeyFn(provider) : '');

        // Only fetch if we have an API key or it's Ollama
        if (apiKey || provider === ExternalProvider.Ollama) {
            providersToFetch.push({ provider, apiKey });
        }
    }

    if (providersToFetch.length === 0) {
        console.log('[ModelService] No providers configured for prefetch');
        return;
    }

    console.log(`[ModelService] Prefetching models for ${providersToFetch.length} providers...`);

    // Fetch all in parallel (non-blocking, uses cache if valid)
    const results = await Promise.allSettled(
        providersToFetch.map(({ provider, apiKey }) =>
            getModels(provider, apiKey, false).then(result => ({ provider, result }))
        )
    );

    // Log summary
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`[ModelService] Prefetch complete: ${successful} successful, ${failed} failed`);
};
