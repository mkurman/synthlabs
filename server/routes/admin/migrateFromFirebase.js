import { getRepository, getCurrentProvider } from '../../db/repositoryFactory.js';
import { FirestoreRepository } from '../../db/firestoreRepository.js';
import { getFirestoreAdmin } from '../../firebaseAdmin.js';
import { JobStatus } from '../../jobs/jobStore.js';

// Firestore read page size
const FS_PAGE_SIZE = 500;
// CockroachDB write batch size - 200 rows to stay under 16 MiB wire protocol limit
// with very large reasoning traces (avg 50KB per row = 10MB per batch)
const CRDB_LOG_BATCH = 200;
const CRDB_SESSION_BATCH = 500;
// Number of concurrent workers for log migration
const LOG_WORKERS = 10;

const LOG_COLUMNS = '(id, session_uid, session_name, query, reasoning, reasoning_content, answer, score, verification_status, saved_to_db, messages, created_at, updated_at, metadata)';
const LOG_COL_COUNT = 14;
const SESSION_COLUMNS = '(id, session_uid, name, source, app_mode, engine_mode, external_model, verification_status, log_count, item_count, created_at, updated_at, metadata)';
const SESSION_COL_COUNT = 13;
const JOB_COLUMNS = '(id, type, status, progress, config, params, result, error, created_at, updated_at)';
const JOB_COL_COUNT = 10;

const KNOWN_LOG_FIELDS = new Set(['id', 'sessionUid', 'sessionName', 'query', 'reasoning', 'reasoning_content', 'answer', 'score', 'verificationStatus', 'savedToDb', 'messages', 'createdAt', 'updatedAt']);
const KNOWN_SESSION_FIELDS = new Set(['id', 'sessionUid', 'name', 'source', 'appMode', 'engineMode', 'externalModel', 'verificationStatus', 'logCount', 'itemCount', 'createdAt', 'updatedAt']);

const buildBulkValues = (items, colCount, mapFn) => {
    const values = [];
    const placeholders = [];
    let idx = 1;
    for (const item of items) {
        const params = Array.from({ length: colCount }, () => `$${idx++}`);
        placeholders.push(`(${params.join(', ')})`);
        values.push(...mapFn(item));
    }
    return { placeholders: placeholders.join(', '), values };
};

const safeDate = (val) => {
    if (!val) return new Date();
    try {
        // Handle numeric timestamps (milliseconds or seconds since epoch)
        if (typeof val === 'number') {
            // If > 10 billion, it's milliseconds; otherwise seconds
            const d = new Date(val > 10000000000 ? val : val * 1000);
            return isNaN(d.getTime()) ? new Date() : d;
        }
        // Handle string timestamps - could be ISO string or numeric string
        if (typeof val === 'string') {
            // Try parsing as number first (Unix timestamp)
            const num = Number(val);
            if (!isNaN(num)) {
                const d = new Date(num > 10000000000 ? num : num * 1000);
                return isNaN(d.getTime()) ? new Date() : d;
            }
            // Otherwise parse as date string
            const d = new Date(val);
            return isNaN(d.getTime()) ? new Date() : d;
        }
        // Handle Firestore Timestamp objects
        if (val && typeof val === 'object' && 'toDate' in val) {
            return val.toDate();
        }
        const d = new Date(val);
        return isNaN(d.getTime()) ? new Date() : d;
    } catch {
        return new Date();
    }
};

const logToRow = (log) => {
    const metadata = {};
    for (const [k, v] of Object.entries(log)) {
        if (!KNOWN_LOG_FIELDS.has(k)) metadata[k] = v;
    }
    const now = new Date();
    return [
        log.id || `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        log.sessionUid || null, log.sessionName || null, log.query || null,
        log.reasoning || null, log.reasoning_content || null, log.answer || null,
        log.score != null ? log.score : null, log.verificationStatus || null,
        log.savedToDb !== false, log.messages ? JSON.stringify(log.messages) : null,
        safeDate(log.createdAt), now, JSON.stringify(metadata),
    ];
};

const sessionToRow = (s) => {
    const metadata = {};
    for (const [k, v] of Object.entries(s)) {
        if (!KNOWN_SESSION_FIELDS.has(k)) metadata[k] = v;
    }
    return [
        s.id, s.sessionUid || s.id, s.name || null, s.source || null,
        s.appMode || null, s.engineMode || null, s.externalModel || null,
        s.verificationStatus || null, s.logCount || 0, s.itemCount || 0,
        safeDate(s.createdAt), safeDate(s.updatedAt),
        JSON.stringify(metadata),
    ];
};

const jobToRow = (job) => {
    const now = new Date();
    return [
        job.id, job.type || 'unknown', job.status || 'pending',
        JSON.stringify(job.progress || {}), JSON.stringify(job.config || {}),
        JSON.stringify(job.params || {}), job.result ? JSON.stringify(job.result) : null,
        job.error || null, safeDate(job.createdAt), now,
    ];
};

const flushBulk = async (pool, table, columns, colCount, mapFn, items, conflictClause) => {
    if (items.length === 0) return 0;
    const { placeholders, values } = buildBulkValues(items, colCount, mapFn);
    const text = `INSERT INTO ${table} ${columns} VALUES ${placeholders} ${conflictClause}`;
    const result = await pool.query(text, values);
    return result.rowCount || 0;
};

export const registerMigrateFromFirebaseRoute = (app, { createJob, updateJob, getJob }) => {
    app.post('/api/admin/migrate-from-firebase', async (req, res) => {
        if (getCurrentProvider() !== 'cockroachdb') {
            res.status(400).json({ error: 'Migration only available when active provider is CockroachDB' });
            return;
        }

        const target = getRepository();
        if (!target.pool) {
            res.status(500).json({ error: 'Target repository does not expose a connection pool for bulk operations' });
            return;
        }

        const job = await createJob('migrate');
        res.json({ jobId: job.id });

        // Run migration in background
        (async () => {
            const pool = target.pool;
            updateJob(job.id, { status: JobStatus.Running });
            const trace = [];

            try {
                const source = new FirestoreRepository(() => getFirestoreAdmin());
                const sourceTest = await source.testConnection();
                if (!sourceTest.ok) {
                    throw new Error('Cannot connect to Firebase: ' + (sourceTest.error || 'unknown'));
                }
                trace.push({ type: 'info', message: 'Connected to Firebase', timestamp: Date.now() });

                const progress = { sessionsTotal: 0, sessionsDone: 0, logsTotal: 0, logsDone: 0, jobsTotal: 0, jobsDone: 0, skipped: 0, phase: 'sessions' };
                const sync = () => updateJob(job.id, { progress: { ...progress }, result: { ...progress, trace } });

                const isCancelled = async () => {
                    const current = await getJob(job.id);
                    return current && current.status === JobStatus.Failed;
                };

                const sessionConflict = `ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, log_count = EXCLUDED.log_count, item_count = EXCLUDED.item_count,
                    verification_status = EXCLUDED.verification_status, updated_at = EXCLUDED.updated_at, metadata = EXCLUDED.metadata`;

                // ─── Phase 1: Sessions ──────────────────────────
                let sessionCursor = null;
                let sessionBuffer = [];

                do {
                    if (await isCancelled()) { trace.push({ type: 'warn', message: 'Cancelled during sessions', timestamp: Date.now() }); break; }
                    const page = await source.listSessions({ limit: FS_PAGE_SIZE, cursor: sessionCursor, orderBy: 'createdAt', direction: 'asc' });
                    sessionBuffer.push(...page.items);
                    progress.sessionsTotal += page.items.length;

                    while (sessionBuffer.length >= CRDB_SESSION_BATCH) {
                        const batch = sessionBuffer.splice(0, CRDB_SESSION_BATCH);
                        try {
                            await flushBulk(pool, 'synth_sessions', SESSION_COLUMNS, SESSION_COL_COUNT, sessionToRow, batch, sessionConflict);
                            progress.sessionsDone += batch.length;
                        } catch (e) {
                            trace.push({ type: 'error', message: `Session batch: ${e.message}`, timestamp: Date.now() });
                            progress.sessionsDone += batch.length;
                        }
                        sync();
                    }

                    sessionCursor = page.hasMore ? page.nextCursor : null;
                } while (sessionCursor);

                if (sessionBuffer.length > 0) {
                    try {
                        await flushBulk(pool, 'synth_sessions', SESSION_COLUMNS, SESSION_COL_COUNT, sessionToRow, sessionBuffer, sessionConflict);
                        progress.sessionsDone += sessionBuffer.length;
                    } catch (e) {
                        trace.push({ type: 'error', message: `Session final: ${e.message}`, timestamp: Date.now() });
                        progress.sessionsDone += sessionBuffer.length;
                    }
                    sync();
                }

                trace.push({ type: 'info', message: `Sessions: ${progress.sessionsDone}`, timestamp: Date.now() });

                // ─── Phase 2: Logs (stream + parallel batch writes) ─
                progress.phase = 'logs';
                sync();
                trace.push({ type: 'info', message: `Streaming logs with ${LOG_WORKERS} parallel workers`, timestamp: Date.now() });

                let logCursor = null;
                let logBuffer = [];
                const workerPromises = [];
                let activeWorkers = 0;

                // Stream logs and spawn workers as we accumulate batches
                do {
                    if (await isCancelled()) { trace.push({ type: 'warn', message: 'Cancelled during logs', timestamp: Date.now() }); break; }
                    const page = await source.listLogs({ limit: FS_PAGE_SIZE, cursor: logCursor, orderBy: 'createdAt', direction: 'asc' });
                    logBuffer.push(...page.items);
                    progress.logsTotal += page.items.length;

                    // Spawn worker when buffer is full AND we have worker slots available
                    while (logBuffer.length >= CRDB_LOG_BATCH && activeWorkers < LOG_WORKERS) {
                        const batch = logBuffer.splice(0, CRDB_LOG_BATCH);
                        activeWorkers++;
                        const workerPromise = (async (batchData) => {
                            try {
                                const count = await flushBulk(pool, 'synth_logs', LOG_COLUMNS, LOG_COL_COUNT, logToRow, batchData, 'ON CONFLICT (id) DO NOTHING');
                                progress.logsDone += count;
                                progress.skipped += batchData.length - count;
                            } catch (e) {
                                trace.push({ type: 'error', message: `Log batch: ${e.message}`, timestamp: Date.now() });
                                progress.logsDone += batchData.length;
                            } finally {
                                activeWorkers--;
                            }
                            sync();
                        })(batch);
                        workerPromises.push(workerPromise);
                    }

                    // If all worker slots full, wait for one to finish before fetching more
                    if (activeWorkers >= LOG_WORKERS) {
                        await Promise.race(workerPromises.filter(p => p)); // wait for any worker
                    }

                    logCursor = page.hasMore ? page.nextCursor : null;
                } while (logCursor);

                // Flush remaining logs
                while (logBuffer.length > 0) {
                    const batch = logBuffer.splice(0, CRDB_LOG_BATCH);
                    const workerPromise = (async (batchData) => {
                        try {
                            const count = await flushBulk(pool, 'synth_logs', LOG_COLUMNS, LOG_COL_COUNT, logToRow, batchData, 'ON CONFLICT (id) DO NOTHING');
                            progress.logsDone += count;
                            progress.skipped += batchData.length - count;
                        } catch (e) {
                            progress.logsDone += batchData.length;
                        }
                        sync();
                    })(batch);
                    workerPromises.push(workerPromise);
                }

                // Wait for all workers to finish
                await Promise.all(workerPromises);
                trace.push({ type: 'info', message: `Logs: ${progress.logsDone} (skipped ${progress.skipped})`, timestamp: Date.now() });

                // ─── Phase 3: Jobs ──────────────────────────────
                progress.phase = 'jobs';
                sync();

                if (!(await isCancelled())) {
                    const srcJobs = await source.listJobs({ limit: 10000 });
                    progress.jobsTotal = srcJobs.length;
                    if (srcJobs.length > 0) {
                        for (let i = 0; i < srcJobs.length; i += 4000) {
                            const batch = srcJobs.slice(i, i + 4000);
                            try {
                                const inserted = await flushBulk(pool, 'admin_jobs', JOB_COLUMNS, JOB_COL_COUNT, jobToRow, batch, 'ON CONFLICT (id) DO NOTHING');
                                progress.jobsDone += inserted;
                            } catch (e) {
                                trace.push({ type: 'error', message: `Job batch: ${e.message}`, timestamp: Date.now() });
                                progress.jobsDone += batch.length;
                            }
                        }
                    }
                }

                progress.phase = 'done';
                trace.push({ type: 'info', message: `Complete — sessions: ${progress.sessionsDone}, logs: ${progress.logsDone}, jobs: ${progress.jobsDone}, skipped: ${progress.skipped}`, timestamp: Date.now() });
                updateJob(job.id, {
                    status: JobStatus.Completed,
                    progress: { ...progress },
                    result: { ...progress, trace },
                });

            } catch (error) {
                console.error('[migrate] Job failed:', error);
                trace.push({ type: 'error', message: String(error), timestamp: Date.now() });
                updateJob(job.id, { status: JobStatus.Failed, error: String(error), result: { trace } });
            }
        })();
    });
};
