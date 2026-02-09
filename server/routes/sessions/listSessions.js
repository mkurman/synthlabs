import { getCachedSessions, setCachedSessions, clearSessionsCache } from '../../cache/sessionCache.js';

export const registerListSessionsRoute = (app, { repo }) => {
    app.get('/api/sessions', async (_req, res) => {
        try {
            const defaultLimit = Number(process.env.SESSION_LIST_PAGE_SIZE || 50);
            const limitParam = Number(_req.query?.limit || defaultLimit);
            const cursor = _req.query?.cursor;
            const forceRefresh = String(_req.query?.forceRefresh || '') === '1';
            const cacheKey = {
                limit: limitParam,
                cursor: cursor || null,
                query: _req.query || {}
            };
            if (forceRefresh) {
                clearSessionsCache();
            } else {
                const cached = getCachedSessions(cacheKey);
                if (cached) {
                    res.json(cached);
                    return;
                }
            }

            const pageLimit = Math.min(limitParam, 200);
            const sessions = [];
            const {
                search = '',
                onlyWithLogs = '',
                minRows = '',
                maxRows = '',
                appMode = '',
                engineMode = '',
                model = '',
                tags = ''
            } = _req.query || {};

            const searchTerm = String(search).trim().toLowerCase();
            const modelTerm = String(model).trim().toLowerCase();
            const onlyLogs = String(onlyWithLogs) === '1';
            const minRowsNum = minRows !== '' ? Number(minRows) : null;
            const maxRowsNum = maxRows !== '' ? Number(maxRows) : null;
            const tagFilter = tags ? String(tags).split(',').filter(Boolean) : [];

            const isFiltering = Boolean(search || onlyWithLogs || minRows !== '' || maxRows !== '' || appMode || engineMode || model || tagFilter.length > 0);
            let currentCursor = cursor || null;
            let hasMore = false;

            while (sessions.length < pageLimit) {
                const result = await repo.listSessions({ limit: pageLimit, cursor: currentCursor });
                const batch = result.items;

                if (batch.length === 0) {
                    hasMore = false;
                    break;
                }

                currentCursor = result.nextCursor;
                hasMore = result.hasMore;

                if (!isFiltering) {
                    sessions.push(...batch);
                    break;
                }

                const filteredBatch = batch.filter(session => {
                    const rowCount = session.logCount ?? session.itemCount ?? 0;
                    if (onlyLogs && rowCount <= 0) return false;
                    if (minRowsNum !== null && rowCount < minRowsNum) return false;
                    if (maxRowsNum !== null && rowCount > maxRowsNum) return false;
                    const resolvedAppMode = session.config?.appMode || session.appMode || '';
                    const resolvedEngineMode = session.config?.engineMode || session.engineMode || '';
                    if (appMode && resolvedAppMode !== appMode) return false;
                    if (engineMode && resolvedEngineMode !== engineMode) return false;
                    if (searchTerm && !(session.name || '').toLowerCase().includes(searchTerm)) return false;
                    if (modelTerm) {
                        const modelValue = (session.config?.externalModel || session.externalModel || '').toLowerCase();
                        if (!modelValue.includes(modelTerm)) return false;
                    }
                    if (tagFilter.length > 0) {
                        const sessionTagNames = (session.tags || []).map(t => t.name?.toLowerCase() || '').filter(Boolean);
                        const hasMatchingTag = tagFilter.some(tag => sessionTagNames.includes(tag.toLowerCase()));
                        if (!hasMatchingTag) return false;
                    }
                    return true;
                });
                sessions.push(...filteredBatch);
                if (!hasMore) {
                    break;
                }
            }

            const filtered = sessions.slice(0, pageLimit);
            const nextCursor = currentCursor;
            const payload = { sessions: filtered, nextCursor, hasMore };
            setCachedSessions(cacheKey, payload);
            res.json(payload);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
