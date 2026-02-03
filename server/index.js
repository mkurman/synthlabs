import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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

const PORT = Number(process.env.PORT || 8787);

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

app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
});
