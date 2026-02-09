import { clearTagsCache } from '../../cache/tagsCache.js';

export const registerDeleteTagRoute = (app, { repo }) => {
    app.delete('/api/tags/:uid', async (_req, res) => {
        try {
            const { uid } = _req.params;
            
            if (!uid) {
                res.status(400).json({ error: 'Tag UID is required' });
                return;
            }
            
            await repo.deleteTag(uid);
            clearTagsCache();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
