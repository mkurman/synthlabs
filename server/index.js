import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'url';
import { getFirestoreAdmin, setServiceAccountPath } from './firebaseAdmin.js';
import { createJobStore } from './jobs/jobStore.js';
import { registerHealthRoutes } from './routes/health/getHealth.js';
import { registerAdminRoutes } from './routes/admin/setServiceAccountPath.js';
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

const isProd = process.env.NODE_ENV === 'production';
const defaultPort = isProd ? 8788 : 8787;
const PORT = Number(process.env.PORT || defaultPort);
const PORT_RANGE = Number(process.env.PORT_RANGE || 10);

const createApp = () => {
    const app = express();
    app.use(cors());
    const jsonLimitMb = Number(process.env.BACKEND_JSON_LIMIT_MB || 10);
    app.use(express.json({ limit: `${jsonLimitMb}mb` }));

    const getDb = () => getFirestoreAdmin();
    const { createJob, updateJob, getJob } = createJobStore(getDb);

    registerHealthRoutes(app);
    registerAdminRoutes(app, { setServiceAccountPath });
    registerJobRoutes(app, { getJob });
    registerListSessionsRoute(app, { getDb });
    registerCreateSessionRoute(app, { getDb });
    registerGetSessionRoute(app, { getDb });
    registerUpdateVerificationStatusRoute(app, { getDb });
    registerUpdateSessionRoute(app, { getDb });
    registerDeleteSessionRoute(app, { getDb });
    registerListLogsRoute(app, { getDb });
    registerCreateLogRoute(app, { getDb });
    registerGetStatsRoute(app, { getDb });  // Must come before :id routes
    registerGetLogRoute(app, { getDb });
    registerUpdateLogRoute(app, { getDb });
    registerDeleteLogRoute(app, { getDb });
    registerCheckOrphansRoute(app, { getDb });
    registerSyncOrphansRoute(app, { getDb, createJob, updateJob });

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
    const app = createApp();
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

// Auto-start only when run directly as a script (not when required/imported)
const scriptPath = process.argv[1];
const isDirectRun = scriptPath && pathToFileURL(scriptPath).href === import.meta.url;
if (isDirectRun) {
    startServer().catch((error) => {
        console.error('Failed to start backend server:', error);
        process.exit(1);
    });
}
