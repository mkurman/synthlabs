import fs from 'fs';

export const registerAdminRoutes = (app, { setServiceAccountPath }) => {
    app.post('/api/admin/service-account-path', async (req, res) => {
        try {
            const path = req.body?.path;
            if (!path || typeof path !== 'string') {
                res.status(400).json({ error: 'path is required' });
                return;
            }
            if (!fs.existsSync(path)) {
                res.status(400).json({ error: 'file not found' });
                return;
            }
            await setServiceAccountPath(path);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
