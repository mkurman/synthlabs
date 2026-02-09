import { getCachedTags, setCachedTags, clearTagsCache } from '../../cache/tagsCache.js';
import { generateUid } from '../../utils/uid.js';

export const registerListTagsRoute = (app, { repo }) => {
    app.get('/api/tags', async (_req, res) => {
        try {
            const forceRefresh = String(_req.query?.forceRefresh || '') === '1';
            
            if (forceRefresh) {
                clearTagsCache();
            } else {
                const cached = getCachedTags();
                if (cached) {
                    res.json(cached);
                    return;
                }
            }

            const tags = await repo.listTags();
            const payload = { tags };
            setCachedTags(payload);
            res.json(payload);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
