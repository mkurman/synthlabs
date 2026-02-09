import { clearTagsCache } from '../../cache/tagsCache.js';
import { generateUid } from '../../utils/uid.js';

export const registerCreateTagRoute = (app, { repo }) => {
    app.post('/api/tags', async (_req, res) => {
        try {
            const { name } = _req.body || {};
            
            if (!name || typeof name !== 'string') {
                res.status(400).json({ error: 'Tag name is required' });
                return;
            }
            
            const trimmedName = name.trim().toLowerCase();
            if (!trimmedName) {
                res.status(400).json({ error: 'Tag name cannot be empty' });
                return;
            }
            
            if (trimmedName.length > 50) {
                res.status(400).json({ error: 'Tag name must be 50 characters or less' });
                return;
            }
            
            const existingTag = await repo.getTagByName(trimmedName);
            if (existingTag) {
                res.status(409).json({ error: 'Tag with this name already exists', tag: existingTag });
                return;
            }
            
            const uid = generateUid();
            const tag = await repo.createTag({
                uid,
                name: trimmedName,
                createdAt: new Date().toISOString()
            });
            
            clearTagsCache();
            res.status(201).json({ tag });
        } catch (error) {
            console.error('[createTag] Error:', error);
            res.status(500).json({ error: String(error), stack: error.stack });
        }
    });
};
