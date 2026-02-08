const DEFAULT_TTL_MS = Number(process.env.SESSION_LIST_TTL_MS || 60000);

let cache = new Map();

const buildKey = (params) => JSON.stringify(params);

export const getCachedSessions = (params) => {
    const key = buildKey(params);
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.value;
};

export const setCachedSessions = (params, value, ttlMs = DEFAULT_TTL_MS) => {
    const key = buildKey(params);
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
};

export const clearSessionsCache = () => {
    cache.clear();
};
