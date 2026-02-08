import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

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

    app.post('/api/admin/service-account-json', async (req, res) => {
        try {
            const payload = req.body?.json;
            if (!payload) {
                res.status(400).json({ error: 'json is required' });
                return;
            }
            const jsonText = typeof payload === 'string' ? payload : JSON.stringify(payload);
            let parsed = null;
            try {
                parsed = JSON.parse(jsonText);
            } catch {
                res.status(400).json({ error: 'invalid json' });
                return;
            }
            const fileName = `synthlabs-service-account-${Date.now()}-${crypto.randomUUID()}.json`;
            const tempPath = path.join(os.tmpdir(), fileName);
            fs.writeFileSync(tempPath, JSON.stringify(parsed, null, 2), { encoding: 'utf8', mode: 0o600 });
            await setServiceAccountPath(tempPath);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
