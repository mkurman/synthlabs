import { getCurrentProvider, switchProvider, getRepository } from '../../db/repositoryFactory.js';
import { clearSessionsCache } from '../../cache/sessionCache.js';
import { clearLogsCache } from '../../cache/logsCache.js';
import { updateConfig } from '../../utils/backendConfig.js';

export const registerSwitchDbProviderRoute = (app) => {
    // Get current provider
    app.get('/api/admin/db-provider', (_req, res) => {
        res.json({ provider: getCurrentProvider() });
    });

    // Switch provider
    app.post('/api/admin/db-provider', async (req, res) => {
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
                // Firestore needs getDb — reuse from the existing setup
                const { getFirestoreAdmin } = await import('../../firebaseAdmin.js');
                config.getDb = () => getFirestoreAdmin();
            }

            await switchProvider(provider, config);
            clearSessionsCache();
            clearLogsCache();
            console.log('[switchDbProvider] Backend caches cleared after provider switch');

            // Persist provider settings so backend remembers across restarts
            const persistedConfig = { dbProvider: provider };
            if (provider === 'cockroachdb') {
                persistedConfig.connectionString = connectionString;
                if (caCertPem) persistedConfig.caCertPem = caCertPem;
                if (caCertPath) persistedConfig.caCertPath = caCertPath;
            }
            updateConfig(persistedConfig);

            res.json({ ok: true, provider: getCurrentProvider() });
        } catch (error) {
            res.status(500).json({ error: String(error.message || error) });
        }
    });
};
