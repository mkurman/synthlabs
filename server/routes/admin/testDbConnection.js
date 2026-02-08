import { createRepository } from '../../db/repositoryFactory.js';

export const registerTestDbConnectionRoute = (app) => {
    app.post('/api/admin/test-db-connection', async (req, res) => {
        try {
            const { provider, connectionString, caCertPath, caCertPem } = req.body || {};
            if (!provider || !['firestore', 'cockroachdb'].includes(provider)) {
                res.status(400).json({ error: 'provider must be "firestore" or "cockroachdb"' });
                return;
            }

            const config = {};
            if (provider === 'cockroachdb') {
                if (!connectionString) {
                    res.status(400).json({ error: 'connectionString is required for cockroachdb' });
                    return;
                }
                config.connectionString = connectionString;
                if (caCertPem) {
                    config.caCert = caCertPem;
                } else if (caCertPath) {
                    config.caCertPath = caCertPath;
                }
            } else {
                const { getFirestoreAdmin } = await import('../../firebaseAdmin.js');
                config.getDb = () => getFirestoreAdmin();
            }

            const repo = await createRepository(provider, config);
            const result = await repo.testConnection();
            await repo.close();
            res.json(result);
        } catch (error) {
            res.status(500).json({ ok: false, error: String(error.message || error) });
        }
    });
};
