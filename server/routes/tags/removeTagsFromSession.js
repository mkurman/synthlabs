import { clearTagsCache } from '../../cache/tagsCache.js';

export const registerRemoveTagsFromSessionRoute = (app, { repo }) => {
    app.delete('/api/sessions/:sessionUid/tags', async (_req, res) => {
        try {
            const { sessionUid } = _req.params;
            const { tagUids } = _req.body || {};
            
            if (!sessionUid) {
                res.status(400).json({ error: 'Session UID is required' });
                return;
            }
            
            if (!Array.isArray(tagUids) || tagUids.length === 0) {
                res.status(400).json({ error: 'tagUids array is required' });
                return;
            }
            
            await repo.removeTagsFromSession(sessionUid, tagUids);
            clearTagsCache();
            
            const tags = await repo.getSessionTags(sessionUid);
            res.json({ tags });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
