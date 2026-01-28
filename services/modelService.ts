/**
 * Model Service
 * Fetches and caches available models from various LLM providers
 */

import { ExternalProvider, ProviderModel, CachedModelList } from '../types';
import { PROVIDER_URLS } from '../constants';

const DB_NAME = 'SynthLabsSettingsDB';
const DB_VERSION = 2; // Bump version to add models store
const MODELS_STORE = 'models';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms

let dbInstance: IDBDatabase | null = null;

// Initialize the IndexedDB database with models store
let initPromise: Promise<IDBDatabase> | null = null;

const initDB = (): Promise<IDBDatabase> => {
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
            reject(new Error('Database open timeout'));
        }, 10000);

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            clearTimeout(timeout);
            initPromise = null;
            console.error('[ModelService] Failed to open database:', request.error);
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
            if (!db.objectStoreNames.contains(MODELS_STORE)) {
                db.createObjectStore(MODELS_STORE, { keyPath: 'provider' });
                console.log('[ModelService] Created models object store');
            }
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
                reject(new Error('Database upgrade blocked'));
            }
        };
    });

    return initPromise;
};

// Get cached models from IndexedDB
const getModelsFromCache = async (provider: ExternalProvider): Promise<CachedModelList | null> => {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const transaction = db.transaction([MODELS_STORE], 'readonly');
            const store = transaction.objectStore(MODELS_STORE);
            const request = store.get(provider);

            request.onsuccess = () => {
                const cached = request.result as CachedModelList | undefined;
                if (cached && cached.expiresAt > Date.now()) {
                    console.log(`[ModelService] Cache hit for ${provider}`);
                    resolve(cached);
                } else {
                    console.log(`[ModelService] Cache miss for ${provider}`);
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
const saveModelsToCache = async (provider: ExternalProvider, models: ProviderModel[]): Promise<void> => {
    try {
        const db = await initDB();
        const cached: CachedModelList = {
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

// Hardcoded model lists for providers without /models endpoint or as fallback defaults
const HARDCODED_MODELS: Partial<Record<ExternalProvider, ProviderModel[]>> = {
    anthropic: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
        { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
        { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', provider: 'anthropic' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', provider: 'anthropic' },
        { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic' },
    ],
    huggingface: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', provider: 'huggingface' },
        { id: 'meta-llama/Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B', provider: 'huggingface' },
        { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', provider: 'huggingface' },
        { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', provider: 'huggingface' },
        { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B v0.3', provider: 'huggingface' },
        { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', provider: 'huggingface' },
        { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 7B', provider: 'huggingface' },
        { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B', provider: 'huggingface' },
        { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', provider: 'huggingface' },
    ],
    kimi: [
        { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', provider: 'kimi', context_length: 8192 },
        { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', provider: 'kimi', context_length: 32768 },
        { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', provider: 'kimi', context_length: 131072 },
    ],
    'z.ai': [
        { id: 'glm-4-plus', name: 'GLM-4 Plus', provider: 'z.ai' },
        { id: 'glm-4-0520', name: 'GLM-4 0520', provider: 'z.ai' },
        { id: 'glm-4-air', name: 'GLM-4 Air', provider: 'z.ai' },
        { id: 'glm-4-airx', name: 'GLM-4 AirX', provider: 'z.ai' },
        { id: 'glm-4-flash', name: 'GLM-4 Flash', provider: 'z.ai' },
    ],
    qwen: [
        { id: 'qwen-turbo', name: 'Qwen Turbo', provider: 'qwen' },
        { id: 'qwen-plus', name: 'Qwen Plus', provider: 'qwen' },
        { id: 'qwen-max', name: 'Qwen Max', provider: 'qwen' },
        { id: 'qwen-max-longcontext', name: 'Qwen Max Long Context', provider: 'qwen' },
    ],
};

// Default fallback models for providers with /models endpoint (used when API call fails or no API key)
const DEFAULT_FALLBACK_MODELS: Partial<Record<ExternalProvider, ProviderModel[]>> = {
    openai: [
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', context_length: 128000 },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', context_length: 128000 },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', context_length: 128000 },
        { id: 'gpt-4', name: 'GPT-4', provider: 'openai', context_length: 8192 },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', context_length: 16385 },
        { id: 'o1', name: 'o1', provider: 'openai', context_length: 200000 },
        { id: 'o1-mini', name: 'o1 Mini', provider: 'openai', context_length: 128000 },
        { id: 'o1-preview', name: 'o1 Preview', provider: 'openai', context_length: 128000 },
    ],
    groq: [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'groq', context_length: 128000 },
        { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', provider: 'groq', context_length: 128000 },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', provider: 'groq', context_length: 128000 },
        { id: 'llama3-70b-8192', name: 'Llama 3 70B', provider: 'groq', context_length: 8192 },
        { id: 'llama3-8b-8192', name: 'Llama 3 8B', provider: 'groq', context_length: 8192 },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', provider: 'groq', context_length: 32768 },
        { id: 'gemma2-9b-it', name: 'Gemma 2 9B', provider: 'groq', context_length: 8192 },
    ],
    together: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', provider: 'together', context_length: 128000 },
        { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B Turbo', provider: 'together', context_length: 128000 },
        { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B Turbo', provider: 'together', context_length: 128000 },
        { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B Turbo', provider: 'together', context_length: 128000 },
        { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Turbo', provider: 'together', context_length: 32768 },
        { id: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B', name: 'DeepSeek R1 Distill 70B', provider: 'together' },
        { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', provider: 'together' },
        { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B', provider: 'together', context_length: 65536 },
    ],
    cerebras: [
        { id: 'llama3.1-70b', name: 'Llama 3.1 70B', provider: 'cerebras', context_length: 128000 },
        { id: 'llama3.1-8b', name: 'Llama 3.1 8B', provider: 'cerebras', context_length: 128000 },
        { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'cerebras', context_length: 128000 },
    ],
    featherless: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', provider: 'featherless' },
        { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', provider: 'featherless' },
        { id: 'Qwen/QwQ-32B-Preview', name: 'QwQ 32B', provider: 'featherless' },
        { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', name: 'DeepSeek R1 Distill 32B', provider: 'featherless' },
        { id: 'mistralai/Mistral-Nemo-Instruct-2407', name: 'Mistral Nemo', provider: 'featherless' },
    ],
    'qwen-deepinfra': [
        { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', provider: 'qwen-deepinfra' },
        { id: 'Qwen/QwQ-32B-Preview', name: 'QwQ 32B', provider: 'qwen-deepinfra' },
        { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', provider: 'qwen-deepinfra' },
        { id: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B', name: 'DeepSeek R1 Distill 70B', provider: 'qwen-deepinfra' },
    ],
    openrouter: [
        { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'openrouter' },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openrouter' },
        { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openrouter' },
        { id: 'openai/o1', name: 'o1', provider: 'openrouter' },
        { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'openrouter' },
        { id: 'google/gemini-2.5-pro-preview-03-25', name: 'Gemini 2.5 Pro', provider: 'openrouter' },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'openrouter' },
        { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', provider: 'openrouter' },
        { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', provider: 'openrouter' },
        { id: 'qwen/qwq-32b', name: 'QwQ 32B', provider: 'openrouter' },
    ],
    chutes: [
        { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', provider: 'chutes' },
        { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', provider: 'chutes' },
        { id: 'Qwen/QwQ-32B', name: 'QwQ 32B', provider: 'chutes' },
    ],
};

// Normalize OpenAI-compatible API response to ProviderModel[]
const normalizeOpenAIModels = (data: any, provider: ExternalProvider): ProviderModel[] => {
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
    provider: ExternalProvider,
    apiKey: string,
    customBaseUrl?: string
): Promise<ProviderModel[]> => {
    // Check for hardcoded models first
    if (HARDCODED_MODELS[provider]) {
        return HARDCODED_MODELS[provider]!;
    }

    // Skip 'other' provider - user must enter model manually
    if (provider === 'other') {
        return [];
    }

    const baseUrl = customBaseUrl || PROVIDER_URLS[provider];
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
        if (provider === 'ollama') {
            return normalizeOllamaModels(data, provider);
        }

        return normalizeOpenAIModels(data, provider);
    } catch (error) {
        console.error(`[ModelService] Failed to fetch models for ${provider}:`, error);
        throw error;
    }
};

// Filter and sort models for better UX
const filterAndSortModels = (models: ProviderModel[], provider: ExternalProvider): ProviderModel[] => {
    // For OpenRouter, filter to show only popular/recommended models
    if (provider === 'openrouter') {
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
    provider: ExternalProvider,
    apiKey: string,
    forceRefresh = false,
    customBaseUrl?: string
): Promise<GetModelsResult> => {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
        const cached = await getModelsFromCache(provider);
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
            await saveModelsToCache(provider, models);
        }

        return {
            models: sortedModels,
            fromCache: false,
        };
    } catch (error) {
        // On error, try to return cached data even if expired
        const cached = await getModelsFromCache(provider);
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
export const getHardcodedModels = (provider: ExternalProvider): ProviderModel[] => {
    return HARDCODED_MODELS[provider] || [];
};

/**
 * Get default/fallback models for a provider (hardcoded or default fallback)
 * These are used when the API call fails or no API key is configured
 */
export const getDefaultModels = (provider: ExternalProvider): ProviderModel[] => {
    return HARDCODED_MODELS[provider] || DEFAULT_FALLBACK_MODELS[provider] || [];
};

/**
 * Check if a provider has a models API endpoint
 */
export const hasModelsEndpoint = (provider: ExternalProvider): boolean => {
    const providersWithEndpoint: ExternalProvider[] = [
        'openai',
        'openrouter',
        'together',
        'groq',
        'cerebras',
        'featherless',
        'qwen-deepinfra',
        'ollama',
        'chutes',
    ];
    return providersWithEndpoint.includes(provider);
};

/**
 * Check if a provider requires an API key for models endpoint
 */
export const requiresApiKeyForModels = (provider: ExternalProvider): boolean => {
    // Ollama doesn't require an API key
    if (provider === 'ollama') {
        return false;
    }
    return hasModelsEndpoint(provider);
};

/**
 * Clear cached models for a provider or all providers
 */
export const clearModelsCache = async (provider?: ExternalProvider): Promise<void> => {
    try {
        const db = await initDB();
        const transaction = db.transaction([MODELS_STORE], 'readwrite');
        const store = transaction.objectStore(MODELS_STORE);

        if (provider) {
            store.delete(provider);
            console.log(`[ModelService] Cleared cache for ${provider}`);
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
        if (apiKey || provider === 'ollama') {
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
    for (const provider of Object.keys(PROVIDER_URLS) as ExternalProvider[]) {
        // Skip 'other' provider - requires manual entry
        if (provider === 'other') continue;

        // Get API key from provided keys or via callback function
        const apiKey = providerKeys[provider] || (getApiKeyFn ? getApiKeyFn(provider) : '');

        // Only fetch if we have an API key or it's Ollama
        if (apiKey || provider === 'ollama') {
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
