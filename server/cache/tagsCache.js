const DEFAULT_TTL_MS = Number(process.env.TAGS_LIST_TTL_MS || 30000);

let cache = null;
let expiresAt = 0;

export const getCachedTags = () => {
    if (!cache) return null;
    if (Date.now() > expiresAt) {
        cache = null;
        return null;
    }
    return cache;
};

export const setCachedTags = (value, ttlMs = DEFAULT_TTL_MS) => {
    cache = value;
    expiresAt = Date.now() + ttlMs;
};

export const clearTagsCache = () => {
    cache = null;
    expiresAt = 0;
};
