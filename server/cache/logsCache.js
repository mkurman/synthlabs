const LOGS_CACHE_TTL_MS = 15 * 1000;

let cache = new Map();

const isExpired = (entry) => !entry || entry.expiresAt <= Date.now();

const toCacheKey = ({ sessionUid, limit, offset, cursorCreatedAt }) =>
    JSON.stringify({
        sessionUid: sessionUid || null,
        limit: Number(limit) || 100,
        offset: Number(offset) || 0,
        cursorCreatedAt: cursorCreatedAt ?? null
    });

export const getCachedLogs = (params) => {
    const key = toCacheKey(params);
    const entry = cache.get(key);
    if (isExpired(entry)) {
        cache.delete(key);
        return null;
    }
    return entry.value;
};

export const setCachedLogs = (params, value, ttlMs = LOGS_CACHE_TTL_MS) => {
    const key = toCacheKey(params);
    cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
    });
};

export const patchCachedLog = (updatedLog) => {
    if (!updatedLog || !updatedLog.id) return;
    for (const [key, entry] of cache.entries()) {
        if (isExpired(entry)) {
            cache.delete(key);
            continue;
        }
        const currentValue = entry.value;
        if (!currentValue || !Array.isArray(currentValue.logs)) continue;

        const index = currentValue.logs.findIndex((log) => log?.id === updatedLog.id);
        if (index < 0) continue;

        const nextLogs = [...currentValue.logs];
        nextLogs[index] = {
            ...nextLogs[index],
            ...updatedLog
        };
        cache.set(key, {
            ...entry,
            value: {
                ...currentValue,
                logs: nextLogs
            }
        });
    }
};

export const clearLogsCache = () => {
    cache.clear();
};

