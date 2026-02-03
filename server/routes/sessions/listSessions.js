import { getCachedSessions, setCachedSessions, clearSessionsCache } from '../../cache/sessionCache.js';

export const registerListSessionsRoute = (app, { getDb }) => {
    app.get('/api/sessions', async (_req, res) => {
        try {
            const db = getDb();
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
            let query = db.collection('synth_sessions').orderBy('updatedAt', 'desc');
            if (cursor) {
                const cursorDoc = await db.collection('synth_sessions').doc(String(cursor)).get();
                if (cursorDoc.exists) {
                    query = query.startAfter(cursorDoc);
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
                model = ''
            } = _req.query || {};
            
            const searchTerm = String(search).trim().toLowerCase();
            const modelTerm = String(model).trim().toLowerCase();
            const onlyLogs = String(onlyWithLogs) === '1';
            const minRowsNum = minRows !== '' ? Number(minRows) : null;
            const maxRowsNum = maxRows !== '' ? Number(maxRows) : null;

            const isFiltering = Boolean(search || onlyWithLogs || minRows !== '' || maxRows !== '' || appMode || engineMode || model);
            let lastScannedDoc = null;
            let hasMore = false;

            while (sessions.length < pageLimit) {
                const snapshot = await query.limit(pageLimit).get();
                if (snapshot.empty) {
                    hasMore = false;
                    break;
                }
                lastScannedDoc = snapshot.docs[snapshot.docs.length - 1];
                query = query.startAfter(lastScannedDoc);
                const batch = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (!isFiltering) {
                    sessions.push(...batch);
                    hasMore = snapshot.docs.length === pageLimit;
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
                    return true;
                });
                sessions.push(...filteredBatch);
                if (snapshot.docs.length < pageLimit) {
                    hasMore = false;
                    break;
                }
                hasMore = true;
            }

            const filtered = sessions.slice(0, pageLimit);
            const nextCursor = lastScannedDoc ? lastScannedDoc.id : null;
            const payload = { sessions: filtered, nextCursor, hasMore };
            setCachedSessions(cacheKey, payload);
            res.json(payload);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
