import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { getFirestoreAdmin, setServiceAccountPath } from './firebaseAdmin.js';
import { createJobStore } from './jobs/jobStore.js';
import { createStalledJobMonitor } from './jobs/stalledJobMonitor.js';
import { initRepository } from './db/repositoryFactory.js';
import { registerHealthRoutes } from './routes/health/getHealth.js';
import { registerAdminRoutes } from './routes/admin/setServiceAccountPath.js';
import { registerSwitchDbProviderRoute } from './routes/admin/switchDbProvider.js';
import { registerTestDbConnectionRoute } from './routes/admin/testDbConnection.js';
import { registerMigrateFromFirebaseRoute } from './routes/admin/migrateFromFirebase.js';
import { registerJobRoutes } from './routes/jobs/getJob.js';
import { registerListSessionsRoute } from './routes/sessions/listSessions.js';
import { registerCreateSessionRoute } from './routes/sessions/createSession.js';
import { registerGetSessionRoute } from './routes/sessions/getSession.js';
import { registerUpdateVerificationStatusRoute } from './routes/sessions/updateVerificationStatus.js';
import { registerUpdateSessionRoute } from './routes/sessions/updateSession.js';
import { registerDeleteSessionRoute } from './routes/sessions/deleteSession.js';
import { registerListLogsRoute } from './routes/logs/listLogs.js';
import { registerCreateLogRoute } from './routes/logs/createLog.js';
import { registerGetLogRoute } from './routes/logs/getLog.js';
import { registerUpdateLogRoute } from './routes/logs/updateLog.js';
import { registerDeleteLogRoute } from './routes/logs/deleteLog.js';
import { registerGetStatsRoute } from './routes/logs/getStats.js';
import { registerCheckOrphansRoute } from './routes/orphans/checkOrphans.js';
import { registerSyncOrphansRoute } from './routes/orphans/syncOrphans.js';
import { registerListJobsRoute } from './routes/jobs/listJobs.js';
import { registerStartAutoscoreRoute } from './routes/jobs/startAutoscore.js';
import { registerStartRewriteRoute } from './routes/jobs/startRewrite.js';
import { registerStartRemoveItemsRoute } from './routes/jobs/startRemoveItems.js';
import { registerStartMigrateReasoningRoute } from './routes/jobs/startMigrateReasoning.js';
import { registerCancelJobRoute } from './routes/jobs/cancelJob.js';
import { registerRerunJobRoute } from './routes/jobs/rerunJob.js';
import { registerGetScoreDistributionRoute } from './routes/sessions/getScoreDistribution.js';
import { registerGenerateRoutes } from './routes/ai/generate.js';
import { registerChatRoutes } from './routes/ai/chat.js';
import { registerRewriteStreamRoutes } from './routes/ai/rewrite.js';
import { decryptKey } from './utils/keyEncryption.js';
import { loadConfig } from './utils/backendConfig.js';

const isProd = process.env.NODE_ENV === 'production';
const defaultPort = isProd ? 8788 : 8787;
const PORT = Number(process.env.PORT || defaultPort);
const PORT_RANGE = Number(process.env.PORT_RANGE || 10);

const createApp = async () => {
    const app = express();
    app.use(cors());
    const jsonLimitMb = Number(process.env.BACKEND_JSON_LIMIT_MB || 10);
    app.use(express.json({ limit: `${jsonLimitMb}mb` }));

    // Load persisted backend config (provider, connection strings, etc.)
    const persistedConfig = loadConfig();
    if (persistedConfig?.dbProvider) {
        // Persisted config overrides env var so the backend remembers the last switch
        process.env.DB_PROVIDER = persistedConfig.dbProvider;
        if (persistedConfig.connectionString) {
            process.env.COCKROACH_CONNECTION_STRING = persistedConfig.connectionString;
        }
        if (persistedConfig.caCertPem) {
            process.env.COCKROACH_CA_CERT_PEM = persistedConfig.caCertPem;
        }
        console.log(`[server] Restored persisted DB provider: ${persistedConfig.dbProvider}`);
    }

    // Initialize repository (Firestore or CockroachDB based on DB_PROVIDER env var)
    const getDb = () => getFirestoreAdmin();
    const initConfig = { getDb };
    if (persistedConfig?.connectionString) {
        initConfig.connectionString = persistedConfig.connectionString;
    }
    if (persistedConfig?.caCertPem) {
        initConfig.caCert = persistedConfig.caCertPem;
    }
    const repo = await initRepository(initConfig);
    const { createJob, updateJob, getJob, listJobs, cancelJob } = createJobStore(repo);

    // Start stalled job monitor
    const stalledJobMonitor = createStalledJobMonitor({ listJobs, updateJob, getJob }, {
        checkIntervalMs: 2 * 60 * 1000, // Check every 2 minutes
        stalledThresholdMs: 5 * 60 * 1000, // 5 minutes without update = stalled
        autoMarkAsFailed: true,
        enabled: true
    });

    registerHealthRoutes(app);
    registerAdminRoutes(app, { setServiceAccountPath });
    registerSwitchDbProviderRoute(app);
    registerTestDbConnectionRoute(app);
    registerMigrateFromFirebaseRoute(app, { createJob, updateJob, getJob });
    registerListJobsRoute(app, { listJobs });
    registerJobRoutes(app, { getJob });
    registerListSessionsRoute(app, { repo });
    registerCreateSessionRoute(app, { repo });
    registerGetSessionRoute(app, { repo });
    registerUpdateVerificationStatusRoute(app, { repo });
    registerUpdateSessionRoute(app, { repo });
    registerDeleteSessionRoute(app, { repo });
    registerListLogsRoute(app, { repo });
    registerCreateLogRoute(app, { repo });
    registerGetStatsRoute(app, { repo });  // Must come before :id routes
    registerGetLogRoute(app, { repo });
    registerUpdateLogRoute(app, { repo });
    registerDeleteLogRoute(app, { repo });
    registerCheckOrphansRoute(app, { repo, createJob, updateJob });
    registerSyncOrphansRoute(app, { repo, createJob, updateJob });
    registerStartAutoscoreRoute(app, { repo, createJob, updateJob, getJob });
    registerStartRewriteRoute(app, { repo, createJob, updateJob, getJob });
    registerStartRemoveItemsRoute(app, { repo, createJob, updateJob, getJob });
    registerStartMigrateReasoningRoute(app, { repo, createJob, updateJob, getJob });
    registerCancelJobRoute(app, { cancelJob });
    registerRerunJobRoute(app, { getJob });
    registerGetScoreDistributionRoute(app, { repo });

    // AI streaming routes
    registerGenerateRoutes(app, { decryptKey });
    registerChatRoutes(app, { decryptKey });
    registerRewriteStreamRoutes(app, { decryptKey });

    return app;
};

const listenOnAvailablePort = (appInstance, startPort, range) => new Promise((resolve, reject) => {
    if (startPort === 0) {
        const server = appInstance.listen(0, () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : startPort;
            resolve({ server, port });
        });
        server.on('error', reject);
        return;
    }

    let attempt = 0;
    const tryListen = (port) => {
        const server = appInstance.listen(port, () => resolve({ server, port }));
        server.on('error', (error) => {
            if (error?.code === 'EADDRINUSE' && attempt < range) {
                attempt += 1;
                server.close(() => tryListen(port + 1));
                return;
            }
            reject(error);
        });
    };
    tryListen(startPort);
});

let activeServer = null;

export const startServer = async () => {
    if (activeServer) {
        return { server: activeServer, port: activeServer.address()?.port };
    }
    const app = await createApp();
    const { server, port } = await listenOnAvailablePort(app, PORT, PORT_RANGE);
    activeServer = server;
    console.log(`Backend listening on http://localhost:${port}`);
    return { server, port };
};

export const stopServer = async () => {
    if (!activeServer) return;
    await new Promise((resolve) => activeServer.close(resolve));
    activeServer = null;
};

// --- Vault file for dev mode backend discovery ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT_PATH = path.join(__dirname, '..', '.backend-vault.json');

const writeVaultFile = (port) => {
    try {
        fs.writeFileSync(VAULT_PATH, JSON.stringify({
            port,
            pid: process.pid,
            startedAt: Date.now(),
            service: 'synthlabs-rg'
        }));
    } catch (e) {
        console.warn('Could not write vault file:', e.message);
    }
};

const cleanupVaultFile = () => {
    try {
        if (fs.existsSync(VAULT_PATH)) fs.unlinkSync(VAULT_PATH);
    } catch { /* ignore */ }
};

// Auto-start only when run directly as a script (not when required/imported)
const scriptPath = process.argv[1];
const isDirectRun = scriptPath && pathToFileURL(scriptPath).href === import.meta.url;
if (isDirectRun) {
    startServer()
        .then(({ port }) => {
            writeVaultFile(port);
            process.on('SIGINT', () => { cleanupVaultFile(); process.exit(0); });
            process.on('SIGTERM', () => { cleanupVaultFile(); process.exit(0); });
            process.on('exit', cleanupVaultFile);
        })
        .catch((error) => {
            console.error('Failed to start backend server:', error);
            process.exit(1);
        });
}
